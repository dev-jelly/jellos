/**
 * ExecutionStateHistory Repository Tests
 * Task 12.2 - FSM State History Implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExecutionStateHistoryRepository } from '../execution-state-history.repository';
import { prisma } from '../../lib/db';
import type { CreateExecutionStateHistoryInput } from '../execution-state-history.repository';

describe('ExecutionStateHistoryRepository', () => {
  let repository: ExecutionStateHistoryRepository;
  let testProjectId: string;
  let testAgentId: string;
  let testExecutionId: string;

  beforeEach(async () => {
    repository = new ExecutionStateHistoryRepository();

    // Create test project
    const project = await prisma.project.create({
      data: {
        name: 'Test Project',
        localPath: '/test/path',
        defaultBranch: 'main',
      },
    });
    testProjectId = project.id;

    // Create test agent
    const agent = await prisma.codeAgentRuntime.create({
      data: {
        projectId: testProjectId,
        externalId: 'test-agent-001',
        label: 'Test Agent',
        cmd: 'node',
        args: JSON.stringify(['agent.js']),
        envMask: JSON.stringify([]),
      },
    });
    testAgentId = agent.id;

    // Create test execution
    const execution = await prisma.agentExecution.create({
      data: {
        agentId: testAgentId,
        projectId: testProjectId,
        status: 'PENDING',
      },
    });
    testExecutionId = execution.id;
  });

  afterEach(async () => {
    // Clean up test data in correct order
    await prisma.executionStateHistory.deleteMany({});
    await prisma.agentExecution.deleteMany({});
    await prisma.codeAgentRuntime.deleteMany({});
    await prisma.project.deleteMany({});
  });

  describe('create', () => {
    it('should create a new execution state history entry', async () => {
      const input: CreateExecutionStateHistoryInput = {
        executionId: testExecutionId,
        fromState: null,
        toState: 'PENDING',
        event: 'create',
      };

      const history = await repository.create(input);

      expect(history.id).toBeDefined();
      expect(history.executionId).toBe(testExecutionId);
      expect(history.fromState).toBeNull();
      expect(history.toState).toBe('PENDING');
      expect(history.event).toBe('create');
      expect(history.timestamp).toBeInstanceOf(Date);
    });

    it('should create state transition with context and reason', async () => {
      const context = JSON.stringify({ processId: 12345, timeout: 30000 });
      const input: CreateExecutionStateHistoryInput = {
        executionId: testExecutionId,
        fromState: 'PENDING',
        toState: 'RUNNING',
        event: 'execute',
        context,
        reason: 'Agent started successfully',
      };

      const history = await repository.create(input);

      expect(history.context).toBe(context);
      expect(history.reason).toBe('Agent started successfully');
    });

    it('should create failure transition with error details', async () => {
      const metadata = JSON.stringify({
        errorCode: 'ECONNREFUSED',
        stack: 'Error stack trace...',
      });
      const input: CreateExecutionStateHistoryInput = {
        executionId: testExecutionId,
        fromState: 'RUNNING',
        toState: 'FAILED',
        event: 'fail',
        reason: 'Connection refused',
        metadata,
      };

      const history = await repository.create(input);

      expect(history.reason).toBe('Connection refused');
      expect(history.metadata).toBe(metadata);
    });
  });

  describe('findByExecutionId', () => {
    it('should find all state history for an execution', async () => {
      // Create multiple state transitions
      await repository.create({
        executionId: testExecutionId,
        fromState: null,
        toState: 'PENDING',
        event: 'create',
      });

      await repository.create({
        executionId: testExecutionId,
        fromState: 'PENDING',
        toState: 'RUNNING',
        event: 'execute',
      });

      await repository.create({
        executionId: testExecutionId,
        fromState: 'RUNNING',
        toState: 'COMPLETED',
        event: 'complete',
      });

      const history = await repository.findByExecutionId(testExecutionId);

      expect(history).toHaveLength(3);
      // Should be ordered by timestamp DESC (newest first)
      expect(history[0].toState).toBe('COMPLETED');
      expect(history[1].toState).toBe('RUNNING');
      expect(history[2].toState).toBe('PENDING');
    });

    it('should limit results when specified', async () => {
      // Create 5 transitions
      for (let i = 0; i < 5; i++) {
        await repository.create({
          executionId: testExecutionId,
          fromState: null,
          toState: `STATE_${i}`,
          event: `event_${i}`,
        });
      }

      const history = await repository.findByExecutionId(testExecutionId, 3);

      expect(history).toHaveLength(3);
    });
  });

  describe('find', () => {
    beforeEach(async () => {
      await repository.create({
        executionId: testExecutionId,
        fromState: null,
        toState: 'PENDING',
        event: 'create',
      });

      await repository.create({
        executionId: testExecutionId,
        fromState: 'PENDING',
        toState: 'RUNNING',
        event: 'execute',
      });

      await repository.create({
        executionId: testExecutionId,
        fromState: 'RUNNING',
        toState: 'FAILED',
        event: 'fail',
      });
    });

    it('should filter by event', async () => {
      const history = await repository.find({ event: 'execute' });

      expect(history).toHaveLength(1);
      expect(history[0].event).toBe('execute');
    });

    it('should filter by toState', async () => {
      const history = await repository.find({ toState: 'FAILED' });

      expect(history).toHaveLength(1);
      expect(history[0].toState).toBe('FAILED');
    });

    it('should filter by fromState', async () => {
      const history = await repository.find({ fromState: 'RUNNING' });

      expect(history).toHaveLength(1);
      expect(history[0].fromState).toBe('RUNNING');
    });

    it('should support limit and offset', async () => {
      const page1 = await repository.find({ limit: 2, offset: 0 });
      const page2 = await repository.find({ limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
    });
  });

  describe('findLatestByExecutionId', () => {
    it('should return the most recent state transition', async () => {
      await repository.create({
        executionId: testExecutionId,
        fromState: null,
        toState: 'PENDING',
        event: 'create',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await repository.create({
        executionId: testExecutionId,
        fromState: 'PENDING',
        toState: 'RUNNING',
        event: 'execute',
      });

      const latest = await repository.findLatestByExecutionId(testExecutionId);

      expect(latest).toBeDefined();
      expect(latest?.toState).toBe('RUNNING');
      expect(latest?.event).toBe('execute');
    });
  });

  describe('getTimeline', () => {
    it('should return transitions in chronological order', async () => {
      const states = ['PENDING', 'RUNNING', 'COMPLETED'];

      for (let i = 0; i < states.length; i++) {
        await repository.create({
          executionId: testExecutionId,
          fromState: i === 0 ? null : states[i - 1],
          toState: states[i],
          event: `transition_${i}`,
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const timeline = await repository.getTimeline(testExecutionId);

      expect(timeline).toHaveLength(3);
      expect(timeline[0].toState).toBe('PENDING');
      expect(timeline[1].toState).toBe('RUNNING');
      expect(timeline[2].toState).toBe('COMPLETED');
    });
  });

  describe('getTransitionStats', () => {
    it('should calculate transition statistics with timing', async () => {
      const startTime = Date.now();

      await repository.create({
        executionId: testExecutionId,
        fromState: null,
        toState: 'PENDING',
        event: 'create',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      await repository.create({
        executionId: testExecutionId,
        fromState: 'PENDING',
        toState: 'RUNNING',
        event: 'execute',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      await repository.create({
        executionId: testExecutionId,
        fromState: 'RUNNING',
        toState: 'COMPLETED',
        event: 'complete',
      });

      const stats = await repository.getTransitionStats(testExecutionId);

      expect(stats.totalTransitions).toBe(3);
      expect(stats.firstTransition?.toState).toBe('PENDING');
      expect(stats.lastTransition?.toState).toBe('COMPLETED');
      expect(stats.stateCount['PENDING']).toBe(1);
      expect(stats.stateCount['RUNNING']).toBe(1);
      expect(stats.stateCount['COMPLETED']).toBe(1);
      expect(stats.averageTransitionTime).toBeGreaterThan(0);
    });

    it('should handle execution with single transition', async () => {
      await repository.create({
        executionId: testExecutionId,
        fromState: null,
        toState: 'PENDING',
        event: 'create',
      });

      const stats = await repository.getTransitionStats(testExecutionId);

      expect(stats.totalTransitions).toBe(1);
      expect(stats.averageTransitionTime).toBeUndefined();
    });
  });

  describe('findFailedExecutions', () => {
    it('should find all failed execution transitions', async () => {
      // Create second execution
      const execution2 = await prisma.agentExecution.create({
        data: {
          agentId: testAgentId,
          projectId: testProjectId,
          status: 'FAILED',
        },
      });

      await repository.create({
        executionId: testExecutionId,
        fromState: 'RUNNING',
        toState: 'FAILED',
        event: 'fail',
        reason: 'Process crashed',
      });

      await repository.create({
        executionId: execution2.id,
        fromState: 'RUNNING',
        toState: 'FAILED',
        event: 'fail',
        reason: 'Timeout exceeded',
      });

      const failed = await repository.findFailedExecutions();

      expect(failed).toHaveLength(2);
      expect(failed.every((h) => h.toState === 'FAILED')).toBe(true);
    });

    it('should limit failed execution results', async () => {
      for (let i = 0; i < 5; i++) {
        const execution = await prisma.agentExecution.create({
          data: {
            agentId: testAgentId,
            projectId: testProjectId,
            status: 'FAILED',
          },
        });

        await repository.create({
          executionId: execution.id,
          fromState: 'RUNNING',
          toState: 'FAILED',
          event: 'fail',
        });
      }

      const failed = await repository.findFailedExecutions(3);

      expect(failed).toHaveLength(3);
    });
  });

  describe('findTimedOutExecutions', () => {
    it('should find all timed out execution transitions', async () => {
      await repository.create({
        executionId: testExecutionId,
        fromState: 'RUNNING',
        toState: 'TIMEOUT',
        event: 'timeout',
        reason: 'Exceeded 30s timeout',
      });

      const timedOut = await repository.findTimedOutExecutions();

      expect(timedOut).toHaveLength(1);
      expect(timedOut[0].toState).toBe('TIMEOUT');
      expect(timedOut[0].reason).toBe('Exceeded 30s timeout');
    });
  });

  describe('deleteByExecutionId', () => {
    it('should delete all history for an execution', async () => {
      await repository.create({
        executionId: testExecutionId,
        fromState: null,
        toState: 'PENDING',
        event: 'create',
      });

      await repository.create({
        executionId: testExecutionId,
        fromState: 'PENDING',
        toState: 'RUNNING',
        event: 'execute',
      });

      await repository.deleteByExecutionId(testExecutionId);

      const count = await repository.countByExecutionId(testExecutionId);
      expect(count).toBe(0);
    });
  });

  describe('cascade deletion', () => {
    it('should delete state history when execution is deleted', async () => {
      await repository.create({
        executionId: testExecutionId,
        fromState: null,
        toState: 'PENDING',
        event: 'create',
      });

      const countBefore = await repository.countByExecutionId(testExecutionId);
      expect(countBefore).toBe(1);

      // Delete the execution (should cascade to state history)
      await prisma.agentExecution.delete({ where: { id: testExecutionId } });

      const countAfter = await repository.countByExecutionId(testExecutionId);
      expect(countAfter).toBe(0);
    });
  });

  describe('integration with execution lifecycle', () => {
    it('should track complete execution lifecycle', async () => {
      // Simulate a complete execution lifecycle
      const transitions = [
        {
          fromState: null,
          toState: 'PENDING',
          event: 'create',
          reason: 'Execution queued',
        },
        {
          fromState: 'PENDING',
          toState: 'RUNNING',
          event: 'execute',
          reason: 'Agent started',
        },
        {
          fromState: 'RUNNING',
          toState: 'COMPLETED',
          event: 'complete',
          reason: 'Exit code 0',
        },
      ];

      for (const transition of transitions) {
        await repository.create({
          executionId: testExecutionId,
          ...transition,
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const timeline = await repository.getTimeline(testExecutionId);
      const stats = await repository.getTransitionStats(testExecutionId);

      expect(timeline).toHaveLength(3);
      expect(stats.totalTransitions).toBe(3);
      expect(stats.firstTransition?.toState).toBe('PENDING');
      expect(stats.lastTransition?.toState).toBe('COMPLETED');
    });

    it('should track retry scenario', async () => {
      // First attempt - fail
      await repository.create({
        executionId: testExecutionId,
        fromState: null,
        toState: 'PENDING',
        event: 'create',
      });

      await repository.create({
        executionId: testExecutionId,
        fromState: 'PENDING',
        toState: 'RUNNING',
        event: 'execute',
      });

      await repository.create({
        executionId: testExecutionId,
        fromState: 'RUNNING',
        toState: 'FAILED',
        event: 'fail',
        reason: 'Network error',
      });

      // Retry
      await repository.create({
        executionId: testExecutionId,
        fromState: 'FAILED',
        toState: 'PENDING',
        event: 'retry',
        reason: 'Automatic retry',
      });

      await repository.create({
        executionId: testExecutionId,
        fromState: 'PENDING',
        toState: 'RUNNING',
        event: 'execute',
      });

      await repository.create({
        executionId: testExecutionId,
        fromState: 'RUNNING',
        toState: 'COMPLETED',
        event: 'complete',
      });

      const timeline = await repository.getTimeline(testExecutionId);
      const stats = await repository.getTransitionStats(testExecutionId);

      expect(timeline).toHaveLength(6);
      expect(stats.stateCount['FAILED']).toBe(1);
      expect(stats.stateCount['COMPLETED']).toBe(1);
      expect(stats.stateCount['PENDING']).toBe(2);
      expect(stats.stateCount['RUNNING']).toBe(2);
    });
  });
});
