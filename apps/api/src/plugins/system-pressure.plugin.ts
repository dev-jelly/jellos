/**
 * System Pressure Plugin
 * Monitors system health and returns 503 when under pressure
 *
 * Features:
 * - Memory usage monitoring
 * - Event loop delay monitoring
 * - Heap usage monitoring
 * - Configurable thresholds via environment variables
 * - Event bus integration for alerting
 */

import fp from 'fastify-plugin';
import underPressure from '@fastify/under-pressure';
import type { FastifyPluginAsync } from 'fastify';
import { eventBus } from '../lib/event-bus';

/**
 * System pressure configuration from environment
 */
interface SystemPressureConfig {
  maxEventLoopDelay: number; // milliseconds
  maxRssBytes: number; // bytes (RSS - Resident Set Size)
  maxHeapUsedBytes: number; // bytes (Heap Used)
  healthCheckInterval: number; // milliseconds
  sampleInterval: number; // milliseconds
}

/**
 * Load configuration from environment with defaults
 */
function loadConfig(): SystemPressureConfig {
  const MAX_EVENT_LOOP_DELAY_MS = parseInt(
    process.env.MAX_EVENT_LOOP_DELAY_MS || '1000',
    10
  );
  const MAX_MEMORY_USAGE_MB = parseInt(
    process.env.MAX_MEMORY_USAGE_MB || '512',
    10
  );
  const MAX_HEAP_USAGE_MB = parseInt(
    process.env.MAX_HEAP_USAGE_MB || '384',
    10
  );
  const PRESSURE_CHECK_INTERVAL_MS = parseInt(
    process.env.PRESSURE_CHECK_INTERVAL_MS || '5000',
    10
  );
  const PRESSURE_SAMPLE_INTERVAL_MS = parseInt(
    process.env.PRESSURE_SAMPLE_INTERVAL_MS || '1000',
    10
  );

  return {
    maxEventLoopDelay: MAX_EVENT_LOOP_DELAY_MS,
    maxRssBytes: MAX_MEMORY_USAGE_MB * 1024 * 1024, // Convert MB to bytes
    maxHeapUsedBytes: MAX_HEAP_USAGE_MB * 1024 * 1024, // Convert MB to bytes
    healthCheckInterval: PRESSURE_CHECK_INTERVAL_MS,
    sampleInterval: PRESSURE_SAMPLE_INTERVAL_MS,
  };
}

/**
 * Track pressure state to avoid duplicate events
 */
const pressureState = {
  memory: false,
  eventLoop: false,
  heap: false,
};

/**
 * System pressure plugin
 */
const systemPressurePlugin: FastifyPluginAsync = async (fastify, opts) => {
  const config = loadConfig();

  // Register under-pressure plugin
  await fastify.register(underPressure, {
    maxEventLoopDelay: config.maxEventLoopDelay,
    maxRssBytes: config.maxRssBytes,
    maxHeapUsedBytes: config.maxHeapUsedBytes,
    pressureHandler: (req, rep, type, value) => {
      // Emit high pressure event
      const threshold =
        type === 'eventLoopDelay'
          ? config.maxEventLoopDelay
          : type === 'rssBytes'
          ? config.maxRssBytes
          : config.maxHeapUsedBytes;

      const pressureType =
        type === 'eventLoopDelay'
          ? 'eventLoop'
          : type === 'rssBytes'
          ? 'memory'
          : 'heap';

      // Only emit if not already in high pressure state
      if (!pressureState[pressureType]) {
        pressureState[pressureType] = true;
        eventBus.emitEvent('system.pressure.high', {
          type: pressureType,
          value: value || 0,
          threshold,
          timestamp: new Date(),
        });

        fastify.log.warn({
          msg: `System under pressure: ${type}`,
          type,
          value,
          threshold,
        });
      }

      // Return 503 Service Unavailable
      rep.code(503).send({
        error: 'Service Unavailable',
        message: 'System under pressure, please retry later',
        type,
        retryAfter: 30, // seconds
      });
    },
    healthCheck: async () => {
      // Custom health check logic
      // Return true if healthy, false if unhealthy
      const memUsage = process.memoryUsage();
      const heapUsed = memUsage.heapUsed;
      const rss = memUsage.rss;

      // Check if we recovered from pressure
      if (pressureState.memory && rss < config.maxRssBytes * 0.8) {
        pressureState.memory = false;
        eventBus.emitEvent('system.pressure.normal', {
          type: 'memory',
          value: rss,
          timestamp: new Date(),
        });
        fastify.log.info({
          msg: 'System memory pressure recovered',
          value: rss,
        });
      }

      if (pressureState.heap && heapUsed < config.maxHeapUsedBytes * 0.8) {
        pressureState.heap = false;
        eventBus.emitEvent('system.pressure.normal', {
          type: 'heap',
          value: heapUsed,
          timestamp: new Date(),
        });
        fastify.log.info({
          msg: 'System heap pressure recovered',
          value: heapUsed,
        });
      }

      return true; // Continue running health checks
    },
    healthCheckInterval: config.healthCheckInterval,
    sampleInterval: config.sampleInterval,
  });

  fastify.log.info({
    msg: 'System pressure monitoring enabled',
    config: {
      maxEventLoopDelay: `${config.maxEventLoopDelay}ms`,
      maxRssBytes: `${config.maxRssBytes / 1024 / 1024}MB`,
      maxHeapUsedBytes: `${config.maxHeapUsedBytes / 1024 / 1024}MB`,
      healthCheckInterval: `${config.healthCheckInterval}ms`,
      sampleInterval: `${config.sampleInterval}ms`,
    },
  });

  // Add decorator to access pressure metrics
  fastify.decorate('memoryUsage', () => {
    return fastify.memoryUsage();
  });
};

export default fp(systemPressurePlugin, {
  name: 'system-pressure',
  fastify: '5.x',
});
