/**
 * IssueStateHistory Repository - Data access layer for issue state transitions
 * Task 12.2 - FSM State History Implementation
 */

import { prisma } from '../lib/db';
import { Prisma, IssueStateHistory } from '@prisma/client';

export interface CreateIssueStateHistoryInput {
  issueId: string;
  fromState: string | null;
  toState: string;
  event: string;
  context?: string | null;
  triggeredBy?: string | null;
  reason?: string | null;
  metadata?: string | null;
}

export interface StateHistoryQuery {
  issueId?: string;
  fromState?: string;
  toState?: string;
  event?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class IssueStateHistoryRepository {
  /**
   * Create a new state history entry
   */
  async create(
    data: CreateIssueStateHistoryInput
  ): Promise<IssueStateHistory> {
    return prisma.issueStateHistory.create({
      data,
    });
  }

  /**
   * Find all state history entries for an issue
   * Returns entries ordered by timestamp (newest first)
   */
  async findByIssueId(
    issueId: string,
    limit?: number
  ): Promise<IssueStateHistory[]> {
    return prisma.issueStateHistory.findMany({
      where: { issueId },
      orderBy: { timestamp: 'desc' },
      ...(limit && { take: limit }),
    });
  }

  /**
   * Find state history entries with filters
   */
  async find(query: StateHistoryQuery): Promise<IssueStateHistory[]> {
    const {
      issueId,
      fromState,
      toState,
      event,
      startDate,
      endDate,
      limit,
      offset,
    } = query;

    const where: Prisma.IssueStateHistoryWhereInput = {
      ...(issueId && { issueId }),
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

    return prisma.issueStateHistory.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      ...(limit && { take: limit }),
      ...(offset && { skip: offset }),
    });
  }

  /**
   * Get the most recent state transition for an issue
   */
  async findLatestByIssueId(
    issueId: string
  ): Promise<IssueStateHistory | null> {
    return prisma.issueStateHistory.findFirst({
      where: { issueId },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Count state transitions for an issue
   */
  async countByIssueId(issueId: string): Promise<number> {
    return prisma.issueStateHistory.count({
      where: { issueId },
    });
  }

  /**
   * Get state transition timeline for an issue
   * Returns entries ordered chronologically (oldest first)
   */
  async getTimeline(issueId: string): Promise<IssueStateHistory[]> {
    return prisma.issueStateHistory.findMany({
      where: { issueId },
      orderBy: { timestamp: 'asc' },
    });
  }

  /**
   * Find transitions by event type
   */
  async findByEvent(
    event: string,
    limit?: number
  ): Promise<IssueStateHistory[]> {
    return prisma.issueStateHistory.findMany({
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
  ): Promise<IssueStateHistory[]> {
    return prisma.issueStateHistory.findMany({
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
  ): Promise<IssueStateHistory[]> {
    return prisma.issueStateHistory.findMany({
      where: { fromState },
      orderBy: { timestamp: 'desc' },
      ...(limit && { take: limit }),
    });
  }

  /**
   * Delete all state history for an issue (cascade will handle this automatically)
   */
  async deleteByIssueId(issueId: string): Promise<void> {
    await prisma.issueStateHistory.deleteMany({
      where: { issueId },
    });
  }

  /**
   * Get state transition statistics for an issue
   */
  async getTransitionStats(issueId: string): Promise<{
    totalTransitions: number;
    firstTransition: IssueStateHistory | null;
    lastTransition: IssueStateHistory | null;
    stateCount: Record<string, number>;
  }> {
    const [total, first, last, allTransitions] = await Promise.all([
      this.countByIssueId(issueId),
      prisma.issueStateHistory.findFirst({
        where: { issueId },
        orderBy: { timestamp: 'asc' },
      }),
      prisma.issueStateHistory.findFirst({
        where: { issueId },
        orderBy: { timestamp: 'desc' },
      }),
      prisma.issueStateHistory.findMany({
        where: { issueId },
        select: { toState: true },
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

    return {
      totalTransitions: total,
      firstTransition: first,
      lastTransition: last,
      stateCount,
    };
  }
}

// Export singleton instance
export const issueStateHistoryRepository = new IssueStateHistoryRepository();
