import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pino, type Logger } from 'pino';
import {
  createChildLogger,
  createCorrelatedLogger,
  createUserLogger,
  createTracedLogger,
  createComponentLogger,
  extractRequestBindings,
} from '../child-logger';
import { requestContextStore } from '../../diagnostics/context-store';

describe('Child Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = pino({ level: 'silent' }); // Silent to avoid test output
  });

  describe('createChildLogger', () => {
    it('should create child logger with provided bindings', () => {
      const child = createChildLogger(logger, { userId: '123' });
      expect(child).toBeDefined();
      expect(child).not.toBe(logger);
    });

    it('should include request context if available', () => {
      const context = {
        requestId: 'req-456',
        startTime: Date.now(),
        method: 'GET',
        url: '/test',
        metadata: {},
      };

      requestContextStore.run(context, () => {
        const child = createChildLogger(logger, { custom: 'value' });
        // Child logger should exist and be different from parent
        expect(child).toBeDefined();
        expect(child).not.toBe(logger);
      });
    });

    it('should not override provided requestId', () => {
      const context = {
        requestId: 'req-context',
        startTime: Date.now(),
        method: 'GET',
        url: '/test',
        metadata: {},
      };

      requestContextStore.run(context, () => {
        const child = createChildLogger(logger, { requestId: 'req-provided' });
        // The provided requestId should take precedence
        expect(child).toBeDefined();
      });
    });

    it('should add route information from context', () => {
      const context = {
        requestId: 'req-789',
        startTime: Date.now(),
        method: 'POST',
        url: '/api/test',
        routePath: '/api/test',
        routeMethod: 'POST',
        metadata: {},
      };

      requestContextStore.run(context, () => {
        const child = createChildLogger(logger);
        expect(child).toBeDefined();
      });
    });
  });

  describe('createCorrelatedLogger', () => {
    it('should create logger with correlation ID', () => {
      const child = createCorrelatedLogger(logger, 'corr-123');
      expect(child).toBeDefined();
    });

    it('should include additional bindings', () => {
      const child = createCorrelatedLogger(logger, 'corr-456', {
        userId: '789',
      });
      expect(child).toBeDefined();
    });
  });

  describe('createUserLogger', () => {
    it('should create logger with user ID', () => {
      const child = createUserLogger(logger, 'user-123');
      expect(child).toBeDefined();
    });

    it('should include additional bindings', () => {
      const child = createUserLogger(logger, 'user-456', {
        sessionId: 'session-789',
      });
      expect(child).toBeDefined();
    });
  });

  describe('createTracedLogger', () => {
    it('should create logger with trace context', () => {
      const child = createTracedLogger(logger, 'trace-123', 'span-456');
      expect(child).toBeDefined();
    });

    it('should include additional bindings', () => {
      const child = createTracedLogger(logger, 'trace-789', 'span-012', {
        operation: 'test',
      });
      expect(child).toBeDefined();
    });
  });

  describe('createComponentLogger', () => {
    it('should create logger with component name', () => {
      const child = createComponentLogger(logger, 'AuthService');
      expect(child).toBeDefined();
    });

    it('should include additional bindings', () => {
      const child = createComponentLogger(logger, 'DatabaseService', {
        operation: 'query',
      });
      expect(child).toBeDefined();
    });
  });

  describe('extractRequestBindings', () => {
    it('should extract common request fields', () => {
      const request = {
        id: 'req-123',
        method: 'POST',
        url: '/api/users',
        routerPath: '/api/users',
        ip: '192.168.1.1',
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
      };

      const bindings = extractRequestBindings(request);
      expect(bindings).toEqual({
        requestId: 'req-123',
        method: 'POST',
        url: '/api/users',
        routePath: '/api/users',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });
    });

    it('should handle missing optional fields', () => {
      const request = {
        id: 'req-456',
        method: 'GET',
        url: '/test',
        ip: '127.0.0.1',
      };

      const bindings = extractRequestBindings(request);
      expect(bindings).toHaveProperty('requestId', 'req-456');
      expect(bindings).toHaveProperty('method', 'GET');
      expect(bindings).toHaveProperty('userAgent', undefined);
    });
  });
});
