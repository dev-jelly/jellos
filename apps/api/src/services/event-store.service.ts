/**
 * Event Store Service
 *
 * Implements event sourcing pattern with:
 * - Append-only event log with ordering guarantees
 * - Event replay mechanism for state reconstruction
 * - Snapshot support for performance optimization
 * - Event versioning for schema evolution
 * - Idempotency for event processing
 *
 * Task 12.5 - Event Sourcing Pattern Implementation
 */

import { randomUUID } from 'crypto';
import { prisma } from '../lib/db';
import type {
  DomainEvent,
  PersistedEvent,
  EventStoreQuery,
  ReplayOptions,
  EventReducer,
  StateSnapshot,
  SnapshotOptions,
  IdempotencyCheckResult,
  EventAppendResult,
  StateTransitionPayload,
  EventMetadata,
} from '../types/event-sourcing';
import { Prisma, IssueStateHistory, ExecutionStateHistory } from '@prisma/client';

/**
 * Aggregate type enum
 */
export enum AggregateType {
  ISSUE = 'Issue',
  EXECUTION = 'Execution',
}

/**
 * Event Store Service
 * Generic event store implementation that works with both Issue and Execution aggregates
 */
export class EventStoreService {
  /**
   * Append a new event to the event store with idempotency guarantees
   */
  async appendEvent<TPayload = StateTransitionPayload>(
    event: DomainEvent<TPayload>
  ): Promise<EventAppendResult> {
    // Check for idempotency
    if (event.metadata.eventId) {
      const existing = await this.checkIdempotency(
        event.aggregateType as AggregateType,
        event.metadata.eventId
      );
      if (existing.exists && existing.event) {
        return {
          event: existing.event,
          isNew: false,
        };
      }
    }

    // Generate eventId if not provided
    const eventId = event.metadata.eventId || randomUUID();
    const correlationId = event.metadata.correlationId || randomUUID();

    // Get next sequence number for the aggregate
    const sequenceNumber = await this.getNextSequenceNumber(
      event.aggregateType as AggregateType,
      event.aggregateId
    );

    // Persist event based on aggregate type
    const persistedEvent = await this.persistEvent(
      event,
      eventId,
      correlationId,
      sequenceNumber
    );

    return {
      event: persistedEvent,
      isNew: true,
    };
  }

  /**
   * Get events for an aggregate with optional filtering
   */
  async getEvents(
    aggregateType: AggregateType,
    query: EventStoreQuery
  ): Promise<PersistedEvent[]> {
    if (aggregateType === AggregateType.ISSUE) {
      return this.getIssueEvents(query);
    } else {
      return this.getExecutionEvents(query);
    }
  }

  /**
   * Replay events to reconstruct state
   */
  async replayEvents<TState>(
    aggregateType: AggregateType,
    aggregateId: string,
    initialState: TState,
    reducer: EventReducer<TState>,
    options: ReplayOptions = {}
  ): Promise<TState> {
    const { useSnapshot = true, batchSize = 100 } = options;
    let state = initialState;
    let fromSequence = options.fromSequence || 1;

    // Try to load snapshot if enabled
    if (useSnapshot) {
      const snapshot = await this.getLatestSnapshot<TState>(
        aggregateType,
        aggregateId
      );

      if (snapshot && (!options.fromSequence || snapshot.lastSequenceNumber >= options.fromSequence)) {
        state = snapshot.state;
        fromSequence = snapshot.lastSequenceNumber + 1;
      }
    }

    // Fetch and apply events in batches
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      const events = await this.getEvents(aggregateType, {
        aggregateId,
        fromSequence,
        toSequence: options.toSequence,
        fromTimestamp: options.fromTimestamp,
        toTimestamp: options.toTimestamp,
        limit: batchSize,
        offset,
      });

      if (events.length === 0) {
        hasMore = false;
        break;
      }

      // Apply events to state
      for (const event of events) {
        state = reducer(state, event);
      }

      // Check if we have more events
      if (events.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
      }
    }

