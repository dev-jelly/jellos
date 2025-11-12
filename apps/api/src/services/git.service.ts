/**
 * Git Service
 * Collects git diff, commit messages, and repository metadata
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { gzip, gunzip } from 'zlib';

const execAsync = promisify(exec);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface GitDiffResult {
  diff: string; // Raw diff output
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  isCompressed: boolean;
}

export interface GitCommitInfo {
  hash: string;
  message: string;
  author: string;
  date: Date;
  branch: string;
}

export interface GitMetadata {
  diff?: GitDiffResult;
  commit?: GitCommitInfo;
  branch: string;
  hasUncommittedChanges: boolean;
}

/**
 * Git service for repository operations
 */
export class GitService {
  private readonly MAX_DIFF_SIZE = 100 * 1024; // 100KB uncompressed

  /**
   * Get git diff for staged or all changes
   */
  public async getDiff(cwd: string, staged: boolean = false): Promise<GitDiffResult | null> {
    try {
      // Check if directory is a git repository
      if (!await this.isGitRepository(cwd)) {
        return null;
      }

      const command = staged ? 'git diff --cached --stat --numstat' : 'git diff --stat --numstat';

      // Get diff with stats
      const { stdout: statOutput } = await execAsync(command, { cwd });

      if (!statOutput.trim()) {
        return null; // No changes
      }

      // Get full diff
      const diffCommand = staged ? 'git diff --cached' : 'git diff';
      const { stdout: diffOutput } = await execAsync(diffCommand, { cwd });

      // Parse stats
      const stats = this.parseDiffStats(statOutput);

      // Compress if diff is large
      let finalDiff = diffOutput;
      let isCompressed = false;

      if (diffOutput.length > this.MAX_DIFF_SIZE) {
        const compressed = await gzipAsync(Buffer.from(diffOutput));
        finalDiff = compressed.toString('base64');
        isCompressed = true;
      }

      return {
        diff: finalDiff,
        filesChanged: stats.filesChanged,
        linesAdded: stats.linesAdded,
        linesDeleted: stats.linesDeleted,
        isCompressed,
      };
    } catch (error) {
      console.error('Failed to get git diff:', error);
      return null;
    }
  }

  /**
   * Get latest commit information
   */
  public async getLatestCommit(cwd: string): Promise<GitCommitInfo | null> {
    try {
      if (!await this.isGitRepository(cwd)) {
        return null;
      }

      // Get commit info
      const format = '%H%n%s%n%an%n%ai';
      const { stdout } = await execAsync(`git log -1 --format="${format}"`, { cwd });

      if (!stdout.trim()) {
        return null; // No commits
      }

      const lines = stdout.trim().split('\n');

      if (lines.length < 4) {
        return null;
      }

      // Get current branch
      const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd });

      return {
        hash: lines[0],
        message: lines[1],
        author: lines[2],
        date: new Date(lines[3]),
        branch: branchOutput.trim(),
      };
    } catch (error) {
      console.error('Failed to get latest commit:', error);
      return null;
    }
  }

  /**
   * Get current branch name
   */
  public async getCurrentBranch(cwd: string): Promise<string | null> {
    try {
      if (!await this.isGitRepository(cwd)) {
        return null;
      }

      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd });
      return stdout.trim();
    } catch (error) {
      console.error('Failed to get current branch:', error);
      return null;
    }
  }

  /**
   * Check if repository has uncommitted changes
   */
  public async hasUncommittedChanges(cwd: string): Promise<boolean> {
    try {
      if (!await this.isGitRepository(cwd)) {
        return false;
      }

      const { stdout } = await execAsync('git status --porcelain', { cwd });
      return stdout.trim().length > 0;
    } catch (error) {
      console.error('Failed to check uncommitted changes:', error);
      return false;
    }
  }

  /**
   * Collect all git metadata for execution
   */
  public async collectMetadata(cwd: string): Promise<GitMetadata | null> {
    try {
      if (!await this.isGitRepository(cwd)) {
        return null;
      }

      const [branch, hasChanges, diff, commit] = await Promise.all([
        this.getCurrentBranch(cwd),
        this.hasUncommittedChanges(cwd),
        this.getDiff(cwd, false), // Get all changes, not just staged
        this.getLatestCommit(cwd),
      ]);

      if (!branch) {
        return null;
      }

      return {
        diff: diff || undefined,
        commit: commit || undefined,
        branch,
        hasUncommittedChanges: hasChanges,
      };
    } catch (error) {
      console.error('Failed to collect git metadata:', error);
      return null;
    }
  }

  /**
   * Decompress diff if needed
   */
  public async decompressDiff(diff: string, isCompressed: boolean): Promise<string> {
    if (!isCompressed) {
      return diff;
    }

    try {
      const buffer = Buffer.from(diff, 'base64');
      const decompressed = await gunzipAsync(buffer);
      return decompressed.toString('utf-8');
    } catch (error) {
      console.error('Failed to decompress diff:', error);
      return diff; // Return as-is if decompression fails
    }
  }

  /**
   * Parse diff stats from numstat output
   */
  private parseDiffStats(output: string): {
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
  } {
    const lines = output.trim().split('\n');
    let filesChanged = 0;
    let linesAdded = 0;
    let linesDeleted = 0;

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);

      if (parts.length >= 2) {
        const added = parseInt(parts[0], 10);
        const deleted = parseInt(parts[1], 10);

        if (!isNaN(added) && !isNaN(deleted)) {
          linesAdded += added;
          linesDeleted += deleted;
          filesChanged++;
        }
      }
    }

    return { filesChanged, linesAdded, linesDeleted };
  }

  /**
   * Check if directory is a git repository
   */
  private async isGitRepository(cwd: string): Promise<boolean> {
    try {
      const gitDir = join(cwd, '.git');

      // Check for .git directory
      if (existsSync(gitDir)) {
        return true;
      }

      // Check if inside a git worktree
      const { stdout } = await execAsync('git rev-parse --is-inside-work-tree', { cwd });
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Get diff stats summary
   */
  public async getDiffSummary(cwd: string): Promise<string | null> {
    try {
      if (!await this.isGitRepository(cwd)) {
        return null;
      }

      const { stdout } = await execAsync('git diff --stat', { cwd });
      return stdout.trim() || null;
    } catch (error) {
      console.error('Failed to get diff summary:', error);
      return null;
    }
  }
}

// Singleton instance
let gitServiceInstance: GitService | null = null;

export function getGitService(): GitService {
  if (!gitServiceInstance) {
    gitServiceInstance = new GitService();
  }
  return gitServiceInstance;
}
