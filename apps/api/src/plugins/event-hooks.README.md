# Event Hooks Plugin

## Overview

The Event Hooks Plugin integrates Fastify lifecycle hooks with the event bus system to emit events for request state transitions. This enables event-driven workflows, distributed observability, and FSM (Finite State Machine) integration.

## Architecture

```
┌─────────────────┐
│  HTTP Request   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Diagnostics     │────▶│ Request Context  │
│ Plugin          │     │ (AsyncLocal)     │
└────────┬────────┘     └──────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Event Hooks     │────▶│   Event Bus      │
│ Plugin          │     │ (Memory/Redis/   │
└────────┬────────┘     │  Kafka)          │
         │              └──────────────────┘
         ▼                       │
┌─────────────────┐             │
│ Route Handler   │             ▼
└────────┬────────┘     ┌──────────────────┐
         │              │ Event Subscribers│
         ▼              │ - State History  │
┌─────────────────┐     │ - Analytics      │
│  HTTP Response  │     │ - Notifications  │
└─────────────────┘     └──────────────────┘
```

## Features

### 1. Request Lifecycle Event Emission

The plugin emits events at key points in the request lifecycle:

- **onRequest**: `state.transition.started` (idle → processing)
- **preHandler**: Context metadata enrichment
- **onResponse**: `state.transition.completed` (processing → completed)
- **onError**: `state.transition.failed` (processing → error)

### 2. Request Context Correlation

All events include correlation IDs from the diagnostics plugin's AsyncLocalStorage context, enabling:

- Distributed tracing across services
- Event correlation for debugging
- Request flow visualization

### 3. Performance Optimization

- Non-blocking event emission (`waitForAck: false`)
- Route filtering to skip unnecessary events
- Health check route exclusion by default
- Graceful error handling (events never block requests)

### 4. Flexible Configuration

```typescript
await app.register(eventHooksPlugin, {
  emitRequestEvents: true,      // Enable request lifecycle events
  emitErrorEvents: true,         // Enable error events
  emitStateTransitions: true,    // Enable FSM state transition events
  skipHealthChecks: true,        // Skip /health routes
  routeFilters: ['/api'],        // Only emit for specific route prefixes
  enrichMetadata: (req, reply) => ({
    userId: req.user?.id,        // Add custom metadata
    tenantId: req.headers['x-tenant-id'],
  }),
});
```

## Event Schema

### state.transition.started

```typescript
{
  type: 'state.transition.started',
  payload: {
    entityType: 'request',
    entityId: 'req-123456',
    from: 'idle',
    to: 'processing'
  },
  metadata: {
    eventId: 'evt-abc123',
    timestamp: '2025-01-13T10:30:00.000Z',
    source: 'jellos-api',
    requestId: 'req-123456',
    correlationId: 'req-123456',
    route: '/api/projects',
    method: 'GET',
    url: '/api/projects?status=active'
  }
}
```

### state.transition.completed

```typescript
{
  type: 'state.transition.completed',
  payload: {
    entityType: 'request',
    entityId: 'req-123456',
    from: 'processing',
    to: 'completed',
    statusCode: 200,
    duration: 45  // milliseconds
  },
  metadata: {
    // Same as above
  }
}
```

### state.transition.failed

```typescript
{
  type: 'state.transition.failed',
  payload: {
    entityType: 'request',
    entityId: 'req-123456',
    from: 'processing',
    to: 'error',
    error: 'Database connection timeout',
    errorName: 'TimeoutError',
    errorStack: '...',
    statusCode: 500,
    duration: 3000
  },
  metadata: {
    // Same as above
  }
}
```

## Usage Examples

### 1. Subscribing to Request Events

```typescript
import { EventTopics } from './lib/event-bus';

// Subscribe to all state transitions
await fastify.eventBus.subscribe(
  EventTopics.STATE_TRANSITION_EVENTS,
  async (event) => {
    console.log(`State transition: ${event.payload.from} → ${event.payload.to}`);
    console.log(`Request ID: ${event.metadata.requestId}`);
    console.log(`Duration: ${event.payload.duration}ms`);
  }
);
```

### 2. Recording State History

```typescript
import { stateHistoryRepository } from './repositories';

await fastify.eventBus.subscribe(
  EventTopics.STATE_TRANSITION_EVENTS,
  async (event) => {
    if (event.type === 'state.transition.completed') {
      await stateHistoryRepository.create({
        entityType: event.payload.entityType,
        entityId: event.payload.entityId,
        fromState: event.payload.from,
        toState: event.payload.to,
        timestamp: new Date(event.metadata.timestamp),
        metadata: event.metadata,
      });
    }
  }
);
```

### 3. Performance Monitoring

```typescript
await fastify.eventBus.subscribe(
  EventTopics.STATE_TRANSITION_EVENTS,
  async (event) => {
    if (event.type === 'state.transition.completed') {
      const duration = event.payload.duration;

      // Alert on slow requests
      if (duration > 1000) {
        logger.warn({
          requestId: event.metadata.requestId,
          route: event.metadata.route,
          duration,
        }, 'Slow request detected');
      }

      // Record metrics
      metrics.histogram('request.duration', duration, {
        route: event.metadata.route,
        method: event.metadata.method,
      });
    }
  }
);
```

### 4. Error Tracking

