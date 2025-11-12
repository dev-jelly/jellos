/**
 * Agent Adapter Service
 * Executes code agents and streams output via AsyncGenerator
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { executionRepository } from '../repositories/execution.repository';
import type { CodeAgentRuntime } from '../lib/db';
import {
  AgentExecutionStatus,
  StreamEventType,
  type StreamEvent,
  type AgentExecuteOptions,
  type ExecutionMetadata,
} from '../types/agent-execution';

export interface ProcessStreamOptions {
  executionId: string;
  agent: CodeAgentRuntime;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
}

/**
 * Agent adapter service for executing agents and streaming output
 */
export class AgentAdapterService {
  private activeProcesses = new Map<string, ChildProcess>();
  private heartbeatIntervals = new Map<string, NodeJS.Timeout>();

  /**
   * Execute an agent and return async generator for streaming output
   */
  public async execute(options: AgentExecuteOptions): Promise<AsyncGenerator<StreamEvent>> {
    // 1. Create execution record
    const execution = await executionRepository.create({
      agentId: options.agentId,
      projectId: options.projectId,
      issueId: options.issueId,
      worktreePath: options.worktreePath,
      context: options.context,
    });

    // 2. Get agent details (in real implementation, fetch from DB)
    // For now, we'll assume agent details are passed or fetched
    const agent = await this.getAgent(options.agentId);

    if (!agent) {
      await executionRepository.markAsFailed(execution.id, 'Agent not found');
      throw new Error(`Agent not found: ${options.agentId}`);
    }

    // 3. Return async generator
    return this.streamProcess({
      executionId: execution.id,
      agent,
      args: options.args,
      env: options.env,
      cwd: options.worktreePath,
      timeout: options.timeout || 300000, // 5 minutes default
    });
  }

