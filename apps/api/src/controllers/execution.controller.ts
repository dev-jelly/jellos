/**
 * Execution Controller
 * Handles agent execution requests and SSE streaming
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getAgentAdapterService } from '../services/agent-adapter.service';
import { executionRepository } from '../repositories/execution.repository';
import type { AgentExecuteOptions } from '../types/agent-execution';

export interface CreateExecutionBody {
  agentId: string;
  projectId?: string;
  issueId?: string;
  worktreePath?: string;
  context?: object;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
}

export interface StreamExecutionParams {
  id: string;
}

/**
 * Create a new agent execution
 */
export async function createExecution(
  request: FastifyRequest<{ Body: CreateExecutionBody }>,
  reply: FastifyReply
) {
  const { agentId, projectId, issueId, worktreePath, context, args, env, timeout } = request.body;

  try {
    // Create execution and start streaming in background
    const agentAdapter = getAgentAdapterService();

    const options: AgentExecuteOptions = {
      agentId,
      projectId,
      issueId,
      worktreePath,
      context,
      args,
      env,
      timeout,
    };

    // Start execution (returns immediately with execution ID)
    const generator = await agentAdapter.execute(options);

    // Get the first event which contains metadata
    const { value: firstEvent } = await generator.next();

    if (!firstEvent) {
      return reply.status(500).send({
        error: 'Failed to start execution',
      });
    }

    // Return execution ID for client to connect to stream
    return reply.status(201).send({
      executionId: firstEvent.executionId,
      streamUrl: `/api/executions/${firstEvent.executionId}/stream`,
    });
  } catch (error) {
    request.log.error({ error }, 'Failed to create execution');

    return reply.status(500).send({
      error: error instanceof Error ? error.message : 'Failed to create execution',
    });
  }
}

/**
 * Stream execution output via SSE
 */
export async function streamExecution(
  request: FastifyRequest<{ Params: StreamExecutionParams }>,
  reply: FastifyReply
) {
  const { id: executionId } = request.params;

  try {
    // Verify execution exists
    const execution = await executionRepository.findById(executionId);

    if (!execution) {
      return reply.status(404).send({
        error: 'Execution not found',
      });
    }

    // Get agent adapter
    const agentAdapter = getAgentAdapterService();

    // Execute and stream
    const options: AgentExecuteOptions = {
      agentId: execution.agentId,
      projectId: execution.projectId || undefined,
      issueId: execution.issueId || undefined,
      worktreePath: execution.worktreePath || undefined,
      context: execution.context ? JSON.parse(execution.context) : undefined,
    };

    const generator = await agentAdapter.execute(options);

    // Stream events via SSE
    for await (const event of generator) {
      // Send SSE event
      reply.raw.write(
        `id: ${executionId}-${Date.now()}\n` +
        `event: ${event.type}\n` +
        `data: ${JSON.stringify({
          type: event.type,
          data: event.data,
          timestamp: event.timestamp,
          executionId: event.executionId,
        })}\n\n`
      );
    }

    // Close SSE connection
    reply.raw.end();
  } catch (error) {
    request.log.error({ error }, 'Streaming error');

    // Send error event
    reply.raw.write(
      `event: error\n` +
      `data: ${JSON.stringify({
        error: error instanceof Error ? error.message : 'Streaming error',
        timestamp: new Date(),
      })}\n\n`
    );

    reply.raw.end();
  }
}

/**
 * Get execution details
 */
export async function getExecution(
  request: FastifyRequest<{ Params: StreamExecutionParams }>,
  reply: FastifyReply
) {
  const { id } = request.params;

  try {
    const execution = await executionRepository.findById(id);

    if (!execution) {
      return reply.status(404).send({
        error: 'Execution not found',
      });
    }

    return reply.send({
      id: execution.id,
      agentId: execution.agentId,
      projectId: execution.projectId,
      issueId: execution.issueId,
      worktreePath: execution.worktreePath,
      status: execution.status,
      processId: execution.processId,
      exitCode: execution.exitCode,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      lastHeartbeat: execution.lastHeartbeat,
      context: execution.context ? JSON.parse(execution.context) : null,
      errorMessage: execution.errorMessage,
      createdAt: execution.createdAt,
      updatedAt: execution.updatedAt,
      agent: execution.agent,
    });
  } catch (error) {
    request.log.error({ error }, 'Failed to get execution');

    return reply.status(500).send({
      error: 'Failed to get execution',
    });
  }
}

/**
 * List executions
 */
export async function listExecutions(request: FastifyRequest, reply: FastifyReply) {
  try {
    const executions = await executionRepository.findActive();

    return reply.send({
      executions: executions.map((e) => ({
        id: e.id,
        agentId: e.agentId,
        status: e.status,
        startedAt: e.startedAt,
        lastHeartbeat: e.lastHeartbeat,
        agent: e.agent,
      })),
    });
  } catch (error) {
    request.log.error({ error }, 'Failed to list executions');

    return reply.status(500).send({
      error: 'Failed to list executions',
    });
  }
}

/**
 * Cancel execution
 */
export async function cancelExecution(
  request: FastifyRequest<{ Params: StreamExecutionParams }>,
  reply: FastifyReply
) {
  const { id } = request.params;

  try {
    const agentAdapter = getAgentAdapterService();
    await agentAdapter.cancel(id);

    return reply.send({
      success: true,
      message: 'Execution cancelled',
    });
  } catch (error) {
    request.log.error({ error }, 'Failed to cancel execution');

    return reply.status(500).send({
      error: 'Failed to cancel execution',
    });
  }
}

/**
 * Get execution statistics
 */
export async function getExecutionStats(request: FastifyRequest, reply: FastifyReply) {
  try {
    const stats = await executionRepository.getStatistics();
    const agentAdapter = getAgentAdapterService();

    return reply.send({
      ...stats,
      activeProcesses: agentAdapter.getActiveCount(),
    });
  } catch (error) {
    request.log.error({ error }, 'Failed to get stats');

    return reply.status(500).send({
      error: 'Failed to get statistics',
    });
  }
}
