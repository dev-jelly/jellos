import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { HealthCheckService, HealthStatus } from '../services/health-check.service';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const healthCheckService = new HealthCheckService({
    timeout: 3000,
    includeDetails: false,
  });

  // Liveness probe - Kubernetes /healthz endpoint
  fastify.get(
    '/healthz',
    {
      schema: {
        description: 'Liveness probe - checks if application is alive',
        tags: ['health'],
        querystring: z.object({}).optional(),
        response: {
          200: z.object({
            status: z.enum(['healthy', 'degraded', 'unhealthy']),
            timestamp: z.string(),
            uptime: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const result = await healthCheckService.checkLiveness();

      // Liveness should always return 200 unless the app crashes
      return {
        status: result.status,
        timestamp: result.timestamp,
        uptime: result.uptime,
      };
    }
  );

  // Readiness probe - Kubernetes /readyz endpoint
  fastify.get(
    '/readyz',
    {
      schema: {
        description: 'Readiness probe - checks if application is ready to serve traffic',
        tags: ['health'],
        querystring: z
          .object({
            verbose: z.string().optional(),
          })
          .optional(),
        response: {
          200: z.object({
            status: z.enum(['healthy', 'degraded', 'unhealthy']),
            timestamp: z.string(),
            uptime: z.number(),
            components: z.record(
              z.string(),
              z.object({
                status: z.enum(['healthy', 'degraded', 'unhealthy']),
                responseTime: z.number(),
                message: z.string().optional(),
                details: z.record(z.string(), z.any()).optional(),
                error: z.string().optional(),
              })
            ),
            checks: z.object({
              passed: z.number(),
              failed: z.number(),
              total: z.number(),
            }),
          }),
          503: z.object({
            status: z.enum(['healthy', 'degraded', 'unhealthy']),
            timestamp: z.string(),
            uptime: z.number(),
            components: z.record(
              z.string(),
              z.object({
                status: z.enum(['healthy', 'degraded', 'unhealthy']),
                responseTime: z.number(),
                message: z.string().optional(),
                details: z.record(z.string(), z.any()).optional(),
                error: z.string().optional(),
              })
            ),
            checks: z.object({
              passed: z.number(),
              failed: z.number(),
              total: z.number(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const query = request.query as { verbose?: string } | undefined;
      const verbose = query?.verbose === 'true';
      const result = await healthCheckService.checkReadiness(verbose);

      // Log unhealthy status
      if (result.status === HealthStatus.UNHEALTHY) {
        fastify.log.error(
          {
            status: result.status,
            components: result.components,
            checks: result.checks,
          },
          'Readiness check failed'
        );
      } else if (result.status === HealthStatus.DEGRADED) {
        fastify.log.warn(
          {
            status: result.status,
            components: result.components,
            checks: result.checks,
          },
          'Readiness check degraded'
        );
      }

      // Return 503 if unhealthy (not ready to serve traffic)
      const statusCode = result.status === HealthStatus.UNHEALTHY ? 503 : 200;
      reply.status(statusCode);

      return result;
    }
  );

  // Legacy basic health check (backwards compatibility)
  fastify.get(
    '/',
    {
      schema: {
        description: 'Basic health check (legacy)',
        tags: ['health'],
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

  // Legacy database health check (backwards compatibility)
  fastify.get(
    '/db',
    {
      schema: {
        description: 'Database health check (legacy)',
        tags: ['health'],
        response: {
          200: z.object({
            status: z.literal('ok'),
            database: z.literal('connected'),
            timestamp: z.string(),
          }),
          503: z.object({
            status: z.literal('error'),
            database: z.literal('disconnected'),
            timestamp: z.string(),
            error: z.string().optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const result = await healthCheckService.checkReadiness(false);

      if (result.components.database?.status === HealthStatus.UNHEALTHY) {
        reply.status(503);
        return {
          status: 'error' as const,
          database: 'disconnected' as const,
          timestamp: result.timestamp,
          error: result.components.database.error,
        };
      }

      return {
        status: 'ok' as const,
        database: 'connected' as const,
        timestamp: result.timestamp,
      };
    }
  );

  // Legacy ready check (backwards compatibility)
  fastify.get(
    '/ready',
    {
      schema: {
        description: 'Readiness check (legacy)',
        tags: ['health'],
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
      const result = await healthCheckService.checkReadiness(false);

      return {
        ready: result.status !== HealthStatus.UNHEALTHY,
        checks: {
          database: result.components.database?.status !== HealthStatus.UNHEALTHY,
        },
      };
    }
  );

  // System metrics endpoint - exposes circuit breaker and pressure monitoring
  fastify.get(
    '/metrics',
    {
      schema: {
        description: 'System metrics including circuit breaker status and memory pressure',
        tags: ['health'],
        response: {
          200: z.object({
            timestamp: z.string(),
            uptime: z.number(),
            memory: z.object({
              rss: z.number(),
              heapUsed: z.number(),
              heapTotal: z.number(),
              external: z.number(),
              arrayBuffers: z.number(),
            }),
            circuitBreakers: z.object({
              github: z.string(),
              linear: z.string(),
            }),
            pressure: z.object({
              eventLoopDelay: z.number().optional(),
              eventLoopUtilization: z.object({
                idle: z.number(),
                active: z.number(),
                utilization: z.number(),
              }).optional(),
            }).optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      // Get circuit breaker states from health check service
      const githubClient = healthCheckService['githubClient'];
      const linearClient = healthCheckService['linearClient'];

      // Get event loop utilization if available (Node.js 14+)
      const eventLoopUtil = (performance as any).eventLoopUtilization?.();

      return {
        timestamp: new Date().toISOString(),
        uptime,
        memory: {
          rss: memoryUsage.rss,
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          arrayBuffers: memoryUsage.arrayBuffers,
        },
        circuitBreakers: {
          github: githubClient.getCircuitBreakerState(),
          linear: linearClient.getCircuitBreakerState(),
        },
        pressure: eventLoopUtil ? {
          eventLoopUtilization: {
            idle: eventLoopUtil.idle,
            active: eventLoopUtil.active,
            utilization: eventLoopUtil.utilization,
          },
        } : undefined,
      };
    }
  );
};

export default fp(healthRoutes);
export { healthRoutes };
