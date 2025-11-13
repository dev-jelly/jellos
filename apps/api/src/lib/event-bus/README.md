# Event Bus Architecture

A pluggable, adapter-based event bus system supporting multiple backends (Kafka, Redis, In-Memory) for distributed event-driven architectures.

## Architecture Overview

The event bus follows the **Adapter Pattern** to provide a unified interface for different messaging backends:

```
┌─────────────────────────────────────────┐
│           Application Code              │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│          EventBus (Facade)              │
│  - publish(), subscribe(), unsubscribe()│
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│    EventBusAdapter (Interface)          │
└─────────────┬───────────────────────────┘
              │
      ┌───────┴───────┬──────────┐
      ▼               ▼          ▼
┌──────────┐   ┌──────────┐  ┌──────────┐
│  Memory  │   │  Redis   │  │  Kafka   │
│ Adapter  │   │ Adapter  │  │ Adapter  │
└──────────┘   └──────────┘  └──────────┘
```

## Features

- **Pluggable Adapters**: Switch between Kafka, Redis, and In-Memory without code changes
- **Type Safety**: Full TypeScript support with typed events
- **Retry Logic**: Automatic retry with exponential backoff
- **Dead Letter Queue (DLQ)**: Route failed messages to DLQ for inspection
- **Event Sourcing**: Built-in event history for audit and replay
- **Consumer Groups**: Support for load balancing across multiple consumers (Kafka/Redis)
- **Health Checks**: Monitor adapter connectivity
- **Statistics**: Track published/failed events and subscriptions

## Installation

The event bus uses `ioredis` for Redis support. Kafka support requires `kafkajs` as an optional peer dependency:

```bash
# Core dependencies (already installed)
pnpm add ioredis

# Optional: for Kafka support
pnpm add kafkajs
```

## Quick Start

### 1. Initialize Event Bus

```typescript
import { createEventBus, EventTopics } from '@/lib/event-bus';

// Create event bus (uses environment variables for configuration)
const eventBus = await createEventBus();

// Or create with specific service name
const eventBus = await createEventBus('my-service');
```

### 2. Publish Events

```typescript
await eventBus.publish(
  EventTopics.ISSUE_EVENTS,
  'issue.state.changed',
  {
    issueId: '123',
    from: 'TODO',
    to: 'IN_PROGRESS',
  },
  {
    metadata: {
      correlationId: 'exec-456',
      userId: 'user-789',
    },
  }
);
```

### 3. Subscribe to Events

```typescript
const subscriptionId = await eventBus.subscribe(
  EventTopics.ISSUE_EVENTS,
  async (event) => {
    console.log('Received event:', event);

    // Process event
    if (event.type === 'issue.state.changed') {
      await updateIssueInDatabase(event.payload);
    }
  },
  {
    maxRetries: 3,
    useDLQ: true,
  }
);
```

### 4. Unsubscribe

```typescript
await eventBus.unsubscribe(subscriptionId);
```

## Configuration

### Environment Variables

```bash
# Adapter Selection
EVENT_BUS_ADAPTER=memory|redis|kafka  # Default: memory

# Memory Adapter
EVENT_BUS_MEMORY_MAX_HISTORY=1000     # Max events to keep in history
EVENT_BUS_MEMORY_PERSIST=false        # Persist events to disk

# Redis Adapter
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TLS=false

# Kafka Adapter
KAFKA_BROKERS=localhost:9092,localhost:9093
KAFKA_CLIENT_ID=jellos-api
KAFKA_SSL=false
KAFKA_CONNECTION_TIMEOUT=30000
KAFKA_REQUEST_TIMEOUT=30000

# Kafka SASL (optional)
KAFKA_SASL_MECHANISM=plain|scram-sha-256|scram-sha-512
KAFKA_SASL_USERNAME=
KAFKA_SASL_PASSWORD=

# Default Subscription Options
EVENT_BUS_DEFAULT_MAX_RETRIES=3
EVENT_BUS_DEFAULT_AUTO_ACK=true
EVENT_BUS_DEFAULT_USE_DLQ=false
```

### Programmatic Configuration

```typescript
import { createEventBusAdapter, EventBus } from '@/lib/event-bus';

// Create with custom config
const adapter = await createEventBusAdapter({
  adapter: 'redis',
  redis: {
    host: 'redis.example.com',
    port: 6379,
    password: 'secret',
    tls: true,
  },
  defaultSubscriptionOptions: {
    maxRetries: 5,
    useDLQ: true,
  },
});

const eventBus = new EventBus(adapter, 'my-service');
```

