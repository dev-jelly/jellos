/**
 * State Manager Service Tests
 *
 * Tests for state management with event sourcing integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { stateManagerService } from '../state-manager.service';
import { AggregateType } from '../event-store.service';
import { prisma } from '../../lib/db';
import { IssueStatus } from '../../types/issue';

// Mock EventBus for testing
const createMockEventBus = () => ({
  publish: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue('mock-subscription'),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  isHealthy: vi.fn().mockResolvedValue(true),
  close: vi.fn().mockResolvedValue(undefined),
  getAdapterName: vi.fn().mockReturnValue('mock-adapter'),
  getStats: vi.fn().mockResolvedValue({
    adapter: 'mock',
    isHealthy: true,
    publishedEvents: 0,
    subscribedTopics: 0,
    activeSubscriptions: 0,
    failedPublishes: 0,
    failedHandlers: 0,
  }),
});

describe('StateManagerService', () => {
  let testIssueId: string;
  let testExecutionId: string;
  let testProjectId: string;

  beforeEach(async () => {
    // Initialize with mock event bus
    const mockEventBus = createMockEventBus() as any;
    await stateManagerService.initialize(mockEventBus);
    // Disable event bus publishing for tests
    stateManagerService.disableEventPublishing();

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
    await stateManagerService.close();
  });

  describe('transitionState', () => {
    it('should execute state transition with event sourcing', async () => {
      await stateManagerService.transitionState({
        aggregateType: AggregateType.ISSUE,
        aggregateId: testIssueId,
        fromState: IssueStatus.TODO,
        toState: IssueStatus.IN_PROGRESS,
        event: 'start_work',
        actor: 'user-123',
      });

      // Verify event was stored
      const events = await stateManagerService.getEventStream(
        AggregateType.ISSUE,
        testIssueId
      );

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('start_work');
      expect(events[0].metadata.actor).toBe('user-123');
    });

    it('should maintain correlation across related transitions', async () => {
      const correlationId = randomUUID();

      await stateManagerService.transitionState({
        aggregateType: AggregateType.ISSUE,
        aggregateId: testIssueId,
        fromState: IssueStatus.TODO,
        toState: IssueStatus.IN_PROGRESS,
        event: 'start_work',
        correlationId,
      });

      await stateManagerService.transitionState({
        aggregateType: AggregateType.ISSUE,
        aggregateId: testIssueId,
        fromState: IssueStatus.IN_PROGRESS,
        toState: IssueStatus.IN_REVIEW,
        event: 'submit_review',
        correlationId,
      });

      const events = await stateManagerService.getEventStream(
        AggregateType.ISSUE,
        testIssueId
      );

      expect(events).toHaveLength(2);
      expect(events[0].metadata.correlationId).toBe(correlationId);
      expect(events[1].metadata.correlationId).toBe(correlationId);
    });

    it('should create snapshot after 50 events', async () => {
      // Add 50 events
      for (let i = 1; i <= 50; i++) {
        await stateManagerService.transitionState({
          aggregateType: AggregateType.ISSUE,
          aggregateId: testIssueId,
          fromState: IssueStatus.TODO,
          toState: IssueStatus.IN_PROGRESS,
          event: `event_${i}`,
        });
      }

      // Check if snapshot was created
      const snapshot = await stateManagerService.getLatestSnapshot(
        AggregateType.ISSUE,
        testIssueId
      );

      expect(snapshot).toBeTruthy();
      expect(snapshot?.lastSequenceNumber).toBe(50);
    });
  });

  describe('reconstructIssueState', () => {
    beforeEach(async () => {
      // Add test transitions
      await stateManagerService.transitionState({
        aggregateType: AggregateType.ISSUE,
        aggregateId: testIssueId,
        fromState: IssueStatus.TODO,
        toState: IssueStatus.IN_PROGRESS,
        event: 'start_work',
        reason: 'Starting work on issue',
      });

      await stateManagerService.transitionState({
        aggregateType: AggregateType.ISSUE,
        aggregateId: testIssueId,
        fromState: IssueStatus.IN_PROGRESS,
        toState: IssueStatus.IN_REVIEW,
        event: 'submit_review',
        reason: 'Code ready for review',
      });
    });

    it('should reconstruct issue state from events', async () => {
      const state = await stateManagerService.reconstructIssueState(testIssueId);

      expect(state.issueId).toBe(testIssueId);
      expect(state.status).toBe(IssueStatus.IN_REVIEW);
      expect(state.transitionCount).toBe(2);
      expect(state.stateHistory).toHaveLength(2);
      expect(state.stateHistory[0].event).toBe('start_work');
      expect(state.stateHistory[1].event).toBe('submit_review');
    });

    it('should reconstruct state up to a specific point in time', async () => {
      // Add third transition
      await stateManagerService.transitionState({
        aggregateType: AggregateType.ISSUE,
        aggregateId: testIssueId,
        fromState: IssueStatus.IN_REVIEW,
        toState: IssueStatus.MERGED,
        event: 'merge',
      });

      // Reconstruct up to sequence 2
      const state = await stateManagerService.reconstructIssueState(testIssueId, {
        toSequence: 2,
      });

      expect(state.status).toBe(IssueStatus.IN_REVIEW);
      expect(state.transitionCount).toBe(2);
    });
  });

  describe('reconstructExecutionState', () => {
    beforeEach(async () => {
      // Add test transitions
      await stateManagerService.transitionState({
        aggregateType: AggregateType.EXECUTION,
        aggregateId: testExecutionId,
        fromState: 'PENDING',
        toState: 'RUNNING',
        event: 'execute',
      });

      await stateManagerService.transitionState({
        aggregateType: AggregateType.EXECUTION,
        aggregateId: testExecutionId,
        fromState: 'RUNNING',
        toState: 'COMPLETED',
        event: 'complete',
      });
    });

    it('should reconstruct execution state from events', async () => {
      const state = await stateManagerService.reconstructExecutionState(
        testExecutionId
      );

      expect(state.executionId).toBe(testExecutionId);
      expect(state.status).toBe('COMPLETED');
      expect(state.transitionCount).toBe(2);
      expect(state.stateHistory).toHaveLength(2);
    });
  });

  describe('createStateSnapshot', () => {
    it('should manually create snapshot', async () => {
      // Add some transitions
      await stateManagerService.transitionState({
        aggregateType: AggregateType.ISSUE,
        aggregateId: testIssueId,
        fromState: IssueStatus.TODO,
        toState: IssueStatus.IN_PROGRESS,
        event: 'start_work',
      });

      await stateManagerService.transitionState({
        aggregateType: AggregateType.ISSUE,
        aggregateId: testIssueId,
        fromState: IssueStatus.IN_PROGRESS,
        toState: IssueStatus.IN_REVIEW,
        event: 'submit_review',
      });

      // Create snapshot
      await stateManagerService.createStateSnapshot(
        AggregateType.ISSUE,
        testIssueId,
        { force: true }
      );

      // Verify snapshot exists
      const snapshot = await stateManagerService.getLatestSnapshot(
        AggregateType.ISSUE,
        testIssueId
      );

      expect(snapshot).toBeTruthy();
      expect(snapshot?.aggregateId).toBe(testIssueId);
    });
  });

  describe('getEventStream', () => {
    it('should return event stream for an aggregate', async () => {
      // Add transitions
      await stateManagerService.transitionState({
        aggregateType: AggregateType.ISSUE,
        aggregateId: testIssueId,
        fromState: IssueStatus.TODO,
        toState: IssueStatus.IN_PROGRESS,
        event: 'start_work',
      });

      await stateManagerService.transitionState({
        aggregateType: AggregateType.ISSUE,
        aggregateId: testIssueId,
        fromState: IssueStatus.IN_PROGRESS,
        toState: IssueStatus.IN_REVIEW,
        event: 'submit_review',
      });

      const stream = await stateManagerService.getEventStream(
        AggregateType.ISSUE,
        testIssueId
      );

      expect(stream).toHaveLength(2);
      expect(stream[0].sequenceNumber).toBe(1);
      expect(stream[1].sequenceNumber).toBe(2);
    });
  });
});
