/**
 * Worktree Repository
 * Database access layer for worktree operations
 */

import { prisma, type Worktree } from '../lib/db';
import { WorktreeStatus } from '../types/worktree';

export interface WorktreeCreateData {
  projectId: string;
  issueId?: string;
  path: string;
  branch: string;
  status?: string;
}

export interface WorktreeUpdateData {
  path?: string;
  branch?: string;
  status?: string;
  lastActivity?: Date;
}

export interface WorktreeFilters {
  projectId?: string;
  issueId?: string;
  status?: string;
  branch?: string;
}

/**
 * Repository for worktree database operations
 */
export class WorktreeRepository {
  /**
   * Create a new worktree
   */
  async create(data: WorktreeCreateData): Promise<Worktree> {
    return prisma.worktree.create({
      data: {
        projectId: data.projectId,
        issueId: data.issueId,
        path: data.path,
        branch: data.branch,
        status: data.status || WorktreeStatus.ACTIVE,
      },
      include: {
        project: true,
        issue: true,
      },
    });
  }

  /**
   * Find worktree by ID
   */
  async findById(id: string): Promise<Worktree | null> {
    return prisma.worktree.findUnique({
      where: { id },
      include: {
        project: true,
        issue: true,
      },
    });
  }

  /**
   * Find worktree by branch name
   */
  async findByBranch(branch: string): Promise<Worktree | null> {
    return prisma.worktree.findUnique({
      where: { branch },
      include: {
        project: true,
        issue: true,
      },
    });
  }

  /**
   * Find worktrees with filters
   */
  async findMany(filters?: WorktreeFilters, skip = 0, take = 50): Promise<Worktree[]> {
    return prisma.worktree.findMany({
      where: filters
        ? {
            projectId: filters.projectId,
            issueId: filters.issueId,
            status: filters.status,
            branch: filters.branch,
          }
        : undefined,
      include: {
        project: {
          select: { name: true },
        },
        issue: {
          select: { title: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
    });
  }

  /**
   * Find all worktrees for a project
   */
  async findByProject(projectId: string): Promise<Worktree[]> {
    return this.findMany({ projectId });
  }

  /**
   * Find all active worktrees
   */
  async findActive(): Promise<Worktree[]> {
    return this.findMany({ status: WorktreeStatus.ACTIVE });
  }

  /**
   * Find stale worktrees (older than specified date)
   */
  async findStale(olderThan: Date): Promise<Worktree[]> {
    return prisma.worktree.findMany({
      where: {
        status: WorktreeStatus.ACTIVE,
        OR: [
          { lastActivity: { lt: olderThan } },
          { lastActivity: null, createdAt: { lt: olderThan } },
        ],
      },
      include: {
        project: true,
        issue: true,
      },
    });
  }

  /**
   * Update worktree
   */
  async update(id: string, data: WorktreeUpdateData): Promise<Worktree> {
    return prisma.worktree.update({
      where: { id },
      data,
      include: {
        project: true,
        issue: true,
      },
    });
  }

  /**
   * Update worktree last activity timestamp
   */
  async updateLastActivity(id: string): Promise<Worktree> {
    return this.update(id, { lastActivity: new Date() });
  }

  /**
   * Update worktree status
   */
  async updateStatus(id: string, status: string): Promise<Worktree> {
    return this.update(id, { status });
  }

  /**
   * Mark worktree as stale
   */
  async markAsStale(id: string): Promise<Worktree> {
    return this.updateStatus(id, WorktreeStatus.STALE);
  }

  /**
   * Mark worktree as dirty
   */
  async markAsDirty(id: string): Promise<Worktree> {
    return this.updateStatus(id, WorktreeStatus.DIRTY);
  }

  /**
   * Mark worktree as removed
   */
  async markAsRemoved(id: string): Promise<Worktree> {
    return this.updateStatus(id, WorktreeStatus.REMOVED);
  }

  /**
   * Delete worktree (soft delete by marking as REMOVED)
   */
  async softDelete(id: string): Promise<Worktree> {
    return this.markAsRemoved(id);
  }

  /**
   * Hard delete worktree from database
   */
  async delete(id: string): Promise<void> {
    await prisma.worktree.delete({
      where: { id },
    });
  }

  /**
   * Count worktrees
   */
  async count(filters?: WorktreeFilters): Promise<number> {
    return prisma.worktree.count({
      where: filters
        ? {
            projectId: filters.projectId,
            issueId: filters.issueId,
            status: filters.status,
            branch: filters.branch,
          }
        : undefined,
    });
  }

  /**
   * Count active worktrees
   */
  async countActive(): Promise<number> {
    return this.count({ status: WorktreeStatus.ACTIVE });
  }

  /**
   * Batch update status for multiple worktrees
   */
  async batchUpdateStatus(ids: string[], status: string): Promise<number> {
    const result = await prisma.worktree.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    return result.count;
  }

  /**
   * Batch update last activity for multiple worktrees
   */
  async batchUpdateLastActivity(ids: string[]): Promise<number> {
    const result = await prisma.worktree.updateMany({
      where: { id: { in: ids } },
      data: { lastActivity: new Date() },
    });
    return result.count;
  }

  /**
   * Get worktree statistics
   */
  async getStatistics(): Promise<{
    total: number;
    active: number;
    stale: number;
    dirty: number;
    removed: number;
  }> {
    const [total, active, stale, dirty, removed] = await Promise.all([
      this.count(),
      this.count({ status: WorktreeStatus.ACTIVE }),
      this.count({ status: WorktreeStatus.STALE }),
      this.count({ status: WorktreeStatus.DIRTY }),
      this.count({ status: WorktreeStatus.REMOVED }),
    ]);

    return { total, active, stale, dirty, removed };
  }
}

// Singleton instance
export const worktreeRepository = new WorktreeRepository();
