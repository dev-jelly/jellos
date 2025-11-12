/**
 * Linear Sync Service
 * Handles synchronization between Linear issues and internal issues
 */

import { getLinearClient } from './linear-client.service';
import { issueRepository } from '../repositories/issue.repository';
import { externalIssueLinkRepository } from '../repositories/external-issue-link.repository';
import type {
  Issue,
  CreateIssueInput,
  UpdateIssueInput,
  ExternalIssueLink,
} from '../types/issue';
import {
  ExternalIssueProvider,
  IssueStatus,
  IssuePriority,
} from '../types/issue';
import type { LinearIssueData } from '../types/linear';

/**
 * Sync configuration
 */
export interface SyncConfig {
  bidirectional?: boolean; // Enable bidirectional sync (not implemented in read-only phase)
  autoCreate?: boolean; // Auto-create internal issues for Linear issues
  syncInterval?: number; // Sync interval in milliseconds
}

/**
 * Sync result for a single issue
 */
export interface SyncResult {
  success: boolean;
  issueId?: string;
  externalId: string;
  action: 'created' | 'updated' | 'linked' | 'skipped' | 'error';
  error?: string;
}

/**
 * Batch sync result
 */
export interface BatchSyncResult {
  total: number;
  successful: number;
  failed: number;
  results: SyncResult[];
}

/**
 * Linear synchronization service
 */
export class LinearSyncService {
  private linearClient;
  private config: SyncConfig;

  constructor(config?: SyncConfig) {
    this.linearClient = getLinearClient();
    this.config = {
      bidirectional: false, // Read-only for now
      autoCreate: true,
      syncInterval: 5 * 60 * 1000, // 5 minutes default
      ...config,
    };
  }

  /**
   * Check if Linear is available
   */
  public isAvailable(): boolean {
    return this.linearClient.isAvailable();
  }

  /**
   * Enable sync for an issue with Linear
   */
  public async enableSync(
    issueId: string,
    linearIdentifier: string
  ): Promise<ExternalIssueLink> {
    if (!this.isAvailable()) {
      throw new Error('Linear API key not configured');
    }

    // Verify issue exists
    const issue = await issueRepository.findById(issueId);
    if (!issue) {
      throw new Error(`Issue ${issueId} not found`);
    }

    // Fetch Linear issue to verify it exists
    const linearIssue = await this.linearClient.getIssueByIdentifier(
      linearIdentifier
    );
    if (!linearIssue) {
      throw new Error(`Linear issue ${linearIdentifier} not found`);
    }

    // Check if link already exists
    const existingLink = await externalIssueLinkRepository.findByIssueAndProvider(
      issueId,
      ExternalIssueProvider.LINEAR
    );

    if (existingLink) {
      // Update existing link
      return externalIssueLinkRepository.updateSyncEnabled(
        existingLink.id,
        true
      );
    }

    // Create new link
    return externalIssueLinkRepository.create({
      issueId,
      provider: ExternalIssueProvider.LINEAR,
      externalId: linearIssue.id,
      externalUrl: linearIssue.url,
      syncEnabled: true,
    });
  }

  /**
   * Disable sync for an issue
   */
  public async disableSync(
    issueId: string,
    provider: ExternalIssueProvider = ExternalIssueProvider.LINEAR
  ): Promise<void> {
    const link = await externalIssueLinkRepository.findByIssueAndProvider(
      issueId,
      provider
    );

    if (!link) {
      throw new Error(`No external link found for issue ${issueId}`);
    }

    await externalIssueLinkRepository.updateSyncEnabled(link.id, false);
  }

