/**
 * State Manager Service
 *
 * Integrates event sourcing with FSM state management.
 * Provides high-level API for state transitions with:
 * - Automatic event sourcing
 * - Event bus integration
 * - Snapshot management
 * - State reconstruction
 *
 * Task 12.5 - Event Sourcing Pattern Implementation
 */

import { randomUUID } from 'crypto';
import { eventStoreService, AggregateType } from './event-store.service';
import { createEventBus, EventTopics, EventBus } from '../lib/event-bus';
import type {
  DomainEvent,
  StateTransitionPayload,
  EventReducer,
  ReplayOptions,
  SnapshotOptions,
} from '../types/event-sourcing';
import { IssueStatus } from '../types/issue';

/**
 * Issue state for reconstruction
 */
export interface IssueState {
  issueId: string;
  status: IssueStatus;
  stateHistory: Array<{
    from: string | null;
    to: string;
    event: string;
    timestamp: Date;
    reason?: string;
  }>;
  transitionCount: number;
  lastTransitionAt: Date | null;
}

/**
 * Execution state for reconstruction
 */
export interface ExecutionState {
  executionId: string;
  status: string;
  stateHistory: Array<{
    from: string | null;
    to: string;
    event: string;
    timestamp: Date;
    reason?: string;
  }>;
  transitionCount: number;
  lastTransitionAt: Date | null;
}

/**
 * State transition request
 */
export interface StateTransitionRequest {
  aggregateType: AggregateType;
  aggregateId: string;
  fromState: string | null;
  toState: string;
  event: string;
  context?: Record<string, any>;
  reason?: string;
  actor?: string;
  correlationId?: string;
  causationId?: string;
}

/**
 * State Manager Service
 */
export class StateManagerService {
  private eventBus: EventBus | null = null;
  private shouldPublishEvents: boolean = true;

  /**
   * Initialize the service
   */
  async initialize(eventBus?: EventBus): Promise<void> {
    if (!this.eventBus) {
      this.eventBus = eventBus || (await createEventBus('jellos-api'));
    }
  }

  /**
   * Disable event publishing (useful for testing)
   */
  disableEventPublishing(): void {
    this.shouldPublishEvents = false;
  }

  /**
   * Enable event publishing
   */
  enableEventPublishing(): void {
    this.shouldPublishEvents = true;
  }

  /**
   * Execute a state transition with event sourcing
   */
  async transitionState(request: StateTransitionRequest): Promise<void> {
    await this.initialize();

    const eventId = randomUUID();
    const correlationId = request.correlationId || randomUUID();
    const timestamp = new Date().toISOString();

    // Create domain event
    const domainEvent: DomainEvent<StateTransitionPayload> = {
      aggregateType: request.aggregateType,
      aggregateId: request.aggregateId,
      eventType: request.event,
      payload: {
        fromState: request.fromState,
        toState: request.toState,
        event: request.event,
        context: request.context,
        reason: request.reason,
      },
      metadata: {
        eventId,
        version: '1.0.0',
        timestamp,
        correlationId,
        causationId: request.causationId,
        actor: request.actor,
      },
    };

    // Append to event store with idempotency
    const result = await eventStoreService.appendEvent(domainEvent);

    // Publish to event bus if it's a new event
    if (result.isNew && this.eventBus && this.shouldPublishEvents) {
      const topic =
        request.aggregateType === AggregateType.ISSUE
          ? EventTopics.ISSUE_EVENTS
          : EventTopics.EXECUTION_EVENTS;

      const eventType =
        request.aggregateType === AggregateType.ISSUE
          ? 'issue.state.changed'
          : 'execution.state.changed';

      await this.eventBus.publish(
        topic,
        eventType,
        {
          [request.aggregateType === AggregateType.ISSUE ? 'issueId' : 'executionId']:
            request.aggregateId,
          from: request.fromState || 'null',
          to: request.toState,
          reason: request.reason,
        },
        {
          metadata: {
            correlationId,
            causationId: request.causationId,
            userId: request.actor,
          },
          waitForAck: false,
        }
      );
    }

    // Check if snapshot is needed
    const eventCount = await eventStoreService.countEvents(
      request.aggregateType,
      request.aggregateId
    );

    if (eventCount > 0 && eventCount % 50 === 0) {
      // Create snapshot every 50 events
      await this.createStateSnapshot(
        request.aggregateType,
        request.aggregateId,
        { minEventsSinceLastSnapshot: 50 }
      );
    }
  }

