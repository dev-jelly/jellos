/**
 * Pull Request Routes
 *
 * Handles PR creation, status synchronization, and mapping management
 */

import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { getGitHubClient, GitHubApiError } from '../services/github-client.service';
import { PRDuplicateCheckService, PRDuplicateCheckError } from '../services/pr-duplicate-check.service';
import { issuePRMappingRepository, issueRepository } from '../repositories';
import { getPRTemplateService, PRTemplateService } from '../services/pr-template.service';
import { RecoverableError } from '../types/errors';

// Zod schemas
const createPRBodySchema = z.object({
  issueId: z.string().min(1, 'Issue ID is required'),
  issueNumber: z.string().min(1, 'Issue number is required'),
  issueTitle: z.string().min(1, 'Issue title is required'),
  projectId: z.string().cuid('Invalid project ID'),
  branchName: z.string().min(1, 'Branch name is required'),
  baseBranch: z.string().default('main'),
  title: z.string().optional(), // Optional custom title, defaults to template
  description: z.string().optional(), // Optional custom description
  executionSummary: z.string().optional(), // Agent execution summary
  filesChanged: z.array(z.string()).optional(), // List of changed files
});

const prIdParamsSchema = z.object({
  id: z.string().cuid(),
});

const issueIdParamsSchema = z.object({
  issueId: z.string().min(1),
});

// Response schemas
const prMappingResponseSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  projectId: z.string(),
  prNumber: z.number(),
  prUrl: z.string(),
  branchName: z.string(),
  state: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  closedAt: z.date().nullable(),
});

const createPRResponseSchema = z.object({
  success: z.boolean(),
  pr: z.object({
    number: z.number(),
    url: z.string(),
    title: z.string(),
    state: z.string(),
  }),
  mapping: prMappingResponseSchema,
});

type CreatePRBody = z.infer<typeof createPRBodySchema>;
type CreatePRResponse = z.infer<typeof createPRResponseSchema>;

/**
 * PR Routes Plugin
 */
export const prRoutes: FastifyPluginAsync = async (fastify) => {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * POST /api/pull-requests
   * Create a new Pull Request
   */
  server.post<{
    Body: CreatePRBody;
    Reply: CreatePRResponse | { error: string; message: string };
  }>(
    '/pull-requests',
    {
      schema: {
        description: 'Create a new Pull Request for an issue',
        tags: ['pull-requests'],
        body: createPRBodySchema,
        response: {
          201: createPRResponseSchema,
          400: z.object({
            error: z.string(),
            message: z.string(),
          }),
          409: z.object({
            error: z.string(),
            message: z.string(),
          }),
          500: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const {
        issueId,
        issueNumber,
        issueTitle,
        projectId,
        branchName,
        baseBranch,
        title: customTitle,
        description: customDescription,
        executionSummary,
        filesChanged,
      } = request.body;

      try {
        // 1. Initialize services
        const githubClient = getGitHubClient();
        const duplicateCheckService = new PRDuplicateCheckService(
          githubClient,
          issuePRMappingRepository
        );

        if (!githubClient.isConfigured()) {
          return reply.code(500).send({
            error: 'GitHub not configured',
            message: 'GitHub client is not configured. Please set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO environment variables.',
          });
        }

        // 2. Check for duplicates
        try {
          await duplicateCheckService.validateNoDuplicates({
            issueId,
            projectId,
            branchName,
          });
        } catch (error) {
          if (error instanceof PRDuplicateCheckError) {
            return reply.code(409).send({
              error: 'Duplicate PR detected',
              message: error.message,
            });
          }
          throw error;
        }

        // 3. Get issue details from database
        const issue = await issueRepository.findById(issueId);
        if (!issue) {
          return reply.code(404).send({
            error: 'Issue not found',
            message: `Issue with ID ${issueId} not found`,
          });
        }

        // 4. Generate PR title and body using template
        const prTemplateService = getPRTemplateService();
        const templateContext = PRTemplateService.buildContext(
          issue,
          undefined, // execution
          filesChanged ? { files: filesChanged, summary: executionSummary } : undefined,
          { baseBranch }
        );

        const templateResult = await prTemplateService.render(templateContext);
        const prTitle = customTitle || templateResult.title;
        const prBody = customDescription || templateResult.body;

        // 5. Create PR via GitHub API
        const pr = await githubClient.createPR({
          title: prTitle,
          body: prBody,
          head: branchName,
          base: baseBranch,
        });

        // 6. Save PR mapping to database
        const mapping = await issuePRMappingRepository.create({
          issueId,
          projectId,
          prNumber: pr.number,
          prUrl: pr.html_url,
          branchName,
          state: 'open',
        });

        // 7. Return success response
        return reply.code(201).send({
          success: true,
          pr: {
            number: pr.number,
            url: pr.html_url,
            title: pr.title,
            state: pr.state,
          },
          mapping: {
            id: mapping.id,
            issueId: mapping.issueId,
            projectId: mapping.projectId,
            prNumber: mapping.prNumber,
            prUrl: mapping.prUrl,
            branchName: mapping.branchName,
            state: mapping.state,
            createdAt: mapping.createdAt,
            updatedAt: mapping.updatedAt,
            closedAt: mapping.closedAt,
          },
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to create PR');

        if (error instanceof GitHubApiError) {
          return reply.code(error.recoverable ? 503 : 400).send({
            error: 'GitHub API error',
            message: error.message,
          });
        }

        if (error instanceof RecoverableError) {
          return reply.code(503).send({
            error: 'Service temporarily unavailable',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    }
  );

  /**
   * GET /api/pull-requests/:id
   * Get PR mapping by ID
   */
  server.get<{
    Params: { id: string };
  }>(
    '/pull-requests/:id',
    {
      schema: {
        description: 'Get PR mapping by ID',
        tags: ['pull-requests'],
        params: prIdParamsSchema,
        response: {
          200: prMappingResponseSchema,
          404: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const mapping = await issuePRMappingRepository.findById(id);

      if (!mapping) {
        return reply.code(404).send({
          error: 'Not found',
          message: `PR mapping with ID ${id} not found`,
        });
      }

      return reply.send(mapping);
    }
  );

  /**
   * GET /api/issues/:issueId/pull-requests
   * Get all PR mappings for an issue
   */
  server.get<{
    Params: { issueId: string };
  }>(
    '/issues/:issueId/pull-requests',
    {
      schema: {
        description: 'Get all PR mappings for an issue',
        tags: ['pull-requests'],
        params: issueIdParamsSchema,
        response: {
          200: z.object({
            count: z.number(),
            prs: z.array(prMappingResponseSchema),
          }),
        },
      },
    },
    async (request, reply) => {
      const { issueId } = request.params;

      const mappings = await issuePRMappingRepository.findByIssueId(issueId);

      return reply.send({
        count: mappings.length,
        prs: mappings,
      });
    }
  );
};

export default prRoutes;
