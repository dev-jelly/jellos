/**
 * Type definitions for Issue-PR Mapping
 */

import { IssuePRMapping as PrismaIssuePRMapping } from '@prisma/client';

// Re-export Prisma type
export type IssuePRMapping = PrismaIssuePRMapping;

/**
 * PR state types
 */
export type PRState = 'open' | 'closed' | 'merged';

/**
 * Input for creating a new issue-PR mapping
 */
export interface CreateIssuePRMappingInput {
  issueId: string;
  projectId: string;
  prNumber: number;
  prUrl: string;
  branchName: string;
  state?: PRState;
}

/**
 * Input for updating an issue-PR mapping
 */
export interface UpdateIssuePRMappingInput {
  state?: PRState;
  closedAt?: Date;
}

/**
 * Result of duplicate PR check
 */
export interface DuplicatePRCheckResult {
  isDuplicate: boolean;
  existingMappings: IssuePRMapping[];
  reason?: string;
}

/**
 * Query parameters for finding PR mappings
 */
export interface FindPRMappingsQuery {
  issueId?: string;
  projectId?: string;
  branchName?: string;
  state?: PRState;
  prNumber?: number;
}
