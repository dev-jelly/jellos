/**
 * Event Store Service Tests
 *
 * Tests for event sourcing implementation:
 * - Event appending with idempotency
 * - Event replay and state reconstruction
 * - Snapshot creation and usage
 * - Ordering guarantees
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { eventStoreService, AggregateType } from '../event-store.service';
import { prisma } from '../../lib/db';
import type {
  DomainEvent,
  StateTransitionPayload,
  EventReducer,
} from '../../types/event-sourcing';
import { IssueStatus } from '../../types/issue';

describe('EventStoreService', () => {
  let testIssueId: string;
  let testExecutionId: string;
  let testProjectId: string;

  beforeEach(async () => {
    // Create test project
    const project = await prisma.project.create({
      data: {
        name: 'Test Project',
        localPath: `/tmp/test-project-${randomUUID()}`,
      },
    });
    testProjectId = project.id;

    // Create test issue
    const issue = await prisma.issue.create({
      data: {
        projectId: testProjectId,
        title: 'Test Issue',
        status: IssueStatus.TODO,
      },
    });
    testIssueId = issue.id;

    // Create test execution
    const agent = await prisma.codeAgentRuntime.create({
      data: {
        externalId: 'test-agent',
        label: 'Test Agent',
        cmd: 'test',
        args: '[]',
        envMask: '[]',
      },
    });

    const execution = await prisma.agentExecution.create({
      data: {
        agentId: agent.id,
        status: 'PENDING',
      },
    });
    testExecutionId = execution.id;
  });

  afterEach(async () => {
    // Cleanup
    await prisma.issueStateHistory.deleteMany({});
    await prisma.executionStateHistory.deleteMany({});
    await prisma.issueStateSnapshot.deleteMany({});
    await prisma.executionStateSnapshot.deleteMany({});
    await prisma.issue.deleteMany({});
    await prisma.agentExecution.deleteMany({});
    await prisma.codeAgentRuntime.deleteMany({});
    await prisma.project.deleteMany({});
  });

  describe('appendEvent', () => {
    it('should append a new event to the event store', async () => {
      const event: DomainEvent<StateTransitionPayload> = {
        aggregateType: AggregateType.ISSUE,
        aggregateId: testIssueId,
        eventType: 'issue.state.changed',
        payload: {
          fromState: IssueStatus.TODO,
          toState: IssueStatus.IN_PROGRESS,
          event: 'start_work',
        },
        metadata: {
          eventId: randomUUID(),
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          correlationId: randomUUID(),
        },
      };

      const result = await eventStoreService.appendEvent(event);

      expect(result.isNew).toBe(true);
      expect(result.event.aggregateId).toBe(testIssueId);
      expect(result.event.sequenceNumber).toBe(1);
    });

    it('should maintain idempotency for duplicate events', async () => {
      const eventId = randomUUID();
      const event: DomainEvent<StateTransitionPayload> = {
        aggregateType: AggregateType.ISSUE,
        aggregateId: testIssueId,
        eventType: 'issue.state.changed',
        payload: {
          fromState: IssueStatus.TODO,
          toState: IssueStatus.IN_PROGRESS,
          event: 'start_work',
        },
        metadata: {
          eventId,
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          correlationId: randomUUID(),
        },
      };

      // Append first time
      const result1 = await eventStoreService.appendEvent(event);
      expect(result1.isNew).toBe(true);

      // Append again with same eventId
      const result2 = await eventStoreService.appendEvent(event);
      expect(result2.isNew).toBe(false);
      expect(result2.event.id).toBe(result1.event.id);
    });

    it('should maintain sequence number ordering', async () => {
      const events = [
        { from: IssueStatus.TODO, to: IssueStatus.IN_PROGRESS, event: 'start_work' },
        { from: IssueStatus.IN_PROGRESS, to: IssueStatus.IN_REVIEW, event: 'submit_review' },
        { from: IssueStatus.IN_REVIEW, to: IssueStatus.MERGED, event: 'merge' },
      ];

      const results = [];
      for (const e of events) {
        const domainEvent: DomainEvent<StateTransitionPayload> = {
          aggregateType: AggregateType.ISSUE,
          aggregateId: testIssueId,
          eventType: 'issue.state.changed',
          payload: {
            fromState: e.from,
            toState: e.to,
            event: e.event,
          },
          metadata: {
            eventId: randomUUID(),
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            correlationId: randomUUID(),
          },
        };
        const result = await eventStoreService.appendEvent(domainEvent);
        results.push(result.event);
      }

      expect(results[0].sequenceNumber).toBe(1);
      expect(results[1].sequenceNumber).toBe(2);
      expect(results[2].sequenceNumber).toBe(3);
    });
  });

  describe('getEvents', () => {
    beforeEach(async () => {
      // Add some test events
      const events = [
        { from: IssueStatus.TODO, to: IssueStatus.IN_PROGRESS, event: 'start_work' },
        { from: IssueStatus.IN_PROGRESS, to: IssueStatus.IN_REVIEW, event: 'submit_review' },
        { from: IssueStatus.IN_REVIEW, to: IssueStatus.MERGED, event: 'merge' },
      ];

      for (const e of events) {
        const domainEvent: DomainEvent<StateTransitionPayload> = {
          aggregateType: AggregateType.ISSUE,
          aggregateId: testIssueId,
          eventType: 'issue.state.changed',
          payload: {
            fromState: e.from,
            toState: e.to,
            event: e.event,
          },
          metadata: {
            eventId: randomUUID(),
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            correlationId: randomUUID(),
          },
        };
        await eventStoreService.appendEvent(domainEvent);
      }
    });

    it('should get all events for an aggregate', async () => {
      const events = await eventStoreService.getEvents(AggregateType.ISSUE, {
        aggregateId: testIssueId,
      });

      expect(events).toHaveLength(3);
      expect(events[0].sequenceNumber).toBe(1);
      expect(events[1].sequenceNumber).toBe(2);
      expect(events[2].sequenceNumber).toBe(3);
    });

    it('should filter events by sequence range', async () => {
      const events = await eventStoreService.getEvents(AggregateType.ISSUE, {
        aggregateId: testIssueId,
        fromSequence: 2,
        toSequence: 3,
      });

      expect(events).toHaveLength(2);
      expect(events[0].sequenceNumber).toBe(2);
      expect(events[1].sequenceNumber).toBe(3);
    });

    it('should limit number of events returned', async () => {
      const events = await eventStoreService.getEvents(AggregateType.ISSUE, {
        aggregateId: testIssueId,
        limit: 2,
      });

      expect(events).toHaveLength(2);
    });
  });

  describe('replayEvents', () => {
    it('should reconstruct state from events', async () => {
      // Add test events
      const events = [
        { from: IssueStatus.TODO, to: IssueStatus.IN_PROGRESS, event: 'start_work' },
        { from: IssueStatus.IN_PROGRESS, to: IssueStatus.IN_REVIEW, event: 'submit_review' },
      ];

      for (const e of events) {
        const domainEvent: DomainEvent<StateTransitionPayload> = {
          aggregateType: AggregateType.ISSUE,
          aggregateId: testIssueId,
          eventType: 'issue.state.changed',
          payload: {
            fromState: e.from,
            toState: e.to,
            event: e.event,
          },
          metadata: {
            eventId: randomUUID(),
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            correlationId: randomUUID(),
          },
        };
        await eventStoreService.appendEvent(domainEvent);
      }

      // Define reducer
      interface SimpleState {
        status: string;
        transitionCount: number;
      }

      const initialState: SimpleState = {
        status: IssueStatus.TODO,
        transitionCount: 0,
      };

      const reducer: EventReducer<SimpleState> = (state, event) => {
        const payload = event.payload as StateTransitionPayload;
        return {
          status: payload.toState,
          transitionCount: state.transitionCount + 1,
        };
      };

      // Replay events
      const finalState = await eventStoreService.replayEvents(
        AggregateType.ISSUE,
        testIssueId,
        initialState,
        reducer
      );

      expect(finalState.status).toBe(IssueStatus.IN_REVIEW);
      expect(finalState.transitionCount).toBe(2);
    });
  });

  describe('snapshots', () => {
    it('should create and retrieve snapshots', async () => {
      // Add some events
      const events = [
        { from: IssueStatus.TODO, to: IssueStatus.IN_PROGRESS, event: 'start_work' },
        { from: IssueStatus.IN_PROGRESS, to: IssueStatus.IN_REVIEW, event: 'submit_review' },
      ];

      for (const e of events) {
        const domainEvent: DomainEvent<StateTransitionPayload> = {
          aggregateType: AggregateType.ISSUE,
          aggregateId: testIssueId,
          eventType: 'issue.state.changed',
          payload: {
            fromState: e.from,
            toState: e.to,
            event: e.event,
          },
          metadata: {
            eventId: randomUUID(),
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            correlationId: randomUUID(),
          },
        };
        await eventStoreService.appendEvent(domainEvent);
      }

      // Create snapshot
      const state = { status: IssueStatus.IN_REVIEW, transitionCount: 2 };
      await eventStoreService.createSnapshot(
        AggregateType.ISSUE,
        testIssueId,
        state,
        2,
        { force: true }
      );

      // Retrieve snapshot
      const snapshot = await eventStoreService.getLatestSnapshot(
        AggregateType.ISSUE,
        testIssueId
      );

      expect(snapshot).toBeTruthy();
      expect(snapshot?.state).toEqual(state);
      expect(snapshot?.lastSequenceNumber).toBe(2);
    });

    it('should use snapshot during replay', async () => {
      // Add 5 events
      for (let i = 1; i <= 5; i++) {
        const domainEvent: DomainEvent<StateTransitionPayload> = {
          aggregateType: AggregateType.ISSUE,
          aggregateId: testIssueId,
          eventType: 'issue.state.changed',
          payload: {
            fromState: IssueStatus.TODO,
            toState: IssueStatus.IN_PROGRESS,
            event: `event_${i}`,
          },
          metadata: {
            eventId: randomUUID(),
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            correlationId: randomUUID(),
          },
        };
        await eventStoreService.appendEvent(domainEvent);
      }

      // Create snapshot after event 3
      const snapshotState = { status: IssueStatus.IN_PROGRESS, transitionCount: 3 };
      await eventStoreService.createSnapshot(
        AggregateType.ISSUE,
        testIssueId,
        snapshotState,
        3,
        { force: true }
      );

      // Replay with snapshot
      interface SimpleState {
        status: string;
        transitionCount: number;
      }

      const initialState: SimpleState = {
        status: IssueStatus.TODO,
        transitionCount: 0,
      };

      const reducer: EventReducer<SimpleState> = (state, event) => ({
        status: IssueStatus.IN_PROGRESS,
        transitionCount: state.transitionCount + 1,
      });

      const finalState = await eventStoreService.replayEvents(
        AggregateType.ISSUE,
        testIssueId,
        initialState,
        reducer,
        { useSnapshot: true }
      );

      // Should start from snapshot (3 events) and apply remaining 2 events
      expect(finalState.transitionCount).toBe(5);
    });
  });

  describe('event stream', () => {
    it('should return complete event stream in order', async () => {
      // Add events
      const eventCount = 10;
      for (let i = 1; i <= eventCount; i++) {
        const domainEvent: DomainEvent<StateTransitionPayload> = {
          aggregateType: AggregateType.ISSUE,
          aggregateId: testIssueId,
          eventType: 'issue.state.changed',
          payload: {
            fromState: IssueStatus.TODO,
            toState: IssueStatus.IN_PROGRESS,
            event: `event_${i}`,
          },
          metadata: {
            eventId: randomUUID(),
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            correlationId: randomUUID(),
          },
        };
        await eventStoreService.appendEvent(domainEvent);
      }

      const stream = await eventStoreService.getEventStream(
        AggregateType.ISSUE,
        testIssueId
      );

      expect(stream).toHaveLength(eventCount);
      // Verify ordering
      for (let i = 0; i < eventCount; i++) {
        expect(stream[i].sequenceNumber).toBe(i + 1);
      }
    });
  });

  describe('countEvents', () => {
    it('should count events for an aggregate', async () => {
      // Add 3 events
      for (let i = 1; i <= 3; i++) {
        const domainEvent: DomainEvent<StateTransitionPayload> = {
          aggregateType: AggregateType.ISSUE,
          aggregateId: testIssueId,
          eventType: 'issue.state.changed',
          payload: {
            fromState: IssueStatus.TODO,
            toState: IssueStatus.IN_PROGRESS,
            event: `event_${i}`,
          },
          metadata: {
            eventId: randomUUID(),
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            correlationId: randomUUID(),
          },
        };
        await eventStoreService.appendEvent(domainEvent);
      }

      const count = await eventStoreService.countEvents(
        AggregateType.ISSUE,
        testIssueId
      );

      expect(count).toBe(3);
    });
  });
});
