import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { setupDiagnostics, type DiagnosticsConfig } from '../lib/diagnostics';

/**
 * Diagnostics Channel Plugin for Fastify
 *
 * Integrates Node.js Diagnostics Channel with Fastify v5 to provide:
 * - Request lifecycle tracing (start, end, error events)
 * - AsyncLocalStorage context propagation for request tracking
 * - Automatic request ID generation and tracking
 * - Centralized logging with Pino integration
 *
 * The plugin automatically subscribes to Fastify's diagnostic channels
 * and logs request metrics to the configured Pino logger.
 */
const diagnosticsPlugin: FastifyPluginAsync<DiagnosticsConfig> = async (
  fastify,
  options
) => {
  // Setup diagnostics channel subscribers
  const cleanup = setupDiagnostics(fastify, options);

  // Register cleanup hook
  fastify.addHook('onClose', async () => {
    cleanup();
  });

  fastify.log.debug('Diagnostics plugin registered');
};

export default fp(diagnosticsPlugin, {
  name: 'diagnostics',
  fastify: '5.x',
});
