import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { prisma } from './lib/db';
import { healthRoutes } from './routes/health.routes';
import { projectRoutes } from './routes/project.routes';
import { linearSyncRoutes } from './routes/linear-sync.routes';
import { issueRoutes } from './routes/issue.routes';

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Set Zod validator and serializer
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register CORS
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  });

  // Register routes
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(projectRoutes, { prefix: '/api/projects' });
  await app.register(linearSyncRoutes, { prefix: '/api/linear' });
  await app.register(issueRoutes, { prefix: '/api/issues' });

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
