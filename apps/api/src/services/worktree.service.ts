/**
 * Worktree Service
 * Core service for Git worktree lifecycle management
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { prisma } from '../lib/db';
import type { Worktree } from '../lib/db';
import {
  getWorktreeValidationService,
  WorktreeValidationService,
} from './worktree-validation.service';

export interface WorktreeCreateOptions {
  projectId: string;
  issueId?: string;
  branch: string;
  baseBranch?: string;
  customPath?: string;
  timeout?: number;
  skipValidation?: boolean;
}

export interface WorktreeCreateResult {
  success: boolean;
  worktree?: Worktree;
  error?: string;
  validationErrors?: any[];
}

export interface GitCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Worktree service for Git worktree operations
 */
export class WorktreeService {
  private validationService: WorktreeValidationService;
  private projectRoot: string;
  private worktreeBaseDir: string;

  constructor(
    projectRoot?: string,
    validationService?: WorktreeValidationService
  ) {
    this.projectRoot = projectRoot || process.cwd();
    this.worktreeBaseDir = join(this.projectRoot, '.jellos', 'worktrees');
    this.validationService = validationService || getWorktreeValidationService();
  }

  /**
   * Create a new Git worktree with full lifecycle management
   */
  public async createWorktree(
    options: WorktreeCreateOptions
  ): Promise<WorktreeCreateResult> {
    const {
      projectId,
      issueId,
      branch,
      baseBranch = 'main',
      customPath,
      timeout = 60000,
      skipValidation = false,
    } = options;

    try {
      // 1. Generate standardized path
      const worktreePath = customPath || this.generateWorktreePath(issueId || branch);

      // 2. Validate worktree creation (unless skipped)
      if (!skipValidation) {
        const validationResult = await this.validationService.validate({
          projectId,
          issueId,
          path: worktreePath,
          branch,
        });

        if (!validationResult.valid) {
          return {
            success: false,
            error: 'Validation failed',
            validationErrors: validationResult.errors,
          };
        }
      }

      // 3. Ensure worktree base directory exists
      this.ensureWorktreeBaseDir();

      // 4. Create the worktree using git worktree add
      const gitResult = await this.executeGitWorktreeAdd({
        path: worktreePath,
        branch,
        baseBranch,
        timeout,
      });

      if (!gitResult.success) {
        return {
          success: false,
          error: `Git worktree add failed: ${gitResult.stderr}`,
        };
      }

      // 5. Verify branch checkout
      const verifyResult = await this.verifyBranchCheckout(worktreePath, branch);
      if (!verifyResult.success) {
        // Cleanup on verification failure
        await this.removeWorktreeDirectory(worktreePath);
        return {
          success: false,
          error: `Branch verification failed: ${verifyResult.stderr}`,
        };
      }

      // 6. Save metadata to database
      const worktree = await prisma.worktree.create({
        data: {
          projectId,
          issueId: issueId || null,
          path: worktreePath,
          branch,
          status: 'ACTIVE',
        },
      });

      return {
        success: true,
        worktree,
      };
    } catch (error) {
      console.error('Failed to create worktree:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Remove a worktree and its metadata
   */
  public async removeWorktree(worktreeId: string): Promise<WorktreeCreateResult> {
    try {
      const worktree = await prisma.worktree.findUnique({
        where: { id: worktreeId },
      });

      if (!worktree) {
        return {
          success: false,
          error: 'Worktree not found',
        };
      }

      // Remove git worktree
      const gitResult = await this.executeGitWorktreeRemove(worktree.path);
      if (!gitResult.success) {
        console.warn('Git worktree remove failed:', gitResult.stderr);
      }

      // Update database status
      const updatedWorktree = await prisma.worktree.update({
        where: { id: worktreeId },
        data: { status: 'REMOVED' },
      });

      return {
        success: true,
        worktree: updatedWorktree,
      };
    } catch (error) {
      console.error('Failed to remove worktree:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * List all worktrees from database
   */
  public async listWorktrees(projectId?: string): Promise<Worktree[]> {
    return prisma.worktree.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { name: true },
        },
        issue: {
          select: { title: true },
        },
      },
    });
  }

  /**
   * Get worktree by ID
   */
  public async getWorktree(worktreeId: string): Promise<Worktree | null> {
    return prisma.worktree.findUnique({
      where: { id: worktreeId },
      include: {
        project: true,
        issue: true,
      },
    });
  }

  /**
   * Generate standardized worktree path
   */
  private generateWorktreePath(identifier: string): string {
    // Sanitize identifier for filesystem (remove special characters)
    const sanitized = identifier.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    return join(this.worktreeBaseDir, sanitized);
  }

  /**
   * Ensure worktree base directory exists
   */
  private ensureWorktreeBaseDir(): void {
    if (!existsSync(this.worktreeBaseDir)) {
      mkdirSync(this.worktreeBaseDir, { recursive: true });
    }
  }

  /**
   * Execute git worktree add command
   */
  private async executeGitWorktreeAdd(options: {
    path: string;
    branch: string;
    baseBranch: string;
    timeout: number;
  }): Promise<GitCommandResult> {
    const { path, branch, baseBranch, timeout } = options;

    // Check if branch exists, if not create it
    const branchExists = await this.checkBranchExists(branch);
    const args = branchExists
      ? ['worktree', 'add', path, branch]
      : ['worktree', 'add', '-b', branch, path, baseBranch];

    return this.executeGitCommand(args, timeout);
  }

  /**
   * Execute git worktree remove command
   */
  private async executeGitWorktreeRemove(path: string): Promise<GitCommandResult> {
    return this.executeGitCommand(['worktree', 'remove', path, '--force'], 30000);
  }

  /**
   * Verify branch checkout in worktree
   */
  private async verifyBranchCheckout(
    path: string,
    expectedBranch: string
  ): Promise<GitCommandResult> {
    const result = await this.executeGitCommand(
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      10000,
      path
    );

    if (result.success && result.stdout.trim() !== expectedBranch) {
      return {
        success: false,
        stdout: result.stdout,
        stderr: `Expected branch ${expectedBranch}, got ${result.stdout.trim()}`,
        exitCode: 1,
      };
    }

    return result;
  }

  /**
   * Check if a branch exists
   */
  private async checkBranchExists(branch: string): Promise<boolean> {
    const result = await this.executeGitCommand(
      ['rev-parse', '--verify', `refs/heads/${branch}`],
      10000
    );
    return result.success;
  }

  /**
   * Execute a Git command with timeout and error handling
   */
  private async executeGitCommand(
    args: string[],
    timeout: number,
    cwd?: string
  ): Promise<GitCommandResult> {
    return new Promise((resolve) => {
      const proc = spawn('git', args, {
        cwd: cwd || this.projectRoot,
        timeout,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timer);

        if (timedOut) {
          resolve({
            success: false,
            stdout,
            stderr: 'Command timed out',
            exitCode: -1,
          });
          return;
        }

        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code || 0,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          stdout,
          stderr: err.message,
          exitCode: -1,
        });
      });
    });
  }

  /**
   * Remove worktree directory (cleanup utility)
   */
  private async removeWorktreeDirectory(path: string): Promise<void> {
    try {
      await this.executeGitCommand(['worktree', 'remove', path, '--force'], 30000);
    } catch (error) {
      console.warn('Failed to remove worktree directory:', error);
    }
  }

  /**
   * Prune stale worktrees
   */
  public async pruneWorktrees(): Promise<GitCommandResult> {
    return this.executeGitCommand(['worktree', 'prune'], 30000);
  }

  /**
   * List git worktrees (from git, not database)
   */
  public async listGitWorktrees(): Promise<{
    success: boolean;
    worktrees: Array<{ path: string; branch: string; bare?: boolean }>;
  }> {
    const result = await this.executeGitCommand(['worktree', 'list', '--porcelain'], 10000);

    if (!result.success) {
      return { success: false, worktrees: [] };
    }

    const worktrees: Array<{ path: string; branch: string; bare?: boolean }> = [];
    const lines = result.stdout.split('\n');
    let currentWorktree: any = {};

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (currentWorktree.path) {
          worktrees.push(currentWorktree);
        }
        currentWorktree = { path: line.substring(9) };
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.substring(7).replace('refs/heads/', '');
      } else if (line === 'bare') {
        currentWorktree.bare = true;
      }
    }

    if (currentWorktree.path) {
      worktrees.push(currentWorktree);
    }

    return { success: true, worktrees };
  }

  /**
   * Sync database with actual git worktrees
   */
  public async syncWithGit(): Promise<{
    added: number;
    removed: number;
    updated: number;
  }> {
    const gitWorktrees = await this.listGitWorktrees();
    if (!gitWorktrees.success) {
      throw new Error('Failed to list git worktrees');
    }

    const dbWorktrees = await prisma.worktree.findMany({
      where: { status: 'ACTIVE' },
    });

    let added = 0;
    let removed = 0;
    let updated = 0;

    // Mark removed worktrees as REMOVED
    for (const dbWorktree of dbWorktrees) {
      const exists = gitWorktrees.worktrees.some((gw) => gw.path === dbWorktree.path);
      if (!exists) {
        await prisma.worktree.update({
          where: { id: dbWorktree.id },
          data: { status: 'REMOVED' },
        });
        removed++;
      }
    }

    return { added, removed, updated };
  }
}

// Singleton instance
let worktreeServiceInstance: WorktreeService | null = null;

export function getWorktreeService(
  projectRoot?: string,
  validationService?: WorktreeValidationService
): WorktreeService {
  if (!worktreeServiceInstance || projectRoot || validationService) {
    worktreeServiceInstance = new WorktreeService(projectRoot, validationService);
  }
  return worktreeServiceInstance;
}

export function resetWorktreeService(): void {
  worktreeServiceInstance = null;
}
