/**
 * Tests for InMemory Event Bus Adapter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemoryAdapter } from '../adapters/memory.adapter';
import type { BaseEvent } from '../types';

describe('InMemoryAdapter', () => {
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter({
      maxHistorySize: 100,
    });
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe('Basic Operations', () => {
    it('should publish and subscribe to events', async () => {
      const receivedEvents: BaseEvent[] = [];

      const subscriptionId = await adapter.subscribe(
        'test.topic',
        async (event) => {
          receivedEvents.push(event);
        }
      );

      const event: BaseEvent = {
        type: 'test.event',
        payload: { message: 'Hello, World!' },
        metadata: {
          eventId: '123',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      await adapter.publish('test.topic', event);

      // Wait for event to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual(event);
      expect(subscriptionId).toBeDefined();
    });

    it('should support multiple subscribers on same topic', async () => {
      const events1: BaseEvent[] = [];
      const events2: BaseEvent[] = [];

      await adapter.subscribe('test.topic', async (event) => {
        events1.push(event);
      });

      await adapter.subscribe('test.topic', async (event) => {
        events2.push(event);
      });

      const event: BaseEvent = {
        type: 'test.event',
        payload: { count: 1 },
        metadata: {
          eventId: '456',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      await adapter.publish('test.topic', event);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
      expect(events1[0]).toEqual(event);
      expect(events2[0]).toEqual(event);
    });

    it('should unsubscribe correctly', async () => {
      const receivedEvents: BaseEvent[] = [];

      const subscriptionId = await adapter.subscribe(
        'test.topic',
        async (event) => {
          receivedEvents.push(event);
        }
      );

      const event1: BaseEvent = {
        type: 'test.event',
        payload: { id: 1 },
        metadata: {
          eventId: '1',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      await adapter.publish('test.topic', event1);
      await new Promise((resolve) => setTimeout(resolve, 10));

      await adapter.unsubscribe(subscriptionId);

      const event2: BaseEvent = {
        type: 'test.event',
        payload: { id: 2 },
        metadata: {
          eventId: '2',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      await adapter.publish('test.topic', event2);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].payload.id).toBe(1);
    });
  });

  describe('Error Handling and Retry', () => {
    it('should retry failed handlers', async () => {
      let attempts = 0;

      await adapter.subscribe(
        'test.topic',
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Temporary failure');
          }
        },
        { maxRetries: 3 }
      );

      const event: BaseEvent = {
        type: 'test.event',
        payload: { test: true },
        metadata: {
          eventId: '789',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      await adapter.publish('test.topic', event);
      // Wait for retries: 200ms + 400ms backoffs + processing time
      await new Promise((resolve) => setTimeout(resolve, 700));

      expect(attempts).toBe(3);
    });

    it('should send failed events to DLQ', async () => {
      const dlqEvents: BaseEvent[] = [];

      // Subscribe to DLQ
      await adapter.subscribe('test.topic.dlq', async (event) => {
        dlqEvents.push(event);
      });

      // Subscribe to main topic with failing handler
      await adapter.subscribe(
        'test.topic',
        async () => {
          throw new Error('Always fails');
        },
        { maxRetries: 2, useDLQ: true }
      );

      const event: BaseEvent = {
        type: 'test.event',
        payload: { willFail: true },
        metadata: {
          eventId: 'fail-1',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      await adapter.publish('test.topic', event);
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(dlqEvents).toHaveLength(1);
      expect(dlqEvents[0].metadata.originalTopic).toBe('test.topic');
      expect(dlqEvents[0].metadata.failureReason).toBeDefined();
    });
  });

  describe('Event History', () => {
    it('should store event history', async () => {
      const event1: BaseEvent = {
        type: 'test.event',
        payload: { id: 1 },
        metadata: {
          eventId: 'hist-1',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      const event2: BaseEvent = {
        type: 'test.event',
        payload: { id: 2 },
        metadata: {
          eventId: 'hist-2',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      };

      await adapter.publish('test.topic', event1);
      await adapter.publish('test.topic', event2);

      const history = adapter.getHistory('test.topic');
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual(event1);
      expect(history[1]).toEqual(event2);
    });

    it('should limit history size', async () => {
      const smallAdapter = new InMemoryAdapter({ maxHistorySize: 5 });

      for (let i = 0; i < 10; i++) {
        await smallAdapter.publish('test.topic', {
          type: 'test.event',
          payload: { id: i },
          metadata: {
            eventId: `hist-${i}`,
            timestamp: new Date().toISOString(),
            source: 'test',
          },
        });
      }

      const history = smallAdapter.getHistory('test.topic');
      expect(history).toHaveLength(5);
      expect(history[0].payload.id).toBe(5); // First 5 were trimmed

      await smallAdapter.close();
    });

    it('should clear history', async () => {
      await adapter.publish('test.topic', {
        type: 'test.event',
        payload: { test: true },
        metadata: {
          eventId: 'clear-1',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      });

      expect(adapter.getHistory('test.topic')).toHaveLength(1);

      adapter.clearHistory();

      expect(adapter.getHistory('test.topic')).toHaveLength(0);
    });
  });

  describe('Health Check', () => {
    it('should always be healthy', async () => {
      const isHealthy = await adapter.isHealthy();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should track statistics', async () => {
      await adapter.subscribe('topic1', async () => {});
      await adapter.subscribe('topic2', async () => {});

      await adapter.publish('topic1', {
        type: 'test.event',
        payload: {},
        metadata: {
          eventId: 'stat-1',
          timestamp: new Date().toISOString(),
          source: 'test',
        },
      });

      const stats = adapter.getStats();
      expect(stats.activeSubscriptions).toBe(2);
      expect(stats.publishedEvents).toBe(1);
      expect(stats.topics).toContain('topic1');
    });
  });

  describe('Adapter Info', () => {
    it('should return correct adapter name', () => {
      expect(adapter.getName()).toBe('InMemoryAdapter');
    });
  });
});
