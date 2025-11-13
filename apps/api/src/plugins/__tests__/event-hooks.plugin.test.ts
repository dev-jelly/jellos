import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../../app';
import type { FastifyInstance } from 'fastify';
import { EventTopics, resetEventBus } from '../../lib/event-bus';
import type { BaseEvent } from '../../lib/event-bus';

describe('Event Hooks Plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Reset event bus between tests
    await resetEventBus();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    await resetEventBus();
  });

  it('should register the event hooks plugin successfully', async () => {
    app = await buildApp();

    // Check that eventBus is decorated on the Fastify instance
    expect(app).toHaveProperty('eventBus');
    expect(app.eventBus).toBeDefined();
  });

  it('should emit state transition events on request lifecycle', async () => {
    app = await buildApp();

    // Subscribe to state transition events
    const events: BaseEvent[] = [];
    await app.eventBus.subscribe(
      EventTopics.STATE_TRANSITION_EVENTS,
      async (event: BaseEvent) => {
        events.push(event);
      }
    );

    // Make a test request
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    // Wait for async event processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should skip health check routes by default
    expect(events.length).toBe(0);
  });

  it('should emit events for non-health check routes', async () => {
    app = await buildApp();

    // Subscribe to state transition events
    const events: BaseEvent[] = [];
    await app.eventBus.subscribe(
      EventTopics.STATE_TRANSITION_EVENTS,
      async (event: BaseEvent) => {
        events.push(event);
      }
    );

    // Make a test request to API route
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: {
        'x-request-id': 'test-request-123',
      },
    });

    // Wait for async event processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should have emitted start and complete events
    expect(events.length).toBeGreaterThanOrEqual(2);

    // Check start event
    const startEvent = events.find(
      (e) => e.type === 'state.transition.started'
    );
    expect(startEvent).toBeDefined();
    expect(startEvent.payload.entityType).toBe('request');
    expect(startEvent.payload.from).toBe('idle');
    expect(startEvent.payload.to).toBe('processing');
    expect(startEvent.metadata.requestId).toBe('test-request-123');

    // Check complete event
    const completeEvent = events.find(
      (e) => e.type === 'state.transition.completed'
    );
    expect(completeEvent).toBeDefined();
    expect(completeEvent.payload.entityType).toBe('request');
    expect(completeEvent.payload.from).toBe('processing');
    expect(completeEvent.payload.to).toBe('completed');
  });

  it('should emit error events when request fails', async () => {
    app = await buildApp();

    // Add a test route that throws an error
    app.get('/api/test-error', async () => {
      throw new Error('Test error');
    });

    // Subscribe to state transition events
    const events: BaseEvent[] = [];
    await app.eventBus.subscribe(
      EventTopics.STATE_TRANSITION_EVENTS,
      async (event: BaseEvent) => {
        events.push(event);
      }
    );

    // Make a request that will fail
    const response = await app.inject({
      method: 'GET',
      url: '/api/test-error',
      headers: {
        'x-request-id': 'test-error-123',
      },
    });

    expect(response.statusCode).toBe(500);

    // Wait for async event processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should have emitted start and error events
    expect(events.length).toBeGreaterThanOrEqual(2);

    // Check error event
    const errorEvent = events.find(
      (e) => e.type === 'state.transition.failed'
    );
    expect(errorEvent).toBeDefined();
    expect(errorEvent.payload.entityType).toBe('request');
    expect(errorEvent.payload.from).toBe('processing');
    expect(errorEvent.payload.to).toBe('error');
    expect(errorEvent.payload.error).toBe('Test error');
    expect(errorEvent.metadata.requestId).toBe('test-error-123');
  });

  it('should include correlation ID from request context', async () => {
    app = await buildApp();

    // Subscribe to state transition events
    const events: BaseEvent[] = [];
    await app.eventBus.subscribe(
      EventTopics.STATE_TRANSITION_EVENTS,
      async (event: BaseEvent) => {
        events.push(event);
      }
    );

    // Make a test request
    const requestId = 'correlation-test-456';
    await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: {
        'x-request-id': requestId,
      },
    });

    // Wait for async event processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // All events should have the same correlation ID
    events.forEach((event) => {
      expect(event.metadata.correlationId).toBe(requestId);
    });
  });

  it('should not block request processing if event emission fails', async () => {
    app = await buildApp();

    // Mock eventBus.publish to throw an error
    const originalPublish = app.eventBus.publish.bind(app.eventBus);
    vi.spyOn(app.eventBus, 'publish').mockRejectedValue(
      new Error('Event bus failure')
    );

    // Make a test request - should still succeed
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects',
    });

    // Request should succeed despite event bus failure
    // (The exact status code depends on the route, but it shouldn't be 500)
    expect([200, 401, 403, 404]).toContain(response.statusCode);

    // Restore original publish
    vi.restoreAllMocks();
  });

  it('should provide event bus adapter information', async () => {
    app = await buildApp();

    const adapterName = app.eventBus.getAdapterName();
    expect(adapterName).toBeDefined();
    expect(typeof adapterName).toBe('string');

    // In test environment, should be using in-memory adapter
    expect(adapterName.toLowerCase()).toContain('memory');
  });

  it('should get event bus health status', async () => {
    app = await buildApp();

    const isHealthy = await app.eventBus.isHealthy();
    expect(isHealthy).toBe(true);
  });

  it('should get event bus statistics', async () => {
    app = await buildApp();

    const stats = await app.eventBus.getStats();
    expect(stats).toHaveProperty('adapter');
    expect(stats).toHaveProperty('isHealthy');
    expect(stats).toHaveProperty('publishedEvents');
    expect(stats).toHaveProperty('subscribedTopics');
    expect(stats).toHaveProperty('activeSubscriptions');
  });

  it('should calculate request duration in events', async () => {
    app = await buildApp();

    // Subscribe to state transition events
    const events: BaseEvent[] = [];
    await app.eventBus.subscribe(
      EventTopics.STATE_TRANSITION_EVENTS,
      async (event: BaseEvent) => {
        events.push(event);
      }
    );

    // Make a test request
    await app.inject({
      method: 'GET',
      url: '/api/projects',
    });

    // Wait for async event processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Complete event should have duration
    const completeEvent = events.find(
      (e) => e.type === 'state.transition.completed'
    );

    if (completeEvent) {
      expect(completeEvent.payload).toHaveProperty('duration');
      expect(typeof completeEvent.payload.duration).toBe('number');
      expect(completeEvent.payload.duration).toBeGreaterThanOrEqual(0);
    }
  });

  it('should close event bus on app close', async () => {
    app = await buildApp();

    // Spy on eventBus.close
    const closeSpy = vi.spyOn(app.eventBus, 'close');

    // Close the app
    await app.close();

    // Event bus close should have been called
    expect(closeSpy).toHaveBeenCalled();
  });
});
