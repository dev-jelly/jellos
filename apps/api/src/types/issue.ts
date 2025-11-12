/**
 * Issue domain types and schemas
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export enum IssueStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  MERGED = 'MERGED',
  DEPLOYED = 'DEPLOYED',
  REJECTED = 'REJECTED',
  CANCELED = 'CANCELED',
}

export enum IssuePriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum ExternalIssueProvider {
  LINEAR = 'linear',
  GITHUB = 'github',
  JIRA = 'jira',
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const issueStatusSchema = z.nativeEnum(IssueStatus);
export const issuePrioritySchema = z.nativeEnum(IssuePriority);
export const externalIssueProviderSchema = z.nativeEnum(ExternalIssueProvider);

// Create issue input
export const createIssueSchema = z.object({
  projectId: z.string().cuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  status: issueStatusSchema.default(IssueStatus.TODO),
  priority: issuePrioritySchema.default(IssuePriority.MEDIUM),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;

// Update issue input
export const updateIssueSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: issueStatusSchema.optional(),
  priority: issuePrioritySchema.optional(),
});

export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

// External issue link input
export const createExternalIssueLinkSchema = z.object({
  issueId: z.string().cuid(),
  provider: externalIssueProviderSchema,
  externalId: z.string().min(1),
  externalUrl: z.string().url(),
  syncEnabled: z.boolean().default(false),
});

export type CreateExternalIssueLinkInput = z.infer<
  typeof createExternalIssueLinkSchema
>;

// Issue comment input
export const createIssueCommentSchema = z.object({
  issueId: z.string().cuid(),
  content: z.string().min(1),
  author: z.string().min(1).max(255),
});

export type CreateIssueCommentInput = z.infer<typeof createIssueCommentSchema>;

// Query schemas
export const listIssuesQuerySchema = z.object({
  projectId: z.string().cuid().optional(),
  status: issueStatusSchema.optional(),
  priority: issuePrioritySchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListIssuesQuery = z.infer<typeof listIssuesQuerySchema>;

// ============================================================================
// Domain Models (matching Prisma schema)
// ============================================================================

export interface Issue {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalIssueLink {
  id: string;
  issueId: string;
  provider: ExternalIssueProvider;
  externalId: string;
  externalUrl: string;
  syncEnabled: boolean;
  createdAt: Date;
}

export interface IssueComment {
  id: string;
  issueId: string;
  content: string;
  author: string;
  createdAt: Date;
}

// ============================================================================
// Extended Types for API Responses
// ============================================================================

export interface IssueWithLinks extends Issue {
  externalLinks?: ExternalIssueLink[];
  comments?: IssueComment[];
}

export interface PaginatedIssues {
  data: IssueWithLinks[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}
