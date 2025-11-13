/**
 * GitHub Webhook Service
 *
 * Handles webhook signature verification and PR event processing
 *
 * Features:
 * - HMAC-SHA256 signature verification
 * - PR event processing (opened, merged, closed)
 * - Issue-PR mapping updates
 * - Issue state transitions via event bus
 */

import * as crypto from 'crypto';
import { issuePRMappingRepository } from '../repositories/issue-pr-mapping.repository';
import { issueRepository } from '../repositories/issue.repository';
import { IssueStatus } from '../types/issue';
import type { PRState } from '../types/issue-pr-mapping';

// Event bus imports (lazy loaded to avoid circular dependencies)
let EventBus: any;
let EventTopics: any;

async function getEventBusModules() {
  if (!EventBus) {
    const eventBusModule = await import('../lib/event-bus');
    EventBus = eventBusModule.createEventBus;
    EventTopics = eventBusModule.EventTopics;
  }
  return { createEventBus: EventBus, EventTopics };
}

/**
 * GitHub webhook event types we handle
 */
export type GitHubWebhookEvent = 'pull_request' | 'pull_request_review';

/**
 * PR action types from GitHub webhooks
 */
export type PRAction =
  | 'opened'
  | 'reopened'
  | 'closed'
  | 'edited'
  | 'synchronize'
  | 'assigned'
  | 'unassigned'
  | 'labeled'
  | 'unlabeled';

/**
 * GitHub webhook payload for pull_request events
 */
export interface GitHubPRWebhookPayload {
  action: PRAction;
  number: number;
  pull_request: {
    id: number;
    number: number;
    state: 'open' | 'closed';
    title: string;
    body: string | null;
    html_url: string;
    head: {
      ref: string; // branch name
      sha: string;
    };
    base: {
      ref: string;
    };
    merged: boolean;
    merged_at: string | null;
    closed_at: string | null;
    created_at: string;
    updated_at: string;
    user: {
      login: string;
    };
  };
  repository: {
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
  };
  sender: {
    login: string;
  };
}

/**
 * Result of webhook processing
 */
export interface WebhookProcessingResult {
  success: boolean;
  event: string;
  action: string;
  prNumber: number;
  processed: boolean;
  message?: string;
  error?: string;
  stateTransition?: {
    issueId: string;
    from: string;
    to: string;
  };
}

/**
 * GitHub webhook signature verification error
 */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/**
 * GitHub Webhook Service
 */
export class GitHubWebhookService {
  private readonly webhookSecret: string;

  constructor(webhookSecret?: string) {
    this.webhookSecret =
      webhookSecret || process.env.GITHUB_WEBHOOK_SECRET || '';

    if (!this.webhookSecret) {
      console.warn(
        'GitHub webhook secret not configured. Webhook signature verification will be skipped. ' +
          'Set GITHUB_WEBHOOK_SECRET environment variable for production use.'
      );
    }
  }

