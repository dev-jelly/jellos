/**
 * Issue-PR Mapping Repository - Data access layer for issue-PR mappings
 */

import { prisma } from '../lib/db';
import type {
  IssuePRMapping,
  CreateIssuePRMappingInput,
  UpdateIssuePRMappingInput,
  FindPRMappingsQuery,
  PRState,
} from '../types/issue-pr-mapping';

export class IssuePRMappingRepository {
  /**
   * Create a new issue-PR mapping
   */
  async create(data: CreateIssuePRMappingInput): Promise<IssuePRMapping> {
    return prisma.issuePRMapping.create({
      data: {
        ...data,
        state: data.state || 'open',
      },
    }) as Promise<IssuePRMapping>;
  }

  /**
   * Find mapping by ID
   */
  async findById(id: string): Promise<IssuePRMapping | null> {
    return prisma.issuePRMapping.findUnique({
      where: { id },
    }) as Promise<IssuePRMapping | null>;
  }

  /**
   * Find mapping by issue ID and PR number
   */
  async findByIssuePR(
    issueId: string,
    prNumber: number
  ): Promise<IssuePRMapping | null> {
    return prisma.issuePRMapping.findUnique({
      where: {
        issueId_prNumber: {
          issueId,
          prNumber,
        },
      },
    }) as Promise<IssuePRMapping | null>;
  }

  /**
   * Find all mappings for an issue
   */
  async findByIssueId(issueId: string): Promise<IssuePRMapping[]> {
    return prisma.issuePRMapping.findMany({
      where: { issueId },
      orderBy: { createdAt: 'desc' },
    }) as Promise<IssuePRMapping[]>;
  }

  /**
   * Find open PR mappings for an issue
   */
  async findOpenByIssueId(issueId: string): Promise<IssuePRMapping[]> {
    return prisma.issuePRMapping.findMany({
      where: {
        issueId,
        state: 'open',
      },
      orderBy: { createdAt: 'desc' },
    }) as Promise<IssuePRMapping[]>;
  }

  /**
   * Find mapping by branch name and state
   */
  async findByBranchAndState(
    projectId: string,
    branchName: string,
    state: PRState = 'open'
  ): Promise<IssuePRMapping | null> {
    return prisma.issuePRMapping.findUnique({
      where: {
        projectId_branchName_state: {
          projectId,
          branchName,
          state,
        },
      },
    }) as Promise<IssuePRMapping | null>;
  }

  /**
   * Find all open PR mappings for a branch
   */
  async findOpenByBranch(
    projectId: string,
    branchName: string
  ): Promise<IssuePRMapping[]> {
    return prisma.issuePRMapping.findMany({
      where: {
        projectId,
        branchName,
        state: 'open',
      },
      orderBy: { createdAt: 'desc' },
    }) as Promise<IssuePRMapping[]>;
  }

  /**
   * Find mappings by project ID
   */
  async findByProjectId(projectId: string): Promise<IssuePRMapping[]> {
    return prisma.issuePRMapping.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    }) as Promise<IssuePRMapping[]>;
  }

  /**
   * Find mappings with flexible query
   */
  async find(query: FindPRMappingsQuery): Promise<IssuePRMapping[]> {
    return prisma.issuePRMapping.findMany({
      where: {
        ...(query.issueId && { issueId: query.issueId }),
        ...(query.projectId && { projectId: query.projectId }),
        ...(query.branchName && { branchName: query.branchName }),
        ...(query.state && { state: query.state }),
        ...(query.prNumber && { prNumber: query.prNumber }),
      },
      orderBy: { createdAt: 'desc' },
    }) as Promise<IssuePRMapping[]>;
  }

  /**
   * Update a mapping
   */
  async update(
    id: string,
    data: UpdateIssuePRMappingInput
  ): Promise<IssuePRMapping> {
    return prisma.issuePRMapping.update({
      where: { id },
      data,
    }) as Promise<IssuePRMapping>;
  }

  /**
   * Update mapping state by PR number
   */
  async updateStateByPR(
    issueId: string,
    prNumber: number,
    state: PRState,
    closedAt?: Date
  ): Promise<IssuePRMapping> {
    return prisma.issuePRMapping.update({
      where: {
        issueId_prNumber: {
          issueId,
          prNumber,
        },
      },
      data: {
        state,
        ...(closedAt && { closedAt }),
      },
    }) as Promise<IssuePRMapping>;
  }

  /**
   * Delete a mapping
   */
  async delete(id: string): Promise<void> {
    await prisma.issuePRMapping.delete({
      where: { id },
    });
  }

  /**
   * Delete all mappings for an issue
   */
  async deleteByIssueId(issueId: string): Promise<number> {
    const result = await prisma.issuePRMapping.deleteMany({
      where: { issueId },
    });
    return result.count;
  }

  /**
   * Check if an open PR exists for an issue
   */
  async hasOpenPR(issueId: string): Promise<boolean> {
    const count = await prisma.issuePRMapping.count({
      where: {
        issueId,
        state: 'open',
      },
    });
    return count > 0;
  }

  /**
   * Check if an open PR exists for a branch
   */
  async hasOpenPRForBranch(
    projectId: string,
    branchName: string
  ): Promise<boolean> {
    const count = await prisma.issuePRMapping.count({
      where: {
        projectId,
        branchName,
        state: 'open',
      },
    });
    return count > 0;
  }

  /**
   * Count mappings by state
   */
  async countByState(projectId: string, state: PRState): Promise<number> {
    return prisma.issuePRMapping.count({
      where: {
        projectId,
        state,
      },
    });
  }

  /**
   * Get all open PRs for a project
   */
  async getOpenPRs(projectId: string): Promise<IssuePRMapping[]> {
    return prisma.issuePRMapping.findMany({
      where: {
        projectId,
        state: 'open',
      },
      orderBy: { createdAt: 'desc' },
    }) as Promise<IssuePRMapping[]>;
  }
}

// Export singleton instance
export const issuePRMappingRepository = new IssuePRMappingRepository();
