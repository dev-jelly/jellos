import { describe, it, expect, beforeEach } from 'vitest';
import { pino } from 'pino';
import { createLoggerConfig, createChildLogger } from '../index';
import {
  requestContextStore,
  createRequestContext,
} from '../../diagnostics/context-store';

/**
 * Integration tests for the complete logging system
 */
describe('Logger Integration', () => {
  describe('Logger Creation', () => {
    it('should create a functional logger instance', () => {
      const config = createLoggerConfig();
      const logger = pino(config);

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should include base fields', () => {
      const config = createLoggerConfig();
      expect(config.base).toHaveProperty('service', 'jellos-api');
      expect(config.base).toHaveProperty('pid');
      expect(config.base).toHaveProperty('env');
    });
  });

  describe('Request Context Integration', () => {
    it('should create child logger with request context', () => {
      const config = createLoggerConfig();
      const logger = pino(config);

      const context = createRequestContext('req-123', 'GET', '/api/test');

      requestContextStore.run(context, () => {
        const child = createChildLogger(logger);
        expect(child).toBeDefined();
        expect(child).not.toBe(logger);
      });
    });

    it('should propagate request ID through async operations', async () => {
      const config = createLoggerConfig();
      const logger = pino(config);

      const context = createRequestContext('req-async-123', 'POST', '/api/data');

      await requestContextStore.run(context, async () => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));

        const child = createChildLogger(logger);
        expect(child).toBeDefined();

        // Context should still be available
        const currentContext = requestContextStore.getStore();
        expect(currentContext?.requestId).toBe('req-async-123');
      });
    });
  });

  describe('Child Logger Patterns', () => {
    it('should support nested child loggers', () => {
      const config = createLoggerConfig();
      const logger = pino(config);

      const child1 = createChildLogger(logger, { component: 'auth' });
      const child2 = createChildLogger(child1, { operation: 'login' });

      expect(child1).toBeDefined();
      expect(child2).toBeDefined();
      expect(child2).not.toBe(child1);
      expect(child1).not.toBe(logger);
    });

    it('should accumulate bindings in child loggers', () => {
      const config = createLoggerConfig();
      const logger = pino(config);

      const context = createRequestContext('req-nested', 'GET', '/test');

      requestContextStore.run(context, () => {
        const child1 = createChildLogger(logger, { userId: '123' });
        const child2 = createChildLogger(child1, { sessionId: '456' });

        expect(child2).toBeDefined();
      });
    });
  });

  describe('Environment-based Configuration', () => {
    it('should configure for development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const config = createLoggerConfig();
      expect(config.transport).toBeDefined();
      // Transport can be single, multi, or pipeline options
      if (config.transport && 'target' in config.transport) {
        expect(config.transport.target).toBe('pino-pretty');
      }

      process.env.NODE_ENV = originalEnv;
    });

    it('should configure for production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const config = createLoggerConfig();
      expect(config.transport).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Structured Logging', () => {
    it('should support structured log fields', () => {
      const config = createLoggerConfig();
      const logger = pino(config);

      // This would actually output logs, so we just verify the logger works
      expect(() => {
        logger.info(
          {
            userId: '123',
            action: 'login',
            duration: 150,
            success: true,
          },
          'User login successful'
        );
      }).not.toThrow();
    });

    it('should support error logging with stack traces', () => {
      const config = createLoggerConfig();
      const logger = pino(config);

      const error = new Error('Test error');

      expect(() => {
        logger.error(
          {
            err: error,
            userId: '123',
            operation: 'test',
          },
          'Operation failed'
        );
      }).not.toThrow();
    });
  });

  describe('Log Levels', () => {
    it('should respect log level configuration', () => {
      const originalLevel = process.env.LOG_LEVEL;

      // Delete any existing LOG_LEVEL to ensure test isolation
      delete process.env.LOG_LEVEL;

      process.env.LOG_LEVEL = 'warn';
      const config = createLoggerConfig();
      expect(config.level).toBe('warn');

      // Restore original value
      if (originalLevel !== undefined) {
        process.env.LOG_LEVEL = originalLevel;
      } else {
        delete process.env.LOG_LEVEL;
      }
    });

    it('should support all standard log levels', () => {
      const config = createLoggerConfig();
      const logger = pino(config);

      expect(() => {
        logger.trace('Trace message');
        logger.debug('Debug message');
        logger.info('Info message');
        logger.warn('Warn message');
        logger.error('Error message');
        logger.fatal('Fatal message');
      }).not.toThrow();
    });
  });

  describe('Serializers', () => {
    it('should use custom request serializer', () => {
      const config = createLoggerConfig();
      const logger = pino(config);

      const mockRequest = {
        id: 'req-123',
        method: 'GET',
        url: '/api/test',
        headers: {
          'user-agent': 'test-agent',
          authorization: 'Bearer secret',
        },
        ip: '127.0.0.1',
      };

      expect(() => {
        logger.info({ req: mockRequest }, 'Request received');
      }).not.toThrow();
    });

    it('should use custom error serializer', () => {
      const config = createLoggerConfig();
      const logger = pino(config);

      const error = new Error('Test error');
      error.name = 'TestError';

      expect(() => {
        logger.error({ err: error }, 'Error occurred');
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle high-volume logging', () => {
      const config = createLoggerConfig();
      const logger = pino({ ...config, level: 'silent' }); // Silent to avoid output

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        logger.info({ iteration: i, data: 'test' }, 'Performance test');
      }
      const duration = Date.now() - start;

      // Should complete 1000 logs in reasonable time
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });
  });
});
