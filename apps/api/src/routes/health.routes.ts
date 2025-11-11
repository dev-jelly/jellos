import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { prisma } from '../lib/db';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Basic health check
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal('ok'),
            timestamp: z.string(),
            uptime: z.number(),
          }),
        },
      },
    },
    async () => {
      return {
        status: 'ok' as const,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    }
  );

  // Database health check
  fastify.get(
    '/db',
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal('ok'),
            database: z.literal('connected'),
            timestamp: z.string(),
          }),
        },
      },
    },
    async () => {
      // Test database connection
      await prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok' as const,
        database: 'connected' as const,
        timestamp: new Date().toISOString(),
      };
    }
  );

  // Readiness check
  fastify.get(
    '/ready',
    {
      schema: {
        response: {
          200: z.object({
            ready: z.boolean(),
            checks: z.object({
              database: z.boolean(),
            }),
          }),
        },
      },
    },
    async () => {
      let dbReady = false;

      try {
        await prisma.$queryRaw`SELECT 1`;
        dbReady = true;
      } catch (error) {
        fastify.log.error({ error }, 'Database check failed');
      }

      return {
        ready: dbReady,
        checks: {
          database: dbReady,
        },
      };
    }
  );
};

export default fp(healthRoutes);
export { healthRoutes };