    return state;
  }

  /**
   * Create a snapshot of current state
   */
  async createSnapshot<TState>(
    aggregateType: AggregateType,
    aggregateId: string,
    state: TState,
    lastSequenceNumber: number,
    options: SnapshotOptions = {}
  ): Promise<StateSnapshot<TState>> {
    const { minEventsSinceLastSnapshot = 50, force = false } = options;

    // Check if snapshot is needed
    if (!force) {
      const lastSnapshot = await this.getLatestSnapshot<TState>(
        aggregateType,
        aggregateId
      );

      if (lastSnapshot) {
        const eventsSinceSnapshot = lastSequenceNumber - lastSnapshot.lastSequenceNumber;
        if (eventsSinceSnapshot < minEventsSinceLastSnapshot) {
          return lastSnapshot;
        }
      }
    }

    const snapshot = {
      id: randomUUID(),
      aggregateType,
      aggregateId,
      state,
      lastSequenceNumber,
      version: '1.0.0',
      metadata: options.metadata,
      createdAt: new Date(),
    };

    await this.persistSnapshot(aggregateType, snapshot);

    return snapshot;
  }

  /**
   * Get the latest snapshot for an aggregate
   */
  async getLatestSnapshot<TState>(
    aggregateType: AggregateType,
    aggregateId: string
  ): Promise<StateSnapshot<TState> | null> {
    if (aggregateType === AggregateType.ISSUE) {
      const snapshot = await prisma.issueStateSnapshot.findFirst({
        where: { issueId: aggregateId },
        orderBy: { lastSequenceNumber: 'desc' },
      });

      if (!snapshot) return null;

      return {
        id: snapshot.id,
        aggregateType,
        aggregateId,
        state: JSON.parse(snapshot.state) as TState,
        lastSequenceNumber: snapshot.lastSequenceNumber,
        version: snapshot.version,
        metadata: snapshot.metadata ? JSON.parse(snapshot.metadata) : undefined,
        createdAt: snapshot.createdAt,
      };
    } else {
      const snapshot = await prisma.executionStateSnapshot.findFirst({
        where: { executionId: aggregateId },
        orderBy: { lastSequenceNumber: 'desc' },
      });

      if (!snapshot) return null;

      return {
        id: snapshot.id,
        aggregateType,
        aggregateId,
        state: JSON.parse(snapshot.state) as TState,
        lastSequenceNumber: snapshot.lastSequenceNumber,
        version: snapshot.version,
        metadata: snapshot.metadata ? JSON.parse(snapshot.metadata) : undefined,
        createdAt: snapshot.createdAt,
      };
    }
  }

  /**
   * Get event stream for an aggregate (all events in order)
   */
  async getEventStream(
    aggregateType: AggregateType,
    aggregateId: string
  ): Promise<PersistedEvent[]> {
    return this.getEvents(aggregateType, {
      aggregateId,
    });
  }

  /**
   * Count events for an aggregate
   */
  async countEvents(
    aggregateType: AggregateType,
    aggregateId: string
  ): Promise<number> {
    if (aggregateType === AggregateType.ISSUE) {
      return prisma.issueStateHistory.count({
        where: { issueId: aggregateId },
      });
    } else {
      return prisma.executionStateHistory.count({
        where: { executionId: aggregateId },
      });
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Check if event already exists (idempotency)
   */
  private async checkIdempotency(
    aggregateType: AggregateType,
    eventId: string
  ): Promise<IdempotencyCheckResult> {
    if (aggregateType === AggregateType.ISSUE) {
      const existing = await prisma.issueStateHistory.findUnique({
        where: { eventId },
      });

      if (existing) {
        return {
          exists: true,
          event: this.mapIssueHistoryToEvent(existing),
        };
      }
    } else {
      const existing = await prisma.executionStateHistory.findUnique({
        where: { eventId },
      });

      if (existing) {
        return {
          exists: true,
          event: this.mapExecutionHistoryToEvent(existing),
        };
      }
    }

    return { exists: false };
  }

  /**
   * Get next sequence number for an aggregate
   */
  private async getNextSequenceNumber(
    aggregateType: AggregateType,
    aggregateId: string
  ): Promise<number> {
    if (aggregateType === AggregateType.ISSUE) {
      const latest = await prisma.issueStateHistory.findFirst({
        where: { issueId: aggregateId },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      });

      return (latest?.sequenceNumber || 0) + 1;
    } else {
      const latest = await prisma.executionStateHistory.findFirst({
        where: { executionId: aggregateId },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      });

      return (latest?.sequenceNumber || 0) + 1;
    }
  }

  /**
   * Persist event to database
   */
  private async persistEvent<TPayload>(
    event: DomainEvent<TPayload>,
    eventId: string,
    correlationId: string,
    sequenceNumber: number
  ): Promise<PersistedEvent> {
    const persistedAt = new Date();

    if (event.aggregateType === AggregateType.ISSUE) {
      const payload = event.payload as StateTransitionPayload;
      const created = await prisma.issueStateHistory.create({
        data: {
          issueId: event.aggregateId,
          fromState: payload.fromState,
          toState: payload.toState,
          event: event.eventType,
          context: payload.context ? JSON.stringify(payload.context) : null,
          triggeredBy: event.metadata.actor,
          reason: payload.reason,
          metadata: JSON.stringify(event.metadata),
          timestamp: new Date(event.metadata.timestamp),
          eventId,
          version: event.metadata.version,
          correlationId,
          causationId: event.metadata.causationId,
          sequenceNumber,
          persistedAt,
        },
      });

      return this.mapIssueHistoryToEvent(created);
    } else {
      const payload = event.payload as StateTransitionPayload;
      const created = await prisma.executionStateHistory.create({
        data: {
          executionId: event.aggregateId,
          fromState: payload.fromState,
          toState: payload.toState,
          event: event.eventType,
          context: payload.context ? JSON.stringify(payload.context) : null,
          reason: payload.reason,
          metadata: JSON.stringify(event.metadata),
          timestamp: new Date(event.metadata.timestamp),
          eventId,
          version: event.metadata.version,
          correlationId,
          causationId: event.metadata.causationId,
          sequenceNumber,
          persistedAt,
        },
      });

      return this.mapExecutionHistoryToEvent(created);
    }
  }

  /**
   * Persist snapshot to database
   */
  private async persistSnapshot<TState>(
    aggregateType: AggregateType,
    snapshot: StateSnapshot<TState>
  ): Promise<void> {
    if (aggregateType === AggregateType.ISSUE) {
      await prisma.issueStateSnapshot.create({
        data: {
          id: snapshot.id,
          issueId: snapshot.aggregateId,
          state: JSON.stringify(snapshot.state),
          lastSequenceNumber: snapshot.lastSequenceNumber,
          version: snapshot.version,
          metadata: snapshot.metadata ? JSON.stringify(snapshot.metadata) : null,
          createdAt: snapshot.createdAt,
        },
      });
    } else {
      await prisma.executionStateSnapshot.create({
        data: {
          id: snapshot.id,
          executionId: snapshot.aggregateId,
          state: JSON.stringify(snapshot.state),
          lastSequenceNumber: snapshot.lastSequenceNumber,
          version: snapshot.version,
          metadata: snapshot.metadata ? JSON.stringify(snapshot.metadata) : null,
          createdAt: snapshot.createdAt,
        },
      });
    }
  }

  /**
   * Get issue events with query
   */
  private async getIssueEvents(query: EventStoreQuery): Promise<PersistedEvent[]> {
    const where: Prisma.IssueStateHistoryWhereInput = {
      ...(query.aggregateId && { issueId: query.aggregateId }),
      ...(query.eventType && { event: query.eventType }),
      ...(query.fromSequence || query.toSequence
        ? {
            sequenceNumber: {
              ...(query.fromSequence && { gte: query.fromSequence }),
              ...(query.toSequence && { lte: query.toSequence }),
            },
          }
        : {}),
      ...(query.fromTimestamp || query.toTimestamp
        ? {
            timestamp: {
              ...(query.fromTimestamp && { gte: query.fromTimestamp }),
              ...(query.toTimestamp && { lte: query.toTimestamp }),
            },
          }
        : {}),
    };

    const events = await prisma.issueStateHistory.findMany({
      where,
      orderBy: { sequenceNumber: 'asc' },
      ...(query.limit && { take: query.limit }),
      ...(query.offset && { skip: query.offset }),
    });

    return events.map(this.mapIssueHistoryToEvent);
  }

  /**
   * Get execution events with query
   */
  private async getExecutionEvents(
    query: EventStoreQuery
  ): Promise<PersistedEvent[]> {
    const where: Prisma.ExecutionStateHistoryWhereInput = {
      ...(query.aggregateId && { executionId: query.aggregateId }),
      ...(query.eventType && { event: query.eventType }),
      ...(query.fromSequence || query.toSequence
        ? {
            sequenceNumber: {
              ...(query.fromSequence && { gte: query.fromSequence }),
              ...(query.toSequence && { lte: query.toSequence }),
            },
          }
        : {}),
      ...(query.fromTimestamp || query.toTimestamp
        ? {
            timestamp: {
              ...(query.fromTimestamp && { gte: query.fromTimestamp }),
              ...(query.toTimestamp && { lte: query.toTimestamp }),
            },
          }
        : {}),
    };

    const events = await prisma.executionStateHistory.findMany({
      where,
      orderBy: { sequenceNumber: 'asc' },
      ...(query.limit && { take: query.limit }),
      ...(query.offset && { skip: query.offset }),
    });

    return events.map(this.mapExecutionHistoryToEvent);
  }

  /**
   * Map IssueStateHistory to PersistedEvent
   */
  private mapIssueHistoryToEvent(history: IssueStateHistory): PersistedEvent {
    const metadata: EventMetadata = history.metadata
      ? JSON.parse(history.metadata)
      : {
          eventId: history.eventId || '',
          version: history.version,
          timestamp: history.timestamp.toISOString(),
          correlationId: history.correlationId || '',
          causationId: history.causationId,
          actor: history.triggeredBy,
        };

    const payload: StateTransitionPayload = {
      fromState: history.fromState,
      toState: history.toState,
      event: history.event,
      context: history.context ? JSON.parse(history.context) : undefined,
      reason: history.reason || undefined,
    };

    return {
      id: history.id,
      aggregateType: AggregateType.ISSUE,
      aggregateId: history.issueId,
      eventType: history.event,
      payload,
      metadata,
      sequenceNumber: history.sequenceNumber || 0,
      persistedAt: history.persistedAt,
    };
  }

  /**
   * Map ExecutionStateHistory to PersistedEvent
   */
  private mapExecutionHistoryToEvent(
    history: ExecutionStateHistory
  ): PersistedEvent {
    const metadata: EventMetadata = history.metadata
      ? JSON.parse(history.metadata)
      : {
          eventId: history.eventId || '',
          version: history.version,
          timestamp: history.timestamp.toISOString(),
          correlationId: history.correlationId || '',
          causationId: history.causationId,
          actor: 'system',
        };

    const payload: StateTransitionPayload = {
      fromState: history.fromState,
      toState: history.toState,
      event: history.event,
      context: history.context ? JSON.parse(history.context) : undefined,
      reason: history.reason || undefined,
    };

    return {
      id: history.id,
      aggregateType: AggregateType.EXECUTION,
      aggregateId: history.executionId,
      eventType: history.event,
      payload,
      metadata,
      sequenceNumber: history.sequenceNumber || 0,
      persistedAt: history.persistedAt,
    };
  }
}

// Export singleton instance
export const eventStoreService = new EventStoreService();
