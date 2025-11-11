import Fastify from 'fastify';
import cors from '@fastify/cors';

const server = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Register CORS
await server.register(cors, {
  origin: true,
  credentials: true,
});

// Health check endpoint
server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// API routes
server.get('/api', async () => {
  return { message: 'Jellos API', version: '0.1.0' };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
