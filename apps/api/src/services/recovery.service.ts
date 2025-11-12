/**
 * Recovery Service
 * Handles failure recovery strategies for different error types
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import {
  WorktreeError,
  ProcessExecutionError,
  GitOperationError,
  ResourceError,
  RecoverableError,
} from '../types/errors';
import { executionRepository } from '../repositories/execution.repository';
import { AgentExecutionStatus } from '../types/agent-execution';

const execAsync = promisify(exec);

export interface RecoveryOptions {
  maxRecoveryAttempts?: number;
  cleanupTimeout?: number;
}

export interface RecoveryResult {
  success: boolean;
  message: string;
  actionsTaken: string[];
  needsManualIntervention: boolean;
}

/**
 * Service for handling execution failures and recovery
 */
export class RecoveryService {
  private readonly options: Required<RecoveryOptions>;

  constructor(options: RecoveryOptions = {}) {
    this.options = {
      maxRecoveryAttempts: options.maxRecoveryAttempts || 2,
      cleanupTimeout: options.cleanupTimeout || 5000,
    };
  }

  /**
   * Main recovery dispatcher - routes to appropriate recovery strategy
   */
  public async recover(
    error: Error,
    context: {
      executionId?: string;
      worktreePath?: string;
      processId?: number;
      agentId?: string;
    }
  ): Promise<RecoveryResult> {
    const actionsTaken: string[] = [];

    try {
      // Dispatch to specific recovery handler based on error type
      if (error instanceof WorktreeError) {
        return await this.recoverFromWorktreeError(error, context, actionsTaken);
      }

      if (error instanceof ProcessExecutionError) {
        return await this.recoverFromProcessError(error, context, actionsTaken);
      }

      if (error instanceof GitOperationError) {
        return await this.recoverFromGitError(error, context, actionsTaken);
      }

      if (error instanceof ResourceError) {
        return await this.recoverFromResourceError(error, context, actionsTaken);
      }

      // Generic error recovery
      return await this.recoverFromGenericError(error, context, actionsTaken);
    } catch (recoveryError) {
      actionsTaken.push(`Recovery failed: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown error'}`);

      return {
        success: false,
        message: 'Recovery failed',
        actionsTaken,
        needsManualIntervention: true,
      };
    }
  }

  /**
   * Recover from worktree-related errors
   */
  private async recoverFromWorktreeError(
    error: WorktreeError,
    context: { executionId?: string; worktreePath?: string; processId?: number },
    actionsTaken: string[]
  ): Promise<RecoveryResult> {
    const { worktreePath } = context;

    if (!worktreePath) {
      return {
        success: false,
        message: 'Cannot recover: No worktree path provided',
        actionsTaken,
        needsManualIntervention: true,
      };
    }

    // Check if worktree exists
    const exists = existsSync(worktreePath);

    if (!exists) {
      actionsTaken.push('Detected missing worktree');

      // Worktree was deleted - needs manual recreation
      return {
        success: false,
        message: 'Worktree deleted, requires recreation through worktree service',
        actionsTaken,
        needsManualIntervention: true,
      };
    }

    // Worktree exists but may be corrupted
    actionsTaken.push('Attempting to validate worktree state');

    try {
      // Check git status
      const { stdout: status } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
        timeout: this.options.cleanupTimeout,
      });

      actionsTaken.push('Worktree git status: valid');

      // Check if there are any git locks
      const gitLockPath = join(worktreePath, '.git', 'index.lock');
      if (existsSync(gitLockPath)) {
        actionsTaken.push('Removing stale git lock file');
        rmSync(gitLockPath, { force: true });
      }

