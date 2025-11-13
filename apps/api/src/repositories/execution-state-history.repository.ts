/**
 * ExecutionStateHistory Repository - Data access layer for agent execution state transitions
 * Task 12.2 - FSM State History Implementation
 */

import { prisma } from '../lib/db';
import { Prisma, ExecutionStateHistory } from '@prisma/client';

export interface CreateExecutionStateHistoryInput {
  executionId: string;
  fromState: string | null;
  toState: string;
  event: string;
  context?: string | null;
  reason?: string | null;
  metadata?: string | null;
}

export interface ExecutionStateHistoryQuery {
  executionId?: string;
  fromState?: string;
  toState?: string;
  event?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class ExecutionStateHistoryRepository {
  /**
   * Create a new state history entry
   */
  async create(
    data: CreateExecutionStateHistoryInput
  ): Promise<ExecutionStateHistory> {
    return prisma.executionStateHistory.create({
      data,
    });
  }

  /**
   * Find all state history entries for an execution
   * Returns entries ordered by timestamp (newest first)
   */
  async findByExecutionId(
    executionId: string,
    limit?: number
  ): Promise<ExecutionStateHistory[]> {
    return prisma.executionStateHistory.findMany({
      where: { executionId },
      orderBy: { timestamp: 'desc' },
      ...(limit && { take: limit }),
    });
  }

  /**
   * Find state history entries with filters
   */
  async find(
    query: ExecutionStateHistoryQuery
  ): Promise<ExecutionStateHistory[]> {
    const {
      executionId,
      fromState,
      toState,
      event,
      startDate,
      endDate,
      limit,
      offset,
    } = query;

    const where: Prisma.ExecutionStateHistoryWhereInput = {
      ...(executionId && { executionId }),
      ...(fromState && { fromState }),
      ...(toState && { toState }),
      ...(event && { event }),
      ...(startDate || endDate
        ? {
            timestamp: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          }
        : {}),
    };

    return prisma.executionStateHistory.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      ...(limit && { take: limit }),
      ...(offset && { skip: offset }),
    });
  }

  /**
   * Get the most recent state transition for an execution
   */
  async findLatestByExecutionId(
    executionId: string
  ): Promise<ExecutionStateHistory | null> {
    return prisma.executionStateHistory.findFirst({
      where: { executionId },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Count state transitions for an execution
   */
  async countByExecutionId(executionId: string): Promise<number> {
    return prisma.executionStateHistory.count({
      where: { executionId },
    });
  }

  /**
   * Get state transition timeline for an execution
   * Returns entries ordered chronologically (oldest first)
   */
  async getTimeline(executionId: string): Promise<ExecutionStateHistory[]> {
    return prisma.executionStateHistory.findMany({
      where: { executionId },
      orderBy: { timestamp: 'asc' },
    });
  }

  /**
   * Find transitions by event type
   */
  async findByEvent(
    event: string,
    limit?: number
  ): Promise<ExecutionStateHistory[]> {
    return prisma.executionStateHistory.findMany({
      where: { event },
      orderBy: { timestamp: 'desc' },
      ...(limit && { take: limit }),
    });
  }

  /**
   * Find transitions to a specific state
   */
  async findByToState(
    toState: string,
    limit?: number
  ): Promise<ExecutionStateHistory[]> {
    return prisma.executionStateHistory.findMany({
      where: { toState },
      orderBy: { timestamp: 'desc' },
      ...(limit && { take: limit }),
    });
  }

  /**
   * Find transitions from a specific state
   */
  async findByFromState(
    fromState: string,
    limit?: number
  ): Promise<ExecutionStateHistory[]> {
    return prisma.executionStateHistory.findMany({
      where: { fromState },
      orderBy: { timestamp: 'desc' },
      ...(limit && { take: limit }),
    });
  }

  /**
   * Delete all state history for an execution (cascade will handle this automatically)
   */
  async deleteByExecutionId(executionId: string): Promise<void> {
    await prisma.executionStateHistory.deleteMany({
      where: { executionId },
    });
  }

  /**
   * Get state transition statistics for an execution
   */
  async getTransitionStats(executionId: string): Promise<{
    totalTransitions: number;
    firstTransition: ExecutionStateHistory | null;
    lastTransition: ExecutionStateHistory | null;
    stateCount: Record<string, number>;
    averageTransitionTime?: number;
  }> {
    const [total, first, last, allTransitions] = await Promise.all([
      this.countByExecutionId(executionId),
      prisma.executionStateHistory.findFirst({
        where: { executionId },
        orderBy: { timestamp: 'asc' },
      }),
      prisma.executionStateHistory.findFirst({
        where: { executionId },
        orderBy: { timestamp: 'desc' },
      }),
      prisma.executionStateHistory.findMany({
        where: { executionId },
        select: { toState: true, timestamp: true },
        orderBy: { timestamp: 'asc' },
      }),
    ]);

    // Count occurrences of each state
    const stateCount = allTransitions.reduce(
      (acc, t) => {
        acc[t.toState] = (acc[t.toState] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Calculate average transition time
    let averageTransitionTime: number | undefined;
    if (allTransitions.length > 1) {
      const totalTime =
        allTransitions[allTransitions.length - 1].timestamp.getTime() -
        allTransitions[0].timestamp.getTime();
      averageTransitionTime = totalTime / (allTransitions.length - 1);
    }

    return {
      totalTransitions: total,
      firstTransition: first,
      lastTransition: last,
      stateCount,
      averageTransitionTime,
    };
  }

  /**
   * Find failed executions with state history
   */
  async findFailedExecutions(limit?: number): Promise<ExecutionStateHistory[]> {
    return prisma.executionStateHistory.findMany({
      where: {
        toState: 'FAILED',
      },
      orderBy: { timestamp: 'desc' },
      ...(limit && { take: limit }),
    });
  }

  /**
   * Find timed out executions with state history
   */
  async findTimedOutExecutions(
    limit?: number
  ): Promise<ExecutionStateHistory[]> {
    return prisma.executionStateHistory.findMany({
      where: {
        toState: 'TIMEOUT',
      },
      orderBy: { timestamp: 'desc' },
      ...(limit && { take: limit }),
    });
  }
}

// Export singleton instance
export const executionStateHistoryRepository =
  new ExecutionStateHistoryRepository();
