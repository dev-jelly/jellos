/**
 * Tests for EventBus wrapper
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../event-bus';
import { InMemoryAdapter } from '../adapters/memory.adapter';
import type { BaseEvent } from '../types';

describe('EventBus', () => {
  let adapter: InMemoryAdapter;
  let eventBus: EventBus;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
    eventBus = new EventBus(adapter, 'test-service');
  });

  afterEach(async () => {
    await eventBus.close();
  });

  describe('Publishing Events', () => {
    it('should publish events with auto-generated metadata', async () => {
      const receivedEvents: BaseEvent[] = [];

      await adapter.subscribe('test.topic', async (event) => {
        receivedEvents.push(event);
      });

      await eventBus.publish('test.topic', 'test.event', {
        message: 'Hello',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe('test.event');
      expect(receivedEvents[0].payload.message).toBe('Hello');
      expect(receivedEvents[0].metadata.eventId).toBeDefined();
      expect(receivedEvents[0].metadata.timestamp).toBeDefined();
      expect(receivedEvents[0].metadata.source).toBe('test-service');
    });

    it('should allow custom metadata', async () => {
      const receivedEvents: BaseEvent[] = [];

      await adapter.subscribe('test.topic', async (event) => {
        receivedEvents.push(event);
      });

      await eventBus.publish(
        'test.topic',
        'test.event',
        { data: 'test' },
        {
          metadata: {
            correlationId: 'custom-correlation-id',
            userId: 'user-123',
            customField: 'custom-value',
          },
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedEvents[0].metadata.correlationId).toBe(
        'custom-correlation-id'
      );
      expect(receivedEvents[0].metadata.userId).toBe('user-123');
      expect(receivedEvents[0].metadata.customField).toBe('custom-value');
    });
  });

  describe('Subscribing to Events', () => {
    it('should subscribe and receive events', async () => {
      const receivedEvents: BaseEvent[] = [];

      await eventBus.subscribe('test.topic', async (event) => {
        receivedEvents.push(event);
      });

      await eventBus.publish('test.topic', 'test.event', { id: 1 });
      await eventBus.publish('test.topic', 'test.event', { id: 2 });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedEvents).toHaveLength(2);
      expect(receivedEvents[0].payload.id).toBe(1);
      expect(receivedEvents[1].payload.id).toBe(2);
    });

    it('should support subscription options', async () => {
      let attempts = 0;

      await eventBus.subscribe(
        'test.topic',
        async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error('Retry me');
          }
        },
        { maxRetries: 3 }
      );

      await eventBus.publish('test.topic', 'test.event', {});

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(attempts).toBe(2);
    });
  });

  describe('Unsubscribing', () => {
    it('should stop receiving events after unsubscribe', async () => {
      const receivedEvents: BaseEvent[] = [];

      const subscriptionId = await eventBus.subscribe(
        'test.topic',
        async (event) => {
          receivedEvents.push(event);
        }
      );

      await eventBus.publish('test.topic', 'test.event', { id: 1 });
      await new Promise((resolve) => setTimeout(resolve, 10));

      await eventBus.unsubscribe(subscriptionId);

      await eventBus.publish('test.topic', 'test.event', { id: 2 });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].payload.id).toBe(1);
    });
  });

  describe('Health Check', () => {
    it('should report health status', async () => {
      const isHealthy = await eventBus.isHealthy();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should return event bus stats', async () => {
      await eventBus.subscribe('topic1', async () => {});
      await eventBus.subscribe('topic2', async () => {});
      await eventBus.publish('topic1', 'test.event', {});

      await new Promise((resolve) => setTimeout(resolve, 10));

      const stats = await eventBus.getStats();

      expect(stats.adapter).toBe('InMemoryAdapter');
      expect(stats.isHealthy).toBe(true);
      expect(stats.activeSubscriptions).toBe(2);
      expect(stats.publishedEvents).toBe(1);
    });
  });

  describe('Adapter Info', () => {
    it('should return adapter name', () => {
      expect(eventBus.getAdapterName()).toBe('InMemoryAdapter');
    });
  });
});
