/**
 * Event Sourcing Types
 *
 * Core types for event sourcing pattern implementation.
 * Supports append-only event store, event replay, and state reconstruction.
 */

import { z } from 'zod';

/**
 * Event version for schema evolution
 */
export type EventVersion = string;

/**
 * Event metadata for tracing and correlation
 */
export interface EventMetadata {
  /**
   * Unique event identifier for idempotency
   */
  eventId: string;

  /**
   * Event version for schema evolution
   */
  version: EventVersion;

  /**
   * Timestamp when the event occurred (ISO 8601)
   */
  timestamp: string;

  /**
   * Correlation ID for tracing related events
   */
  correlationId: string;

  /**
   * Causation ID - ID of the event/command that caused this event
   */
  causationId?: string;

  /**
   * Actor who triggered the event (user ID, system, agent ID, etc.)
   */
  actor?: string;

  /**
   * Additional custom metadata
   */
  [key: string]: any;
}

/**
 * Domain event representing a state change
 */
export interface DomainEvent<TPayload = any> {
  /**
   * Aggregate type (Issue, Execution, etc.)
   */
  aggregateType: string;

  /**
   * Aggregate ID (issueId, executionId, etc.)
   */
  aggregateId: string;

  /**
   * Event type (issue.state.changed, etc.)
   */
  eventType: string;

  /**
   * Event payload data
   */
  payload: TPayload;

  /**
   * Event metadata
   */
  metadata: EventMetadata;

  /**
   * Sequence number within the aggregate stream (for ordering)
   */
  sequenceNumber?: number;
}

/**
 * Persisted event in the event store
 */
export interface PersistedEvent extends DomainEvent {
  /**
   * Database ID
   */
  id: string;

  /**
   * Sequence number (guaranteed ordering)
   */
  sequenceNumber: number;

  /**
   * When the event was persisted to the store
   */
  persistedAt: Date;
}

/**
 * State transition event payload
 */
export interface StateTransitionPayload {
  fromState: string | null;
  toState: string;
  event: string;
  context?: Record<string, any>;
  reason?: string;
}

/**
 * Snapshot for performance optimization
 */
export interface StateSnapshot<TState = any> {
  /**
   * Snapshot ID
   */
  id: string;

  /**
   * Aggregate type
   */
  aggregateType: string;

  /**
   * Aggregate ID
   */
  aggregateId: string;

  /**
   * State at the time of snapshot
   */
  state: TState;

  /**
   * Last event sequence number included in this snapshot
   */
  lastSequenceNumber: number;

  /**
   * When the snapshot was created
   */
  createdAt: Date;

  /**
   * Event version at snapshot time
   */
  version: EventVersion;

  /**
   * Optional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Event store query options
 */
export interface EventStoreQuery {
  aggregateId?: string;
  aggregateType?: string;
  eventType?: string;
  fromSequence?: number;
  toSequence?: number;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Event replay options
 */
export interface ReplayOptions {
  /**
   * Start from this sequence number
   */
  fromSequence?: number;

  /**
   * End at this sequence number
   */
  toSequence?: number;

  /**
   * Start from this timestamp
   */
  fromTimestamp?: Date;

  /**
   * End at this timestamp
   */
  toTimestamp?: Date;

  /**
   * Use snapshot if available and newer than fromSequence
   */
  useSnapshot?: boolean;

  /**
   * Batch size for processing events
   */
  batchSize?: number;
}

/**
 * Event reducer function for state reconstruction
 */
export type EventReducer<TState = any> = (
  state: TState,
  event: PersistedEvent
) => TState;

/**
 * Event upcaster for schema migration
 */
export type EventUpcaster = (
  event: PersistedEvent,
  fromVersion: EventVersion,
  toVersion: EventVersion
) => PersistedEvent;

/**
 * Idempotency check result
 */
export interface IdempotencyCheckResult {
  /**
   * Whether the event already exists
   */
  exists: boolean;

  /**
   * The existing event if found
   */
  event?: PersistedEvent;
}

/**
 * Event append result
 */
export interface EventAppendResult {
  /**
   * The persisted event
   */
  event: PersistedEvent;

  /**
   * Whether this was a new event (false if idempotent duplicate)
   */
  isNew: boolean;
}

/**
 * Snapshot creation options
 */
export interface SnapshotOptions {
  /**
   * Minimum events since last snapshot before creating a new one
   */
  minEventsSinceLastSnapshot?: number;

  /**
   * Force snapshot creation regardless of event count
   */
  force?: boolean;

  /**
   * Additional metadata to include in snapshot
   */
  metadata?: Record<string, any>;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const eventMetadataSchema = z.object({
  eventId: z.string().uuid(),
  version: z.string().default('1.0.0'),
  timestamp: z.string().datetime(),
  correlationId: z.string().uuid(),
  causationId: z.string().uuid().optional(),
  actor: z.string().optional(),
});

export const domainEventSchema = z.object({
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  eventType: z.string().min(1),
  payload: z.record(z.any()),
  metadata: eventMetadataSchema,
  sequenceNumber: z.number().int().positive().optional(),
});

export const eventStoreQuerySchema = z.object({
  aggregateId: z.string().optional(),
  aggregateType: z.string().optional(),
  eventType: z.string().optional(),
  fromSequence: z.number().int().positive().optional(),
  toSequence: z.number().int().positive().optional(),
  fromTimestamp: z.coerce.date().optional(),
  toTimestamp: z.coerce.date().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export const replayOptionsSchema = z.object({
  fromSequence: z.number().int().positive().optional(),
  toSequence: z.number().int().positive().optional(),
  fromTimestamp: z.coerce.date().optional(),
  toTimestamp: z.coerce.date().optional(),
  useSnapshot: z.boolean().default(true),
  batchSize: z.number().int().positive().max(1000).default(100),
});

export const snapshotOptionsSchema = z.object({
  minEventsSinceLastSnapshot: z.number().int().positive().default(50),
  force: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});
