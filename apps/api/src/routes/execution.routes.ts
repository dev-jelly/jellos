/**
 * Execution Routes
 * API routes for agent execution management and streaming
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createExecution,
  streamExecution,
  getExecution,
  listExecutions,
  cancelExecution,
  getExecutionStats,
} from '../controllers/execution.controller';

/**
 * Schemas for request validation
 */
const CreateExecutionBodySchema = z.object({
  agentId: z.string().cuid(),
  projectId: z.string().cuid().optional(),
  issueId: z.string().cuid().optional(),
  worktreePath: z.string().optional(),
  context: z.record(z.string(), z.any()).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeout: z.number().int().positive().max(600000).optional(), // Max 10 minutes
});

const CreateExecutionResponseSchema = z.object({
  executionId: z.string(),
  streamUrl: z.string(),
});

const ExecutionParamsSchema = z.object({
  id: z.string().cuid(),
});

/**
 * Execution routes plugin
 */
export const executionRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/executions
   * Create a new agent execution
   */
  fastify.post(
    '/',
    {
      schema: {
        body: CreateExecutionBodySchema,
        response: {
          201: CreateExecutionResponseSchema,
        },
      },
    },
    createExecution
  );

  /**
   * GET /api/executions/:id/stream
   * Stream execution output via SSE
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id/stream',
    {
      schema: {
        params: ExecutionParamsSchema,
      },
    },
    streamExecution
  );

  /**
   * GET /api/executions/:id
   * Get execution details
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        params: ExecutionParamsSchema,
      },
    },
    getExecution
  );

  /**
   * GET /api/executions
   * List active executions
   */
  fastify.get('/', listExecutions);

  /**
   * DELETE /api/executions/:id
   * Cancel execution
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        params: ExecutionParamsSchema,
      },
    },
    cancelExecution
  );

  /**
   * GET /api/executions/stats
   * Get execution statistics
   */
  fastify.get('/stats', getExecutionStats);
};
