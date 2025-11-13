import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getLogLevel,
  isDevelopment,
  getLogTransport,
  createLoggerConfig,
  LOG_LEVELS,
  REDACT_FIELDS,
} from '../config';

describe('Logger Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clone env to avoid side effects
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('getLogLevel', () => {
    it('should return default log level when LOG_LEVEL not set', () => {
      delete process.env.LOG_LEVEL;
      expect(getLogLevel()).toBe('info');
    });

    it('should return log level from environment', () => {
      process.env.LOG_LEVEL = 'debug';
      expect(getLogLevel()).toBe('debug');
    });

    it('should handle uppercase log level', () => {
      process.env.LOG_LEVEL = 'ERROR';
      expect(getLogLevel()).toBe('error');
    });

    it('should return default for invalid log level', () => {
      process.env.LOG_LEVEL = 'invalid';
      expect(getLogLevel()).toBe('info');
    });

    it('should support all valid log levels', () => {
      const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
      levels.forEach((level) => {
        process.env.LOG_LEVEL = level;
        expect(getLogLevel()).toBe(level);
      });
    });
  });

  describe('isDevelopment', () => {
    it('should return true when NODE_ENV is not production', () => {
      process.env.NODE_ENV = 'development';
      expect(isDevelopment()).toBe(true);
    });

    it('should return true when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      expect(isDevelopment()).toBe(true);
    });

    it('should return false when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      expect(isDevelopment()).toBe(false);
    });
  });

  describe('getLogTransport', () => {
    it('should return pino-pretty transport for development', () => {
      process.env.NODE_ENV = 'development';
      const transport = getLogTransport();
      expect(transport).toBeDefined();
      expect(transport?.target).toBe('pino-pretty');
    });

    it('should return undefined for production', () => {
      process.env.NODE_ENV = 'production';
      const transport = getLogTransport();
      expect(transport).toBeUndefined();
    });
  });

  describe('createLoggerConfig', () => {
    it('should create valid logger config', () => {
      const config = createLoggerConfig();

      expect(config).toBeDefined();
      expect(config.level).toBeDefined();
      expect(config.redact).toBeDefined();
      expect(config.serializers).toBeDefined();
      expect(config.base).toBeDefined();
    });

    it('should include service name in base', () => {
      const config = createLoggerConfig();
      expect(config.base).toHaveProperty('service', 'jellos-api');
    });

    it('should include error serializer', () => {
      const config = createLoggerConfig();
      expect(config.serializers?.err).toBeDefined();
    });

    it('should include request serializer', () => {
      const config = createLoggerConfig();
      expect(config.serializers?.req).toBeDefined();
    });

    it('should include response serializer', () => {
      const config = createLoggerConfig();
      expect(config.serializers?.res).toBeDefined();
    });

    it('should configure transport for development', () => {
      process.env.NODE_ENV = 'development';
      const config = createLoggerConfig();
      expect(config.transport).toBeDefined();
    });

    it('should not configure transport for production', () => {
      process.env.NODE_ENV = 'production';
      const config = createLoggerConfig();
      expect(config.transport).toBeUndefined();
    });
  });

  describe('REDACT_FIELDS', () => {
    it('should include common sensitive fields', () => {
      expect(REDACT_FIELDS).toContain('password');
      expect(REDACT_FIELDS).toContain('token');
      expect(REDACT_FIELDS).toContain('apiKey');
      expect(REDACT_FIELDS).toContain('secret');
    });

    it('should include nested header paths', () => {
      expect(REDACT_FIELDS).toContain('req.headers.authorization');
      expect(REDACT_FIELDS).toContain('req.headers.cookie');
    });

    it('should include payment card fields', () => {
      expect(REDACT_FIELDS).toContain('creditCard');
      expect(REDACT_FIELDS).toContain('cvv');
      expect(REDACT_FIELDS).toContain('cardNumber');
    });
  });

  describe('Serializers', () => {
    it('should serialize errors correctly', () => {
      const config = createLoggerConfig();
      const error = new Error('Test error');
      error.name = 'TestError';

      const serialized = config.serializers?.err?.(error);
      expect(serialized).toHaveProperty('type', 'TestError');
      expect(serialized).toHaveProperty('message', 'Test error');
      expect(serialized).toHaveProperty('stack');
    });

    it('should serialize requests without sensitive headers', () => {
      const config = createLoggerConfig();
      const req = {
        id: 'req-123',
        method: 'GET',
        url: '/api/test',
        routerPath: '/api/test',
        params: { id: '1' },
        headers: {
          host: 'localhost',
          'user-agent': 'test-agent',
          'content-type': 'application/json',
          authorization: 'Bearer secret-token',
          cookie: 'session=secret',
        },
        ip: '127.0.0.1',
        socket: { remotePort: 12345 },
      };

      const serialized = config.serializers?.req?.(req);
      expect(serialized).toHaveProperty('id', 'req-123');
      expect(serialized).toHaveProperty('method', 'GET');
      expect(serialized?.headers).not.toHaveProperty('authorization');
      expect(serialized?.headers).not.toHaveProperty('cookie');
    });

    it('should serialize responses without sensitive headers', () => {
      const config = createLoggerConfig();
      const res = {
        statusCode: 200,
        getHeader: (name: string) => {
          const headers: Record<string, string> = {
            'content-type': 'application/json',
            'set-cookie': 'session=secret',
          };
          return headers[name];
        },
      };

      const serialized = config.serializers?.res?.(res);
      expect(serialized).toHaveProperty('statusCode', 200);
      expect(serialized?.headers).not.toHaveProperty('set-cookie');
    });
  });
});
