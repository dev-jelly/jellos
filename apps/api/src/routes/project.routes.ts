import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  ProjectService,
  ProjectAlreadyExistsError,
  ProjectNotFoundError,
} from '../services/project.service';
import { discoverAgents } from '../lib/agent-discovery/discovery-service';
import {
  performHealthCheck,
  HealthStatus,
} from '../lib/agent-discovery/health-check';
import {
  getCachedHealthCheck,
  setCachedHealthCheck,
  invalidateProjectHealthChecks,
} from '../lib/cache/health-check-cache';

// Zod schemas for validation
const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  localPath: z.string().min(1),
  defaultBranch: z.string().default('main'),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  defaultBranch: z.string().optional(),
});

const projectIdSchema = z.object({
  id: z.string().cuid(),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Response schemas
const projectResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  localPath: z.string(),
  defaultBranch: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const projectListResponseSchema = z.object({
  data: z.array(projectResponseSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
  }),
});

// Agent health check schemas
const agentHealthResponseSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  label: z.string(),
  cmd: z.string(),
  args: z.array(z.string()),
  envMask: z.array(z.string()),
  version: z.string().optional(),
  path: z.string().optional(),
  source: z.string(),
  priority: z.number(),
  health: z
    .object({
      status: z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']),
      version: z.string().optional(),
      responseTime: z.number(),
      lastChecked: z.date(),
      error: z.string().optional(),
    })
    .optional(),
});

const agentListResponseSchema = z.object({
  data: z.array(agentHealthResponseSchema),
  projectId: z.string(),
  totalAgents: z.number(),
});

// Links configuration schemas
const linkTemplateSchema = z.object({
  baseUrl: z.string(),
  prTemplate: z.string().optional(),
  commitTemplate: z.string().optional(),
  fileTemplate: z.string().optional(),
  blameTemplate: z.string().optional(),
  diffTemplate: z.string().optional(),
  issueTemplate: z.string().optional(),
  workspaceUrl: z.string().optional(),
  pipelineTemplate: z.string().optional(),
  jobTemplate: z.string().optional(),
  deploymentTemplate: z.string().optional(),
});

const linksConfigResponseSchema = z.object({
  github: linkTemplateSchema.optional(),
  linear: linkTemplateSchema.optional(),
  jenkins: linkTemplateSchema.optional(),
  githubActions: linkTemplateSchema.optional(),
  deployment: linkTemplateSchema.optional(),
}).nullable();

const projectRoutes: FastifyPluginAsync = async (fastify) => {
  const projectService = new ProjectService();

  // Create new project
  fastify.post(
    '/',
    {
      schema: {
        body: createProjectSchema,
        response: {
          201: projectResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const project = await projectService.createProject(
          request.body as any
        );
        return reply.status(201).send(project);
      } catch (error) {
        if (error instanceof ProjectAlreadyExistsError) {
          return (reply as any).code(409).send({
            error: 'Conflict',
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // List all projects with pagination
  fastify.get(
    '/',
    {
      schema: {
        querystring: querySchema,
        response: {
          200: projectListResponseSchema,
        },
      },
    },
    async (request) => {
      const { page, limit } = request.query as any;

      const { data: projects, total } = await projectService.listProjects(
        page,
        limit
      );

      return {
        data: projects,
        pagination: {
          page,
          limit,
          total,
        },
      };
    }
  );

  // Get project by ID
  fastify.get(
    '/:id',
    {
      schema: {
        params: projectIdSchema,
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as any;
        const project = await projectService.getProjectById(id);
        return project;
      } catch (error) {
        if (error instanceof ProjectNotFoundError) {
          return reply.code(404).send({
            error: 'NotFound',
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // Update project
  fastify.patch(
    '/:id',
    {
      schema: {
        params: projectIdSchema,
        body: updateProjectSchema,
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as any;
        const project = await projectService.updateProject(
          id,
          request.body as any
        );
        return project;
      } catch (error) {
        if (error instanceof ProjectNotFoundError) {
          return reply.code(404).send({
            error: 'NotFound',
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // Delete project
  fastify.delete(
    '/:id',
    {
      schema: {
        params: projectIdSchema,
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as any;
        await projectService.deleteProject(id);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof ProjectNotFoundError) {
          return reply.code(404).send({
            error: 'NotFound',
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // Get agents for project with health checks
  fastify.get(
    '/:id/agents',
    {
      schema: {
        params: projectIdSchema,
        response: {
          200: agentListResponseSchema,
          404: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as any;

        // Verify project exists
        const project = await projectService.getProjectById(id);

        // Discover agents for this project
        const agents = await discoverAgents(project.localPath);

        // Get health check for each agent (from cache or perform new check)
        const agentsWithHealth = await Promise.all(
          agents.map(async (agent) => {
            // Check cache first
            let health = await getCachedHealthCheck(id, agent.externalId);

            // If not cached, perform health check
            if (!health) {
              health = await performHealthCheck(agent);
              // Cache the result
              await setCachedHealthCheck(id, agent.externalId, health);
            }

            return {
              id: `${id}:${agent.externalId}`,
              externalId: agent.externalId,
              label: agent.label,
              cmd: agent.cmd,
              args: agent.args,
              envMask: agent.envMask,
              version: agent.version,
              path: agent.path,
              source: agent.source,
              priority: agent.priority,
              health,
            };
          })
        );

        return {
          data: agentsWithHealth,
          projectId: id,
          totalAgents: agentsWithHealth.length,
        };
      } catch (error) {
        if (error instanceof ProjectNotFoundError) {
          return reply.code(404).send({
            error: 'NotFound',
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // Refresh agent health checks for project
  fastify.post(
    '/:id/agents/refresh',
    {
      schema: {
        params: projectIdSchema,
        response: {
          200: agentListResponseSchema,
          404: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as any;

        // Verify project exists
        const project = await projectService.getProjectById(id);

        // Invalidate all cached health checks for this project
        await invalidateProjectHealthChecks(id);

        // Discover agents for this project
        const agents = await discoverAgents(project.localPath);

        // Perform fresh health checks for all agents
        const agentsWithHealth = await Promise.all(
          agents.map(async (agent) => {
            const health = await performHealthCheck(agent);
            // Cache the new result
            await setCachedHealthCheck(id, agent.externalId, health);

            return {
              id: `${id}:${agent.externalId}`,
              externalId: agent.externalId,
              label: agent.label,
              cmd: agent.cmd,
              args: agent.args,
              envMask: agent.envMask,
              version: agent.version,
              path: agent.path,
              source: agent.source,
              priority: agent.priority,
              health,
            };
          })
        );

        return {
          data: agentsWithHealth,
          projectId: id,
          totalAgents: agentsWithHealth.length,
        };
      } catch (error) {
        if (error instanceof ProjectNotFoundError) {
          return reply.code(404).send({
            error: 'NotFound',
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // Get links configuration for project
  fastify.get(
    '/:id/links',
    {
      schema: {
        params: projectIdSchema,
        response: {
          200: linksConfigResponseSchema,
          404: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as any;
        const linksConfig = await projectService.getProjectLinksConfig(id);
        return linksConfig;
      } catch (error) {
        if (error instanceof ProjectNotFoundError) {
          return reply.code(404).send({
            error: 'NotFound',
            message: error.message,
          });
        }
        throw error;
      }
    }
  );
};

export default projectRoutes;
