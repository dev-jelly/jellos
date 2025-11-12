/**
 * Worktree Validation Service
 * Pre-creation validation for worktrees including PR checks and path conflicts
 */

import { existsSync } from 'fs';
import { resolve, normalize } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '../lib/db';
import { getGitHubClient, GitHubClientService } from './github-client.service';

const execAsync = promisify(exec);

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  details?: any;
}

export interface ValidationWarning {
  code: string;
  message: string;
  details?: any;
}

export interface WorktreeValidationOptions {
  projectId: string;
  issueId?: string;
  path: string;
  branch: string;
  skipGitFetch?: boolean;
  skipPRCheck?: boolean;
  skipPathCheck?: boolean;
}

/**
 * Worktree validation service for pre-creation checks
 */
export class WorktreeValidationService {
  private githubClient: GitHubClientService;

  constructor(githubClient?: GitHubClientService) {
    this.githubClient = githubClient || getGitHubClient();
  }

  /**
   * Validate worktree creation request
   */
  public async validate(options: WorktreeValidationOptions): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Validate required fields
    const fieldErrors = this.validateFields(options);
    errors.push(...fieldErrors);

    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }

    // 2. Fetch latest remote changes (unless skipped)
    if (!options.skipGitFetch) {
      try {
        await this.fetchRemote();
      } catch (error) {
        warnings.push({
          code: 'GIT_FETCH_FAILED',
          message: 'Failed to fetch remote changes. Proceeding with local state.',
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
      }
    }

    // 3. Check for existing PRs (unless skipped)
    if (!options.skipPRCheck && this.githubClient.isConfigured()) {
      const prErrors = await this.checkExistingPRs(options);
      errors.push(...prErrors);
    } else if (!options.skipPRCheck && !this.githubClient.isConfigured()) {
      warnings.push({
        code: 'GITHUB_NOT_CONFIGURED',
        message: 'GitHub is not configured. Skipping PR duplication check.',
        details: {
          hint: 'Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO environment variables',
        },
      });
    }

    // 4. Check for path conflicts (unless skipped)
    if (!options.skipPathCheck) {
      const pathErrors = await this.checkPathConflicts(options);
      errors.push(...pathErrors);
    }

    // 5. Check for branch conflicts in database
    const branchErrors = await this.checkBranchConflicts(options);
    errors.push(...branchErrors);

    // 6. Check if project exists
    const projectErrors = await this.checkProjectExists(options.projectId);
    errors.push(...projectErrors);

    // 7. Check if issue exists (if provided)
    if (options.issueId) {
      const issueErrors = await this.checkIssueExists(options.issueId);
      errors.push(...issueErrors);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate required fields
   */
  private validateFields(options: WorktreeValidationOptions): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!options.projectId || options.projectId.trim() === '') {
      errors.push({
        code: 'MISSING_PROJECT_ID',
        message: 'Project ID is required',
        field: 'projectId',
      });
    }

    if (!options.path || options.path.trim() === '') {
      errors.push({
        code: 'MISSING_PATH',
        message: 'Worktree path is required',
        field: 'path',
      });
    }

    if (!options.branch || options.branch.trim() === '') {
      errors.push({
        code: 'MISSING_BRANCH',
        message: 'Branch name is required',
        field: 'branch',
      });
    }

    // Validate branch name format (no spaces, valid git branch name)
    if (options.branch && !this.isValidBranchName(options.branch)) {
      errors.push({
        code: 'INVALID_BRANCH_NAME',
        message: 'Branch name contains invalid characters',
        field: 'branch',
        details: {
          branch: options.branch,
          hint: 'Branch names cannot contain spaces or special characters like ~, ^, :, \\, ?, *, [',
        },
      });
    }

    // Validate path format (no invalid characters)
    if (options.path && !this.isValidPath(options.path)) {
      errors.push({
        code: 'INVALID_PATH',
        message: 'Path contains invalid characters',
        field: 'path',
        details: { path: options.path },
      });
    }

    return errors;
  }

  /**
   * Fetch remote changes with git fetch --prune origin
   */
  private async fetchRemote(): Promise<void> {
    try {
      const { stdout, stderr } = await execAsync('git fetch --prune origin', {
        cwd: process.cwd(),
        timeout: 30000, // 30 second timeout
      });

      if (stderr && !stderr.includes('From') && !stderr.includes('Fetching')) {
        console.warn('Git fetch stderr:', stderr);
      }
    } catch (error) {
      console.error('Git fetch failed:', error);
      throw error;
    }
  }

  /**
   * Check for existing PRs for the issue
   */
  private async checkExistingPRs(
    options: WorktreeValidationOptions
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    try {
      // Check by issue ID if provided
      if (options.issueId) {
        const issue = await prisma.issue.findUnique({
          where: { id: options.issueId },
          select: { title: true },
        });

        if (issue) {
          // Search for PRs by issue ID in title or branch
          const prSearchResult = await this.githubClient.searchPRsByIssue(options.issueId, {
            state: 'open',
          });

          if (prSearchResult.exists) {
            errors.push({
              code: 'PR_ALREADY_EXISTS',
              message: `Issue already has ${prSearchResult.count} open PR(s)`,
              details: {
                issueId: options.issueId,
                existingPRs: prSearchResult.prs.map((pr) => ({
                  number: pr.number,
                  title: pr.title,
                  branch: pr.head.ref,
                  url: pr.html_url,
                })),
              },
            });
          }
        }
      }

      // Check by branch name
      const branchPRs = await this.githubClient.searchPRsByBranch(options.branch, {
        state: 'open',
      });

      if (branchPRs.exists) {
        errors.push({
          code: 'BRANCH_HAS_OPEN_PR',
          message: `Branch "${options.branch}" already has ${branchPRs.count} open PR(s)`,
          field: 'branch',
          details: {
            branch: options.branch,
            existingPRs: branchPRs.prs.map((pr) => ({
              number: pr.number,
              title: pr.title,
              url: pr.html_url,
            })),
          },
        });
      }
    } catch (error) {
      console.error('Failed to check existing PRs:', error);
      // Don't block on GitHub API errors, just log
    }

    return errors;
  }

  /**
   * Check for path conflicts in filesystem and database
   */
  private async checkPathConflicts(
    options: WorktreeValidationOptions
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    const normalizedPath = normalize(resolve(options.path));

    // Check filesystem
    if (existsSync(normalizedPath)) {
      errors.push({
        code: 'PATH_ALREADY_EXISTS',
        message: `Path already exists on filesystem: ${normalizedPath}`,
        field: 'path',
        details: {
          path: normalizedPath,
          hint: 'Choose a different path or remove the existing directory',
        },
      });
    }

    // Check database for same path
    const existingWorktree = await prisma.worktree.findFirst({
      where: {
        path: normalizedPath,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        branch: true,
        issueId: true,
      },
    });

    if (existingWorktree) {
      errors.push({
        code: 'PATH_IN_USE',
        message: `Path is already in use by another worktree`,
        field: 'path',
        details: {
          path: normalizedPath,
          existingWorktree: {
            id: existingWorktree.id,
            branch: existingWorktree.branch,
            issueId: existingWorktree.issueId,
          },
          hint: 'Choose a different path or remove the existing worktree',
        },
      });
    }

    return errors;
  }

  /**
   * Check for branch conflicts in database
   */
  private async checkBranchConflicts(
    options: WorktreeValidationOptions
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    const existingWorktree = await prisma.worktree.findFirst({
      where: {
        branch: options.branch,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        path: true,
        issueId: true,
      },
    });

    if (existingWorktree) {
      errors.push({
        code: 'BRANCH_ALREADY_IN_USE',
        message: `Branch "${options.branch}" is already in use by another worktree`,
        field: 'branch',
        details: {
          branch: options.branch,
          existingWorktree: {
            id: existingWorktree.id,
            path: existingWorktree.path,
            issueId: existingWorktree.issueId,
          },
          hint: 'Choose a different branch name or remove the existing worktree',
        },
      });
    }

    return errors;
  }

  /**
   * Check if project exists
   */
  private async checkProjectExists(projectId: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      errors.push({
        code: 'PROJECT_NOT_FOUND',
        message: `Project not found: ${projectId}`,
        field: 'projectId',
      });
    }

    return errors;
  }

  /**
   * Check if issue exists
   */
  private async checkIssueExists(issueId: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      select: { id: true },
    });

    if (!issue) {
      errors.push({
        code: 'ISSUE_NOT_FOUND',
        message: `Issue not found: ${issueId}`,
        field: 'issueId',
      });
    }

    return errors;
  }

  /**
   * Validate branch name format
   */
  private isValidBranchName(branch: string): boolean {
    // Git branch name validation rules
    const invalidChars = /[\s~^:?*\[\]\\]/;
    const invalidPatterns = /^\.|\.$|\.\.|\.\.|@{|\/\//;

    return !invalidChars.test(branch) && !invalidPatterns.test(branch);
  }

  /**
   * Validate path format
   */
  private isValidPath(path: string): boolean {
    try {
      // Try to normalize the path - if it throws, it's invalid
      normalize(path);
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let validationServiceInstance: WorktreeValidationService | null = null;

export function getWorktreeValidationService(
  githubClient?: GitHubClientService
): WorktreeValidationService {
  if (!validationServiceInstance || githubClient) {
    validationServiceInstance = new WorktreeValidationService(githubClient);
  }
  return validationServiceInstance;
}

export function resetWorktreeValidationService(): void {
  validationServiceInstance = null;
}
