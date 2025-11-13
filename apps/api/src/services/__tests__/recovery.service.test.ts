/**
 * Recovery Service Tests
 * Tests for failure recovery strategies
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecoveryService } from '../recovery.service';
import {
  WorktreeError,
  ProcessExecutionError,
  GitOperationError,
  ResourceError,
  TimeoutError,
  ConfigurationError,
} from '../../types/errors';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock child_process exec
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Mock execution repository
vi.mock('../../repositories/execution.repository', () => ({
  executionRepository: {
    markAsFailed: vi.fn(),
    markAsTimeout: vi.fn(),
  },
}));

import { exec } from 'child_process';
import { executionRepository } from '../../repositories/execution.repository';

const mockExec = exec as unknown as ReturnType<typeof vi.fn>;
const mockMarkAsFailed = executionRepository.markAsFailed as unknown as ReturnType<typeof vi.fn>;

describe('RecoveryService', () => {
  let recoveryService: RecoveryService;
  let testDir: string;

  beforeEach(() => {
    recoveryService = new RecoveryService({
      maxRecoveryAttempts: 2,
      cleanupTimeout: 1000,
    });

    // Create test directory
    testDir = join(tmpdir(), `recovery-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('WorktreeError Recovery', () => {
    it('should detect missing worktree', async () => {
      const error = new WorktreeError('Worktree not found', {
        worktreePath: '/non/existent/path',
      });

      const result = await recoveryService.recover(error, {
        worktreePath: '/non/existent/path',
      });

      expect(result.success).toBe(false);
      expect(result.needsManualIntervention).toBe(true);
      expect(result.actionsTaken).toContain('Detected missing worktree');
    });

    it('should remove stale git lock files', async () => {
      // Create mock git directory
      const gitDir = join(testDir, '.git');
      mkdirSync(gitDir, { recursive: true });
      const lockFile = join(gitDir, 'index.lock');
      writeFileSync(lockFile, '');

      // Mock git status success
      mockExec.mockImplementation((cmd: string, options: any, callback: Function) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const error = new WorktreeError('Git lock detected', {
        worktreePath: testDir,
      });

      const result = await recoveryService.recover(error, {
        worktreePath: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.actionsTaken).toContain('Removing stale git lock file');
      expect(existsSync(lockFile)).toBe(false);
    });

    it('should attempt git reset on corruption', async () => {
      const gitDir = join(testDir, '.git');
      mkdirSync(gitDir, { recursive: true });

      let callCount = 0;
      mockExec.mockImplementation((cmd: string, options: any, callback: Function) => {
        callCount++;
        if (callCount === 1) {
          // git status fails
          callback(new Error('fatal: not a git repository'));
        } else if (callCount === 2) {
          // git reset succeeds
          callback(null, { stdout: '', stderr: '' });
        } else if (callCount === 3) {
          // git clean succeeds
          callback(null, { stdout: '', stderr: '' });
        }
      });

      const error = new WorktreeError('Worktree corrupted', {
        worktreePath: testDir,
      });

      const result = await recoveryService.recover(error, {
        worktreePath: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.actionsTaken).toContain('Attempting git reset --hard');
      expect(result.actionsTaken).toContain('Attempting git clean -fd');
    });

    it('should detect unrecoverable corruption', async () => {
      const gitDir = join(testDir, '.git');
      mkdirSync(gitDir, { recursive: true });

      // All git commands fail
      mockExec.mockImplementation((cmd: string, options: any, callback: Function) => {
        callback(new Error('fatal: corrupt repository'));
      });

      const error = new WorktreeError('Worktree corrupted', {
        worktreePath: testDir,
      });

      const result = await recoveryService.recover(error, {
        worktreePath: testDir,
      });

      expect(result.success).toBe(false);
      expect(result.needsManualIntervention).toBe(true);
      expect(result.message).toContain('manual intervention');
    });
  });

  describe('ProcessExecutionError Recovery', () => {
    it('should detect terminated process', async () => {
      const error = new ProcessExecutionError('Process crashed', {
        processId: 99999, // Non-existent PID
        exitCode: 1,
      });

      const result = await recoveryService.recover(error, {
        executionId: 'test-exec-1',
        processId: 99999,
      });

      expect(result.success).toBe(true);
      expect(result.actionsTaken).toContain('Process no longer running');
    });

    it('should update execution status on failure', async () => {
      const executionId = 'test-exec-2';
      const error = new ProcessExecutionError('Process failed', {
        processId: 99999,
        exitCode: 1,
      });

      mockMarkAsFailed.mockResolvedValue(undefined);

      const result = await recoveryService.recover(error, {
        executionId,
        processId: 99999,
      });

      expect(result.success).toBe(true);
      expect(mockMarkAsFailed).toHaveBeenCalledWith(
        executionId,
        expect.stringContaining('Process error')
      );
      expect(result.actionsTaken).toContain('Updated execution status to FAILED');
    });
  });

  describe('GitOperationError Recovery', () => {
    it('should handle missing worktree path', async () => {
      const error = new GitOperationError('Git operation failed', {
        operation: 'merge',
      });

      const result = await recoveryService.recover(error, {});

      expect(result.success).toBe(false);
      expect(result.needsManualIntervention).toBe(true);
      expect(result.message).toContain('Invalid worktree path');
    });

    it('should remove git lock files', async () => {
      const gitDir = join(testDir, '.git');
      mkdirSync(gitDir, { recursive: true });
      const lockFile = join(gitDir, 'index.lock');
      writeFileSync(lockFile, '');

      mockExec.mockImplementation((cmd: string, options: any, callback: Function) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const error = new GitOperationError('Git lock detected', {
        operation: 'commit',
      });

      const result = await recoveryService.recover(error, {
        worktreePath: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.actionsTaken).toContain('Removing stale git lock file');
      expect(existsSync(lockFile)).toBe(false);
    });

    it('should abort in-progress merge', async () => {
      const gitDir = join(testDir, '.git');
      mkdirSync(gitDir, { recursive: true });

      let callCount = 0;
      mockExec.mockImplementation((cmd: string, options: any, callback: Function) => {
        callCount++;
        if (callCount === 1) {
          // git status shows merge conflict
          callback(null, { stdout: 'UU conflicted-file.txt\n', stderr: '' });
        } else if (callCount === 2) {
          // git merge --abort
          callback(null, { stdout: '', stderr: '' });
        } else {
          // git rebase --abort
          callback(null, { stdout: '', stderr: '' });
        }
      });

      const error = new GitOperationError('Merge conflict detected', {
        operation: 'merge',
      });

      const result = await recoveryService.recover(error, {
        worktreePath: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.actionsTaken).toContain('Detected merge conflicts');
      expect(result.actionsTaken).toContain('Aborted in-progress merge');
    });
  });

  describe('ResourceError Recovery', () => {
    it('should clean temporary files for disk errors', async () => {
      mockExec.mockImplementation((cmd: string, options: any, callback: Function) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const error = new ResourceError('Disk space exhausted', {
        resourceType: 'disk',
        currentUsage: 95,
        limit: 90,
      });

      const result = await recoveryService.recover(error, {
        worktreePath: testDir,
      });

      expect(result.success).toBe(false); // Resource errors need retry
      expect(result.needsManualIntervention).toBe(false); // But can be retried
      expect(result.actionsTaken).toContain('Resource error detected: disk');
    });

    it('should provide guidance for memory errors', async () => {
      const error = new ResourceError('Memory exhausted', {
        resourceType: 'memory',
        currentUsage: 4096,
        limit: 4000,
      });

      const result = await recoveryService.recover(error, {});

      expect(result.success).toBe(false);
      expect(result.actionsTaken).toContain(
        'Memory exhaustion - consider reducing concurrent executions'
      );
      expect(result.message).toContain('retry may succeed after delay');
    });
  });

  describe('TimeoutError Recovery', () => {
    it('should handle timeout errors', async () => {
      const error = new TimeoutError('Execution timed out', {
        timeoutMs: 30000,
        elapsedMs: 35000,
        recoverable: false,
      });

      const result = await recoveryService.recover(error, {
        executionId: 'test-exec-3',
      });

      // Timeout uses generic recovery
      expect(result.success).toBe(false);
      expect(result.needsManualIntervention).toBe(true);
    });
  });

  describe('ConfigurationError Recovery', () => {
    it('should mark configuration errors as non-recoverable', async () => {
      const error = new ConfigurationError('Invalid config', {
        configKey: 'agent.timeout',
        expectedType: 'number',
        actualValue: 'invalid',
      });

      const result = await recoveryService.recover(error, {});

      expect(result.success).toBe(false);
      expect(result.needsManualIntervention).toBe(true);
    });
  });

  describe('Generic Error Recovery', () => {
    it('should handle unknown errors', async () => {
      const error = new Error('Unknown error occurred');

      const result = await recoveryService.recover(error, {
        executionId: 'test-exec-4',
      });

      expect(result.success).toBe(false);
      expect(result.actionsTaken).toContain('Generic error: Unknown error occurred');
    });

    it('should update execution status for generic errors', async () => {
      const executionId = 'test-exec-5';
      const error = new Error('Something went wrong');

      mockMarkAsFailed.mockResolvedValue(undefined);

      const result = await recoveryService.recover(error, {
        executionId,
      });

      expect(mockMarkAsFailed).toHaveBeenCalledWith(
        executionId,
        'Something went wrong'
      );
      expect(result.actionsTaken).toContain('Updated execution status');
    });
  });

  describe('Recovery Failure Handling', () => {
    it('should handle recovery process failures', async () => {
      const gitDir = join(testDir, '.git');
      mkdirSync(gitDir, { recursive: true });

      const error = new WorktreeError('Test error', {
        worktreePath: testDir,
      });

      // Mock exec to fail all git commands
      mockExec.mockImplementation((cmd: string, options: any, callback: Function) => {
        callback(new Error('Recovery process crashed'));
      });

      const result = await recoveryService.recover(error, {
        worktreePath: testDir,
      });

      expect(result.success).toBe(false);
      expect(result.needsManualIntervention).toBe(true);
      // The worktree recovery detects it can't be fixed and returns this message
      expect(result.message).toContain('manual intervention');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complex worktree recovery scenario', async () => {
      const gitDir = join(testDir, '.git');
      mkdirSync(gitDir, { recursive: true });
      const lockFile = join(gitDir, 'index.lock');
      writeFileSync(lockFile, '');

      let callCount = 0;
      mockExec.mockImplementation((cmd: string, options: any, callback: Function) => {
        callCount++;
        if (callCount === 1 && cmd.includes('git status')) {
          // git status succeeds
          callback(null, { stdout: 'M modified-file.txt\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      });

      const error = new WorktreeError('Worktree state invalid', {
        worktreePath: testDir,
        branch: 'feature/test',
      });

      const result = await recoveryService.recover(error, {
        executionId: 'test-exec-6',
        worktreePath: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.actionsTaken.length).toBeGreaterThan(0);
      expect(existsSync(lockFile)).toBe(false);
    });
  });
});
