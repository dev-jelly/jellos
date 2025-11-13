/**
 * PR Duplicate Check Service
 * Prevents duplicate PR creation for the same issue or branch
 */

import { issuePRMappingRepository } from '../repositories/issue-pr-mapping.repository';
import { getGitHubClient } from './github-client.service';
import type {
  DuplicatePRCheckResult,
  IssuePRMapping,
} from '../types/issue-pr-mapping';

export class PRDuplicateCheckError extends Error {
  constructor(
    message: string,
    public existingMappings: IssuePRMapping[]
  ) {
    super(message);
    this.name = 'PRDuplicateCheckError';
  }
}

export interface DuplicateCheckOptions {
  issueId: string;
  projectId: string;
  branchName: string;
  /**
   * If true, also check GitHub API for existing PRs
   * Default: true
   */
  checkGitHub?: boolean;
}

export class PRDuplicateCheckService {
  /**
   * Check if a PR can be created for the given issue and branch
   * Performs both database and optional GitHub API checks
   */
  async checkForDuplicates(
    options: DuplicateCheckOptions
  ): Promise<DuplicatePRCheckResult> {
    const { issueId, projectId, branchName, checkGitHub = true } = options;

    // 1. Check database for existing open PRs for this issue
    const existingIssueMapping = await this.checkIssueMapping(issueId);
    if (existingIssueMapping.isDuplicate) {
      return existingIssueMapping;
    }

    // 2. Check database for existing open PRs for this branch
    const existingBranchMapping = await this.checkBranchMapping(
      projectId,
      branchName
    );
    if (existingBranchMapping.isDuplicate) {
      return existingBranchMapping;
    }

    // 3. Optionally check GitHub for existing PRs not in our database
    if (checkGitHub) {
      const githubCheck = await this.checkGitHub(issueId, branchName);
      if (githubCheck.isDuplicate) {
        return githubCheck;
      }
    }

    // No duplicates found
    return {
      isDuplicate: false,
      existingMappings: [],
    };
  }

  /**
   * Check database for existing open PRs for an issue
   */
  private async checkIssueMapping(
    issueId: string
  ): Promise<DuplicatePRCheckResult> {
    const openMappings =
      await issuePRMappingRepository.findOpenByIssueId(issueId);

    if (openMappings.length > 0) {
      return {
        isDuplicate: true,
        existingMappings: openMappings,
        reason: `Issue already has ${openMappings.length} open PR(s)`,
      };
    }

    return {
      isDuplicate: false,
      existingMappings: [],
    };
  }

  /**
   * Check database for existing open PRs for a branch
   */
  private async checkBranchMapping(
    projectId: string,
    branchName: string
  ): Promise<DuplicatePRCheckResult> {
    const openMappings = await issuePRMappingRepository.findOpenByBranch(
      projectId,
      branchName
    );

    if (openMappings.length > 0) {
      return {
        isDuplicate: true,
        existingMappings: openMappings,
        reason: `Branch '${branchName}' already has ${openMappings.length} open PR(s)`,
      };
    }

    return {
      isDuplicate: false,
      existingMappings: [],
    };
  }

  /**
   * Check GitHub API for existing PRs
   * This catches PRs that may not be in our database
   */
  private async checkGitHub(
    issueId: string,
    branchName: string
  ): Promise<DuplicatePRCheckResult> {
    const githubClient = getGitHubClient();

    if (!githubClient.isConfigured()) {
      // If GitHub is not configured, skip this check
      return {
        isDuplicate: false,
        existingMappings: [],
      };
    }

    try {
      // Check by branch name for open PRs
      const branchResult = await githubClient.searchPRsByBranch(branchName, {
        state: 'open',
      });

      if (branchResult.exists && branchResult.count > 0) {
        return {
          isDuplicate: true,
          existingMappings: [], // GitHub PRs, not in database yet
          reason: `Found ${branchResult.count} open PR(s) on GitHub for branch '${branchName}'`,
        };
      }

      // Check by issue number in PR title/body
      const issueResult = await githubClient.searchPRsByIssue(issueId, {
        state: 'open',
      });

      if (issueResult.exists && issueResult.count > 0) {
        return {
          isDuplicate: true,
          existingMappings: [], // GitHub PRs, not in database yet
          reason: `Found ${issueResult.count} open PR(s) on GitHub referencing issue ${issueId}`,
        };
      }

      return {
        isDuplicate: false,
        existingMappings: [],
      };
    } catch (error) {
      // Log error but don't fail the check - allow creation if GitHub check fails
      console.error('GitHub duplicate check failed:', error);
      return {
        isDuplicate: false,
        existingMappings: [],
      };
    }
  }

  /**
   * Validate that a PR can be created and throw if duplicate exists
   * Convenience method that throws instead of returning result
   */
  async validateNoDuplicates(options: DuplicateCheckOptions): Promise<void> {
    const result = await this.checkForDuplicates(options);

    if (result.isDuplicate) {
      throw new PRDuplicateCheckError(
        result.reason || 'Duplicate PR detected',
        result.existingMappings
      );
    }
  }

  /**
   * Check if an issue has any open PRs
   */
  async hasOpenPR(issueId: string): Promise<boolean> {
    return issuePRMappingRepository.hasOpenPR(issueId);
  }

  /**
   * Check if a branch has any open PRs
   */
  async hasOpenPRForBranch(
    projectId: string,
    branchName: string
  ): Promise<boolean> {
    return issuePRMappingRepository.hasOpenPRForBranch(projectId, branchName);
  }

  /**
   * Get all open PR mappings for an issue
   */
  async getOpenPRsForIssue(issueId: string): Promise<IssuePRMapping[]> {
    return issuePRMappingRepository.findOpenByIssueId(issueId);
  }

  /**
   * Get all open PR mappings for a branch
   */
  async getOpenPRsForBranch(
    projectId: string,
    branchName: string
  ): Promise<IssuePRMapping[]> {
    return issuePRMappingRepository.findOpenByBranch(projectId, branchName);
  }
}

// Export singleton instance
export const prDuplicateCheckService = new PRDuplicateCheckService();
