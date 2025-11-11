import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  ProjectService,
  ProjectAlreadyExistsError,
  ProjectNotFoundError,
} from '../services/project.service';

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
};

export default fp(projectRoutes);
export { projectRoutes };
