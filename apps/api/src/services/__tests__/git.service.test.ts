/**
 * Tests for git.service.ts - Git diff and commit metadata collection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { GitService } from '../git.service';

const execAsync = promisify(exec);

describe('GitService', () => {
  let gitService: GitService;
  let tempDir: string;

  beforeEach(async () => {
    gitService = new GitService();
    // Create temporary directory for test git repo
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-service-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to initialize a git repository
   */
  async function initGitRepo(dir: string): Promise<void> {
    await execAsync('git init -b main', { cwd: dir });
    await execAsync('git config user.email "test@example.com"', { cwd: dir });
    await execAsync('git config user.name "Test User"', { cwd: dir });
  }

  /**
   * Helper to create and commit a file
   */
  async function createAndCommitFile(
    dir: string,
    filename: string,
    content: string,
    commitMsg: string
  ): Promise<void> {
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, content);
    await execAsync(`git add ${filename}`, { cwd: dir });
    await execAsync(`git commit -m "${commitMsg}"`, { cwd: dir });
  }

  describe('getDiff', () => {
    it('should return null for non-git directory', async () => {
      const result = await gitService.getDiff(tempDir, false);
      expect(result).toBeNull();
    });

    it('should return null when no changes exist', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'initial content', 'Initial commit');

      const result = await gitService.getDiff(tempDir, false);
      expect(result).toBeNull();
    });

    it('should collect unstaged changes', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'initial content', 'Initial commit');

      // Modify file without staging
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'modified content\nline 2\nline 3');

      const result = await gitService.getDiff(tempDir, false);

      expect(result).not.toBeNull();
      expect(result?.filesChanged).toBe(1);
      expect(result?.linesAdded).toBeGreaterThan(0);
      expect(result?.diff).toBeTruthy();
      expect(result?.isCompressed).toBe(false);
    });

    it('should collect staged changes only', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'initial content', 'Initial commit');

      // Create staged change
      const stagedFile = path.join(tempDir, 'staged.txt');
      await fs.writeFile(stagedFile, 'staged content');
      await execAsync('git add staged.txt', { cwd: tempDir });

      // Create unstaged change
      const unstagedFile = path.join(tempDir, 'unstaged.txt');
      await fs.writeFile(unstagedFile, 'unstaged content');

      const result = await gitService.getDiff(tempDir, true);

      expect(result).not.toBeNull();
      expect(result?.filesChanged).toBe(1);
      expect(result?.diff).toContain('staged.txt');
      expect(result?.diff).not.toContain('unstaged.txt');
    });

    it('should track lines added and deleted correctly', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(
        tempDir,
        'test.txt',
        'line 1\nline 2\nline 3\nline 4',
        'Initial commit'
      );

      // Modify: delete 2 lines, add 3 lines
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'line 1\nnew line 2\nnew line 3\nnew line 4');

      const result = await gitService.getDiff(tempDir, false);

      expect(result).not.toBeNull();
      expect(result?.filesChanged).toBe(1);
      expect(result?.linesAdded).toBeGreaterThan(0);
      expect(result?.linesDeleted).toBeGreaterThan(0);
    });

    it('should compress large diffs', async () => {
      await initGitRepo(tempDir);
      // Start with small file
      const initialContent = 'line1\n'.repeat(100);
      await createAndCommitFile(tempDir, 'large.txt', initialContent, 'Initial commit');

      // Create a large change (> 100KB diff)
      const largeContent = 'x'.repeat(150 * 1024);
      const filePath = path.join(tempDir, 'large.txt');
      await fs.writeFile(filePath, largeContent);

      const result = await gitService.getDiff(tempDir, false);

      expect(result).not.toBeNull();
      expect(result?.isCompressed).toBe(true);
      expect(result?.diff).toBeTruthy();
      // Compressed diff should be shorter than uncompressed content
      expect(result!.diff.length).toBeLessThan(largeContent.length);
    });

    it('should handle multiple file changes', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'file1.txt', 'content1', 'Initial commit');
      await createAndCommitFile(tempDir, 'file2.txt', 'content2', 'Second file');
      await createAndCommitFile(tempDir, 'file3.txt', 'content3', 'Third file');

      // Modify all files
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'modified content1');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'modified content2');
      await fs.writeFile(path.join(tempDir, 'file3.txt'), 'modified content3');

      const result = await gitService.getDiff(tempDir, false);

      expect(result).not.toBeNull();
      expect(result?.filesChanged).toBe(3);
      expect(result?.diff).toContain('file1.txt');
      expect(result?.diff).toContain('file2.txt');
      expect(result?.diff).toContain('file3.txt');
    });
  });

  describe('getLatestCommit', () => {
    it('should return null for non-git directory', async () => {
      const result = await gitService.getLatestCommit(tempDir);
      expect(result).toBeNull();
    });

    it('should return null when no commits exist', async () => {
      await initGitRepo(tempDir);

      const result = await gitService.getLatestCommit(tempDir);
      expect(result).toBeNull();
    });

    it('should retrieve latest commit information', async () => {
      await initGitRepo(tempDir);
      const commitMessage = 'Test commit message';
      await createAndCommitFile(tempDir, 'test.txt', 'content', commitMessage);

      const result = await gitService.getLatestCommit(tempDir);

      expect(result).not.toBeNull();
      expect(result?.hash).toMatch(/^[0-9a-f]{40}$/);
      expect(result?.message).toBe(commitMessage);
      expect(result?.author).toBe('Test User');
      expect(result?.date).toBeInstanceOf(Date);
      expect(result?.branch).toBe('main');
    });

    it('should return most recent commit when multiple exist', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'file1.txt', 'content1', 'First commit');
      await createAndCommitFile(tempDir, 'file2.txt', 'content2', 'Second commit');

      const result = await gitService.getLatestCommit(tempDir);

      expect(result).not.toBeNull();
      expect(result?.message).toBe('Second commit');
    });

    it('should include correct branch name', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Initial commit');

      // Create and checkout new branch
      await execAsync('git checkout -b feature/test-branch', { cwd: tempDir });
      await createAndCommitFile(tempDir, 'feature.txt', 'feature content', 'Feature commit');

      const result = await gitService.getLatestCommit(tempDir);

      expect(result).not.toBeNull();
      expect(result?.branch).toBe('feature/test-branch');
      expect(result?.message).toBe('Feature commit');
    });
  });

  describe('getCurrentBranch', () => {
    it('should return null for non-git directory', async () => {
      const result = await gitService.getCurrentBranch(tempDir);
      expect(result).toBeNull();
    });

    it('should return current branch name', async () => {
      await initGitRepo(tempDir);
      // Need at least one commit for HEAD to exist
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Initial commit');

      const result = await gitService.getCurrentBranch(tempDir);
      expect(result).toBe('main');
    });

    it('should return correct branch after checkout', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Initial commit');
      await execAsync('git checkout -b feature/new-feature', { cwd: tempDir });

      const result = await gitService.getCurrentBranch(tempDir);
      expect(result).toBe('feature/new-feature');
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return false for non-git directory', async () => {
      const result = await gitService.hasUncommittedChanges(tempDir);
      expect(result).toBe(false);
    });

    it('should return false when no changes exist', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Initial commit');

      const result = await gitService.hasUncommittedChanges(tempDir);
      expect(result).toBe(false);
    });

    it('should return true for unstaged changes', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'initial', 'Initial commit');

      // Modify file
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'modified');

      const result = await gitService.hasUncommittedChanges(tempDir);
      expect(result).toBe(true);
    });

    it('should return true for staged changes', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'initial', 'Initial commit');

      // Stage a new file
      await fs.writeFile(path.join(tempDir, 'new.txt'), 'new content');
      await execAsync('git add new.txt', { cwd: tempDir });

      const result = await gitService.hasUncommittedChanges(tempDir);
      expect(result).toBe(true);
    });

    it('should return true for untracked files', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Initial commit');

      // Create untracked file
      await fs.writeFile(path.join(tempDir, 'untracked.txt'), 'untracked content');

      const result = await gitService.hasUncommittedChanges(tempDir);
      expect(result).toBe(true);
    });
  });

  describe('collectMetadata', () => {
    it('should return null for non-git directory', async () => {
      const result = await gitService.collectMetadata(tempDir);
      expect(result).toBeNull();
    });

    it('should collect complete metadata', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'initial content', 'Initial commit');

      // Make some changes
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'modified content');

      const result = await gitService.collectMetadata(tempDir);

      expect(result).not.toBeNull();
      expect(result?.branch).toBe('main');
      expect(result?.hasUncommittedChanges).toBe(true);
      expect(result?.commit).toBeDefined();
      expect(result?.commit?.message).toBe('Initial commit');
      expect(result?.diff).toBeDefined();
      expect(result?.diff?.filesChanged).toBe(1);
    });

    it('should handle clean repository', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Initial commit');

      const result = await gitService.collectMetadata(tempDir);

      expect(result).not.toBeNull();
      expect(result?.branch).toBe('main');
      expect(result?.hasUncommittedChanges).toBe(false);
      expect(result?.commit).toBeDefined();
      expect(result?.diff).toBeUndefined(); // No changes
    });

    it('should collect metadata with multiple changes', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'file1.txt', 'content1', 'First commit');
      await createAndCommitFile(tempDir, 'file2.txt', 'content2', 'Second commit');

      // Make changes to committed files only (git diff doesn't track untracked files in --numstat)
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'modified1');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'modified2');

      const result = await gitService.collectMetadata(tempDir);

      expect(result).not.toBeNull();
      expect(result?.branch).toBe('main');
      expect(result?.hasUncommittedChanges).toBe(true);
      expect(result?.commit?.message).toBe('Second commit');
      expect(result?.diff?.filesChanged).toBe(2);
    });

    it('should handle git worktree', async () => {
      // Initialize main repo
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Initial commit');

      // Create worktree
      const worktreePath = path.join(tempDir, '../test-worktree');
      await execAsync(`git worktree add ${worktreePath} -b feature/test`, { cwd: tempDir });

      const result = await gitService.collectMetadata(worktreePath);

      expect(result).not.toBeNull();
      expect(result?.branch).toBe('feature/test');

      // Clean up worktree
      await execAsync(`git worktree remove ${worktreePath}`, { cwd: tempDir });
    });
  });

  describe('decompressDiff', () => {
    it('should return uncompressed diff as-is', async () => {
      const originalDiff = 'diff --git a/file.txt b/file.txt\n+new line';

      const result = await gitService.decompressDiff(originalDiff, false);
      expect(result).toBe(originalDiff);
    });

    it('should decompress compressed diff', async () => {
      await initGitRepo(tempDir);
      const initialContent = 'line1\n'.repeat(100);
      await createAndCommitFile(tempDir, 'large.txt', initialContent, 'Initial commit');

      // Create large diff to trigger compression
      const largeContent = 'x'.repeat(150 * 1024);
      await fs.writeFile(path.join(tempDir, 'large.txt'), largeContent);

      const diffResult = await gitService.getDiff(tempDir, false);

      expect(diffResult).not.toBeNull();
      expect(diffResult!.isCompressed).toBe(true);

      const decompressed = await gitService.decompressDiff(
        diffResult!.diff,
        diffResult!.isCompressed
      );

      expect(decompressed).toContain('diff --git');
      expect(decompressed).toContain('large.txt');
      expect(decompressed.length).toBeGreaterThan(diffResult!.diff.length);
    });

    it('should handle decompression errors gracefully', async () => {
      const invalidCompressedData = 'not-valid-base64-compressed-data';

      const result = await gitService.decompressDiff(invalidCompressedData, true);

      // Should return original data if decompression fails
      expect(result).toBe(invalidCompressedData);
    });
  });

  describe('getDiffSummary', () => {
    it('should return null for non-git directory', async () => {
      const result = await gitService.getDiffSummary(tempDir);
      expect(result).toBeNull();
    });

    it('should return null when no changes exist', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Initial commit');

      const result = await gitService.getDiffSummary(tempDir);
      expect(result).toBeNull();
    });

    it('should return summary for changes', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'line 1\nline 2', 'Initial commit');

      // Modify file
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'modified line 1\nmodified line 2');

      const result = await gitService.getDiffSummary(tempDir);

      expect(result).not.toBeNull();
      expect(result).toContain('test.txt');
      expect(result).toContain('changed');
    });

    it('should show summary for multiple files', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'file1.txt', 'content1', 'Initial commit');
      await createAndCommitFile(tempDir, 'file2.txt', 'content2', 'Second commit');

      // Modify committed files
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'modified1');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'modified2');

      const result = await gitService.getDiffSummary(tempDir);

      expect(result).not.toBeNull();
      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');
      expect(result).toContain('changed');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid directory gracefully', async () => {
      const invalidPath = '/nonexistent/directory/path';

      const diff = await gitService.getDiff(invalidPath, false);
      expect(diff).toBeNull();

      const commit = await gitService.getLatestCommit(invalidPath);
      expect(commit).toBeNull();

      const branch = await gitService.getCurrentBranch(invalidPath);
      expect(branch).toBeNull();

      const hasChanges = await gitService.hasUncommittedChanges(invalidPath);
      expect(hasChanges).toBe(false);

      const metadata = await gitService.collectMetadata(invalidPath);
      expect(metadata).toBeNull();
    });

    it('should handle repository initialization edge cases', async () => {
      // Empty git repo (no commits)
      await initGitRepo(tempDir);

      const commit = await gitService.getLatestCommit(tempDir);
      expect(commit).toBeNull();

      const diff = await gitService.getDiff(tempDir, false);
      expect(diff).toBeNull();

      // getCurrentBranch returns null when no commits exist (HEAD doesn't exist)
      const branch = await gitService.getCurrentBranch(tempDir);
      expect(branch).toBeNull();
    });
  });
});
