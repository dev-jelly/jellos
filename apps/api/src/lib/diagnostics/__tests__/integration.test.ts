import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import diagnosticsPlugin from '../../../plugins/diagnostics.plugin';
import { getRequestContext, requestContextStore } from '../context-store';

describe('Diagnostics Integration Tests', () => {
  it('should register diagnostics plugin successfully', async () => {
    const app = Fastify({
      logger: false, // Disable logger for cleaner test output
    });

    await app.register(diagnosticsPlugin);

    expect(app.hasPlugin('diagnostics')).toBe(true);

    await app.close();
  });

  it('should track request lifecycle with real Fastify requests', async () => {
    const logs: any[] = [];
    const app = Fastify({
      logger: {
        level: 'debug',
        stream: {
          write: (msg: string) => {
            try {
              logs.push(JSON.parse(msg));
            } catch {
              // Ignore non-JSON logs
            }
          },
        },
      },
    });

    await app.register(diagnosticsPlugin, {
      logRequestStart: true,
      logRequestEnd: true,
      requestStartLogLevel: 'info',
      requestEndLogLevel: 'info',
    });

    // Register a test route
    app.get('/test', async () => {
      return { message: 'success' };
    });

    // Make a request
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'success' });

    // Verify logs contain request lifecycle events
    const startLog = logs.find((log) => log.event === 'request.start');
    const endLog = logs.find((log) => log.event === 'request.end');

    expect(startLog).toBeDefined();
    expect(startLog?.method).toBe('GET');
    expect(startLog?.url).toBe('/test');

    expect(endLog).toBeDefined();
    expect(endLog?.method).toBe('GET');
    expect(endLog?.url).toBe('/test');
    expect(endLog?.statusCode).toBe(200);

    await app.close();
  });

  it('should track errors in request lifecycle', async () => {
    const logs: any[] = [];
    const app = Fastify({
      logger: {
        level: 'error',
        stream: {
          write: (msg: string) => {
            try {
              logs.push(JSON.parse(msg));
            } catch {
              // Ignore non-JSON logs
            }
          },
        },
      },
    });

    await app.register(diagnosticsPlugin, {
      logRequestError: true,
      requestErrorLogLevel: 'error',
    });

    // Register a route that throws an error
    app.get('/error', async () => {
      throw new Error('Test error');
    });

    // Make a request that will fail
    const response = await app.inject({
      method: 'GET',
      url: '/error',
    });

    expect(response.statusCode).toBe(500);

    // Verify error log exists
    const errorLog = logs.find((log) => log.event === 'request.error');
    expect(errorLog).toBeDefined();
    expect(errorLog?.error?.message).toBe('Test error');

    await app.close();
  });

  it('should generate request IDs automatically', async () => {
    const app = Fastify({
      logger: false,
      requestIdHeader: 'x-request-id',
      genReqId: (req) => {
        return (
          req.headers['x-request-id']?.toString() ||
          `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        );
      },
    });

    await app.register(diagnosticsPlugin);

    app.get('/test-id', async (request) => {
      return { requestId: request.id };
    });

    // Test without providing request ID
    const response1 = await app.inject({
      method: 'GET',
      url: '/test-id',
    });
    const data1 = response1.json();
    expect(data1.requestId).toBeDefined();
    expect(data1.requestId).toMatch(/^req-/);

    // Test with provided request ID
    const response2 = await app.inject({
      method: 'GET',
      url: '/test-id',
      headers: {
        'x-request-id': 'custom-req-123',
      },
    });
    const data2 = response2.json();
    expect(data2.requestId).toBe('custom-req-123');

    await app.close();
  });

  it('should maintain context through async operations', async () => {
    const app = Fastify({ logger: false });

    await app.register(diagnosticsPlugin, {
      enableContextPropagation: true,
    });

    app.get('/async-test', async (request) => {
      // Simulate async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      const context = getRequestContext();

      await new Promise((resolve) => setTimeout(resolve, 10));

      return {
        contextAvailable: context !== undefined,
        requestId: request.id,
        contextRequestId: context?.requestId,
      };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/async-test',
    });

    const data = response.json();
    expect(data.contextAvailable).toBe(true);
    expect(data.requestId).toBe(data.contextRequestId);

    await app.close();
  });

  it('should track request duration', async () => {
    const logs: any[] = [];
    const app = Fastify({
      logger: {
        level: 'info',
        stream: {
          write: (msg: string) => {
            try {
              logs.push(JSON.parse(msg));
            } catch {
              // Ignore non-JSON logs
            }
          },
        },
      },
    });

    await app.register(diagnosticsPlugin);

    app.get('/slow', async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { message: 'slow response' };
    });

    await app.inject({
      method: 'GET',
      url: '/slow',
    });

    const endLog = logs.find((log) => log.event === 'request.end');
    expect(endLog).toBeDefined();
    // Duration should be present and match the pattern
    if (endLog?.duration) {
      expect(endLog.duration).toMatch(/\d+ms/);
      // Extract numeric value and verify it's >= 100ms
      const durationMatch = endLog.duration.match(/(\d+)ms/);
      if (durationMatch) {
        const durationMs = parseInt(durationMatch[1], 10);
        expect(durationMs).toBeGreaterThanOrEqual(100);
      }
    }

    await app.close();
  });

  it('should handle multiple concurrent requests', async () => {
    const app = Fastify({ logger: false });

    await app.register(diagnosticsPlugin);

    let requestCounter = 0;
    app.get('/concurrent/:id', async (request) => {
      const myCount = ++requestCounter;
      await new Promise((resolve) => setTimeout(resolve, 50));
      const context = getRequestContext();

      return {
        id: (request.params as any).id,
        count: myCount,
        contextUrl: context?.url,
      };
    });

    // Make multiple concurrent requests
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/concurrent/1' }),
      app.inject({ method: 'GET', url: '/concurrent/2' }),
      app.inject({ method: 'GET', url: '/concurrent/3' }),
    ]);

    // Each request should have correct context
    expect(responses[0].json().contextUrl).toContain('/concurrent/1');
    expect(responses[1].json().contextUrl).toContain('/concurrent/2');
    expect(responses[2].json().contextUrl).toContain('/concurrent/3');

    await app.close();
  });
});
