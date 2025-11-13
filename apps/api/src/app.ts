import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { prisma } from './lib/db';
import { healthRoutes } from './routes/health.routes';
import projectRoutes from './routes/project.routes';
import { linearSyncRoutes } from './routes/linear-sync.routes';
import { issueRoutes } from './routes/issue.routes';
import { executionRoutes } from './routes/execution.routes';
import { diffRoutes } from './routes/diff.routes';
import { prRoutes } from './routes/pr.routes';
import { webhookRoutes } from './routes/webhook.routes';
import ssePlugin from './plugins/sse.plugin';
import rawBodyPlugin from './plugins/raw-body.plugin';
import diagnosticsPlugin from './plugins/diagnostics.plugin';
import systemPressurePlugin from './plugins/system-pressure.plugin';
import eventHooksPlugin from './plugins/event-hooks.plugin';
import { createLoggerConfig } from './lib/logger';
import { initializeSagaWorkflows } from './services/saga-workflows.service';
import { initializeSagaEventIntegration } from './services/saga-event-integration.service';

export async function buildApp() {
  const app = Fastify({
    // Use structured logging configuration
    logger: createLoggerConfig(),

    // Enable request ID generation and logging
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    genReqId: (req) => {
      // Use existing request ID from header if available, otherwise generate new one
      return (
        req.headers['x-request-id']?.toString() ||
        `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      );
    },

    // Enable raw body for webhook signature verification
    bodyLimit: 1048576, // 1MB limit for webhook payloads
  }).withTypeProvider<ZodTypeProvider>();

  // Set Zod validator and serializer
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  });

  // Register raw body plugin (before other plugins that parse body)
  await app.register(rawBodyPlugin, {
    field: 'rawBody',
    contentTypes: ['application/json'],
    limit: 1048576, // 1MB
  });

  // Register system pressure monitoring (early to reject requests under pressure)
  await app.register(systemPressurePlugin);

  // Register diagnostics plugin (early to capture all requests)
  await app.register(diagnosticsPlugin, {
    logRequestStart: true,
    logRequestEnd: true,
    logRequestError: true,
    requestStartLogLevel: 'debug',
    requestEndLogLevel: 'info',
    requestErrorLogLevel: 'error',
    enableContextPropagation: true,
  });

  // Register event hooks plugin (after diagnostics for context access)
  await app.register(eventHooksPlugin, {
    emitRequestEvents: true,
    emitErrorEvents: true,
    emitStateTransitions: true,
    skipHealthChecks: true,
    routeFilters: [], // Emit for all routes (except health checks)
  });

  // Register SSE plugin
  await app.register(ssePlugin);

  // Initialize saga workflows and event integration
  initializeSagaWorkflows();
  initializeSagaEventIntegration();

  // Register routes
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(projectRoutes, { prefix: '/api/projects' });
  await app.register(linearSyncRoutes, { prefix: '/api/linear' });
  await app.register(issueRoutes, { prefix: '/api/issues' });
  await app.register(executionRoutes, { prefix: '/api/executions' });
  await app.register(diffRoutes, { prefix: '/api/diff' });
  await app.register(prRoutes, { prefix: '/api' });
  await app.register(webhookRoutes, { prefix: '/api' });

  // Global error handler
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode || 500;
    const errorMessage = error.message || 'Internal server error';
    const errorName = error.name || 'InternalServerError';

    app.log.error({
      error: errorMessage,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    reply.status(statusCode).send({
      error: errorName,
      message: errorMessage,
      statusCode,
    });
  });

  // Graceful shutdown
  const closeGracefully = async (signal: string) => {
    app.log.info(`Received ${signal}, closing gracefully`);
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => closeGracefully('SIGINT'));
  process.on('SIGTERM', () => closeGracefully('SIGTERM'));

  return app;
}