      return {
        success: true,
        message: 'Worktree recovered successfully',
        actionsTaken,
        needsManualIntervention: false,
      };
    } catch (gitError) {
      actionsTaken.push(`Git validation failed: ${gitError instanceof Error ? gitError.message : 'Unknown'}`);

      // Try to reset worktree to clean state
      try {
        actionsTaken.push('Attempting git reset --hard');
        await execAsync('git reset --hard HEAD', {
          cwd: worktreePath,
          timeout: this.options.cleanupTimeout,
        });

        actionsTaken.push('Attempting git clean -fd');
        await execAsync('git clean -fd', {
          cwd: worktreePath,
          timeout: this.options.cleanupTimeout,
        });

        return {
          success: true,
          message: 'Worktree reset to clean state',
          actionsTaken,
          needsManualIntervention: false,
        };
      } catch (resetError) {
        actionsTaken.push(`Reset failed: ${resetError instanceof Error ? resetError.message : 'Unknown'}`);

        return {
          success: false,
          message: 'Worktree corruption requires manual intervention',
          actionsTaken,
          needsManualIntervention: true,
        };
      }
    }
  }

  /**
   * Recover from process execution errors
   */
  private async recoverFromProcessError(
    error: ProcessExecutionError,
    context: { executionId?: string; processId?: number; worktreePath?: string },
    actionsTaken: string[]
  ): Promise<RecoveryResult> {
    const { processId, executionId } = context;

    if (processId) {
      actionsTaken.push(`Checking process ${processId}`);

      try {
        // Check if process still exists
        process.kill(processId, 0); // Signal 0 just checks if process exists

        // Process exists, try to kill it gracefully
        actionsTaken.push('Process still running, attempting graceful shutdown');

        try {
          process.kill(processId, 'SIGTERM');
          await this.sleep(2000);

          // Check if still alive
          try {
            process.kill(processId, 0);

            // Still alive, force kill
            actionsTaken.push('Graceful shutdown failed, forcing kill');
            process.kill(processId, 'SIGKILL');
          } catch {
            actionsTaken.push('Process terminated gracefully');
          }
        } catch (killError) {
          actionsTaken.push(`Kill failed: ${killError instanceof Error ? killError.message : 'Unknown'}`);
        }
      } catch {
        actionsTaken.push('Process no longer running');
      }
    }

    // Update execution status if possible
    if (executionId) {
      try {
        await executionRepository.markAsFailed(
          executionId,
          `Process error: ${error.message}`
        );
        actionsTaken.push('Updated execution status to FAILED');
      } catch (dbError) {
        actionsTaken.push('Failed to update execution status');
      }
    }

    return {
      success: true,
      message: 'Process cleanup completed',
      actionsTaken,
      needsManualIntervention: false,
    };
  }

  /**
   * Recover from git operation errors
   */
  private async recoverFromGitError(
    error: GitOperationError,
    context: { worktreePath?: string },
    actionsTaken: string[]
  ): Promise<RecoveryResult> {
    const { worktreePath } = context;

    if (!worktreePath || !existsSync(worktreePath)) {
      return {
        success: false,
        message: 'Cannot recover git error: Invalid worktree path',
        actionsTaken,
        needsManualIntervention: true,
      };
    }

    try {
      // Check for git locks
      const gitLockPath = join(worktreePath, '.git', 'index.lock');
      if (existsSync(gitLockPath)) {
        actionsTaken.push('Removing stale git lock file');
        rmSync(gitLockPath, { force: true });
      }

      // Check for merge conflicts
      const { stdout: statusOutput } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
        timeout: this.options.cleanupTimeout,
      });

      if (statusOutput.includes('UU ') || statusOutput.includes('AA ')) {
        actionsTaken.push('Detected merge conflicts');

        // Abort any in-progress merge
        try {
          await execAsync('git merge --abort', {
            cwd: worktreePath,
            timeout: this.options.cleanupTimeout,
          });
          actionsTaken.push('Aborted in-progress merge');
        } catch {
          actionsTaken.push('No merge to abort');
        }

        // Abort any in-progress rebase
        try {
          await execAsync('git rebase --abort', {
            cwd: worktreePath,
            timeout: this.options.cleanupTimeout,
          });
          actionsTaken.push('Aborted in-progress rebase');
        } catch {
          actionsTaken.push('No rebase to abort');
        }
      }

      return {
        success: true,
        message: 'Git state recovered',
        actionsTaken,
        needsManualIntervention: false,
      };
    } catch (recoveryError) {
      actionsTaken.push(`Git recovery failed: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown'}`);

      return {
        success: false,
        message: 'Git state requires manual intervention',
        actionsTaken,
        needsManualIntervention: true,
      };
    }
  }

  /**
   * Recover from resource errors
   */
  private async recoverFromResourceError(
    error: ResourceError,
    context: { worktreePath?: string; executionId?: string },
    actionsTaken: string[]
  ): Promise<RecoveryResult> {
    const resourceType = error.context?.resourceType;

    actionsTaken.push(`Resource error detected: ${resourceType || 'unknown'}`);

    if (resourceType === 'disk') {
      // Try to clean up temporary files
      if (context.worktreePath && existsSync(context.worktreePath)) {
        try {
          // Clean git temporary files
          await execAsync('git clean -fd', {
            cwd: context.worktreePath,
            timeout: this.options.cleanupTimeout,
          });
          actionsTaken.push('Cleaned temporary files from worktree');
        } catch {
          actionsTaken.push('Failed to clean temporary files');
        }
      }
    }

    if (resourceType === 'memory') {
      actionsTaken.push('Memory exhaustion - consider reducing concurrent executions');
    }

    // For resource errors, we typically need to wait and retry
    return {
      success: false,
      message: 'Resource error - retry may succeed after delay',
      actionsTaken,
      needsManualIntervention: false, // Retry logic should handle this
    };
  }

  /**
   * Generic error recovery
   */
  private async recoverFromGenericError(
    error: Error,
    context: { executionId?: string; processId?: number; worktreePath?: string },
    actionsTaken: string[]
  ): Promise<RecoveryResult> {
    actionsTaken.push(`Generic error: ${error.message}`);

    // Basic cleanup
    if (context.processId) {
      try {
        process.kill(context.processId, 0);
        process.kill(context.processId, 'SIGTERM');
        actionsTaken.push('Terminated running process');
      } catch {
        // Process not running
      }
    }

    if (context.executionId) {
      try {
        await executionRepository.markAsFailed(context.executionId, error.message);
        actionsTaken.push('Updated execution status');
      } catch {
        actionsTaken.push('Failed to update execution status');
      }
    }

    return {
      success: false,
      message: 'Generic error recovery completed',
      actionsTaken,
      needsManualIntervention: error instanceof RecoverableError ? !error.recoverable : true,
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let recoveryServiceInstance: RecoveryService | null = null;

export function getRecoveryService(): RecoveryService {
  if (!recoveryServiceInstance) {
    recoveryServiceInstance = new RecoveryService();
  }
  return recoveryServiceInstance;
}
