/**
 * GitHub API Client Service
 * Provides GitHub API integration for PR checks and repository operations
 */

import { Octokit } from '@octokit/rest';

export interface GitHubConfig {
  token: string;
  owner?: string;
  repo?: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: 'open' | 'closed';
  head: {
    ref: string; // branch name
    sha: string;
  };
  base: {
    ref: string;
  };
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
  };
}

export interface PRSearchResult {
  exists: boolean;
  prs: GitHubPR[];
  count: number;
}

/**
 * GitHub API client for repository and PR operations
 */
export class GitHubClientService {
  private octokit: Octokit | null = null;
  private config: GitHubConfig;

  constructor(config?: Partial<GitHubConfig>) {
    this.config = {
      token: config?.token || process.env.GITHUB_TOKEN || '',
      owner: config?.owner || process.env.GITHUB_OWNER || '',
      repo: config?.repo || process.env.GITHUB_REPO || '',
    };

    if (this.config.token) {
      this.initializeClient();
    }
  }

  /**
   * Initialize Octokit client
   */
  private initializeClient(): void {
    this.octokit = new Octokit({
      auth: this.config.token,
      userAgent: 'jellos-api/1.0.0',
    });
  }

  /**
   * Check if GitHub is configured and available
   */
  public isConfigured(): boolean {
    return Boolean(this.config.token && this.config.owner && this.config.repo);
  }

  /**
   * Search for PRs by issue number or branch name
   */
  public async searchPRsByIssue(
    issueNumber: string,
    options?: {
      state?: 'open' | 'closed' | 'all';
      owner?: string;
      repo?: string;
    }
  ): Promise<PRSearchResult> {
    if (!this.isConfigured() || !this.octokit) {
      return { exists: false, prs: [], count: 0 };
    }

    const owner = options?.owner || this.config.owner!;
    const repo = options?.repo || this.config.repo!;
    const state = options?.state || 'all';

    try {
      // Search PRs by issue number in title or branch
      const { data: pulls } = await this.octokit.pulls.list({
        owner,
        repo,
        state,
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      });

      // Filter PRs that reference this issue
      const matchingPRs = pulls.filter((pr) => {
        const titleMatch = pr.title.toLowerCase().includes(`#${issueNumber}`);
        const branchMatch = pr.head.ref.toLowerCase().includes(issueNumber.toLowerCase());
        return titleMatch || branchMatch;
      });

      return {
        exists: matchingPRs.length > 0,
        prs: matchingPRs.map(this.transformPR),
        count: matchingPRs.length,
      };
    } catch (error) {
      console.error('Failed to search PRs:', error);
      throw new Error(
        `GitHub API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Search for PRs by branch name
   */
  public async searchPRsByBranch(
    branchName: string,
    options?: {
      state?: 'open' | 'closed' | 'all';
      owner?: string;
      repo?: string;
    }
  ): Promise<PRSearchResult> {
    if (!this.isConfigured() || !this.octokit) {
      return { exists: false, prs: [], count: 0 };
    }

    const owner = options?.owner || this.config.owner!;
    const repo = options?.repo || this.config.repo!;
    const state = options?.state || 'all';

    try {
      const { data: pulls } = await this.octokit.pulls.list({
        owner,
        repo,
        state,
        head: `${owner}:${branchName}`,
        per_page: 100,
      });

      return {
        exists: pulls.length > 0,
        prs: pulls.map(this.transformPR),
        count: pulls.length,
      };
    } catch (error) {
      console.error('Failed to search PRs by branch:', error);
      throw new Error(
        `GitHub API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get a specific PR by number
   */
  public async getPR(
    prNumber: number,
    options?: {
      owner?: string;
      repo?: string;
    }
  ): Promise<GitHubPR | null> {
    if (!this.isConfigured() || !this.octokit) {
      return null;
    }

    const owner = options?.owner || this.config.owner!;
    const repo = options?.repo || this.config.repo!;

    try {
      const { data: pr } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      return this.transformPR(pr);
    } catch (error) {
      console.error(`Failed to get PR #${prNumber}:`, error);
      return null;
    }
  }

  /**
   * Check if a branch exists in the remote repository
   */
  public async branchExists(
    branchName: string,
    options?: {
      owner?: string;
      repo?: string;
    }
  ): Promise<boolean> {
    if (!this.isConfigured() || !this.octokit) {
      return false;
    }

    const owner = options?.owner || this.config.owner!;
    const repo = options?.repo || this.config.repo!;

    try {
      await this.octokit.repos.getBranch({
        owner,
        repo,
        branch: branchName,
      });
      return true;
    } catch (error) {
      // 404 means branch doesn't exist
      if ((error as any)?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Transform GitHub API PR response to our format
   */
  private transformPR(pr: any): GitHubPR {
    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
      },
      base: {
        ref: pr.base.ref,
      },
      html_url: pr.html_url,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      user: {
        login: pr.user.login,
      },
    };
  }

  /**
   * Update configuration (useful for switching repos)
   */
  public updateConfig(config: Partial<GitHubConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.config.token) {
      this.initializeClient();
    }
  }
}

// Singleton instance
let githubClientInstance: GitHubClientService | null = null;

export function getGitHubClient(config?: Partial<GitHubConfig>): GitHubClientService {
  if (!githubClientInstance || config) {
    githubClientInstance = new GitHubClientService(config);
  }
  return githubClientInstance;
}

export function resetGitHubClient(): void {
  githubClientInstance = null;
}
