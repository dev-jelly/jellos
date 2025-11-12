/**
 * Linear integration types
 */

import type { Issue as LinearIssue, IssueConnection } from '@linear/sdk';

// ============================================================================
// Linear Domain Types
// ============================================================================

/**
 * Linear issue with minimal required fields
 */
export interface LinearIssueData {
  id: string;
  identifier: string; // e.g., "ENG-123"
  title: string;
  description?: string;
  state: {
    id: string;
    name: string;
    type: string; // backlog, unstarted, started, completed, canceled
  };
  priority?: number; // 0 (no priority) to 4 (urgent)
  url: string;
  createdAt: Date;
  updatedAt: Date;
  assignee?: {
    id: string;
    name: string;
    email?: string;
  };
  project?: {
    id: string;
    name: string;
  };
  labels?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

/**
 * Linear query options
 */
export interface LinearQueryOptions {
  first?: number; // Number of results to fetch
  after?: string; // Cursor for pagination
  orderBy?: 'createdAt' | 'updatedAt';
  filter?: {
    state?: {
      type?: {
        in?: string[]; // e.g., ['started', 'completed']
      };
    };
    assignee?: {
      id?: {
        eq?: string;
      };
    };
    project?: {
      id?: {
        eq?: string;
      };
    };
  };
}

/**
 * Linear API error
 */
export interface LinearApiError {
  message: string;
  type: string;
  extensions?: Record<string, unknown>;
}

/**
 * Linear configuration
 */
export interface LinearConfig {
  apiKey: string;
  timeout?: number; // Request timeout in milliseconds
  maxRetries?: number; // Maximum number of retry attempts
}
