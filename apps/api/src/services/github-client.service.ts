/**
 * GitHub API Client Service
 * Provides GitHub API integration for PR checks and repository operations
 *
 * Features:
 * - Octokit REST API client with authentication
 * - Exponential backoff retry logic
 * - Circuit breaker for fault tolerance
 * - Rate limit handling
 * - Comprehensive error handling
 */

import { Octokit } from '@octokit/rest';
import {
  withRetry,
  withCircuitBreaker,
  CircuitBreaker,
  type RetryOptions,
  type CircuitBreakerOptions,
} from '../utils/retry';
import { RecoverableError, ErrorCategory } from '../types/errors';

/**
 * GitHub-specific error class
 */
export class GitHubApiError extends RecoverableError {
  constructor(
    message: string,
    options: {
      statusCode?: number;
      operation?: string;
      rateLimitRemaining?: number;
      rateLimitReset?: Date;
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      category: options.recoverable === false
        ? ErrorCategory.NON_RETRYABLE
        : ErrorCategory.RETRYABLE,
      recoverable: options.recoverable ?? true,
      context: {
        statusCode: options.statusCode,
        operation: options.operation,
        rateLimitRemaining: options.rateLimitRemaining,
        rateLimitReset: options.rateLimitReset,
      },
      cause: options.cause,
    });
  }
}

export interface GitHubConfig {
  token: string;
  owner?: string;
  repo?: string;
  timeout?: number; // Request timeout in milliseconds
  maxRetries?: number; // Max retry attempts
  retryOptions?: Partial<RetryOptions>;
  circuitBreakerOptions?: Partial<CircuitBreakerOptions>;
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

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  used: number;
}

/**
 * GitHub API client for repository and PR operations
 */
export class GitHubClientService {
  private octokit: Octokit | null = null;
  private config: GitHubConfig;
  private circuitBreaker: CircuitBreaker;
  private lastRateLimitInfo: RateLimitInfo | null = null;

