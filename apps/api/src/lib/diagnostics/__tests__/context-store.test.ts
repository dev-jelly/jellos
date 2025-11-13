import { describe, it, expect } from 'vitest';
import {
  requestContextStore,
  getRequestContext,
  hasRequestContext,
  createRequestContext,
  updateContextMetadata,
  getRequestDuration,
  type RequestContext,
} from '../context-store';

describe('RequestContext Store', () => {
  describe('createRequestContext', () => {
    it('should create a valid request context', () => {
      const context = createRequestContext('req-123', 'GET', '/api/test');

      expect(context.requestId).toBe('req-123');
      expect(context.method).toBe('GET');
      expect(context.url).toBe('/api/test');
      expect(context.startTime).toBeGreaterThan(0);
      expect(context.metadata).toEqual({});
    });

    it('should create context with current timestamp', () => {
      const before = Date.now();
      const context = createRequestContext('req-456', 'POST', '/api/data');
      const after = Date.now();

      expect(context.startTime).toBeGreaterThanOrEqual(before);
      expect(context.startTime).toBeLessThanOrEqual(after);
    });
  });

  describe('AsyncLocalStorage operations', () => {
    it('should return undefined when no context exists', () => {
      expect(getRequestContext()).toBeUndefined();
      expect(hasRequestContext()).toBe(false);
    });

    it('should store and retrieve context', () => {
      const context = createRequestContext('req-789', 'DELETE', '/api/item');

      requestContextStore.run(context, () => {
        expect(hasRequestContext()).toBe(true);
        const retrieved = getRequestContext();
        expect(retrieved).toBeDefined();
        expect(retrieved?.requestId).toBe('req-789');
        expect(retrieved?.method).toBe('DELETE');
        expect(retrieved?.url).toBe('/api/item');
      });
    });

    it('should isolate contexts between different runs', () => {
      const context1 = createRequestContext('req-1', 'GET', '/api/1');
      const context2 = createRequestContext('req-2', 'POST', '/api/2');

      requestContextStore.run(context1, () => {
        const retrieved1 = getRequestContext();
        expect(retrieved1?.requestId).toBe('req-1');

        requestContextStore.run(context2, () => {
          const retrieved2 = getRequestContext();
          expect(retrieved2?.requestId).toBe('req-2');
        });

        // Context should revert after nested run
        const retrieved1Again = getRequestContext();
        expect(retrieved1Again?.requestId).toBe('req-1');
      });
    });
  });

  describe('updateContextMetadata', () => {
    it('should update metadata in existing context', () => {
      const context = createRequestContext('req-meta', 'PUT', '/api/update');

      requestContextStore.run(context, () => {
        const updated = updateContextMetadata('userId', '12345');
        expect(updated?.metadata.userId).toBe('12345');

        updateContextMetadata('action', 'update');
        const retrieved = getRequestContext();
        expect(retrieved?.metadata).toEqual({
          userId: '12345',
          action: 'update',
        });
      });
    });

    it('should return undefined when no context exists', () => {
      const result = updateContextMetadata('key', 'value');
      expect(result).toBeUndefined();
    });

    it('should allow complex metadata values', () => {
      const context = createRequestContext('req-complex', 'GET', '/api/data');

      requestContextStore.run(context, () => {
        updateContextMetadata('user', { id: 1, name: 'Test' });
        updateContextMetadata('tags', ['tag1', 'tag2']);

        const retrieved = getRequestContext();
        expect(retrieved?.metadata.user).toEqual({ id: 1, name: 'Test' });
        expect(retrieved?.metadata.tags).toEqual(['tag1', 'tag2']);
      });
    });
  });

  describe('getRequestDuration', () => {
    it('should return undefined when no context exists', () => {
      expect(getRequestDuration()).toBeUndefined();
    });

    it('should calculate duration correctly', async () => {
      const context = createRequestContext('req-duration', 'GET', '/api/slow');

      await requestContextStore.run(context, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const duration = getRequestDuration();

        expect(duration).toBeDefined();
        expect(duration).toBeGreaterThanOrEqual(50);
        expect(duration).toBeLessThan(200); // Should complete within reasonable time
      });
    });

    it('should return 0 or small duration for immediate calls', () => {
      const context = createRequestContext('req-fast', 'GET', '/api/fast');

      requestContextStore.run(context, () => {
        const duration = getRequestDuration();
        expect(duration).toBeDefined();
        expect(duration).toBeGreaterThanOrEqual(0);
        expect(duration).toBeLessThan(10);
      });
    });
  });

  describe('Context propagation through async operations', () => {
    it('should maintain context through promises', async () => {
      const context = createRequestContext('req-async', 'POST', '/api/async');

      await requestContextStore.run(context, async () => {
        const before = getRequestContext();
        expect(before?.requestId).toBe('req-async');

        await Promise.resolve();

        const after = getRequestContext();
        expect(after?.requestId).toBe('req-async');
      });
    });

    it('should maintain context through multiple async operations', async () => {
      const context = createRequestContext('req-multi', 'GET', '/api/multi');

      await requestContextStore.run(context, async () => {
        expect(getRequestContext()?.requestId).toBe('req-multi');

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(getRequestContext()?.requestId).toBe('req-multi');

        await Promise.all([
          Promise.resolve('a'),
          Promise.resolve('b'),
          new Promise((resolve) => setTimeout(resolve, 5)),
        ]);

        expect(getRequestContext()?.requestId).toBe('req-multi');
      });
    });
  });
});
