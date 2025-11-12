/**
 * API client for Jellos backend
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface CodeAgentRuntime {
  id: string;
  projectId: string | null;
  externalId: string;
  label: string;
  cmd: string;
  args: string;
  envMask: string;
  version: string | null;
  path: string | null;
  healthStatus: string;
  lastChecked: string | null;
  enabled: boolean;
  discoveredAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  localPath: string;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
  agents?: CodeAgentRuntime[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

/**
 * Fetch all projects from API
 */
export async function fetchProjects(
  page = 1,
  limit = 100
): Promise<PaginatedResponse<Project>> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects?page=${page}&limit=${limit}`,
    {
      // Use Next.js caching with revalidation
      next: {
        revalidate: 60, // Revalidate every 60 seconds
        tags: ['projects'],
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch a single project by ID
 */
export async function fetchProject(id: string): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
    next: {
      revalidate: 30,
      tags: ['projects', `project-${id}`],
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch project: ${response.statusText}`);
  }

  return response.json();
}
