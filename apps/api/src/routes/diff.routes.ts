import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { getGitDiffParser } from '../services/git-diff-parser.service';
import { getDiffConverter } from '../services/diff-converter.service';
import { ProjectService, ProjectNotFoundError } from '../services/project.service';

// Validation schemas
const diffQuerySchema = z.object({
  projectId: z.string().cuid('Invalid project ID format'),
  base: z.string().optional(),
  compare: z.string().optional(),
  staged: z.coerce.boolean().optional().default(false),
  contextLines: z.coerce.number().int().min(0).max(10).optional().default(3),
});

const diffStatsQuerySchema = z.object({
  projectId: z.string().cuid('Invalid project ID format'),
  base: z.string().optional(),
  compare: z.string().optional(),
  staged: z.coerce.boolean().optional().default(false),
});

// Response schemas
const diffLineSchema = z.object({
  type: z.enum(['context', 'addition', 'deletion']),
  content: z.string(),
  oldLineNumber: z.number().optional(),
  newLineNumber: z.number().optional(),
});

const diffHunkSchema = z.object({
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  lines: z.array(diffLineSchema),
  header: z.string(),
});

const fileDiffSchema = z.object({
  path: z.string(),
  oldPath: z.string().optional(),
  changeType: z.enum(['added', 'deleted', 'modified', 'renamed', 'copied']),
  hunks: z.array(diffHunkSchema),
  binary: z.boolean(),
  additions: z.number(),
  deletions: z.number(),
});

const parsedDiffResponseSchema = z.object({
  files: z.array(fileDiffSchema),
  totalAdditions: z.number(),
  totalDeletions: z.number(),
  totalFiles: z.number(),
});

const diffStatsResponseSchema = z.object({
  filesChanged: z.number(),
  additions: z.number(),
  deletions: z.number(),
});

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number().optional(),
});

/**
 * Diff routes for git diff operations
 */
