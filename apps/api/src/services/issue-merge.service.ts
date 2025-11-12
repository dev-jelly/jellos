/**
 * Issue Merge Service
 * Merges and transforms internal issues with external data (Linear)
 */

import { getLinearClient } from './linear-client.service';
import { issueRepository } from '../repositories/issue.repository';
import { externalIssueLinkRepository } from '../repositories/external-issue-link.repository';
import type {
  Issue,
  IssueWithLinks,
} from '../types/issue';
import { ExternalIssueProvider } from '../types/issue';
import type { LinearIssueData } from '../types/linear';

/**
 * Enriched issue with external data
 */
export interface EnrichedIssue extends IssueWithLinks {
  linearData?: LinearIssueData;
  enrichmentStatus: {
    hasLinearLink: boolean;
    linearSyncEnabled: boolean;
    linearDataFetched: boolean;
    fetchError?: string;
  };
}

/**
 * Merge strategy for conflicting data
 */
export enum MergeStrategy {
  PREFER_INTERNAL = 'prefer_internal', // Use internal data when conflicts exist
  PREFER_LINEAR = 'prefer_linear', // Use Linear data when conflicts exist
  COMBINED = 'combined', // Combine data from both sources
}

/**
 * Merge configuration
 */
export interface MergeConfig {
  strategy: MergeStrategy;
  includeLinearData: boolean; // Include full Linear data in response
  fetchLinearData: boolean; // Fetch Linear data for enrichment
  provider: ExternalIssueProvider; // Which provider to merge with
}

/**
 * Issue merge service
 */
export class IssueMergeService {
  private linearClient;
  private defaultConfig: MergeConfig;

  constructor(config?: Partial<MergeConfig>) {
    this.linearClient = getLinearClient();
    this.defaultConfig = {
      strategy: MergeStrategy.PREFER_INTERNAL,
      includeLinearData: true,
      fetchLinearData: true,
      provider: ExternalIssueProvider.LINEAR,
      ...config,
    };
  }

