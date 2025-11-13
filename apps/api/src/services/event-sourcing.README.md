# Event Sourcing Implementation

## Overview

This implementation provides a complete Event Sourcing pattern for state management in the Jellos API. Event sourcing ensures that all state changes are captured as immutable events in an append-only log, enabling:

- **Complete audit trail** of all state transitions
- **State reconstruction** from events at any point in time
- **Idempotent event processing** to handle duplicates
- **Performance optimization** through snapshots
- **Event versioning** for schema evolution

## Architecture

### Components

1. **Event Store Service** (`event-store.service.ts`)
   - Append-only event log with ordering guarantees
   - Event replay mechanism
   - Snapshot management
   - Idempotency checks

2. **State Manager Service** (`state-manager.service.ts`)
   - High-level API for state transitions
   - Integration with event bus
   - Automatic snapshot creation
   - State reconstruction

3. **Event Sourcing Types** (`types/event-sourcing.ts`)
   - Domain event definitions
   - Metadata structures
   - Query and replay options

## Core Concepts

### Domain Events

Domain events represent state changes in the system. Each event contains:

```typescript
interface DomainEvent {
  aggregateType: string;      // "Issue" or "Execution"
  aggregateId: string;         // ID of the entity
  eventType: string;           // Type of event (e.g., "issue.state.changed")
  payload: any;                // Event data
  metadata: EventMetadata;     // Tracing and correlation metadata
  sequenceNumber?: number;     // Ordering guarantee
}
```

### Event Metadata

Every event includes rich metadata for tracing and debugging:

```typescript
interface EventMetadata {
  eventId: string;             // Unique ID for idempotency
  version: string;             // Schema version (e.g., "1.0.0")
  timestamp: string;           // ISO 8601 timestamp
  correlationId: string;       // Trace related events
  causationId?: string;        // ID of causing event
  actor?: string;              // Who triggered the event
}
```

### Snapshots

Snapshots are point-in-time state captures that optimize event replay:

- Created automatically every 50 events
- Can be created manually on demand
- Include sequence number for consistency
- Support versioning for migrations

## Usage

### Basic State Transition

```typescript
import { stateManagerService, AggregateType } from './services/state-manager.service';
import { IssueStatus } from './types/issue';

// Execute a state transition
await stateManagerService.transitionState({
  aggregateType: AggregateType.ISSUE,
  aggregateId: issueId,
  fromState: IssueStatus.TODO,
  toState: IssueStatus.IN_PROGRESS,
  event: 'start_work',
  actor: 'user-123',
  reason: 'Starting implementation',
});
```

### State Reconstruction

```typescript
// Reconstruct current state from events
const state = await stateManagerService.reconstructIssueState(issueId);

console.log(state.status);           // Current status
console.log(state.transitionCount);  // Number of transitions
console.log(state.stateHistory);     // Full history
```

### Point-in-Time State

```typescript
// Reconstruct state at a specific point
const historicalState = await stateManagerService.reconstructIssueState(
  issueId,
  {
    toSequence: 10,  // Up to event #10
    // OR
    toTimestamp: new Date('2024-01-01'),  // Up to specific date
  }
);
```

### Event Stream

```typescript
// Get all events for an aggregate
const events = await stateManagerService.getEventStream(
  AggregateType.ISSUE,
  issueId
);

// Process events
for (const event of events) {
  console.log(event.eventType, event.payload, event.metadata);
}
```

### Snapshots

```typescript
// Manual snapshot creation
await stateManagerService.createStateSnapshot(
  AggregateType.ISSUE,
  issueId,
  { force: true }
);

// Get latest snapshot
const snapshot = await stateManagerService.getLatestSnapshot(
  AggregateType.ISSUE,
  issueId
);
```

### Correlation and Causation

```typescript
const correlationId = randomUUID();

// First event
await stateManagerService.transitionState({
  aggregateType: AggregateType.ISSUE,
  aggregateId: issueId,
  fromState: IssueStatus.TODO,
  toState: IssueStatus.IN_PROGRESS,
  event: 'start_work',
  correlationId,
});

// Related event with causation
const firstEventId = events[0].metadata.eventId;
await stateManagerService.transitionState({
  aggregateType: AggregateType.EXECUTION,
  aggregateId: executionId,
  fromState: 'PENDING',
  toState: 'RUNNING',
  event: 'execute',
  correlationId,        // Same correlation
  causationId: firstEventId,  // Caused by first event
});
```

