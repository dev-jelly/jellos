/**
 * Agent Execution Repository
 * Database operations for agent executions
 */

import { prisma } from '../lib/db';
import type { AgentExecution } from '../lib/db';
import { AgentExecutionStatus } from '../types/agent-execution';

export interface CreateExecutionData {
  agentId: string;
  projectId?: string;
  issueId?: string;
  worktreePath?: string;
  context?: object;
}

export interface UpdateExecutionData {
  status?: AgentExecutionStatus;
  processId?: number;
  exitCode?: number;
  startedAt?: Date;
  completedAt?: Date;
  lastHeartbeat?: Date;
  errorMessage?: string;
  gitDiff?: string;
  gitCommitHash?: string;
  gitCommitMsg?: string;
  gitBranch?: string;
  filesChanged?: number;
  linesAdded?: number;
  linesDeleted?: number;
}

export class ExecutionRepository {
  /**
   * Create a new execution record
   */
  async create(data: CreateExecutionData): Promise<AgentExecution> {
    return prisma.agentExecution.create({
      data: {
        agentId: data.agentId,
        projectId: data.projectId,
        issueId: data.issueId,
        worktreePath: data.worktreePath,
        context: data.context ? JSON.stringify(data.context) : null,
        status: AgentExecutionStatus.PENDING,
      },
    });
  }

  /**
   * Find execution by ID
   */
  async findById(id: string): Promise<(AgentExecution & { agent: any }) | null> {
    return prisma.agentExecution.findUnique({
      where: { id },
      include: {
        agent: true,
      },
    });
  }

  /**
   * Update execution
   */
  async update(id: string, data: UpdateExecutionData): Promise<AgentExecution> {
    return prisma.agentExecution.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Update heartbeat timestamp
   */
  async updateHeartbeat(id: string): Promise<void> {
    await prisma.agentExecution.update({
      where: { id },
      data: {
        lastHeartbeat: new Date(),
      },
    });
  }

  /**
   * Mark execution as started
   */
  async markAsStarted(id: string, processId: number): Promise<AgentExecution> {
    return this.update(id, {
      status: AgentExecutionStatus.RUNNING,
      processId,
      startedAt: new Date(),
      lastHeartbeat: new Date(),
    });
  }

  /**
   * Mark execution as completed
   */
  async markAsCompleted(
    id: string,
    exitCode: number,
    gitMetadata?: {
      gitDiff?: string;
      gitCommitHash?: string;
      gitCommitMsg?: string;
      gitBranch?: string;
      filesChanged?: number;
      linesAdded?: number;
      linesDeleted?: number;
    }
  ): Promise<AgentExecution> {
    return this.update(id, {
      status: exitCode === 0 ? AgentExecutionStatus.COMPLETED : AgentExecutionStatus.FAILED,
      exitCode,
      completedAt: new Date(),
      ...gitMetadata,
    });
  }

  /**
   * Mark execution as failed
   */
  async markAsFailed(id: string, errorMessage: string): Promise<AgentExecution> {
    return this.update(id, {
      status: AgentExecutionStatus.FAILED,
      errorMessage,
      completedAt: new Date(),
    });
  }

  /**
   * Mark execution as timeout
   */
  async markAsTimeout(id: string): Promise<AgentExecution> {
    return this.update(id, {
      status: AgentExecutionStatus.TIMEOUT,
      completedAt: new Date(),
    });
  }

  /**
   * Find active executions
   */
  async findActive(): Promise<(AgentExecution & { agent: any })[]> {
    return prisma.agentExecution.findMany({
      where: {
        status: {
          in: [AgentExecutionStatus.PENDING, AgentExecutionStatus.RUNNING],
        },
      },
      include: {
        agent: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Find executions by agent ID
   */
  async findByAgentId(agentId: string, limit?: number): Promise<AgentExecution[]> {
    return prisma.agentExecution.findMany({
      where: { agentId },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Find stale executions (no heartbeat for threshold)
   */
  async findStale(thresholdMinutes: number = 5): Promise<AgentExecution[]> {
    const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    return prisma.agentExecution.findMany({
      where: {
        status: AgentExecutionStatus.RUNNING,
        OR: [
          { lastHeartbeat: { lt: threshold } },
          { lastHeartbeat: null },
        ],
      },
    });
  }

  /**
   * Get execution statistics
   */
  async getStatistics() {
    const [total, pending, running, completed, failed, timeout] = await Promise.all([
      prisma.agentExecution.count(),
      prisma.agentExecution.count({ where: { status: AgentExecutionStatus.PENDING } }),
      prisma.agentExecution.count({ where: { status: AgentExecutionStatus.RUNNING } }),
      prisma.agentExecution.count({ where: { status: AgentExecutionStatus.COMPLETED } }),
      prisma.agentExecution.count({ where: { status: AgentExecutionStatus.FAILED } }),
      prisma.agentExecution.count({ where: { status: AgentExecutionStatus.TIMEOUT } }),
    ]);

    return {
      total,
      pending,
      running,
      completed,
      failed,
      timeout,
    };
  }
}

// Singleton instance
export const executionRepository = new ExecutionRepository();