  /**
   * Enrich a single issue with external data
   */
  public async enrichIssue(
    issueId: string,
    config?: Partial<MergeConfig>
  ): Promise<EnrichedIssue> {
    const mergeConfig = { ...this.defaultConfig, ...config };

    // Fetch internal issue with links
    const issue = await issueRepository.findById(issueId, true);
    if (!issue) {
      throw new Error(`Issue ${issueId} not found`);
    }

    // Initialize enriched issue
    const enrichedIssue: EnrichedIssue = {
      ...issue,
      enrichmentStatus: {
        hasLinearLink: false,
        linearSyncEnabled: false,
        linearDataFetched: false,
      },
    };

    // Check for Linear link
    const linearLink = issue.externalLinks?.find(
      (link) => link.provider === mergeConfig.provider
    );

    if (!linearLink) {
      return enrichedIssue;
    }

    enrichedIssue.enrichmentStatus.hasLinearLink = true;
    enrichedIssue.enrichmentStatus.linearSyncEnabled = linearLink.syncEnabled;

    // Fetch Linear data if configured
    if (mergeConfig.fetchLinearData && this.linearClient.isAvailable()) {
      try {
        const linearIssue = await this.linearClient.getIssue(
          linearLink.externalId
        );

        if (linearIssue) {
          enrichedIssue.linearData = linearIssue;
          enrichedIssue.enrichmentStatus.linearDataFetched = true;

          // Apply merge strategy if configured
          if (mergeConfig.strategy !== MergeStrategy.PREFER_INTERNAL) {
            this.applyMergeStrategy(enrichedIssue, linearIssue, mergeConfig);
          }
        }
      } catch (error) {
        enrichedIssue.enrichmentStatus.fetchError =
          error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return enrichedIssue;
  }

  /**
   * Enrich multiple issues with external data
   */
  public async enrichIssues(
    issueIds: string[],
    config?: Partial<MergeConfig>
  ): Promise<EnrichedIssue[]> {
    const enrichedIssues = await Promise.all(
      issueIds.map((id) => this.enrichIssue(id, config))
    );

    return enrichedIssues;
  }

  /**
   * Enrich all issues for a project
   */
  public async enrichProjectIssues(
    projectId: string,
    config?: Partial<MergeConfig>
  ): Promise<EnrichedIssue[]> {
    const issues = await issueRepository.findByProject(projectId, true);
    const enrichedIssues = await Promise.all(
      issues.map((issue) => this.enrichIssue(issue.id, config))
    );

    return enrichedIssues;
  }

  /**
   * Apply merge strategy to combine internal and Linear data
   */
  private applyMergeStrategy(
    enrichedIssue: EnrichedIssue,
    linearIssue: LinearIssueData,
    config: MergeConfig
  ): void {
    switch (config.strategy) {
      case MergeStrategy.PREFER_LINEAR:
        // Override internal data with Linear data
        enrichedIssue.title = linearIssue.title;
        enrichedIssue.description = linearIssue.description || enrichedIssue.description;
        break;

      case MergeStrategy.COMBINED:
        // Combine data intelligently
        // If internal description is empty, use Linear description
        if (!enrichedIssue.description && linearIssue.description) {
          enrichedIssue.description = linearIssue.description;
        }
        // If internal title seems generic, prefer Linear title
        if (this.isTitleGeneric(enrichedIssue.title)) {
          enrichedIssue.title = linearIssue.title;
        }
        break;

      case MergeStrategy.PREFER_INTERNAL:
      default:
        // Keep internal data as-is (no changes needed)
        break;
    }
  }

  /**
   * Check if a title seems generic
   */
  private isTitleGeneric(title: string): boolean {
    const genericPatterns = [
      /^untitled/i,
      /^new issue/i,
      /^issue \d+$/i,
      /^todo/i,
    ];

    return genericPatterns.some((pattern) => pattern.test(title));
  }

  /**
   * Transform issue to API response format
   */
  public transformToApiResponse(
    enrichedIssue: EnrichedIssue,
    options?: {
      includeLinearData?: boolean;
      includeEnrichmentStatus?: boolean;
    }
  ): Record<string, any> {
    const response: Record<string, any> = {
      id: enrichedIssue.id,
      projectId: enrichedIssue.projectId,
      title: enrichedIssue.title,
      description: enrichedIssue.description,
      status: enrichedIssue.status,
      priority: enrichedIssue.priority,
      createdAt: enrichedIssue.createdAt,
      updatedAt: enrichedIssue.updatedAt,
    };

    // Include external links
    if (enrichedIssue.externalLinks && enrichedIssue.externalLinks.length > 0) {
      response.externalLinks = enrichedIssue.externalLinks.map((link) => ({
        provider: link.provider,
        externalId: link.externalId,
        externalUrl: link.externalUrl,
        syncEnabled: link.syncEnabled,
      }));
    }

    // Include Linear data if available and requested
    if (
      enrichedIssue.linearData &&
      (options?.includeLinearData ?? true)
    ) {
      response.linear = {
        identifier: enrichedIssue.linearData.identifier,
        url: enrichedIssue.linearData.url,
        state: enrichedIssue.linearData.state,
        priority: enrichedIssue.linearData.priority,
        assignee: enrichedIssue.linearData.assignee,
        project: enrichedIssue.linearData.project,
        labels: enrichedIssue.linearData.labels,
        updatedAt: enrichedIssue.linearData.updatedAt,
      };
    }

    // Include enrichment status if requested
    if (options?.includeEnrichmentStatus ?? false) {
      response.enrichmentStatus = enrichedIssue.enrichmentStatus;
    }

    return response;
  }

  /**
   * Transform multiple issues to API response format
   */
  public transformManyToApiResponse(
    enrichedIssues: EnrichedIssue[],
    options?: {
      includeLinearData?: boolean;
      includeEnrichmentStatus?: boolean;
    }
  ): Record<string, any>[] {
    return enrichedIssues.map((issue) =>
      this.transformToApiResponse(issue, options)
    );
  }

  /**
   * Get data comparison between internal and Linear
   */
  public async compareWithLinear(
    issueId: string
  ): Promise<{
    internal: Partial<Issue>;
    linear: Partial<LinearIssueData> | null;
    differences: {
      field: string;
      internal: any;
      linear: any;
      conflict: boolean;
    }[];
  }> {
    const enrichedIssue = await this.enrichIssue(issueId, {
      fetchLinearData: true,
      includeLinearData: true,
    });

    const differences: {
      field: string;
      internal: any;
      linear: any;
      conflict: boolean;
    }[] = [];

    if (!enrichedIssue.linearData) {
      return {
        internal: enrichedIssue,
        linear: null,
        differences: [],
      };
    }

    const linearIssue = enrichedIssue.linearData;

    // Compare title
    if (enrichedIssue.title !== linearIssue.title) {
      differences.push({
        field: 'title',
        internal: enrichedIssue.title,
        linear: linearIssue.title,
        conflict: true,
      });
    }

    // Compare description
    if (enrichedIssue.description !== linearIssue.description) {
      differences.push({
        field: 'description',
        internal: enrichedIssue.description || null,
        linear: linearIssue.description || null,
        conflict: Boolean(enrichedIssue.description && linearIssue.description),
      });
    }

    // Compare timestamps
    differences.push({
      field: 'updatedAt',
      internal: enrichedIssue.updatedAt,
      linear: linearIssue.updatedAt,
      conflict: false,
    });

    return {
      internal: {
        id: enrichedIssue.id,
        title: enrichedIssue.title,
        description: enrichedIssue.description,
        status: enrichedIssue.status,
        priority: enrichedIssue.priority,
        updatedAt: enrichedIssue.updatedAt,
      },
      linear: {
        id: linearIssue.id,
        identifier: linearIssue.identifier,
        title: linearIssue.title,
        description: linearIssue.description,
        state: linearIssue.state,
        priority: linearIssue.priority,
        updatedAt: linearIssue.updatedAt,
      },
      differences,
    };
  }
}

// Export singleton instance
let issueMergeInstance: IssueMergeService | null = null;

export function getIssueMergeService(
  config?: Partial<MergeConfig>
): IssueMergeService {
  if (!issueMergeInstance || config) {
    issueMergeInstance = new IssueMergeService(config);
  }
  return issueMergeInstance;
}

export function resetIssueMergeService(): void {
  issueMergeInstance = null;
}