const diffRoutes: FastifyPluginAsync = async (fastify) => {
  const projectService = new ProjectService();
  const diffParser = getGitDiffParser();
  const diffConverter = getDiffConverter();

  /**
   * GET /diff-data
   * Get structured diff data for a project
   *
   * Query parameters:
   * - projectId: Project CUID (required)
   * - base: Base ref (branch, commit, tag) - optional
   * - compare: Compare ref (branch, commit, tag) - optional
   * - staged: Show only staged changes - optional, default false
   * - contextLines: Number of context lines - optional, default 3, max 10
   *
   * Examples:
   * - /diff-data?projectId=abc123 - Working tree changes
   * - /diff-data?projectId=abc123&staged=true - Staged changes
   * - /diff-data?projectId=abc123&base=main - Changes vs main branch
   * - /diff-data?projectId=abc123&base=main&compare=feature - Branch comparison
   * - /diff-data?projectId=abc123&base=HEAD~1 - Changes vs previous commit
   */
  fastify.get(
    '/diff-data',
    {
      schema: {
        querystring: diffQuerySchema,
        response: {
          200: parsedDiffResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
        description: 'Get structured git diff data with per-file changes',
        tags: ['git', 'diff'],
      },
    },
    async (request, reply) => {
      const startTime = Date.now();

      try {
        const { projectId, base, compare, staged, contextLines } = request.query as z.infer<typeof diffQuerySchema>;

        // Validate project exists
        let project;
        try {
          project = await projectService.getProjectById(projectId);
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return reply.code(404).send({
              error: 'NotFound',
              message: `Project ${projectId} not found`,
              statusCode: 404,
            });
          }
          throw error;
        }

        // Validate query parameters
        if (compare && !base) {
          return reply.code(400).send({
            error: 'BadRequest',
            message: 'Cannot specify "compare" without "base"',
            statusCode: 400,
          });
        }

        if (staged && (base || compare)) {
          return reply.code(400).send({
            error: 'BadRequest',
            message: 'Cannot combine "staged" with "base" or "compare"',
            statusCode: 400,
          });
        }

        // Get parsed diff
        try {
          const parsedDiff = await diffParser.getParsedDiff({
            cwd: project.localPath,
            base,
            compare,
            staged,
            contextLines,
          });

          const responseTime = Date.now() - startTime;

          // Log performance metrics
          fastify.log.info({
            endpoint: '/diff-data',
            projectId,
            filesChanged: parsedDiff.totalFiles,
            additions: parsedDiff.totalAdditions,
            deletions: parsedDiff.totalDeletions,
            responseTime,
          });

          // Warn if response is slow
          if (responseTime > 500) {
            fastify.log.warn({
              message: 'Slow diff response',
              responseTime,
              filesChanged: parsedDiff.totalFiles,
            });
          }

          return parsedDiff;
        } catch (error: any) {
          // Handle git-specific errors
          if (error.message.includes('Not a git repository')) {
            return reply.code(400).send({
              error: 'BadRequest',
              message: `Project at ${project.localPath} is not a git repository`,
              statusCode: 400,
            });
          }

          if (error.message.includes('unknown revision')) {
            return reply.code(400).send({
              error: 'BadRequest',
              message: `Invalid git reference: ${base || compare}`,
              statusCode: 400,
            });
          }

          if (error.message.includes('ambiguous argument')) {
            return reply.code(400).send({
              error: 'BadRequest',
              message: `Ambiguous git reference: ${base || compare}`,
              statusCode: 400,
            });
          }

          // Re-throw for global error handler
          throw error;
        }
      } catch (error: any) {
        fastify.log.error({
          error: error.message,
          stack: error.stack,
          endpoint: '/diff-data',
        });

        return reply.code(500).send({
          error: 'InternalServerError',
          message: 'Failed to get diff data',
          statusCode: 500,
        });
      }
    }
  );

  /**
   * GET /diff-stats
   * Get quick diff statistics without full parsing
   *
   * Query parameters:
   * - projectId: Project CUID (required)
   * - base: Base ref (branch, commit, tag) - optional
   * - compare: Compare ref (branch, commit, tag) - optional
   * - staged: Show only staged changes - optional, default false
   */
  fastify.get(
    '/diff-stats',
    {
      schema: {
        querystring: diffStatsQuerySchema,
        response: {
          200: diffStatsResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
        description: 'Get quick diff statistics without full parsing',
        tags: ['git', 'diff'],
      },
    },
    async (request, reply) => {
      try {
        const { projectId, base, compare, staged } = request.query as z.infer<typeof diffStatsQuerySchema>;

        // Validate project exists
        let project;
        try {
          project = await projectService.getProjectById(projectId);
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return reply.code(404).send({
              error: 'NotFound',
              message: `Project ${projectId} not found`,
              statusCode: 404,
            });
          }
          throw error;
        }

        // Validate query parameters
        if (compare && !base) {
          return reply.code(400).send({
            error: 'BadRequest',
            message: 'Cannot specify "compare" without "base"',
            statusCode: 400,
          });
        }

        if (staged && (base || compare)) {
          return reply.code(400).send({
            error: 'BadRequest',
            message: 'Cannot combine "staged" with "base" or "compare"',
            statusCode: 400,
          });
        }

        // Get diff stats
        try {
          const stats = await diffParser.getDiffStats({
            cwd: project.localPath,
            base,
            compare,
            staged,
          });

          return stats;
        } catch (error: any) {
          // Handle git-specific errors
          if (error.message.includes('Not a git repository')) {
            return reply.code(400).send({
              error: 'BadRequest',
              message: `Project at ${project.localPath} is not a git repository`,
              statusCode: 400,
            });
          }

          if (error.message.includes('unknown revision')) {
            return reply.code(400).send({
              error: 'BadRequest',
              message: `Invalid git reference: ${base || compare}`,
              statusCode: 400,
            });
          }

          // Re-throw for global error handler
          throw error;
        }
      } catch (error: any) {
        fastify.log.error({
          error: error.message,
          stack: error.stack,
          endpoint: '/diff-stats',
        });

        return reply.code(500).send({
          error: 'InternalServerError',
          message: 'Failed to get diff stats',
          statusCode: 500,
        });
      }
    }
  );

  /**
   * GET /diff-data-frontend
   * Get frontend-optimized diff data with virtual scrolling support
   *
   * Query parameters:
   * - projectId: Project CUID (required)
   * - base: Base ref (branch, commit, tag) - optional
   * - compare: Compare ref (branch, commit, tag) - optional
   * - staged: Show only staged changes - optional, default false
   * - contextLines: Number of context lines - optional, default 3, max 10
   *
   * This endpoint returns the same diff data but optimized for frontend consumption with:
   * - Virtual scrolling metadata (line ranges, chunk sizes)
   * - File metadata (extension, directory, estimated lines)
   * - Enhanced statistics aggregation
   * - Fast lookup indices
   */
  fastify.get(
    '/diff-data-frontend',
    {
      schema: {
        querystring: diffQuerySchema,
        response: {
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
        description: 'Get frontend-optimized diff data with virtual scrolling support',
        tags: ['git', 'diff', 'frontend'],
      },
    },
    async (request, reply) => {
      const startTime = Date.now();

      try {
        const { projectId, base, compare, staged, contextLines } = request.query as z.infer<typeof diffQuerySchema>;

        // Validate project exists
        let project;
        try {
          project = await projectService.getProjectById(projectId);
        } catch (error) {
          if (error instanceof ProjectNotFoundError) {
            return reply.code(404).send({
              error: 'NotFound',
              message: `Project ${projectId} not found`,
              statusCode: 404,
            });
          }
          throw error;
        }

        // Validate query parameters
        if (compare && !base) {
          return reply.code(400).send({
            error: 'BadRequest',
            message: 'Cannot specify "compare" without "base"',
            statusCode: 400,
          });
        }

        if (staged && (base || compare)) {
          return reply.code(400).send({
            error: 'BadRequest',
            message: 'Cannot combine "staged" with "base" or "compare"',
            statusCode: 400,
          });
        }

        // Get parsed diff and convert to frontend format
        try {
          const parsedDiff = await diffParser.getParsedDiff({
            cwd: project.localPath,
            base,
            compare,
            staged,
            contextLines,
          });

          const frontendDiff = diffConverter.convertToFrontend(parsedDiff);

          const responseTime = Date.now() - startTime;

          // Log performance metrics
          fastify.log.info({
            endpoint: '/diff-data-frontend',
            projectId,
            filesChanged: frontendDiff.stats.totalFiles,
            additions: frontendDiff.stats.totalAdditions,
            deletions: frontendDiff.stats.totalDeletions,
            totalRenderableLines: frontendDiff.metadata.totalRenderableLines,
            responseTime,
          });

          // Warn if response is slow
          if (responseTime > 500) {
            fastify.log.warn({
              message: 'Slow diff response',
              responseTime,
              filesChanged: frontendDiff.stats.totalFiles,
            });
          }

          return frontendDiff;
        } catch (error: any) {
          // Handle git-specific errors
          if (error.message.includes('Not a git repository')) {
            return reply.code(400).send({
              error: 'BadRequest',
              message: `Project at ${project.localPath} is not a git repository`,
              statusCode: 400,
            });
          }

          if (error.message.includes('unknown revision')) {
            return reply.code(400).send({
              error: 'BadRequest',
              message: `Invalid git reference: ${base || compare}`,
              statusCode: 400,
            });
          }

          if (error.message.includes('ambiguous argument')) {
            return reply.code(400).send({
              error: 'BadRequest',
              message: `Ambiguous git reference: ${base || compare}`,
              statusCode: 400,
            });
          }

          // Re-throw for global error handler
          throw error;
        }
      } catch (error: any) {
        fastify.log.error({
          error: error.message,
          stack: error.stack,
          endpoint: '/diff-data-frontend',
        });

        return reply.code(500).send({
          error: 'InternalServerError',
          message: 'Failed to get frontend diff data',
          statusCode: 500,
        });
      }
    }
  );
};

export default fp(diffRoutes);
export { diffRoutes };
