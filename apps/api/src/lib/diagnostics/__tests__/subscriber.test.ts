import { describe, it, expect, afterEach, vi } from 'vitest';
import diagnostics_channel from 'node:diagnostics_channel';
import { setupDiagnostics, hasDiagnosticSubscribers } from '../subscriber';
import { DiagnosticChannels } from '../types';
import type { FastifyInstance } from 'fastify';

// Mock Fastify instance
const createMockFastify = () => {
  const logs: Array<{ level: string; data: any; message?: string }> = [];

  const mockLogger = {
    trace: vi.fn((data: any, message?: string) => {
      logs.push({ level: 'trace', data, message });
    }),
    debug: vi.fn((data: any, message?: string) => {
      logs.push({ level: 'debug', data, message });
    }),
    info: vi.fn((data: any, message?: string) => {
      logs.push({ level: 'info', data, message });
    }),
    warn: vi.fn((data: any, message?: string) => {
      logs.push({ level: 'warn', data, message });
    }),
    error: vi.fn((data: any, message?: string) => {
      logs.push({ level: 'error', data, message });
    }),
  };

  return {
    log: mockLogger,
    logs,
  } as unknown as FastifyInstance & { logs: typeof logs };
};

describe('Diagnostics Subscriber', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
  });

  describe('setupDiagnostics', () => {
    it('should setup diagnostics and return cleanup function', () => {
      const fastify = createMockFastify();
      cleanup = setupDiagnostics(fastify);

      expect(cleanup).toBeInstanceOf(Function);
      expect(fastify.log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          channels: expect.arrayContaining([
            DiagnosticChannels.REQUEST_START,
            DiagnosticChannels.REQUEST_END,
            DiagnosticChannels.REQUEST_ERROR,
          ]),
        }),
        'Diagnostics channel subscribers initialized'
      );
    });

    it('should subscribe to all diagnostic channels', () => {
      const fastify = createMockFastify();
      cleanup = setupDiagnostics(fastify);

      expect(hasDiagnosticSubscribers('REQUEST_START')).toBe(true);
      expect(hasDiagnosticSubscribers('REQUEST_END')).toBe(true);
      expect(hasDiagnosticSubscribers('REQUEST_ERROR')).toBe(true);
    });

    it('should cleanup subscriptions when cleanup is called', () => {
      const fastify = createMockFastify();
      cleanup = setupDiagnostics(fastify);

      expect(hasDiagnosticSubscribers('REQUEST_START')).toBe(true);

      cleanup();
      cleanup = undefined;

      expect(fastify.log.info).toHaveBeenCalledWith(
        'Diagnostics channel subscribers cleaned up'
      );
    });
  });

  describe('Request Start Event', () => {
    it('should log request start with default config', () => {
      const fastify = createMockFastify();
      cleanup = setupDiagnostics(fastify);

      const channel = diagnostics_channel.channel(
        DiagnosticChannels.REQUEST_START
      );
      channel.publish({
        request: {
          id: 'req-123',
          method: 'GET',
          url: '/api/test',
        },
        reply: {},
        route: {
          url: '/:id',
          method: 'GET',
          routePath: '/api/test',
        },
      });

      const debugLogs = (fastify as any).logs.filter(
        (log: any) => log.level === 'debug'
      );
      expect(debugLogs.length).toBeGreaterThan(0);
      const requestLog = debugLogs.find(
        (log: any) => log.data?.event === 'request.start'
      );
      expect(requestLog).toBeDefined();
      expect(requestLog.data).toMatchObject({
        event: 'request.start',
        method: 'GET',
        url: '/api/test',
        requestId: 'req-123',
      });
    });

    it('should not log request start when disabled', () => {
      const fastify = createMockFastify();
      cleanup = setupDiagnostics(fastify, { logRequestStart: false });

      const channel = diagnostics_channel.channel(
        DiagnosticChannels.REQUEST_START
      );
      channel.publish({
        request: { id: 'req-456', method: 'POST', url: '/api/data' },
        reply: {},
        route: { url: '/api/data', method: 'POST' },
      });

      const requestLogs = (fastify as any).logs.filter(
        (log: any) => log.data?.event === 'request.start'
      );
      expect(requestLogs.length).toBe(0);
    });

    it('should include headers when configured', () => {
      const fastify = createMockFastify();
      cleanup = setupDiagnostics(fastify, { includeHeaders: true });

      const channel = diagnostics_channel.channel(
        DiagnosticChannels.REQUEST_START
      );
      channel.publish({
        request: {
          id: 'req-789',
          method: 'GET',
          url: '/api/test',
          headers: { 'user-agent': 'test', 'content-type': 'application/json' },
        },
        reply: {},
        route: { url: '/api/test', method: 'GET' },
      });

      const debugLogs = (fastify as any).logs.filter(
        (log: any) => log.level === 'debug'
      );
      const requestLog = debugLogs.find(
        (log: any) => log.data?.event === 'request.start'
      );
      expect(requestLog?.data.headers).toEqual({
        'user-agent': 'test',
        'content-type': 'application/json',
      });
    });
  });

  describe('Request End Event', () => {
    it('should log request end with status code', () => {
      const fastify = createMockFastify();
      cleanup = setupDiagnostics(fastify);

      const channel = diagnostics_channel.channel(
        DiagnosticChannels.REQUEST_END
      );
      channel.publish({
        request: {
          id: 'req-end',
          method: 'POST',
          url: '/api/create',
        },
        reply: {
          statusCode: 201,
          getHeaders: () => ({ 'content-type': 'application/json' }),
        },
        route: { url: '/api/create', method: 'POST' },
      });

      const infoLogs = (fastify as any).logs.filter(
        (log: any) => log.level === 'info'
      );
      const requestLog = infoLogs.find(
        (log: any) => log.data?.event === 'request.end'
      );
      expect(requestLog).toBeDefined();
      expect(requestLog.data).toMatchObject({
        event: 'request.end',
        method: 'POST',
        url: '/api/create',
        statusCode: 201,
        requestId: 'req-end',
      });
    });

    it('should not log request end when disabled', () => {
      const fastify = createMockFastify();
      cleanup = setupDiagnostics(fastify, { logRequestEnd: false });

      const channel = diagnostics_channel.channel(
        DiagnosticChannels.REQUEST_END
      );
      channel.publish({
        request: { id: 'req-no-log', method: 'GET', url: '/api/test' },
        reply: { statusCode: 200, getHeaders: () => ({}) },
        route: { url: '/api/test', method: 'GET' },
      });

      const requestLogs = (fastify as any).logs.filter(
        (log: any) => log.data?.event === 'request.end'
      );
      expect(requestLogs.length).toBe(0);
    });
  });

  describe('Request Error Event', () => {
    it('should log request errors', () => {
      const fastify = createMockFastify();
      cleanup = setupDiagnostics(fastify);

      const testError = new Error('Test error');
      const channel = diagnostics_channel.channel(
        DiagnosticChannels.REQUEST_ERROR
      );
      channel.publish({
        request: {
          id: 'req-error',
          method: 'DELETE',
          url: '/api/delete',
        },
        reply: { statusCode: 500, getHeaders: () => ({}) },
        error: testError,
        route: { url: '/api/delete', method: 'DELETE' },
      });

      const errorLogs = (fastify as any).logs.filter(
        (log: any) => log.level === 'error'
      );
      const requestLog = errorLogs.find(
        (log: any) => log.data?.event === 'request.error'
      );
      expect(requestLog).toBeDefined();
      expect(requestLog.data).toMatchObject({
        event: 'request.error',
        method: 'DELETE',
        url: '/api/delete',
        requestId: 'req-error',
        error: {
          name: 'Error',
          message: 'Test error',
        },
      });
      expect(requestLog.data.error.stack).toBeDefined();
    });

    it('should not log request errors when disabled', () => {
      const fastify = createMockFastify();
      cleanup = setupDiagnostics(fastify, { logRequestError: false });

      const channel = diagnostics_channel.channel(
        DiagnosticChannels.REQUEST_ERROR
      );
      channel.publish({
        request: { id: 'req-err', method: 'GET', url: '/api/test' },
        reply: { statusCode: 500, getHeaders: () => ({}) },
        error: new Error('Test'),
        route: { url: '/api/test', method: 'GET' },
      });

      const errorLogs = (fastify as any).logs.filter(
        (log: any) => log.data?.event === 'request.error'
      );
      expect(errorLogs.length).toBe(0);
    });
  });

  describe('Custom log levels', () => {
    it('should use custom log level for request start', () => {
      const fastify = createMockFastify();
      cleanup = setupDiagnostics(fastify, { requestStartLogLevel: 'info' });

      const channel = diagnostics_channel.channel(
        DiagnosticChannels.REQUEST_START
      );
      channel.publish({
        request: { id: 'req-custom', method: 'GET', url: '/api/test' },
        reply: {},
        route: { url: '/api/test', method: 'GET' },
      });

      const infoLogs = (fastify as any).logs.filter(
        (log: any) => log.level === 'info'
      );
      expect(
        infoLogs.some((log: any) => log.data?.event === 'request.start')
      ).toBe(true);
    });

    it('should use custom log level for request end', () => {
      const fastify = createMockFastify();
      cleanup = setupDiagnostics(fastify, { requestEndLogLevel: 'debug' });

      const channel = diagnostics_channel.channel(
        DiagnosticChannels.REQUEST_END
      );
      channel.publish({
        request: { id: 'req-custom-end', method: 'GET', url: '/api/test' },
        reply: { statusCode: 200, getHeaders: () => ({}) },
        route: { url: '/api/test', method: 'GET' },
      });

      const debugLogs = (fastify as any).logs.filter(
        (log: any) => log.level === 'debug'
      );
      expect(
        debugLogs.some((log: any) => log.data?.event === 'request.end')
      ).toBe(true);
    });
  });
});