## Database Schema

### Extended State History Tables

Both `IssueStateHistory` and `ExecutionStateHistory` include event sourcing fields:

- `eventId` - Unique identifier for idempotency
- `version` - Schema version for evolution
- `correlationId` - Trace related events
- `causationId` - Event causation chain
- `sequenceNumber` - Ordering guarantee
- `persistedAt` - Persistence timestamp

### Snapshot Tables

- `IssueStateSnapshot` - Issue state snapshots
- `ExecutionStateSnapshot` - Execution state snapshots

Each snapshot includes:
- Serialized state (JSON)
- Last sequence number included
- Version for compatibility
- Metadata for context

## Features

### 1. Append-Only Event Log

All events are immutable and stored in an append-only log:
- Events never modified or deleted
- Complete audit trail preserved
- Ordering guaranteed by sequence numbers

### 2. Idempotency

Duplicate events are detected and handled gracefully:
- Events with same `eventId` are deduplicated
- Returns existing event instead of creating duplicate
- Safe for retry scenarios

### 3. Ordering Guarantees

Events maintain strict ordering within an aggregate:
- Automatic sequence number assignment
- Sequential increments (1, 2, 3, ...)
- Ordering preserved during replay

### 4. Event Replay

State can be reconstructed from events:
- Start from initial state
- Apply events sequentially
- Reduce to current state
- Support for custom reducers

### 5. Snapshots

Performance optimization for large event streams:
- Automatic creation every 50 events
- Manual creation on demand
- Used during replay to skip old events
- Includes sequence number for consistency

### 6. Event Versioning

Support for schema evolution:
- Version field on every event
- Future support for event upcasters
- Backward compatibility maintained

### 7. Tracing and Correlation

Rich metadata for distributed tracing:
- Correlation ID for related events
- Causation ID for event chains
- Actor tracking for audit
- Timestamp for ordering

## Integration with Event Bus

State transitions are automatically published to the event bus:

```typescript
// Event published to EventTopics.ISSUE_EVENTS
{
  type: 'issue.state.changed',
  payload: {
    issueId: '...',
    from: 'TODO',
    to: 'IN_PROGRESS',
    reason: '...'
  },
  metadata: {
    correlationId: '...',
    causationId: '...',
    userId: '...'
  }
}
```

Subscribers can react to state changes in real-time:

```typescript
await eventBus.subscribe(
  EventTopics.ISSUE_EVENTS,
  async (event) => {
    if (event.type === 'issue.state.changed') {
      // React to state change
      console.log('Issue state changed:', event.payload);
    }
  }
);
```

## Testing

Comprehensive test suite covers:
- Event appending and idempotency
- Sequence number ordering
- Event replay and state reconstruction
- Snapshot creation and usage
- Correlation and causation tracking
- Event stream operations

Run tests:
```bash
npm test event-store.service.test.ts
npm test state-manager.service.test.ts
```

## Performance Considerations

### Snapshot Strategy

- **Default**: Create snapshot every 50 events
- **Manual**: Create on demand for critical points
- **Optimization**: Adjust threshold based on aggregate size

### Replay Performance

- **With Snapshot**: O(n) where n = events since snapshot
- **Without Snapshot**: O(n) where n = total events
- **Batch Processing**: Events loaded in batches (default 100)

### Query Optimization

Indexes support efficient queries:
- `[aggregateId, sequenceNumber]` - Event stream
- `[eventId]` - Idempotency checks
- `[correlationId]` - Correlation queries
- `[timestamp]` - Time-based queries

## Future Enhancements

1. **Event Upcasters**: Automatic schema migration
2. **Projections**: Pre-computed views from events
3. **Saga Support**: Long-running transactions
4. **Event Archival**: Move old events to cold storage
5. **Compression**: Compress event payloads
6. **CQRS**: Separate read/write models

## References

- [Event Sourcing Pattern](https://martinfowler.com/eaaDev/EventSourcing.html)
- [CQRS Pattern](https://martinfowler.com/bliki/CQRS.html)
- [Domain Events](https://martinfowler.com/eaaDev/DomainEvent.html)