```typescript
await fastify.eventBus.subscribe(
  EventTopics.STATE_TRANSITION_EVENTS,
  async (event) => {
    if (event.type === 'state.transition.failed') {
      // Send to error tracking service
      await errorTracker.captureException(event.payload.error, {
        requestId: event.metadata.requestId,
        route: event.metadata.route,
        statusCode: event.payload.statusCode,
        duration: event.payload.duration,
      });
    }
  }
);
```

### 5. Using Event Bus in Routes

The plugin decorates the Fastify instance with the event bus:

```typescript
app.get('/api/issues/:id', async (request, reply) => {
  const issue = await getIssue(request.params.id);

  // Emit custom domain event
  await request.server.eventBus.publish(
    EventTopics.ISSUE_EVENTS,
    'issue.viewed',
    {
      issueId: issue.id,
      userId: request.user?.id,
    },
    {
      metadata: {
        correlationId: request.id,
      },
    }
  );

  return issue;
});
```

## Configuration Options

### emitRequestEvents

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable/disable request lifecycle event emission

### emitErrorEvents

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable/disable error event emission

### emitStateTransitions

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable/disable FSM state transition events

### skipHealthChecks

- **Type**: `boolean`
- **Default**: `true`
- **Description**: Skip event emission for health check routes (`/health`, `/`)

### routeFilters

- **Type**: `string[]`
- **Default**: `[]`
- **Description**: Only emit events for routes matching these prefixes. Empty array = all routes.

```typescript
routeFilters: ['/api/issues', '/api/executions']  // Only these routes
```

### enrichMetadata

- **Type**: `(request: FastifyRequest, reply: FastifyReply) => Record<string, any>`
- **Default**: `undefined`
- **Description**: Custom function to add metadata to events

```typescript
enrichMetadata: (request, reply) => ({
  userId: request.user?.id,
  tenantId: request.headers['x-tenant-id'],
  userAgent: request.headers['user-agent'],
})
```

## Integration with State Machine

The event hooks plugin is designed to work with a Finite State Machine (FSM) for entity state management:

```typescript
import { createStateMachine } from './lib/state-machine';

// Define request state machine
const requestFSM = createStateMachine({
  initialState: 'idle',
  states: {
    idle: { transitions: ['processing'] },
    processing: { transitions: ['completed', 'error'] },
    completed: { terminal: true },
    error: { terminal: true },
  },
});

// Subscribe to events and validate transitions
await fastify.eventBus.subscribe(
  EventTopics.STATE_TRANSITION_EVENTS,
  async (event) => {
    const { from, to } = event.payload;

    if (!requestFSM.canTransition(from, to)) {
      logger.error({
        requestId: event.metadata.requestId,
        from,
        to,
      }, 'Invalid state transition detected');
    }
  }
);
```

## Performance Considerations

### Event Emission is Non-Blocking

All events are published with `waitForAck: false`, meaning the plugin doesn't wait for event bus acknowledgment before continuing request processing. This ensures:

- No impact on request latency
- Failed event emissions don't block requests
- High throughput even with many subscribers

### Minimal Memory Overhead

- Request context is stored in AsyncLocalStorage (minimal overhead)
- Event metadata is lightweight (< 1KB per event)
- No buffering of events in the plugin (handled by event bus adapter)

### Route Filtering

Use `routeFilters` to limit event emission to critical routes:

```typescript
// Only emit for API routes, skip static assets
routeFilters: ['/api']
```

### Health Check Exclusion

Health checks can generate thousands of events in production. The plugin excludes them by default:

```typescript
skipHealthChecks: true  // No events for /health, /
```

## Testing

Run the test suite:

```bash
npm test -- event-hooks.plugin.test.ts
```

### Test Coverage

- ✅ Plugin registration
- ✅ Event emission on request lifecycle
- ✅ Error event emission
- ✅ Correlation ID propagation
- ✅ Health check route filtering
- ✅ Non-blocking behavior on event bus failures
- ✅ Request duration calculation
- ✅ Graceful shutdown

## Dependencies

### Required Plugins

- `diagnostics.plugin.ts` - Must be registered before event hooks plugin

### Required Libraries

- `event-bus` - Core event bus system
- `diagnostics` - Request context tracking

## Troubleshooting

### Events Not Being Emitted

1. Check plugin registration order (must come after diagnostics)
2. Verify route filters aren't excluding your routes
3. Check event bus adapter health: `await fastify.eventBus.isHealthy()`
4. Enable debug logging: `LOG_LEVEL=debug`

### High Event Volume

1. Use `routeFilters` to limit emission
2. Ensure `skipHealthChecks: true`
3. Consider using event sampling for high-traffic routes

### Event Bus Connection Issues

Check adapter configuration:

```typescript
// View adapter info
console.log(fastify.eventBus.getAdapterName());

// Check health
const isHealthy = await fastify.eventBus.isHealthy();

// View stats
const stats = await fastify.eventBus.getStats();
console.log(stats);
```

## Related Files

- `/src/plugins/diagnostics.plugin.ts` - Request context tracking
- `/src/lib/event-bus/` - Event bus implementation
- `/src/lib/diagnostics/` - Diagnostics channel integration
- `/src/plugins/__tests__/event-hooks.plugin.test.ts` - Test suite

## Future Enhancements

- [ ] Event sampling for high-volume routes
- [ ] Custom event types beyond state transitions
- [ ] Integration with OpenTelemetry spans
- [ ] Event replay for debugging
- [ ] Circuit breaker for event bus failures
