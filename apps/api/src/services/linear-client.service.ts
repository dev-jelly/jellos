/**
 * Linear API Client Service
 * Provides a wrapper around @linear/sdk with error handling and retry logic
 */

import { LinearClient } from '@linear/sdk';
import {
  withRetry,
  withCircuitBreaker,
  CircuitBreaker,
  type RetryOptions,
  type CircuitBreakerOptions,
} from '../utils/retry';
import { RecoverableError, ErrorCategory } from '../types/errors';
import type {
  LinearIssueData,
  LinearQueryOptions,
  LinearConfig,
  LinearApiError,
} from '../types/linear';

/**
 * Linear-specific error class
 */
export class LinearClientError extends RecoverableError {
  constructor(
    message: string,
    options: {
      operation?: string;
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
        operation: options.operation,
      },
      cause: options.cause,
    });
  }
}

/**
 * Linear API client service
 */
export class LinearClientService {
  private client: LinearClient | null = null;
  private config: LinearConfig;
  private circuitBreaker: CircuitBreaker;
  private retryOptions: RetryOptions;

  constructor(config?: Partial<LinearConfig>) {
    this.config = {
      apiKey: config?.apiKey || process.env.LINEAR_API_KEY || '',
      timeout: config?.timeout || 10000, // 10 seconds default
      maxRetries: config?.maxRetries || 3,
    };

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 1 minute
      serviceName: 'linear',
    });

    // Configure retry options
    this.retryOptions = {
      maxRetries: this.config.maxRetries,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      jitterMs: 500,
    };

    if (this.config.apiKey) {
      this.initializeClient();
    }
  }

  /**
   * Initialize Linear client
   */
  private initializeClient(): void {
    try {
      this.client = new LinearClient({
        apiKey: this.config.apiKey,
      });
    } catch (error) {
      console.error('Failed to initialize Linear client:', error);
      this.client = null;
    }
  }

  /**
   * Check if Linear is available (API key is configured)
   */
  public isAvailable(): boolean {
    return this.client !== null && this.config.apiKey.length > 0;
  }

  /**
   * Get issue by ID
   */
  public async getIssue(issueId: string): Promise<LinearIssueData | null> {
    if (!this.isAvailable()) {
      throw new Error('Linear API key not configured');
    }

    try {
      const issue = await this.executeWithRetry(async () => {
        return this.client!.issue(issueId);
      }, 'getIssue');

      if (!issue) {
        return null;
      }

      // Transform Linear issue to our format
      return this.transformIssue(issue);
    } catch (error) {
      this.handleError(error, 'getIssue');
      return null;
    }
  }

  /**
   * Get issue by identifier (e.g., "ENG-123")
   */
  public async getIssueByIdentifier(
    identifier: string
  ): Promise<LinearIssueData | null> {
    if (!this.isAvailable()) {
      throw new Error('Linear API key not configured');
    }

    try {
      const issues = await this.executeWithRetry(async () => {
        return this.client!.issues({
          filter: {
            number: {
              eq: parseInt(identifier.split('-')[1], 10),
            },
          },
        });
      }, 'getIssueByIdentifier');

      const nodes = await issues.nodes;
      if (nodes.length === 0) {
        return null;
      }

      return this.transformIssue(nodes[0]);
    } catch (error) {
      this.handleError(error, 'getIssueByIdentifier');
      return null;
    }
  }

  /**
   * Search issues
   */
  public async searchIssues(
    query: string
  ): Promise<LinearIssueData[]> {
    if (!this.isAvailable()) {
      throw new Error('Linear API key not configured');
    }

    try {
      const issues = await this.executeWithRetry(async () => {
        return this.client!.issueSearch({
          query,
        });
      }, 'searchIssues');

      const nodes = await issues.nodes;
      return Promise.all(nodes.map((issue) => this.transformIssue(issue)));
    } catch (error) {
      this.handleError(error, 'searchIssues');
      return [];
    }
  }

  /**
   * List issues with filtering
   */
  public async listIssues(
    options?: Record<string, any>
  ): Promise<LinearIssueData[]> {
    if (!this.isAvailable()) {
      throw new Error('Linear API key not configured');
    }

    try {
      const issues = await this.executeWithRetry(async () => {
        return this.client!.issues(options);
      }, 'listIssues');

      const nodes = await issues.nodes;
      return Promise.all(nodes.map((issue) => this.transformIssue(issue)));
    } catch (error) {
      this.handleError(error, 'listIssues');
      return [];
    }
  }

  /**
   * Transform Linear issue to our format
   */
  private async transformIssue(issue: any): Promise<LinearIssueData> {
    const state = await issue.state;
    const assignee = await issue.assignee;
    const project = await issue.project;
    const labels = await issue.labels();

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description || undefined,
      state: {
        id: state?.id || '',
        name: state?.name || '',
        type: state?.type || '',
      },
      priority: issue.priority,
      url: issue.url,
      createdAt: new Date(issue.createdAt),
      updatedAt: new Date(issue.updatedAt),
      assignee: assignee
        ? {
            id: assignee.id,
            name: assignee.name,
            email: assignee.email || undefined,
          }
        : undefined,
      project: project
        ? {
            id: project.id,
            name: project.name,
          }
        : undefined,
      labels:
        labels && labels.nodes && labels.nodes.length > 0
          ? await Promise.all(
              labels.nodes.map(async (label: any) => ({
                id: label.id,
                name: label.name,
                color: label.color,
              }))
            )
          : undefined,
    };
  }

  /**
   * Execute operation with retry and circuit breaker
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    return withRetry(
      () => withCircuitBreaker(operation, this.circuitBreaker),
      {
        ...this.retryOptions,
        onRetry: async (attempt, error, delayMs) => {
          console.log(
            `Retrying Linear ${operationName} (attempt ${attempt}) after ${delayMs}ms due to: ${error.message}`
          );
        },
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
   * Handle and log errors
   */
  private handleError(error: any, operation: string): void {
    const linearError: LinearApiError = {
      message: error.message || 'Unknown Linear API error',
      type: error.type || 'UNKNOWN',
      extensions: error.extensions,
    };

    console.error(`Linear API error in ${operation}:`, linearError);
  }

  /**
   * Get viewer (current authenticated user)
   */
  public async getViewer(): Promise<{ id: string; name: string; email?: string } | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const viewer = await this.client!.viewer;
      return {
        id: viewer.id,
        name: viewer.name,
        email: viewer.email || undefined,
      };
    } catch (error) {
      this.handleError(error, 'getViewer');
      return null;
    }
  }

  /**
   * Test Linear connection
   */
  public async testConnection(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      // Try to fetch the viewer (current user) as a simple health check
      await this.client!.viewer;
      return true;
    } catch (error) {
      this.handleError(error, 'testConnection');
      return false;
    }
  }
}

// Export singleton instance
let linearClientInstance: LinearClientService | null = null;

export function getLinearClient(
  config?: Partial<LinearConfig>
): LinearClientService {
  if (!linearClientInstance || config) {
    linearClientInstance = new LinearClientService(config);
  }
  return linearClientInstance;
}

export function resetLinearClient(): void {
  linearClientInstance = null;
}