  /**
   * Stream process output as async generator
   */
  private async *streamProcess(options: ProcessStreamOptions): AsyncGenerator<StreamEvent> {
    const { executionId, agent, args = [], env = {}, cwd, timeout } = options;

    let proc: ChildProcess | null = null;
    let timeoutHandle: NodeJS.Timeout | null = null;
    let isComplete = false;

    try {
      // Send metadata event
      yield {
        type: StreamEventType.METADATA,
        data: {
          executionId,
          agentId: agent.id,
          status: AgentExecutionStatus.RUNNING,
          startedAt: new Date(),
        },
        timestamp: new Date(),
        executionId,
      };

      // Parse agent command and arguments
      const cmdArgs = this.parseArgs(agent.args);
      const allArgs = [...cmdArgs, ...args];
      const processEnv = this.buildEnv(agent.envMask, env);

      // Validate working directory
      if (cwd && !existsSync(cwd)) {
        throw new Error(`Working directory does not exist: ${cwd}`);
      }

      // Spawn process
      proc = spawn(agent.cmd, allArgs, {
        cwd: cwd || process.cwd(),
        env: { ...process.env, ...processEnv },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      if (!proc.pid) {
        throw new Error('Failed to spawn process');
      }

      // Update execution with process ID
      await executionRepository.markAsStarted(executionId, proc.pid);
      this.activeProcesses.set(executionId, proc);

      // Start heartbeat
      this.startHeartbeat(executionId);

      // Set timeout
      if (timeout && timeout > 0) {
        timeoutHandle = setTimeout(() => {
          if (proc && !isComplete) {
            proc.kill('SIGTERM');
            executionRepository.markAsTimeout(executionId);
          }
        }, timeout);
      }

      // Create async streams for stdout and stderr
      const stdoutStream = this.createStream(proc.stdout, StreamEventType.STDOUT, executionId);
      const stderrStream = this.createStream(proc.stderr, StreamEventType.STDERR, executionId);

      // Merge streams and yield events
      yield* this.mergeStreams(stdoutStream, stderrStream);

      // Wait for process completion
      const exitCode = await this.waitForExit(proc);
      isComplete = true;

      // Clear timeout
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      // Update execution status
      await executionRepository.markAsCompleted(executionId, exitCode);

      // Send completion event
      yield {
        type: StreamEventType.COMPLETE,
        data: {
          exitCode,
          status: exitCode === 0 ? AgentExecutionStatus.COMPLETED : AgentExecutionStatus.FAILED,
        },
        timestamp: new Date(),
        executionId,
      };
    } catch (error) {
      isComplete = true;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await executionRepository.markAsFailed(executionId, errorMessage);

      yield {
        type: StreamEventType.ERROR,
        data: { message: errorMessage },
        timestamp: new Date(),
        executionId,
      };
    } finally {
      // Cleanup
      this.stopHeartbeat(executionId);
      this.activeProcesses.delete(executionId);

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      if (proc && !isComplete) {
        proc.kill('SIGTERM');
      }
    }
  }

  /**
   * Create async generator from stream
   */
  private async *createStream(
    stream: NodeJS.ReadableStream | null,
    type: StreamEventType,
    executionId: string
  ): AsyncGenerator<StreamEvent> {
    if (!stream) return;

    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      yield {
        type,
        data: buffer.toString('utf-8'),
        timestamp: new Date(),
        executionId,
      };
    }
  }

  /**
   * Merge multiple async generators
   */
  private async *mergeStreams(
    ...generators: AsyncGenerator<StreamEvent>[]
  ): AsyncGenerator<StreamEvent> {
    const iterators = generators.map((gen) => gen[Symbol.asyncIterator]());
    const pending = new Map(iterators.map((it, index) => [index, it.next()]));

    while (pending.size > 0) {
      const race = Promise.race(
        Array.from(pending.entries()).map(async ([index, promise]) => ({
          index,
          result: await promise,
        }))
      );

      const { index, result } = await race;

      if (result.done) {
        pending.delete(index);
      } else {
        yield result.value;
        pending.set(index, iterators[index].next());
      }
    }
  }

  /**
   * Wait for process to exit
   */
  private waitForExit(proc: ChildProcess): Promise<number> {
    return new Promise((resolve) => {
      proc.on('close', (code) => {
        resolve(code || 0);
      });

      proc.on('error', () => {
        resolve(-1);
      });
    });
  }

  /**
   * Start heartbeat for execution
   */
  private startHeartbeat(executionId: string): void {
    const interval = setInterval(async () => {
      try {
        await executionRepository.updateHeartbeat(executionId);
      } catch (error) {
        console.error(`Failed to update heartbeat for ${executionId}:`, error);
      }
    }, 30000); // Every 30 seconds

    this.heartbeatIntervals.set(executionId, interval);
  }

  /**
   * Stop heartbeat for execution
   */
  private stopHeartbeat(executionId: string): void {
    const interval = this.heartbeatIntervals.get(executionId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(executionId);
    }
  }

  /**
   * Parse args from JSON string
   */
  private parseArgs(argsJson: string): string[] {
    try {
      return JSON.parse(argsJson);
    } catch {
      return [];
    }
  }

  /**
   * Build environment variables
   */
  private buildEnv(envMaskJson: string, additionalEnv: Record<string, string>): Record<string, string> {
    try {
      const envMask = JSON.parse(envMaskJson) as string[];
      const filteredEnv: Record<string, string> = {};

      for (const key of envMask) {
        if (process.env[key]) {
          filteredEnv[key] = process.env[key]!;
        }
      }

      return { ...filteredEnv, ...additionalEnv };
    } catch {
      return additionalEnv;
    }
  }

  /**
   * Get agent by ID (placeholder - would fetch from DB)
   */
  private async getAgent(agentId: string): Promise<CodeAgentRuntime | null> {
    const { prisma } = await import('../lib/db');
    return prisma.codeAgentRuntime.findUnique({
      where: { id: agentId },
    });
  }

  /**
   * Cancel execution
   */
  public async cancel(executionId: string): Promise<void> {
    const proc = this.activeProcesses.get(executionId);
    if (proc) {
      proc.kill('SIGTERM');
      await executionRepository.update(executionId, {
        status: AgentExecutionStatus.CANCELLED,
        completedAt: new Date(),
      });
    }
  }

  /**
   * Get active executions count
   */
  public getActiveCount(): number {
    return this.activeProcesses.size;
  }
}

// Singleton instance
let agentAdapterInstance: AgentAdapterService | null = null;

export function getAgentAdapterService(): AgentAdapterService {
  if (!agentAdapterInstance) {
    agentAdapterInstance = new AgentAdapterService();
  }
  return agentAdapterInstance;
}
