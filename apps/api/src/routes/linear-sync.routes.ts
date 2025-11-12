/**
 * Linear Sync Routes
 * REST API endpoints for Linear synchronization
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getLinearSyncService } from '../services/linear-sync.service';

/**
 * Request schemas
 */
const enableSyncSchema = z.object({
  issueId: z.string().cuid(),
  linearIdentifier: z.string().min(1), // e.g., "ENG-123"
});

const syncIssueSchema = z.object({
  linearIdentifier: z.string().min(1),
  projectId: z.string().cuid(),
});

const syncAllSchema = z.object({
  projectId: z.string().cuid(),
});

const searchAndSyncSchema = z.object({
  query: z.string().min(1),
  projectId: z.string().cuid(),
  autoSync: z.boolean().optional().default(false),
});

/**
 * Register Linear sync routes
 */
export async function linearSyncRoutes(fastify: FastifyInstance) {
  const syncService = getLinearSyncService();

  /**
   * GET /linear/status - Check Linear availability
   */
  fastify.get('/linear/status', async (request, reply) => {
    const isAvailable = syncService.isAvailable();

    return {
      available: isAvailable,
      message: isAvailable
        ? 'Linear API is configured and ready'
        : 'LINEAR_API_KEY not configured',
    };
  });

  /**
   * POST /linear/enable-sync - Enable sync for an issue
   */
  fastify.post<{
    Body: z.infer<typeof enableSyncSchema>;
  }>(
    '/linear/enable-sync',
    {
      schema: {
        body: enableSyncSchema,
        response: {
          200: z.object({
            success: z.boolean(),
            link: z.any(),
            message: z.string(),
          }),
          400: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { issueId, linearIdentifier } = request.body;

        const link = await syncService.enableSync(issueId, linearIdentifier);

        return {
          success: true,
          link,
          message: `Sync enabled for issue ${issueId} with Linear issue ${linearIdentifier}`,
        };
      } catch (error) {
        reply.code(400);
        return {
          error: 'Failed to enable sync',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * POST /linear/disable-sync - Disable sync for an issue
   */
  fastify.post<{
    Body: { issueId: string };
  }>(
    '/linear/disable-sync',
    {
      schema: {
        body: z.object({ issueId: z.string().cuid() }),
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
          }),
          400: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { issueId } = request.body;

        await syncService.disableSync(issueId);

        return {
          success: true,
          message: `Sync disabled for issue ${issueId}`,
        };
      } catch (error) {
        reply.code(400);
        return {
          error: 'Failed to disable sync',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * GET /linear/sync-status/:issueId - Get sync status for an issue
   */
  fastify.get<{
    Params: { issueId: string };
  }>(
    '/linear/sync-status/:issueId',
    {
      schema: {
        params: z.object({ issueId: z.string().cuid() }),
        response: {
          200: z.object({
            enabled: z.boolean(),
            provider: z.string().optional(),
            externalId: z.string().optional(),
            externalUrl: z.string().optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { issueId } = request.params;

      const status = await syncService.getSyncStatus(issueId);

      return status;
    }
  );

  /**
   * POST /linear/sync-issue - Sync a single Linear issue
   */
  fastify.post<{
    Body: z.infer<typeof syncIssueSchema>;
  }>(
    '/linear/sync-issue',
    {
      schema: {
        body: syncIssueSchema,
        response: {
          200: z.object({
            result: z.any(),
          }),
          400: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { linearIdentifier, projectId } = request.body;

        const result = await syncService.syncIssue(linearIdentifier, projectId);

        if (!result.success) {
          reply.code(400);
          return {
            error: 'Sync failed',
            message: result.error || 'Unknown error',
          };
        }

        return { result };
      } catch (error) {
        reply.code(400);
        return {
          error: 'Failed to sync issue',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * POST /linear/sync-all - Sync all enabled issues for a project
   */
  fastify.post<{
    Body: z.infer<typeof syncAllSchema>;
  }>(
    '/linear/sync-all',
    {
      schema: {
        body: syncAllSchema,
        response: {
          200: z.object({
            total: z.number(),
            successful: z.number(),
            failed: z.number(),
            results: z.array(z.any()),
          }),
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.body;

      const result = await syncService.syncAllIssues(projectId);

      return result;
    }
  );

  /**
   * POST /linear/search - Search Linear issues and optionally sync
   */
  fastify.post<{
    Body: z.infer<typeof searchAndSyncSchema>;
  }>(
    '/linear/search',
    {
      schema: {
        body: searchAndSyncSchema,
        response: {
          200: z.object({
            linearIssues: z.array(z.any()),
            syncResults: z.array(z.any()).optional(),
          }),
          400: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { query, projectId, autoSync } = request.body;

        const result = await syncService.searchAndSync(
          query,
          projectId,
          autoSync
        );

        return result;
      } catch (error) {
        reply.code(400);
        return {
          error: 'Search failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );
}
