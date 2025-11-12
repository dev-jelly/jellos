/**
 * Fastify SSE Plugin
 * Server-Sent Events support for real-time streaming
 */

import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import fastifySSE from '@fastify/sse';

/**
 * SSE plugin configuration
 */
export interface SSEPluginOptions {
  // Add any custom options here
}

/**
 * Registers the SSE plugin with Fastify
 */
const ssePlugin: FastifyPluginAsync<SSEPluginOptions> = async (fastify, options) => {
  // Register @fastify/sse plugin
  await fastify.register(fastifySSE);

  // Add hooks for SSE connections
  fastify.addHook('onRequest', async (request, reply) => {
    // Set headers for SSE connections
    if (request.url.includes('/stream')) {
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    }
  });

  fastify.log.info('SSE plugin registered');
};

export default fp(ssePlugin, {
  name: 'sse-plugin',
  fastify: '5.x',
});
