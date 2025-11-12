/**
 * Execution Controller
 * Handles agent execution requests and SSE streaming
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getAgentAdapterService } from '../services/agent-adapter.service';
import { executionRepository } from '../repositories/execution.repository';
import { getEventBufferService } from '../services/event-buffer.service';
import { StreamEventType, type AgentExecuteOptions } from '../types/agent-execution';

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
  const lastEventId = request.headers['last-event-id'] as string | undefined;

  try {
    // Verify execution exists
    const execution = await executionRepository.findById(executionId);

    if (!execution) {
      return reply.status(404).send({
        error: 'Execution not found',
      });
    }

    // Get services
    const agentAdapter = getAgentAdapterService();
    const eventBuffer = getEventBufferService();

    // Setup AbortController for client disconnection detection
    const abortController = new AbortController();

    request.raw.on('close', () => {
      request.log.info(`Client disconnected from execution ${executionId}`);
      abortController.abort();
    });

    request.raw.on('error', () => {
      request.log.error(`Client connection error for execution ${executionId}`);
      abortController.abort();
    });

    // If reconnecting with Last-Event-ID, replay missed events
    if (lastEventId && eventBuffer.hasBuffer(executionId)) {
      request.log.info(`Replaying events after ${lastEventId} for execution ${executionId}`);

      const missedEvents = eventBuffer.getEventsAfter(executionId, lastEventId);

      for (const bufferedEvent of missedEvents) {
        if (abortController.signal.aborted) break;

        reply.raw.write(
          `id: ${bufferedEvent.id}\n` +
          `event: ${bufferedEvent.event.type}\n` +
          `data: ${JSON.stringify({
            type: bufferedEvent.event.type,
            data: bufferedEvent.event.data,
            timestamp: bufferedEvent.event.timestamp,
            executionId: bufferedEvent.event.executionId,
          })}\n\n`
        );
      }
    }

    // Setup heartbeat
    let heartbeatCount = 0;
    const heartbeatInterval = setInterval(() => {
      if (abortController.signal.aborted) {
        clearInterval(heartbeatInterval);
        return;
      }

      const heartbeatEventId = `${executionId}-heartbeat-${heartbeatCount++}`;

      reply.raw.write(
        `id: ${heartbeatEventId}\n` +
        `event: ${StreamEventType.HEARTBEAT}\n` +
        `data: ${JSON.stringify({
          type: StreamEventType.HEARTBEAT,
          timestamp: new Date(),
          executionId,
        })}\n\n`
      );

      // Buffer heartbeat events too
      eventBuffer.addEvent(executionId, heartbeatEventId, {
        type: StreamEventType.HEARTBEAT,
        data: { timestamp: new Date() },
        timestamp: new Date(),
        executionId,
      });
    }, 30000); // Every 30 seconds

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
    let eventCount = 0;
    for await (const event of generator) {
      if (abortController.signal.aborted) {
        request.log.info(`Stream aborted for execution ${executionId}`);
        break;
      }

      const eventId = `${executionId}-${eventCount++}`;

      // Send SSE event
      reply.raw.write(
        `id: ${eventId}\n` +
        `event: ${event.type}\n` +
        `data: ${JSON.stringify({
          type: event.type,
          data: event.data,
          timestamp: event.timestamp,
          executionId: event.executionId,
        })}\n\n`
      );

      // Buffer event for reconnection support
      eventBuffer.addEvent(executionId, eventId, event);

      // Clear buffer on completion
      if (event.type === StreamEventType.COMPLETE || event.type === StreamEventType.ERROR) {
        // Keep buffer for a short time in case of reconnection
        setTimeout(() => {
          eventBuffer.clearBuffer(executionId);
        }, 60000); // Clear after 1 minute
      }
    }

    // Cleanup
    clearInterval(heartbeatInterval);

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
