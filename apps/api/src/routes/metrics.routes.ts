/**
 * Metrics Routes
 * Task 12.8: Expose saga metrics via API
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSagaMetricsService } from '../services/saga-metrics.service';

/**
 * Register metrics routes
 */
export async function metricsRoutes(fastify: FastifyInstance) {
  const metricsService = getSagaMetricsService();

  /**
   * GET /metrics/sagas - Get aggregated saga metrics
   */
  fastify.get('/sagas', {
    schema: {
      response: {
        200: z.any(),
      },
    },
  }, async (request, reply) => {
    const aggregated = metricsService.getAggregatedMetrics();
    return {
      data: aggregated,
      timestamp: new Date().toISOString(),
    };
  });

  /**
   * GET /metrics/sagas/:id - Get metrics for specific saga
   */
  fastify.get<{
    Params: { id: string };
  }>('/sagas/:id', {
    schema: {
      params: z.object({ id: z.string() }),
      response: {
        200: z.any(),
        404: z.object({
          error: z.string(),
          message: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const metrics = metricsService.getSagaMetrics(id);

    if (!metrics) {
      reply.code(404);
      return {
        error: 'Saga not found',
        message: `No metrics found for saga ${id}`,
      };
    }

    return { data: metrics };
  });

  /**
   * GET /metrics/sagas/recent - Get recent saga metrics
   */
  fastify.get<{
    Querystring: { count?: string };
  }>('/sagas/recent', {
    schema: {
      querystring: z.object({
        count: z.string().optional().default('10'),
      }),
      response: {
        200: z.any(),
      },
    },
  }, async (request, reply) => {
    const count = parseInt(request.query.count || '10', 10);
    const recent = metricsService.getRecentMetrics(count);

    return {
      data: recent,
      count: recent.length,
    };
  });

  /**
   * GET /metrics/sagas/slow - Get slow sagas
   */
  fastify.get<{
    Querystring: { threshold?: string };
  }>('/sagas/slow', {
    schema: {
      querystring: z.object({
        threshold: z.string().optional().default('5000'),
      }),
      response: {
        200: z.any(),
      },
    },
  }, async (request, reply) => {
    const threshold = parseInt(request.query.threshold || '5000', 10);
    const slow = metricsService.getSlowSagas(threshold);

    return {
      data: slow,
      count: slow.length,
      threshold,
    };
  });

  /**
   * DELETE /metrics/sagas - Clear all metrics
   */
  fastify.delete('/sagas', {
    schema: {
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    metricsService.clearMetrics();

    return {
      success: true,
      message: 'All saga metrics cleared',
    };
  });
}
