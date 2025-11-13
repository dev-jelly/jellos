/**
 * Issue Routes
 * REST API endpoints for issue management with enrichment support
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { issueRepository } from '../repositories/issue.repository';
import { getIssueMergeService, MergeStrategy } from '../services/issue-merge.service';
import { getIssueCacheService } from '../services/issue-cache.service';
import {
  createIssueSchema,
  updateIssueSchema,
} from '../types/issue';
import { eventBus } from '../lib/event-bus';

/**
 * Query schemas
 */
const enrichQuerySchema = z.object({
  enriched: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  includeLinearData: z
    .string()
    .optional()
    .transform((val) => val !== 'false'),
  strategy: z
    .enum(['prefer_internal', 'prefer_linear', 'combined'])
    .optional()
    .default('prefer_internal'),
});

const compareQuerySchema = z.object({
  issueId: z.string().cuid(),
});

/**
 * Register issue routes
 */
export async function issueRoutes(fastify: FastifyInstance) {
  const mergeService = getIssueMergeService();
  const cacheService = getIssueCacheService();

  /**
   * POST /issues - Create a new issue
   */
  fastify.post<{
    Body: z.infer<typeof createIssueSchema>;
  }>(
    '/',
    {
      schema: {
        body: createIssueSchema,
        response: {
          201: z.any(),
          400: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const issue = await issueRepository.create(request.body);
        reply.code(201);
        return { data: issue };
      } catch (error) {
        reply.code(400);
        return {
          error: 'Failed to create issue',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * GET /issues/:id - Get issue by ID with optional enrichment
   */
  fastify.get<{
    Params: { id: string };
    Querystring: z.infer<typeof enrichQuerySchema>;
  }>(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string().cuid() }),
        querystring: enrichQuerySchema,
        response: {
          200: z.any(),
          404: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { enriched, includeLinearData, strategy } = request.query;

      try {
        if (enriched) {
          // Try to get from cache with SWR pattern
          const cached = await cacheService.getEnrichedIssue(
            id,
            async () => {
              return mergeService.enrichIssue(id, {
                fetchLinearData: true,
                includeLinearData,
                strategy: strategy as MergeStrategy,
              });
            }
          );

          if (cached.data) {
            const response = mergeService.transformToApiResponse(cached.data, {
              includeLinearData,
              includeEnrichmentStatus: true,
            });

            return {
              data: response,
              cache: {
                cached: cached.cached,
                stale: cached.stale,
                revalidating: cached.revalidating,
              },
            };
          }

          // Cache miss - fetch and cache
          const enrichedIssue = await mergeService.enrichIssue(id, {
            fetchLinearData: true,
            includeLinearData,
            strategy: strategy as MergeStrategy,
          });

          await cacheService.setEnrichedIssue(id, enrichedIssue);

          const response = mergeService.transformToApiResponse(enrichedIssue, {
            includeLinearData,
            includeEnrichmentStatus: true,
          });

          return { data: response, cache: { cached: false, stale: false, revalidating: false } };
        }

        // Return plain issue
        const issue = await issueRepository.findById(id);
        if (!issue) {
          reply.code(404);
          return {
            error: 'Issue not found',
            message: `Issue with ID ${id} not found`,
          };
        }

        return { data: issue };
      } catch (error) {
        reply.code(404);
        return {
          error: 'Issue not found',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * PUT /issues/:id - Update an issue
   */
  fastify.put<{
    Params: { id: string };
    Body: z.infer<typeof updateIssueSchema>;
  }>(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string().cuid() }),
        body: updateIssueSchema,
        response: {
          200: z.any(),
          400: z.object({
            error: z.string(),
            message: z.string(),
          }),
          404: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      try {
        const issue = await issueRepository.update(id, request.body);

        // Invalidate cache after update
        await cacheService.invalidateIssue(id);

        // Emit event for real-time updates (Task 11.6)
        eventBus.emitEvent('issue.updated', {
          issueId: issue.id,
          projectId: issue.projectId,
        });

        return { data: issue };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('not found')) {
          reply.code(404);
          return {
            error: 'Issue not found',
            message,
          };
        }

        reply.code(400);
        return {
          error: 'Failed to update issue',
          message,
        };
      }
    }
  );

  /**
   * DELETE /issues/:id - Delete an issue
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string().cuid() }),
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
          404: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      try {
        await issueRepository.delete(id);

        // Invalidate cache after deletion
        await cacheService.invalidateIssue(id);

        return {
          success: true,
          message: `Issue ${id} deleted successfully`,
        };
      } catch (error) {
        reply.code(404);
        return {
          error: 'Issue not found',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * GET /issues/:id/compare - Compare internal and Linear data
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/:id/compare',
    {
      schema: {
        params: z.object({ id: z.string().cuid() }),
        response: {
          200: z.any(),
          404: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      try {
        const comparison = await mergeService.compareWithLinear(id);
        return { data: comparison };
      } catch (error) {
        reply.code(404);
        return {
          error: 'Failed to compare',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * GET /project/:projectId/issues - Get all issues for a project with enrichment
   */
  fastify.get<{
    Params: { projectId: string };
    Querystring: z.infer<typeof enrichQuerySchema>;
  }>(
    '/project/:projectId/issues',
    {
      schema: {
        params: z.object({ projectId: z.string().cuid() }),
        querystring: enrichQuerySchema,
        response: {
          200: z.any(),
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params;
      const { enriched, includeLinearData, strategy } = request.query;

      try {
        if (enriched) {
          // Try to get from cache first
          const cached = await cacheService.getProjectIssues(projectId);

          if (cached.data && !cached.stale) {
            const responses = mergeService.transformManyToApiResponse(cached.data, {
              includeLinearData,
              includeEnrichmentStatus: true,
            });

            return {
              data: responses,
              projectId,
              total: responses.length,
              cache: { cached: true, stale: false },
            };
          }

          // Cache miss or stale - fetch and cache
          const enrichedIssues = await mergeService.enrichProjectIssues(projectId, {
            fetchLinearData: true,
            includeLinearData,
            strategy: strategy as MergeStrategy,
          });

          await cacheService.setProjectIssues(projectId, enrichedIssues);

          const responses = mergeService.transformManyToApiResponse(enrichedIssues, {
            includeLinearData,
            includeEnrichmentStatus: true,
          });

          return {
            data: responses,
            projectId,
            total: responses.length,
            cache: { cached: false, stale: false },
          };
        }

        // Return plain issues
        const issues = await issueRepository.findByProject(projectId);
        return {
          data: issues,
          projectId,
          total: issues.length,
        };
      } catch (error) {
        return {
          data: [],
          projectId,
          total: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * DELETE /cache/invalidate/:id - Invalidate cache for an issue
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    '/cache/invalidate/:id',
    {
      schema: {
        params: z.object({ id: z.string().cuid() }),
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      await cacheService.invalidateIssue(id);

      return {
        success: true,
        message: `Cache invalidated for issue ${id}`,
      };
    }
  );

  /**
   * DELETE /cache/invalidate-project/:projectId - Invalidate cache for project issues
   */
  fastify.delete<{
    Params: { projectId: string };
  }>(
    '/cache/invalidate-project/:projectId',
    {
      schema: {
        params: z.object({ projectId: z.string().cuid() }),
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params;
      await cacheService.invalidateProjectIssues(projectId);

      return {
        success: true,
        message: `Cache invalidated for project ${projectId} issues`,
      };
    }
  );

  /**
   * DELETE /cache/invalidate-all - Invalidate all issue caches
   */
  fastify.delete(
    '/cache/invalidate-all',
    {
      schema: {
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      await cacheService.invalidateAll();

      return {
        success: true,
        message: 'All issue caches invalidated',
      };
    }
  );

  /**
   * GET /cache/stats - Get cache statistics
   */
  fastify.get(
    '/cache/stats',
    {
      schema: {
        response: {
          200: z.object({
            totalKeys: z.number(),
            issueKeys: z.number(),
            projectKeys: z.number(),
            available: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const stats = await cacheService.getCacheStats();

      return {
        ...stats,
        available: cacheService.isAvailable(),
      };
    }
  );

  /**
   * GET /stream - Server-Sent Events stream for real-time issue updates
   * Task 11.6: Real-time synchronization via SSE
   *
   * Query parameters:
   * - projectId: Optional project ID to filter events
   *
   * Events emitted:
   * - issue-updated: When an issue is updated
   * - heartbeat: Every 30 seconds to keep connection alive
   */
  fastify.get<{
    Querystring: {
      projectId?: string;
    };
  }>(
    '/stream',
    {
      schema: {
        querystring: z.object({
          projectId: z.string().cuid().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { projectId } = request.query;

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Send initial connection message
      reply.raw.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

      // Event handler for issue updates
      const handleIssueUpdate = async (payload: { issueId: string; projectId: string }) => {
        // Filter by project if specified
        if (projectId && payload.projectId !== projectId) {
          return;
        }

        try {
          // Fetch the updated issue to send full data
          const issue = await issueRepository.findById(payload.issueId);
          if (!issue) {
            return;
          }

          const eventData = {
            type: 'issue-updated',
            timestamp: new Date().toISOString(),
            data: issue,
          };

          reply.raw.write(`event: issue-updated\n`);
          reply.raw.write(`data: ${JSON.stringify(eventData)}\n\n`);
        } catch (error) {
          fastify.log.error('Error sending SSE update:', error);
        }
      };

      // Subscribe to issue update events
      eventBus.onEvent('issue.updated', handleIssueUpdate);

      // Heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          reply.raw.write(`: heartbeat ${new Date().toISOString()}\n\n`);
        } catch (error) {
          // Client disconnected
          clearInterval(heartbeatInterval);
        }
      }, 30000); // 30 seconds

      // Cleanup on client disconnect
      request.raw.on('close', () => {
        eventBus.offEvent('issue.updated', handleIssueUpdate);
        clearInterval(heartbeatInterval);
        fastify.log.info('SSE client disconnected');
      });

      // Keep the connection open
      await new Promise((resolve) => {
        request.raw.on('close', resolve);
        request.raw.on('end', resolve);
      });
    }
  );
}