## Adapters

### InMemory Adapter

Best for: Development, testing, single-instance applications

```typescript
const adapter = new InMemoryAdapter({
  maxHistorySize: 1000,  // Keep last 1000 events
  persistToDisk: false,  // Don't persist (not implemented yet)
});
```

**Features:**
- Synchronous event delivery
- Event history for replay and testing
- No external dependencies
- Not suitable for multi-instance deployments

### Redis Adapter

Best for: Distributed pub/sub, moderate scale

```typescript
const adapter = new RedisAdapter({
  host: 'localhost',
  port: 6379,
  password: 'secret',
  db: 0,
  tls: true,
});
```

**Features:**
- Distributed pub/sub
- Multiple subscribers per topic
- Redis Streams support (with TTL)
- Automatic reconnection
- Good performance for moderate load

**Limitations:**
- No native consumer groups (all subscribers get all messages)
- Messages not persisted after delivery
- Limited message ordering guarantees

### Kafka Adapter

Best for: High-scale production, strict ordering, event sourcing

```typescript
const adapter = new KafkaAdapter({
  brokers: ['kafka1:9092', 'kafka2:9092'],
  clientId: 'jellos-api',
  ssl: true,
  sasl: {
    mechanism: 'scram-sha-512',
    username: 'user',
    password: 'pass',
  },
});

await adapter.initialize();
```

**Features:**
- Consumer groups for load balancing
- Message persistence and replay
- Partition-based ordering
- High throughput and scalability
- Exactly-once semantics (idempotent producer)

**Requires:** `kafkajs` npm package

## Advanced Usage

### Event Sourcing

```typescript
// Store all events for audit/replay
const eventLog: BaseEvent[] = [];

await eventBus.subscribe('issue.events', async (event) => {
  eventLog.push(event);
  await persistToDatabase(event);
});

// Replay events
for (const event of eventLog) {
  await processEvent(event);
}
```

### Saga Pattern with Compensation

```typescript
// Listen for saga failures
await eventBus.subscribe('saga.failures', async (event) => {
  const { sagaId, failedStep, compensationActions } = event.payload;

  // Execute compensating transactions
  for (const action of compensationActions) {
    await executeCompensation(action);
  }
});

// Trigger compensation on failure
try {
  await createPR();
} catch (error) {
  await eventBus.publish('saga.failures', 'saga.compensation.required', {
    sagaId: 'saga-123',
    failedStep: 'createPR',
    compensationActions: ['deleteWorktree', 'revertIssueState'],
  });
}
```

### Dead Letter Queue Pattern

```typescript
// Subscribe to main topic with DLQ
await eventBus.subscribe(
  'orders.processing',
  processOrder,
  {
    maxRetries: 3,
    useDLQ: true,
    dlqTopic: 'orders.failed',
  }
);

// Monitor DLQ for failed messages
await eventBus.subscribe('orders.failed', async (event) => {
  console.error('Failed order:', event);

  // Send alert
  await sendAlert({
    message: 'Order processing failed',
    originalEvent: event,
    failureReason: event.metadata.failureReason,
  });
});
```

### Consumer Groups (Kafka)

```typescript
// Multiple instances share the workload
await eventBus.subscribe(
  'orders.processing',
  processOrder,
  {
    consumerGroup: 'order-processors',  // All instances in same group
  }
);

// Each message delivered to only one instance in the group
```

### Event Filtering

```typescript
await eventBus.subscribe('all.events', async (event) => {
  // Filter by event type
  if (event.type === 'issue.state.changed') {
    // Only process state change events
    await handleStateChange(event.payload);
  }

  // Filter by payload
  if (event.payload.priority === 'high') {
    await handleHighPriority(event);
  }

  // Filter by metadata
  if (event.metadata.userId === 'admin') {
    await auditAdminAction(event);
  }
});
```

### Correlation IDs for Tracing

```typescript
// Start operation with correlation ID
const correlationId = randomUUID();

await eventBus.publish(
  'issue.events',
  'issue.created',
  { issueId: '123' },
  { metadata: { correlationId } }
);

// All related events share the same correlation ID
await eventBus.publish(
  'execution.events',
  'execution.started',
  { executionId: '456', issueId: '123' },
  { metadata: { correlationId } }
);

// Trace entire flow
const events = await queryEventsByCorrelationId(correlationId);
```