  /**
   * Sync a single Linear issue to internal issue
   */
  public async syncIssue(
    linearIdentifier: string,
    projectId: string
  ): Promise<SyncResult> {
    if (!this.isAvailable()) {
      return {
        success: false,
        externalId: linearIdentifier,
        action: 'error',
        error: 'Linear API key not configured',
      };
    }

    try {
      // Fetch Linear issue
      const linearIssue = await this.linearClient.getIssueByIdentifier(
        linearIdentifier
      );

      if (!linearIssue) {
        return {
          success: false,
          externalId: linearIdentifier,
          action: 'error',
          error: 'Linear issue not found',
        };
      }

      // Check if we already have a link for this Linear issue
      const existingLinks = await externalIssueLinkRepository.findByExternalId(
        linearIssue.id
      );

      if (existingLinks.length > 0) {
        // Update existing issue
        const link = existingLinks[0];
        const issue = await this.updateIssueFromLinear(
          link.issueId,
          linearIssue
        );

        return {
          success: true,
          issueId: issue.id,
          externalId: linearIssue.id,
          action: 'updated',
        };
      }

      // Create new issue if autoCreate is enabled
      if (this.config.autoCreate) {
        const issue = await this.createIssueFromLinear(linearIssue, projectId);

        // Create external link
        await externalIssueLinkRepository.create({
          issueId: issue.id,
          provider: ExternalIssueProvider.LINEAR,
          externalId: linearIssue.id,
          externalUrl: linearIssue.url,
          syncEnabled: true,
        });

        return {
          success: true,
          issueId: issue.id,
          externalId: linearIssue.id,
          action: 'created',
        };
      }

      return {
        success: false,
        externalId: linearIssue.id,
        action: 'skipped',
        error: 'Auto-create is disabled',
      };
    } catch (error) {
      return {
        success: false,
        externalId: linearIdentifier,
        action: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Sync all enabled Linear issues for a project
   */
  public async syncAllIssues(projectId: string): Promise<BatchSyncResult> {
    const results: SyncResult[] = [];

    try {
      // Find all issues with Linear sync enabled for this project
      const syncEnabledLinks = await externalIssueLinkRepository.findSyncEnabled();

      // Filter by project
      const projectLinks = syncEnabledLinks.filter(
        (link: any) => link.issue?.projectId === projectId
      );

      if (projectLinks.length === 0) {
        return {
          total: 0,
          successful: 0,
          failed: 0,
          results: [],
        };
      }

      // Sync each issue
      for (const link of projectLinks) {
        const linearIssue = await this.linearClient.getIssue(link.externalId);

        if (!linearIssue) {
          results.push({
            success: false,
            issueId: link.issueId,
            externalId: link.externalId,
            action: 'error',
            error: 'Linear issue not found',
          });
          continue;
        }

        try {
          await this.updateIssueFromLinear(link.issueId, linearIssue);

          results.push({
            success: true,
            issueId: link.issueId,
            externalId: link.externalId,
            action: 'updated',
          });
        } catch (error) {
          results.push({
            success: false,
            issueId: link.issueId,
            externalId: link.externalId,
            action: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        total: results.length,
        successful,
        failed,
        results,
      };
    } catch (error) {
      return {
        total: 0,
        successful: 0,
        failed: 1,
        results: [
          {
            success: false,
            externalId: 'batch',
            action: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }

  /**
   * Create internal issue from Linear issue
   */
  private async createIssueFromLinear(
    linearIssue: LinearIssueData,
    projectId: string
  ): Promise<Issue> {
    // Map Linear status to internal status
    const status = this.mapLinearStatus(linearIssue.state.type);

    // Map Linear priority to internal priority
    const priority = this.mapLinearPriority(linearIssue.priority);

    const createInput: CreateIssueInput = {
      projectId,
      title: linearIssue.title,
      description: linearIssue.description,
      status,
      priority,
    };

    return issueRepository.create(createInput);
  }

  /**
   * Update internal issue from Linear issue
   */
  private async updateIssueFromLinear(
    issueId: string,
    linearIssue: LinearIssueData
  ): Promise<Issue> {
    const status = this.mapLinearStatus(linearIssue.state.type);
    const priority = this.mapLinearPriority(linearIssue.priority);

    const updateInput: UpdateIssueInput = {
      title: linearIssue.title,
      description: linearIssue.description,
      status,
      priority,
    };

    return issueRepository.update(issueId, updateInput);
  }

  /**
   * Map Linear state type to internal status
   */
  private mapLinearStatus(linearStateType: string): IssueStatus {
    switch (linearStateType.toLowerCase()) {
      case 'backlog':
      case 'unstarted':
        return IssueStatus.TODO;
      case 'started':
        return IssueStatus.IN_PROGRESS;
      case 'completed':
        return IssueStatus.MERGED;
      case 'canceled':
        return IssueStatus.CANCELED;
      default:
        return IssueStatus.TODO;
    }
  }

  /**
   * Map Linear priority to internal priority
   */
  private mapLinearPriority(linearPriority?: number): IssuePriority {
    if (!linearPriority) return IssuePriority.MEDIUM;

    switch (linearPriority) {
      case 4:
        return IssuePriority.URGENT;
      case 3:
        return IssuePriority.HIGH;
      case 2:
        return IssuePriority.MEDIUM;
      case 1:
      case 0:
      default:
        return IssuePriority.LOW;
    }
  }

  /**
   * Get sync status for an issue
   */
  public async getSyncStatus(issueId: string): Promise<{
    enabled: boolean;
    provider?: ExternalIssueProvider;
    externalId?: string;
    externalUrl?: string;
  }> {
    const link = await externalIssueLinkRepository.findByIssueAndProvider(
      issueId,
      ExternalIssueProvider.LINEAR
    );

    if (!link) {
      return { enabled: false };
    }

    return {
      enabled: link.syncEnabled,
      provider: link.provider as ExternalIssueProvider,
      externalId: link.externalId,
      externalUrl: link.externalUrl || undefined,
    };
  }

  /**
   * Search Linear issues and optionally sync them
   */
  public async searchAndSync(
    query: string,
    projectId: string,
    autoSync: boolean = false
  ): Promise<{
    linearIssues: LinearIssueData[];
    syncResults?: SyncResult[];
  }> {
    if (!this.isAvailable()) {
      throw new Error('Linear API key not configured');
    }

    const linearIssues = await this.linearClient.searchIssues(query);

    if (!autoSync) {
      return { linearIssues };
    }

    // Auto-sync found issues
    const syncResults: SyncResult[] = [];

    for (const linearIssue of linearIssues) {
      const result = await this.syncIssue(linearIssue.identifier, projectId);
      syncResults.push(result);
    }

    return {
      linearIssues,
      syncResults,
    };
  }
}

// Export singleton instance
let linearSyncInstance: LinearSyncService | null = null;

export function getLinearSyncService(
  config?: SyncConfig
): LinearSyncService {
  if (!linearSyncInstance || config) {
    linearSyncInstance = new LinearSyncService(config);
  }
  return linearSyncInstance;
}

export function resetLinearSyncService(): void {
  linearSyncInstance = null;
}
