/**
 * Issue Repository - Data access layer for issues
 */

import { prisma } from '../lib/db';
import { Prisma } from '@prisma/client';
import type {
  Issue,
  IssueWithLinks,
  CreateIssueInput,
  UpdateIssueInput,
  ListIssuesQuery,
  PaginatedIssues,
} from '../types/issue';

export class IssueRepository {
  /**
   * Create a new issue
   */
  async create(data: CreateIssueInput): Promise<Issue> {
    return prisma.issue.create({
      data,
    }) as Promise<Issue>;
  }

  /**
   * Find issue by ID with optional relations
   */
  async findById(
    id: string,
    includeRelations: boolean = true
  ): Promise<IssueWithLinks | null> {
    return prisma.issue.findUnique({
      where: { id },
      include: includeRelations
        ? {
            project: true,
            externalLinks: true,
            worktrees: {
              where: { status: 'ACTIVE' },
            },
            comments: {
              orderBy: { createdAt: 'desc' },
            },
          }
        : undefined,
    }) as Promise<IssueWithLinks | null>;
  }

  /**
   * Find issues by project ID
   */
  async findByProject(
    projectId: string,
    includeRelations: boolean = true
  ): Promise<IssueWithLinks[]> {
    return prisma.issue.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: includeRelations
        ? {
            externalLinks: true,
            worktrees: {
              where: { status: 'ACTIVE' },
            },
          }
        : undefined,
    }) as Promise<IssueWithLinks[]>;
  }

  /**
   * List issues with filtering and pagination
   */
  async list(query: ListIssuesQuery): Promise<PaginatedIssues> {
    const { projectId, status, priority, page, limit } = query;

    // Build where clause
    const where: Prisma.IssueWhereInput = {
      ...(projectId && { projectId }),
      ...(status && { status }),
      ...(priority && { priority }),
    };

    // Execute queries in parallel
    const [issues, total] = await Promise.all([
      prisma.issue.findMany({
        where,
        include: {
          externalLinks: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.issue.count({ where }),
    ]);

    return {
      data: issues as IssueWithLinks[],
      pagination: {
        page,
        limit,
        total,
      },
    };
  }

  /**
   * Update an issue
   */
  async update(id: string, data: UpdateIssueInput): Promise<Issue> {
    return prisma.issue.update({
      where: { id },
      data,
    }) as Promise<Issue>;
  }

  /**
   * Delete an issue
   */
  async delete(id: string): Promise<void> {
    await prisma.issue.delete({
      where: { id },
    });
  }

  /**
   * Find issues by status
   */
  async findByStatus(
    status: string,
    projectId?: string
  ): Promise<IssueWithLinks[]> {
    return prisma.issue.findMany({
      where: {
        status,
        ...(projectId && { projectId }),
      },
      include: {
        externalLinks: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    }) as Promise<IssueWithLinks[]>;
  }

  /**
   * Count issues by project
   */
  async countByProject(projectId: string): Promise<number> {
    return prisma.issue.count({
      where: { projectId },
    });
  }

  /**
   * Count issues by status
   */
  async countByStatus(projectId: string, status: string): Promise<number> {
    return prisma.issue.count({
      where: { projectId, status },
    });
  }

  /**
   * Check if issue exists
   */
  async exists(id: string): Promise<boolean> {
    const count = await prisma.issue.count({
      where: { id },
    });
    return count > 0;
  }
}

// Export singleton instance
export const issueRepository = new IssueRepository();