## Standard Event Topics

```typescript
export const EventTopics = {
  ISSUE_EVENTS: 'issue.events',
  EXECUTION_EVENTS: 'execution.events',
  PROJECT_EVENTS: 'project.events',
  WORKTREE_EVENTS: 'worktree.events',
  AGENT_EVENTS: 'agent.events',
  PR_EVENTS: 'pr.events',
  DEPLOYMENT_EVENTS: 'deployment.events',
  STATE_TRANSITION_EVENTS: 'state.transition.events',
};
```

## Testing

### Unit Tests

```typescript
import { InMemoryAdapter } from '@/lib/event-bus';

const adapter = new InMemoryAdapter();
const eventBus = new EventBus(adapter);

// Test event publishing
await eventBus.publish('test.topic', 'test.event', { data: 'test' });

// Verify with history
const history = adapter.getHistory('test.topic');
expect(history).toHaveLength(1);

// Clear between tests
adapter.clearHistory();
```

### Integration Tests with Testcontainers

```typescript
import { GenericContainer } from 'testcontainers';
import { RedisAdapter } from '@/lib/event-bus';

// Start Redis container
const container = await new GenericContainer('redis:7')
  .withExposedPorts(6379)
  .start();

const adapter = new RedisAdapter({
  host: container.getHost(),
  port: container.getMappedPort(6379),
});

// Run tests...

await container.stop();
```

## Health Checks

```typescript
// Check event bus health
const isHealthy = await eventBus.isHealthy();

if (!isHealthy) {
  console.error('Event bus is unhealthy!');
}

// Get statistics
const stats = await eventBus.getStats();
console.log('Stats:', {
  adapter: stats.adapter,
  isHealthy: stats.isHealthy,
  publishedEvents: stats.publishedEvents,
  activeSubscriptions: stats.activeSubscriptions,
});
```

## Performance Considerations

### InMemory Adapter
- **Throughput**: Very high (in-process)
- **Latency**: Microseconds
- **Scalability**: Single instance only
- **Use case**: Development, testing, single-server apps

### Redis Adapter
- **Throughput**: ~100K msgs/sec (depends on network)
- **Latency**: 1-5ms (local), 10-50ms (remote)
- **Scalability**: Moderate (limited by Redis instance)
- **Use case**: Distributed apps, moderate scale

### Kafka Adapter
- **Throughput**: Millions of msgs/sec
- **Latency**: 5-10ms (with batching)
- **Scalability**: Very high (horizontally scalable)
- **Use case**: Large-scale production, event sourcing

## Monitoring and Observability

```typescript
// Subscribe to all events for logging
await eventBus.subscribe('*', async (event) => {
  logger.info('Event published', {
    type: event.type,
    eventId: event.metadata.eventId,
    correlationId: event.metadata.correlationId,
  });
});

// Track metrics
let publishCount = 0;
let errorCount = 0;

const originalPublish = eventBus.publish.bind(eventBus);
eventBus.publish = async (...args) => {
  publishCount++;
  try {
    return await originalPublish(...args);
  } catch (error) {
    errorCount++;
    throw error;
  }
};
```

## Migration Guide

### From Old EventBus

The old `/lib/event-bus.ts` used Node's EventEmitter directly. To migrate:

**Before:**
```typescript
import { eventBus } from '@/lib/event-bus';

eventBus.emitEvent('project.created', { projectId: '123' });

eventBus.onEvent('project.created', (payload) => {
  console.log(payload);
});
```

**After:**
```typescript
import { createEventBus, EventTopics } from '@/lib/event-bus';

const eventBus = await createEventBus();

await eventBus.publish(
  EventTopics.PROJECT_EVENTS,
  'project.created',
  { projectId: '123' }
);

await eventBus.subscribe(EventTopics.PROJECT_EVENTS, async (event) => {
  if (event.type === 'project.created') {
    console.log(event.payload);
  }
});
```

## Contributing

When adding new features:

1. Update the `EventBusAdapter` interface if adding new methods
2. Implement the feature in all three adapters
3. Add tests for each adapter
4. Update this README
5. Update TypeScript types in `types.ts`

## License

MIT
