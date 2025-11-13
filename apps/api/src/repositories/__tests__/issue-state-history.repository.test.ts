/**
 * IssueStateHistory Repository Tests
 * Task 12.2 - FSM State History Implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IssueStateHistoryRepository } from '../issue-state-history.repository';
import { prisma } from '../../lib/db';
import type { CreateIssueStateHistoryInput } from '../issue-state-history.repository';

describe('IssueStateHistoryRepository', () => {
  let repository: IssueStateHistoryRepository;
  let testProjectId: string;
  let testIssueId: string;

  beforeEach(async () => {
    repository = new IssueStateHistoryRepository();

    // Create test project
    const project = await prisma.project.create({
      data: {
        name: 'Test Project',
        localPath: '/test/path',
        defaultBranch: 'main',
      },
    });
    testProjectId = project.id;

    // Create test issue
    const issue = await prisma.issue.create({
      data: {
        projectId: testProjectId,
        title: 'Test Issue',
        status: 'TODO',
      },
    });
    testIssueId = issue.id;
  });

  afterEach(async () => {
    // Clean up test data in correct order
    await prisma.issueStateHistory.deleteMany({});
    await prisma.issue.deleteMany({});
    await prisma.project.deleteMany({});
  });

  describe('create', () => {
    it('should create a new state history entry', async () => {
      const input: CreateIssueStateHistoryInput = {
        issueId: testIssueId,
        fromState: null,
        toState: 'TODO',
        event: 'create',
        triggeredBy: 'system',
      };

      const history = await repository.create(input);

      expect(history.id).toBeDefined();
      expect(history.issueId).toBe(testIssueId);
      expect(history.fromState).toBeNull();
      expect(history.toState).toBe('TODO');
      expect(history.event).toBe('create');
      expect(history.triggeredBy).toBe('system');
      expect(history.timestamp).toBeInstanceOf(Date);
    });

    it('should create state transition with context', async () => {
      const context = JSON.stringify({ userId: 'user-123', comment: 'Starting work' });
      const input: CreateIssueStateHistoryInput = {
        issueId: testIssueId,
        fromState: 'TODO',
        toState: 'IN_PROGRESS',
        event: 'start_work',
        context,
        triggeredBy: 'user-123',
      };

      const history = await repository.create(input);

      expect(history.context).toBe(context);
    });

    it('should create state transition with reason and metadata', async () => {
      const metadata = JSON.stringify({ retries: 3, errorCode: 'TIMEOUT' });
      const input: CreateIssueStateHistoryInput = {
        issueId: testIssueId,
        fromState: 'IN_PROGRESS',
        toState: 'BLOCKED',
        event: 'block',
        reason: 'Waiting on external dependency',
        metadata,
        triggeredBy: 'system',
      };

      const history = await repository.create(input);

      expect(history.reason).toBe('Waiting on external dependency');
      expect(history.metadata).toBe(metadata);
    });
  });

  describe('findByIssueId', () => {
    it('should find all state history for an issue', async () => {
      // Create multiple state transitions
      await repository.create({
        issueId: testIssueId,
        fromState: null,
        toState: 'TODO',
        event: 'create',
      });

      await repository.create({
        issueId: testIssueId,
        fromState: 'TODO',
        toState: 'IN_PROGRESS',
        event: 'start_work',
      });

      await repository.create({
        issueId: testIssueId,
        fromState: 'IN_PROGRESS',
        toState: 'IN_REVIEW',
        event: 'submit_for_review',
      });

      const history = await repository.findByIssueId(testIssueId);

      expect(history).toHaveLength(3);
      // Should be ordered by timestamp DESC (newest first)
      expect(history[0].toState).toBe('IN_REVIEW');
      expect(history[1].toState).toBe('IN_PROGRESS');
      expect(history[2].toState).toBe('TODO');
    });

    it('should limit results when specified', async () => {
      // Create 5 transitions
      for (let i = 0; i < 5; i++) {
        await repository.create({
          issueId: testIssueId,
          fromState: null,
          toState: `STATE_${i}`,
          event: `event_${i}`,
        });
      }

      const history = await repository.findByIssueId(testIssueId, 3);

      expect(history).toHaveLength(3);
    });

    it('should return empty array for issue with no history', async () => {
      const history = await repository.findByIssueId('non-existent-id');

      expect(history).toHaveLength(0);
    });
  });

  describe('find', () => {
    beforeEach(async () => {
      // Create test history entries
      await repository.create({
        issueId: testIssueId,
        fromState: null,
        toState: 'TODO',
        event: 'create',
      });

      await repository.create({
        issueId: testIssueId,
        fromState: 'TODO',
        toState: 'IN_PROGRESS',
        event: 'start_work',
      });

      await repository.create({
        issueId: testIssueId,
        fromState: 'IN_PROGRESS',
        toState: 'BLOCKED',
        event: 'block',
      });
    });

    it('should filter by event', async () => {
      const history = await repository.find({ event: 'start_work' });

      expect(history).toHaveLength(1);
      expect(history[0].event).toBe('start_work');
    });

    it('should filter by toState', async () => {
      const history = await repository.find({ toState: 'BLOCKED' });

      expect(history).toHaveLength(1);
      expect(history[0].toState).toBe('BLOCKED');
    });

    it('should filter by fromState', async () => {
      const history = await repository.find({ fromState: 'TODO' });

      expect(history).toHaveLength(1);
      expect(history[0].fromState).toBe('TODO');
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const history = await repository.find({
        startDate: yesterday,
        endDate: tomorrow,
      });

      expect(history.length).toBeGreaterThan(0);
    });

    it('should support limit and offset', async () => {
      const page1 = await repository.find({ limit: 2, offset: 0 });
      const page2 = await repository.find({ limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe('findLatestByIssueId', () => {
    it('should return the most recent state transition', async () => {
      await repository.create({
        issueId: testIssueId,
        fromState: null,
        toState: 'TODO',
        event: 'create',
      });

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await repository.create({
        issueId: testIssueId,
        fromState: 'TODO',
        toState: 'IN_PROGRESS',
        event: 'start_work',
      });

      const latest = await repository.findLatestByIssueId(testIssueId);

      expect(latest).toBeDefined();
      expect(latest?.toState).toBe('IN_PROGRESS');
      expect(latest?.event).toBe('start_work');
    });

    it('should return null for issue with no history', async () => {
      const latest = await repository.findLatestByIssueId('non-existent-id');

      expect(latest).toBeNull();
    });
  });

  describe('countByIssueId', () => {
    it('should count state transitions', async () => {
      await repository.create({
        issueId: testIssueId,
        fromState: null,
        toState: 'TODO',
        event: 'create',
      });

      await repository.create({
        issueId: testIssueId,
        fromState: 'TODO',
        toState: 'IN_PROGRESS',
        event: 'start_work',
      });

      const count = await repository.countByIssueId(testIssueId);

      expect(count).toBe(2);
    });

    it('should return 0 for issue with no history', async () => {
      const count = await repository.countByIssueId('non-existent-id');

      expect(count).toBe(0);
    });
  });

  describe('getTimeline', () => {
    it('should return transitions in chronological order', async () => {
      const states = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'MERGED'];

      for (let i = 0; i < states.length; i++) {
        await repository.create({
          issueId: testIssueId,
          fromState: i === 0 ? null : states[i - 1],
          toState: states[i],
          event: `transition_${i}`,
        });
        // Small delay to ensure timestamp ordering
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const timeline = await repository.getTimeline(testIssueId);

      expect(timeline).toHaveLength(4);
      expect(timeline[0].toState).toBe('TODO');
      expect(timeline[1].toState).toBe('IN_PROGRESS');
      expect(timeline[2].toState).toBe('IN_REVIEW');
      expect(timeline[3].toState).toBe('MERGED');
    });
  });

  describe('findByEvent', () => {
    it('should find all transitions with specific event', async () => {
      // Create two issues and transitions
      const issue2 = await prisma.issue.create({
        data: {
          projectId: testProjectId,
          title: 'Test Issue 2',
          status: 'TODO',
        },
      });

      await repository.create({
        issueId: testIssueId,
        fromState: 'TODO',
        toState: 'IN_PROGRESS',
        event: 'start_work',
      });

      await repository.create({
        issueId: issue2.id,
        fromState: 'TODO',
        toState: 'IN_PROGRESS',
        event: 'start_work',
      });

      const history = await repository.findByEvent('start_work');

      expect(history).toHaveLength(2);
      expect(history.every((h) => h.event === 'start_work')).toBe(true);
    });
  });

  describe('findByToState and findByFromState', () => {
    beforeEach(async () => {
      await repository.create({
        issueId: testIssueId,
        fromState: 'TODO',
        toState: 'IN_PROGRESS',
        event: 'start_work',
      });

      await repository.create({
        issueId: testIssueId,
        fromState: 'IN_PROGRESS',
        toState: 'IN_REVIEW',
        event: 'submit_for_review',
      });
    });

    it('should find transitions to specific state', async () => {
      const history = await repository.findByToState('IN_PROGRESS');

      expect(history).toHaveLength(1);
      expect(history[0].toState).toBe('IN_PROGRESS');
    });

    it('should find transitions from specific state', async () => {
      const history = await repository.findByFromState('IN_PROGRESS');

      expect(history).toHaveLength(1);
      expect(history[0].fromState).toBe('IN_PROGRESS');
    });
  });

  describe('deleteByIssueId', () => {
    it('should delete all history for an issue', async () => {
      await repository.create({
        issueId: testIssueId,
        fromState: null,
        toState: 'TODO',
        event: 'create',
      });

      await repository.create({
        issueId: testIssueId,
        fromState: 'TODO',
        toState: 'IN_PROGRESS',
        event: 'start_work',
      });

      await repository.deleteByIssueId(testIssueId);

      const count = await repository.countByIssueId(testIssueId);
      expect(count).toBe(0);
    });
  });

  describe('getTransitionStats', () => {
    it('should calculate transition statistics', async () => {
      await repository.create({
        issueId: testIssueId,
        fromState: null,
        toState: 'TODO',
        event: 'create',
      });

      await repository.create({
        issueId: testIssueId,
        fromState: 'TODO',
        toState: 'IN_PROGRESS',
        event: 'start_work',
      });

      await repository.create({
        issueId: testIssueId,
        fromState: 'IN_PROGRESS',
        toState: 'IN_REVIEW',
        event: 'submit_for_review',
      });

      await repository.create({
        issueId: testIssueId,
        fromState: 'IN_REVIEW',
        toState: 'IN_PROGRESS',
        event: 'request_changes',
      });

      const stats = await repository.getTransitionStats(testIssueId);

      expect(stats.totalTransitions).toBe(4);
      expect(stats.firstTransition?.toState).toBe('TODO');
      expect(stats.lastTransition?.toState).toBe('IN_PROGRESS');
      expect(stats.stateCount['TODO']).toBe(1);
      expect(stats.stateCount['IN_PROGRESS']).toBe(2);
      expect(stats.stateCount['IN_REVIEW']).toBe(1);
    });

    it('should handle issue with no history', async () => {
      const stats = await repository.getTransitionStats('non-existent-id');

      expect(stats.totalTransitions).toBe(0);
      expect(stats.firstTransition).toBeNull();
      expect(stats.lastTransition).toBeNull();
      expect(Object.keys(stats.stateCount)).toHaveLength(0);
    });
  });

  describe('cascade deletion', () => {
    it('should delete state history when issue is deleted', async () => {
      await repository.create({
        issueId: testIssueId,
        fromState: null,
        toState: 'TODO',
        event: 'create',
      });

      const countBefore = await repository.countByIssueId(testIssueId);
      expect(countBefore).toBe(1);

      // Delete the issue (should cascade to state history)
      await prisma.issue.delete({ where: { id: testIssueId } });

      const countAfter = await repository.countByIssueId(testIssueId);
      expect(countAfter).toBe(0);
    });
  });
});
