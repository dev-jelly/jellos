/**
 * Integration Tests for Event Bus
 *
 * Tests real-world scenarios and integration between components
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../event-bus';
import { InMemoryAdapter } from '../adapters/memory.adapter';
import { createEventBusAdapter } from '../factory';
import type { EventBusConfig } from '../types';

describe('Event Bus Integration', () => {
  let eventBus: EventBus;

  afterEach(async () => {
    if (eventBus) {
      await eventBus.close();
    }
  });

  describe('State Machine Integration', () => {
    it('should handle state transition events', async () => {
      const adapter = new InMemoryAdapter();
      eventBus = new EventBus(adapter);

      const transitions: any[] = [];

      await eventBus.subscribe(
        'state.transitions',
        async (event) => {
          transitions.push(event.payload);
        }
      );

      // Simulate state machine transition
      await eventBus.publish(
        'state.transitions',
        'issue.state.changed',
        {
          issueId: 'issue-123',
          from: 'TODO',
          to: 'IN_PROGRESS',
          reason: 'Agent started execution',
        },
        {
          metadata: {
            correlationId: 'exec-456',
          },
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transitions).toHaveLength(1);
      expect(transitions[0].issueId).toBe('issue-123');
      expect(transitions[0].from).toBe('TODO');
      expect(transitions[0].to).toBe('IN_PROGRESS');
    });

    it('should support event sourcing pattern', async () => {
      const adapter = new InMemoryAdapter();
      eventBus = new EventBus(adapter);

      const eventLog: any[] = [];

      // Event sourcing: store all events
      await eventBus.subscribe('issue.events', async (event) => {
        eventLog.push({
          eventId: event.metadata.eventId,
          type: event.type,
          timestamp: event.metadata.timestamp,
          payload: event.payload,
        });
      });

      // Simulate multiple events
      await eventBus.publish('issue.events', 'issue.created', {
        issueId: 'issue-1',
        title: 'New feature',
      });

      await eventBus.publish('issue.events', 'issue.state.changed', {
        issueId: 'issue-1',
        from: 'TODO',
        to: 'IN_PROGRESS',
      });

      await eventBus.publish('issue.events', 'issue.state.changed', {
        issueId: 'issue-1',
        from: 'IN_PROGRESS',
        to: 'DONE',
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(eventLog).toHaveLength(3);
      expect(eventLog[0].type).toBe('issue.created');
      expect(eventLog[1].type).toBe('issue.state.changed');
      expect(eventLog[2].type).toBe('issue.state.changed');

      // Verify event ordering (timestamps are ISO strings)
      const ts0 = new Date(eventLog[0].timestamp).getTime();
      const ts1 = new Date(eventLog[1].timestamp).getTime();
      const ts2 = new Date(eventLog[2].timestamp).getTime();

      expect(ts0).toBeLessThanOrEqual(ts1);
      expect(ts1).toBeLessThanOrEqual(ts2);
    });
  });

  describe('Saga Pattern', () => {
    it('should handle compensating transactions', async () => {
      const adapter = new InMemoryAdapter();
      eventBus = new EventBus(adapter);

      const compensations: any[] = [];

      // Subscribe to compensation events
      await eventBus.subscribe('saga.compensations', async (event) => {
        compensations.push(event.payload);
      });

      // Simulate saga failure requiring compensation
      await eventBus.publish(
        'saga.compensations',
        'saga.compensation.required',
        {
          sagaId: 'saga-123',
          failedStep: 'createPR',
          compensationActions: ['deleteWorktree', 'revertIssueState'],
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(compensations).toHaveLength(1);
      expect(compensations[0].compensationActions).toContain('deleteWorktree');
    });
  });

  describe('Multiple Subscribers', () => {
    it('should fan out events to multiple subscribers', async () => {
      const adapter = new InMemoryAdapter();
      eventBus = new EventBus(adapter);

      const subscriber1Events: any[] = [];
      const subscriber2Events: any[] = [];
      const subscriber3Events: any[] = [];

      await eventBus.subscribe('issue.events', async (event) => {
        subscriber1Events.push(event);
      });

      await eventBus.subscribe('issue.events', async (event) => {
        subscriber2Events.push(event);
      });

      await eventBus.subscribe('issue.events', async (event) => {
        subscriber3Events.push(event);
      });

      await eventBus.publish('issue.events', 'issue.created', {
        issueId: 'issue-1',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(subscriber1Events).toHaveLength(1);
      expect(subscriber2Events).toHaveLength(1);
      expect(subscriber3Events).toHaveLength(1);
    });
  });

  describe('Factory Pattern', () => {
    it('should create InMemory adapter from config', async () => {
      const config: EventBusConfig = {
        adapter: 'memory',
        memory: {
          maxHistorySize: 500,
        },
      };

      const adapter = await createEventBusAdapter(config);
      expect(adapter.getName()).toBe('InMemoryAdapter');

      await adapter.close();
    });

    it('should create Redis adapter from config', async () => {
      const config: EventBusConfig = {
        adapter: 'redis',
        redis: {
          host: 'localhost',
          port: 6379,
        },
      };

      const adapter = await createEventBusAdapter(config);
      expect(adapter.getName()).toBe('RedisAdapter');

      await adapter.close();
    });
  });

  describe('Error Resilience', () => {
    it('should continue processing after handler errors', async () => {
      const adapter = new InMemoryAdapter();
      eventBus = new EventBus(adapter);

      const successfulEvents: any[] = [];
      let errorCount = 0;

      // Failing subscriber
      await eventBus.subscribe(
        'test.events',
        async () => {
          errorCount++;
          throw new Error('Handler error');
        },
        { maxRetries: 1 }
      );

      // Successful subscriber
      await eventBus.subscribe('test.events', async (event) => {
        successfulEvents.push(event);
      });

      await eventBus.publish('test.events', 'test.event', { id: 1 });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errorCount).toBeGreaterThan(0);
      expect(successfulEvents).toHaveLength(1);
    });
  });

  describe('Dead Letter Queue', () => {
    it('should route failed messages to DLQ', async () => {
      const adapter = new InMemoryAdapter();
      eventBus = new EventBus(adapter);

      const dlqMessages: any[] = [];

      // Subscribe to DLQ
      await eventBus.subscribe('test.events.dlq', async (event) => {
        dlqMessages.push(event);
      });

      // Subscribe with failing handler
      await eventBus.subscribe(
        'test.events',
        async () => {
          throw new Error('Processing failed');
        },
        {
          maxRetries: 2,
          useDLQ: true,
        }
      );

      await eventBus.publish('test.events', 'test.event', {
        data: 'will fail',
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(dlqMessages).toHaveLength(1);
      expect(dlqMessages[0].metadata.originalTopic).toBe('test.events');
      expect(dlqMessages[0].metadata.failureReason).toBeDefined();
    });
  });

  describe('Topic Isolation', () => {
    it('should keep topics isolated', async () => {
      const adapter = new InMemoryAdapter();
      eventBus = new EventBus(adapter);

      const topic1Events: any[] = [];
      const topic2Events: any[] = [];

      await eventBus.subscribe('topic1', async (event) => {
        topic1Events.push(event);
      });

      await eventBus.subscribe('topic2', async (event) => {
        topic2Events.push(event);
      });

      await eventBus.publish('topic1', 'event', { id: 1 });
      await eventBus.publish('topic2', 'event', { id: 2 });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(topic1Events).toHaveLength(1);
      expect(topic2Events).toHaveLength(1);
      expect(topic1Events[0].payload.id).toBe(1);
      expect(topic2Events[0].payload.id).toBe(2);
    });
  });
});
