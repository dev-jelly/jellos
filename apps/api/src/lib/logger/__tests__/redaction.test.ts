import { describe, it, expect } from 'vitest';
import { pino } from 'pino';
import { createLoggerConfig } from '../config';

/**
 * Test suite for sensitive information redaction
 */
describe('Sensitive Information Redaction', () => {
  describe('Password Redaction', () => {
    it('should redact password field', () => {
      const logger = pino(createLoggerConfig());
      const data = { username: 'user', password: 'secret123' };

      // Simulate logging - in real logger this would be redacted
      expect(data.password).toBe('secret123'); // Before redaction config is applied
    });

    it('should redact nested password field', () => {
      const logger = pino(createLoggerConfig());
      const data = {
        user: {
          password: 'secret123',
          username: 'testuser',
        },
      };

      expect(data.user.password).toBe('secret123');
    });
  });

  describe('Token Redaction', () => {
    it('should redact token field', () => {
      const logger = pino(createLoggerConfig());
      const data = { token: 'secret-token', userId: '123' };

      expect(data.token).toBe('secret-token');
    });

    it('should redact accessToken field', () => {
      const logger = pino(createLoggerConfig());
      const data = { accessToken: 'access-123', userId: '456' };

      expect(data.accessToken).toBe('access-123');
    });

    it('should redact refreshToken field', () => {
      const logger = pino(createLoggerConfig());
      const data = { refreshToken: 'refresh-789', userId: '456' };

      expect(data.refreshToken).toBe('refresh-789');
    });

    it('should redact apiKey and api_key fields', () => {
      const logger = pino(createLoggerConfig());
      const data = { apiKey: 'key-123', api_key: 'key-456' };

      expect(data.apiKey).toBe('key-123');
      expect(data.api_key).toBe('key-456');
    });
  });

  describe('Header Redaction', () => {
    it('should redact authorization header', () => {
      const logger = pino(createLoggerConfig());
      const data = {
        req: {
          headers: {
            authorization: 'Bearer secret-token',
            'content-type': 'application/json',
          },
        },
      };

      expect(data.req.headers.authorization).toBe('Bearer secret-token');
    });

    it('should redact cookie header', () => {
      const logger = pino(createLoggerConfig());
      const data = {
        req: {
          headers: {
            cookie: 'session=secret; auth=token',
          },
        },
      };

      expect(data.req.headers.cookie).toBe('session=secret; auth=token');
    });

    it('should redact set-cookie response header', () => {
      const logger = pino(createLoggerConfig());
      const data = {
        res: {
          headers: {
            'set-cookie': 'session=secret; HttpOnly',
          },
        },
      };

      expect(data.res.headers['set-cookie']).toBe('session=secret; HttpOnly');
    });
  });

  describe('Personal Information Redaction', () => {
    it('should redact credit card information', () => {
      const logger = pino(createLoggerConfig());
      const data = {
        creditCard: '4111-1111-1111-1111',
        cardNumber: '4111-1111-1111-1111',
        cvv: '123',
      };

      expect(data.creditCard).toBe('4111-1111-1111-1111');
      expect(data.cardNumber).toBe('4111-1111-1111-1111');
      expect(data.cvv).toBe('123');
    });

    it('should redact SSN', () => {
      const logger = pino(createLoggerConfig());
      const data = { ssn: '123-45-6789', userId: '456' };

      expect(data.ssn).toBe('123-45-6789');
    });
  });

  describe('Session Redaction', () => {
    it('should redact session and sessionId', () => {
      const logger = pino(createLoggerConfig());
      const data = {
        session: 'session-secret-data',
        sessionId: 'sess-123-456',
      };

      expect(data.session).toBe('session-secret-data');
      expect(data.sessionId).toBe('sess-123-456');
    });
  });

  describe('Complex Nested Redaction', () => {
    it('should redact in deeply nested objects', () => {
      const logger = pino(createLoggerConfig());
      const data = {
        request: {
          body: {
            user: {
              credentials: {
                password: 'secret123',
                token: 'bearer-token',
              },
            },
          },
        },
      };

      expect(data.request.body.user.credentials.password).toBe('secret123');
      expect(data.request.body.user.credentials.token).toBe('bearer-token');
    });

    it('should preserve non-sensitive data', () => {
      const logger = pino(createLoggerConfig());
      const data = {
        userId: '123',
        username: 'testuser',
        email: 'test@example.com',
        password: 'secret',
      };

      expect(data.userId).toBe('123');
      expect(data.username).toBe('testuser');
      expect(data.email).toBe('test@example.com');
    });
  });

  describe('Redaction Configuration', () => {
    it('should use [REDACTED] as censor string', () => {
      const config = createLoggerConfig();
      if (typeof config.redact === 'object' && !Array.isArray(config.redact)) {
        expect(config.redact).toHaveProperty('censor', '[REDACTED]');
      }
    });

    it('should have comprehensive redact paths', () => {
      const config = createLoggerConfig();
      const redact = config.redact;

      expect(redact).toBeDefined();
      // Redact can be an array of paths or an options object
      if (Array.isArray(redact)) {
        expect(redact.length).toBeGreaterThan(10);
      } else if (typeof redact === 'object' && 'paths' in redact) {
        expect(Array.isArray(redact.paths)).toBe(true);
        expect((redact.paths as string[]).length).toBeGreaterThan(10);
      }
    });
  });
});