  /**
   * Reconstruct issue state from events
   */
  async reconstructIssueState(
    issueId: string,
    options?: ReplayOptions
  ): Promise<IssueState> {
    const initialState: IssueState = {
      issueId,
      status: IssueStatus.TODO,
      stateHistory: [],
      transitionCount: 0,
      lastTransitionAt: null,
    };

    const reducer: EventReducer<IssueState> = (state, event) => {
      const payload = event.payload as StateTransitionPayload;
      return {
        ...state,
        status: payload.toState as IssueStatus,
        stateHistory: [
          ...state.stateHistory,
          {
            from: payload.fromState,
            to: payload.toState,
            event: payload.event,
            timestamp: event.persistedAt,
            reason: payload.reason,
          },
        ],
        transitionCount: state.transitionCount + 1,
        lastTransitionAt: event.persistedAt,
      };
    };

    return eventStoreService.replayEvents(
      AggregateType.ISSUE,
      issueId,
      initialState,
      reducer,
      options
    );
  }

  /**
   * Reconstruct execution state from events
   */
  async reconstructExecutionState(
    executionId: string,
    options?: ReplayOptions
  ): Promise<ExecutionState> {
    const initialState: ExecutionState = {
      executionId,
      status: 'PENDING',
      stateHistory: [],
      transitionCount: 0,
      lastTransitionAt: null,
    };

    const reducer: EventReducer<ExecutionState> = (state, event) => {
      const payload = event.payload as StateTransitionPayload;
      return {
        ...state,
        status: payload.toState,
        stateHistory: [
          ...state.stateHistory,
          {
            from: payload.fromState,
            to: payload.toState,
            event: payload.event,
            timestamp: event.persistedAt,
            reason: payload.reason,
          },
        ],
        transitionCount: state.transitionCount + 1,
        lastTransitionAt: event.persistedAt,
      };
    };

    return eventStoreService.replayEvents(
      AggregateType.EXECUTION,
      executionId,
      initialState,
      reducer,
      options
    );
  }

  /**
   * Create a state snapshot
   */
  async createStateSnapshot(
    aggregateType: AggregateType,
    aggregateId: string,
    options?: SnapshotOptions
  ): Promise<void> {
    // Reconstruct current state
    let state: IssueState | ExecutionState;
    if (aggregateType === AggregateType.ISSUE) {
      state = await this.reconstructIssueState(aggregateId);
    } else {
      state = await this.reconstructExecutionState(aggregateId);
    }

    // Get last sequence number
    const events = await eventStoreService.getEventStream(
      aggregateType,
      aggregateId
    );
    const lastSequenceNumber = events[events.length - 1]?.sequenceNumber || 0;

    // Create snapshot
    await eventStoreService.createSnapshot(
      aggregateType,
      aggregateId,
      state,
      lastSequenceNumber,
      options
    );
  }

  /**
   * Get event stream for an aggregate
   */
  async getEventStream(aggregateType: AggregateType, aggregateId: string) {
    return eventStoreService.getEventStream(aggregateType, aggregateId);
  }

  /**
   * Get latest snapshot for an aggregate
   */
  async getLatestSnapshot<T>(aggregateType: AggregateType, aggregateId: string) {
    return eventStoreService.getLatestSnapshot<T>(aggregateType, aggregateId);
  }

  /**
   * Cleanup
   */
  async close(): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.close();
      this.eventBus = null;
    }
  }
}

// Export singleton instance
export const stateManagerService = new StateManagerService();