  constructor(config?: Partial<GitHubConfig>) {
    this.config = {
      token: config?.token || process.env.GITHUB_TOKEN || '',
      owner: config?.owner || process.env.GITHUB_OWNER || '',
      repo: config?.repo || process.env.GITHUB_REPO || '',
      timeout: config?.timeout || 30000, // 30 seconds default
      maxRetries: config?.maxRetries || 3,
      retryOptions: config?.retryOptions || {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        jitterMs: 500,
      },
      circuitBreakerOptions: config?.circuitBreakerOptions || {
        failureThreshold: 5,
        resetTimeoutMs: 60000, // 1 minute
        serviceName: 'github',
      },
    };

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      ...this.config.circuitBreakerOptions,
      serviceName: 'github',
    });

    // Validate and initialize client
    this.validateConfig();
    if (this.config.token) {
      this.initializeClient();
    }
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (!this.config.token) {
      console.warn(
        'GitHub client initialized without token. Set GITHUB_TOKEN environment variable or provide token in config.'
      );
    }
  }

  /**
   * Initialize Octokit client
   */
  private initializeClient(): void {
    try {
      this.octokit = new Octokit({
        auth: this.config.token,
        userAgent: 'jellos-api/1.0.0',
        request: {
          timeout: this.config.timeout,
        },
      });
    } catch (error) {
      throw new GitHubApiError('Failed to initialize GitHub client', {
        recoverable: false,
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Check if GitHub is configured and available
   */
  public isConfigured(): boolean {
    return Boolean(this.config.token && this.config.owner && this.config.repo);
  }

  /**
   * Get current rate limit information
   */
  public async getRateLimit(): Promise<RateLimitInfo | null> {
    if (!this.octokit) {
      return null;
    }

    try {
      const { data } = await this.octokit.rateLimit.get();
      const rateLimitInfo: RateLimitInfo = {
        limit: data.rate.limit,
        remaining: data.rate.remaining,
        reset: new Date(data.rate.reset * 1000),
        used: data.rate.used,
      };

      this.lastRateLimitInfo = rateLimitInfo;
      return rateLimitInfo;
    } catch (error) {
      console.error('Failed to fetch rate limit:', error);
      return null;
    }
  }

  /**
   * Get last known rate limit info (cached)
   */
  public getLastRateLimitInfo(): RateLimitInfo | null {
    return this.lastRateLimitInfo;
  }

  /**
   * Check if we're close to rate limit
   */
  public isNearRateLimit(): boolean {
    if (!this.lastRateLimitInfo) {
      return false;
    }
    // Consider "near" as less than 10% remaining
    return (
      this.lastRateLimitInfo.remaining <
      this.lastRateLimitInfo.limit * 0.1
    );
  }

  /**
   * Execute operation with retry and circuit breaker
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    return withRetry(
      () => withCircuitBreaker(() => this.wrapWithRateLimitCheck(operation, operationName), this.circuitBreaker),
      {
        ...this.config.retryOptions,
        onRetry: async (attempt, error, delayMs) => {
          console.log(
            `Retrying ${operationName} (attempt ${attempt}) after ${delayMs}ms due to: ${error.message}`
          );

          // If rate limit error, fetch current rate limit
          if (this.isRateLimitError(error)) {
            await this.getRateLimit();
          }
        },
      }
    );
  }

  /**
   * Wrap operation with rate limit checking
   */
  private async wrapWithRateLimitCheck<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    try {
      const result = await operation();

      // Update rate limit info from response headers if available
      // Note: Octokit automatically adds rate limit info to responses

      return result;
    } catch (error) {
      // Classify and handle error
      const wrappedError = this.wrapError(error, operationName);
      throw wrappedError;
    }
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    return (
      error.status === 403 &&
      (error.message?.includes('rate limit') ||
        error.response?.headers?.['x-ratelimit-remaining'] === '0')
    );
  }

  /**
   * Wrap error with GitHubApiError
   */
  private wrapError(error: any, operation: string): GitHubApiError {
    const statusCode = error.status || error.response?.status;
    const message = error.message || 'Unknown GitHub API error';

    // Determine if error is recoverable
    let recoverable = true;

    if (statusCode === 401 || statusCode === 403) {
      recoverable = false; // Authentication/authorization errors
    } else if (statusCode === 404) {
      recoverable = false; // Not found errors
    } else if (statusCode === 422) {
      recoverable = false; // Validation errors
    } else if (statusCode >= 500) {
      recoverable = true; // Server errors are retryable
    }

    // Extract rate limit info if available
    let rateLimitRemaining: number | undefined;
    let rateLimitReset: Date | undefined;

    if (error.response?.headers) {
      const remaining = error.response.headers['x-ratelimit-remaining'];
      const reset = error.response.headers['x-ratelimit-reset'];

      if (remaining !== undefined) {
        rateLimitRemaining = parseInt(remaining, 10);
      }
      if (reset !== undefined) {
        rateLimitReset = new Date(parseInt(reset, 10) * 1000);
      }
    }

    return new GitHubApiError(
      `GitHub API error in ${operation}: ${message}`,
      {
        statusCode,
        operation,
        recoverable,
        rateLimitRemaining,
        rateLimitReset,
        cause: error instanceof Error ? error : new Error(String(error)),
      }
    );
  }

  /**
   * Get circuit breaker status
   */
  public getCircuitBreakerState(): string {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker (useful for testing or manual recovery)
   */
  public resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
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

    return this.executeWithRetry(async () => {
      // Search PRs by issue number in title or branch
      const { data: pulls } = await this.octokit!.pulls.list({
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
    }, 'searchPRsByIssue');
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

    return this.executeWithRetry(async () => {
      const { data: pulls } = await this.octokit!.pulls.list({
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
    }, 'searchPRsByBranch');
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
      return await this.executeWithRetry(async () => {
        const { data: pr } = await this.octokit!.pulls.get({
          owner,
          repo,
          pull_number: prNumber,
        });

        return this.transformPR(pr);
      }, 'getPR');
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
      await this.executeWithRetry(async () => {
        await this.octokit!.repos.getBranch({
          owner,
          repo,
          branch: branchName,
        });
      }, 'branchExists');
      return true;
    } catch (error) {
      // 404 means branch doesn't exist (non-retryable error)
      if ((error as any)?.status === 404 || (error as any)?.statusCode === 404) {
        return false;
      }
      // Other errors should be logged
      console.error(`Error checking branch existence for ${branchName}:`, error);
      return false;
    }
  }

  /**
   * Create a new Pull Request
   */
  public async createPR(options: {
    title: string;
    body: string;
    head: string; // Branch name
    base: string; // Base branch (e.g., 'main')
    owner?: string;
    repo?: string;
  }): Promise<GitHubPR> {
    if (!this.isConfigured() || !this.octokit) {
      throw new GitHubApiError('GitHub client not configured', {
        recoverable: false,
      });
    }

    const owner = options.owner || this.config.owner!;
    const repo = options.repo || this.config.repo!;

    return this.executeWithRetry(async () => {
      const { data: pr } = await this.octokit!.pulls.create({
        owner,
        repo,
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base,
      });

      return this.transformPR(pr);
    }, 'createPR');
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
