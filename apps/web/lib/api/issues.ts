/**
 * Issue API client
 * Frontend API calls for issues with enrichment support
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface EnrichedIssue {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  externalLinks?: Array<{
    provider: string;
    externalId: string;
    externalUrl: string;
    syncEnabled: boolean;
  }>;
  linear?: {
    identifier: string;
    url: string;
    state: {
      id: string;
      name: string;
      type: string;
    };
    priority?: number;
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
    updatedAt: string;
  };
  enrichmentStatus?: {
    hasLinearLink: boolean;
    linearSyncEnabled: boolean;
    linearDataFetched: boolean;
    fetchError?: string;
  };
}

export interface IssueListResponse {
  data: EnrichedIssue[];
  projectId?: string;
  total: number;
  cache?: {
    cached: boolean;
    stale: boolean;
    revalidating?: boolean;
  };
}

export interface IssueResponse {
  data: EnrichedIssue;
  cache?: {
    cached: boolean;
    stale: boolean;
    revalidating: boolean;
  };
}

/**
 * Fetch enriched issue by ID
 */
export async function fetchEnrichedIssue(
  issueId: string,
  options?: {
    includeLinearData?: boolean;
    strategy?: 'prefer_internal' | 'prefer_linear' | 'combined';
  }
): Promise<IssueResponse> {
  const params = new URLSearchParams({
    enriched: 'true',
    includeLinearData: String(options?.includeLinearData ?? true),
    strategy: options?.strategy || 'prefer_internal',
  });

  const response = await fetch(
    `${API_BASE_URL}/issues/${issueId}?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch issue: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch enriched issues for a project
 */
export async function fetchProjectIssues(
  projectId: string,
  options?: {
    includeLinearData?: boolean;
    strategy?: 'prefer_internal' | 'prefer_linear' | 'combined';
  }
): Promise<IssueListResponse> {
  const params = new URLSearchParams({
    enriched: 'true',
    includeLinearData: String(options?.includeLinearData ?? true),
    strategy: options?.strategy || 'prefer_internal',
  });

  const response = await fetch(
    `${API_BASE_URL}/issues/project/${projectId}/issues?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch project issues: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Create a new issue
 */
export async function createIssue(data: {
  projectId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
}): Promise<{ data: EnrichedIssue }> {
  const response = await fetch(`${API_BASE_URL}/issues`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to create issue: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Update an issue
 */
export async function updateIssue(
  issueId: string,
  data: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
  }
): Promise<{ data: EnrichedIssue }> {
  const response = await fetch(`${API_BASE_URL}/issues/${issueId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to update issue: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Delete an issue
 */
export async function deleteIssue(
  issueId: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/issues/${issueId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete issue: ${response.statusText}`);
  }

  return response.json();
}