  /**
   * Verify GitHub webhook signature using HMAC-SHA256
   *
   * @param payload - Raw request body as string or Buffer
   * @param signature - X-Hub-Signature-256 header value
   * @returns true if signature is valid
   */
  public verifySignature(
    payload: string | Buffer,
    signature: string | undefined
  ): boolean {
    // Skip verification if no secret is configured (development mode)
    if (!this.webhookSecret) {
      console.warn('Webhook signature verification skipped - no secret configured');
      return true;
    }

    if (!signature) {
      throw new WebhookVerificationError('Missing X-Hub-Signature-256 header');
    }

    // GitHub signature format: "sha256=<hash>"
    if (!signature.startsWith('sha256=')) {
      throw new WebhookVerificationError(
        'Invalid signature format - must start with "sha256="'
      );
    }

    const receivedSignature = signature.substring(7); // Remove "sha256=" prefix

    // Compute expected signature
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    // Use constant-time comparison to prevent timing attacks
    const receivedBuffer = Buffer.from(receivedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  }

  /**
   * Process a pull_request webhook event
   */
  public async processPullRequestEvent(
    payload: GitHubPRWebhookPayload
  ): Promise<WebhookProcessingResult> {
    const { action, pull_request: pr, repository } = payload;
    const prNumber = pr.number;
    const branchName = pr.head.ref;

    console.log(
      `Processing PR webhook: action=${action}, pr=${prNumber}, branch=${branchName}, merged=${pr.merged}`
    );

    // Determine new PR state
    const newState = this.determinePRState(action, pr.state, pr.merged);

    if (!newState) {
      return {
        success: true,
        event: 'pull_request',
        action,
        prNumber,
        processed: false,
        message: `Action '${action}' does not require state update`,
      };
    }

    try {
      // Find all issue-PR mappings for this PR number
      const mappings = await issuePRMappingRepository.find({
        prNumber,
      });

      if (mappings.length === 0) {
        return {
          success: true,
          event: 'pull_request',
          action,
          prNumber,
          processed: false,
          message: `No issue-PR mappings found for PR #${prNumber}`,
        };
      }

      // Update all mappings and trigger state transitions
      const results = await Promise.allSettled(
        mappings.map(async (mapping) => {
          // Update PR mapping state
          const closedAt =
            newState === 'closed' || newState === 'merged'
              ? pr.closed_at
                ? new Date(pr.closed_at)
                : new Date()
              : undefined;

          await issuePRMappingRepository.update(mapping.id, {
            state: newState,
            closedAt,
          });

          // Trigger issue state transition based on PR state
          const issueStateTransition = this.determineIssueStateTransition(
            newState,
            pr.merged
          );

          if (issueStateTransition) {
            await this.triggerIssueStateTransition(
              mapping.issueId,
              issueStateTransition,
              `PR #${prNumber} ${action}`
            );
          }

          return {
            issueId: mapping.issueId,
            mappingId: mapping.id,
            newState,
            issueStateTransition,
          };
        })
      );

      // Extract successful results
      const successfulResults = results
        .filter(
          (result): result is PromiseFulfilledResult<any> =>
            result.status === 'fulfilled'
        )
        .map((result) => result.value);

      const failedResults = results.filter(
        (result) => result.status === 'rejected'
      );

      if (failedResults.length > 0) {
        console.error(
          `Some mappings failed to update: ${failedResults.length}/${results.length}`,
          failedResults
        );
      }

      return {
        success: true,
        event: 'pull_request',
        action,
        prNumber,
        processed: true,
        message: `Updated ${successfulResults.length} issue-PR mappings`,
        stateTransition: successfulResults[0]?.issueStateTransition
          ? {
              issueId: successfulResults[0].issueId,
              from: 'IN_REVIEW',
              to: successfulResults[0].issueStateTransition,
            }
          : undefined,
      };
    } catch (error) {
      console.error('Error processing PR webhook:', error);
      return {
        success: false,
        event: 'pull_request',
        action,
        prNumber,
        processed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Determine PR state from webhook action and PR properties
   */
  private determinePRState(
    action: PRAction,
    prState: 'open' | 'closed',
    merged: boolean
  ): PRState | null {
    switch (action) {
      case 'opened':
      case 'reopened':
        return 'open';

      case 'closed':
        return merged ? 'merged' : 'closed';

      // Other actions don't change state
      case 'edited':
      case 'synchronize':
      case 'assigned':
      case 'unassigned':
      case 'labeled':
      case 'unlabeled':
      default:
        return null;
    }
  }

  /**
   * Determine issue state transition based on PR state
   */
  private determineIssueStateTransition(
    prState: PRState,
    merged: boolean
  ): IssueStatus | null {
    switch (prState) {
      case 'open':
        return IssueStatus.IN_REVIEW;

      case 'merged':
        return IssueStatus.MERGED;

      case 'closed':
        // Closed without merge = rejected
        return merged ? IssueStatus.MERGED : IssueStatus.REJECTED;

      default:
        return null;
    }
  }

  /**
   * Trigger issue state transition via event bus
   */
  private async triggerIssueStateTransition(
    issueId: string,
    newStatus: IssueStatus,
    reason: string
  ): Promise<void> {
    try {
      // Get current issue state
      const issue = await issueRepository.findById(issueId, false);
      if (!issue) {
        console.error(`Issue ${issueId} not found for state transition`);
        return;
      }

      const oldStatus = issue.status;

      // Skip if already in target state
      if (oldStatus === newStatus) {
        console.log(
          `Issue ${issueId} already in state ${newStatus}, skipping transition`
        );
        return;
      }

      // Update issue status in database
      await issueRepository.update(issueId, { status: newStatus });

      // Publish state change event
      try {
        const { createEventBus, EventTopics } = await getEventBusModules();
        const eventBus = await createEventBus();
        await eventBus.publish(
          EventTopics.ISSUE_EVENTS,
          'issue.state.changed',
          {
            issueId,
            projectId: issue.projectId,
            from: oldStatus,
            to: newStatus,
            reason,
          }
        );
      } catch (eventError) {
        // Log but don't fail - event bus is optional
        console.warn(
          `Failed to publish state change event for issue ${issueId}:`,
          eventError
        );
      }

      console.log(
        `Issue ${issueId} state transition: ${oldStatus} -> ${newStatus} (reason: ${reason})`
      );
    } catch (error) {
      console.error(
        `Failed to trigger state transition for issue ${issueId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Validate webhook event type
   */
  public isValidEventType(eventType: string): eventType is GitHubWebhookEvent {
    return eventType === 'pull_request' || eventType === 'pull_request_review';
  }
}

// Singleton instance
let webhookServiceInstance: GitHubWebhookService | null = null;

export function getGitHubWebhookService(
  webhookSecret?: string
): GitHubWebhookService {
  if (!webhookServiceInstance) {
    webhookServiceInstance = new GitHubWebhookService(webhookSecret);
  }
  return webhookServiceInstance;
}

export function resetGitHubWebhookService(): void {
  webhookServiceInstance = null;
}
