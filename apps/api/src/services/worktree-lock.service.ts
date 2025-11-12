/**
 * Worktree Lock Service
 * Distributed lock mechanism to prevent race conditions in concurrent worktree operations
 */

import { existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { prisma } from '../lib/db';

export interface LockOptions {
  timeout?: number; // Lock timeout in milliseconds (default: 30000)
  retryDelay?: number; // Initial retry delay in milliseconds (default: 100)
  maxRetries?: number; // Maximum number of retries (default: 50)
}

export interface LockResult {
  acquired: boolean;
  lockId?: string;
  error?: string;
}

interface LockInfo {
  lockId: string;
  resourceId: string;
  processId: number;
  acquiredAt: number;
  expiresAt: number;
}

/**
 * Worktree lock service for preventing concurrent operation conflicts
 */
export class WorktreeLockService {
  private locksDir: string;
  private activeLocks: Map<string, LockInfo>;

  constructor(locksDir?: string) {
    this.locksDir = locksDir || join(process.cwd(), '.jellos', 'locks');
    this.activeLocks = new Map();
    this.ensureLocksDir();
  }

  /**
   * Acquire a lock for a worktree resource
   */
  public async acquireLock(
    resourceId: string,
    options?: LockOptions
  ): Promise<LockResult> {
    const {
      timeout = 30000,
      retryDelay = 100,
      maxRetries = 50,
    } = options || {};

    const lockId = this.generateLockId(resourceId);
    const expiresAt = Date.now() + timeout;

    let attempts = 0;
    let currentDelay = retryDelay;

    while (attempts < maxRetries) {
      try {
        // Try to acquire database lock first
        const dbLockAcquired = await this.acquireDbLock(resourceId, lockId, expiresAt);

        if (dbLockAcquired) {
          // Try to acquire file lock
          const fileLockAcquired = await this.acquireFileLock(
            resourceId,
            lockId,
            expiresAt
          );

          if (fileLockAcquired) {
            // Both locks acquired successfully
            this.activeLocks.set(resourceId, {
              lockId,
              resourceId,
              processId: process.pid,
              acquiredAt: Date.now(),
              expiresAt,
            });

            return { acquired: true, lockId };
          } else {
            // File lock failed, release DB lock
            await this.releaseDbLock(resourceId, lockId);
          }
        }

        // Lock not acquired, wait and retry with exponential backoff
        attempts++;
        if (attempts < maxRetries) {
          await this.sleep(currentDelay);
          currentDelay = Math.min(currentDelay * 2, 5000); // Cap at 5 seconds
        }
      } catch (error) {
        console.error('Lock acquisition error:', error);
        return {
          acquired: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    return {
      acquired: false,
      error: `Failed to acquire lock after ${maxRetries} attempts`,
    };
  }

  /**
   * Release a lock
   */
  public async releaseLock(resourceId: string, lockId: string): Promise<boolean> {
    try {
      const lockInfo = this.activeLocks.get(resourceId);

      if (!lockInfo || lockInfo.lockId !== lockId) {
        console.warn(`Lock mismatch for resource ${resourceId}`);
        return false;
      }

      // Release both locks
      await Promise.all([
        this.releaseDbLock(resourceId, lockId),
        this.releaseFileLock(resourceId),
      ]);

      this.activeLocks.delete(resourceId);
      return true;
    } catch (error) {
      console.error('Lock release error:', error);
      return false;
    }
  }

  /**
   * Check if a lock is held
   */
  public isLocked(resourceId: string): boolean {
    const lockInfo = this.activeLocks.get(resourceId);
    if (!lockInfo) {
      return false;
    }

    // Check if lock has expired
    if (Date.now() > lockInfo.expiresAt) {
      this.activeLocks.delete(resourceId);
      return false;
    }

    return true;
  }

  /**
   * Execute a function with lock protection
   */
  public async withLock<T>(
    resourceId: string,
    fn: () => Promise<T>,
    options?: LockOptions
  ): Promise<T> {
    const lockResult = await this.acquireLock(resourceId, options);

    if (!lockResult.acquired) {
      throw new Error(
        lockResult.error || 'Failed to acquire lock for resource ' + resourceId
      );
    }

    try {
      return await fn();
    } finally {
      if (lockResult.lockId) {
        await this.releaseLock(resourceId, lockResult.lockId);
      }
    }
  }

  /**
   * Clean up expired locks
   */
  public async cleanupExpiredLocks(): Promise<number> {
    let cleaned = 0;
    const now = Date.now();

    // Clean up in-memory locks
    for (const [resourceId, lockInfo] of this.activeLocks.entries()) {
      if (now > lockInfo.expiresAt) {
        await this.releaseLock(resourceId, lockInfo.lockId);
        cleaned++;
      }
    }

    // Clean up database locks
    try {
      const result = await prisma.$executeRaw`
        DELETE FROM worktree_locks
        WHERE expires_at < datetime('now')
      `;
      cleaned += Number(result);
    } catch (error) {
      console.error('Failed to clean up DB locks:', error);
    }

    // Clean up file locks
    try {
      const lockFiles = this.getExpiredLockFiles(now);
      for (const file of lockFiles) {
        try {
          unlinkSync(file);
          cleaned++;
        } catch {
          // Ignore errors
        }
      }
    } catch (error) {
      console.error('Failed to clean up file locks:', error);
    }

    return cleaned;
  }

  /**
   * Acquire database-level lock
   */
  private async acquireDbLock(
    resourceId: string,
    lockId: string,
    expiresAt: number
  ): Promise<boolean> {
    try {
      // Try to insert lock record
      await prisma.$executeRaw`
        INSERT OR REPLACE INTO worktree_locks (resource_id, lock_id, process_id, expires_at)
        VALUES (${resourceId}, ${lockId}, ${process.pid}, datetime(${expiresAt / 1000}, 'unixepoch'))
      `;
      return true;
    } catch (error) {
      console.error('DB lock acquisition failed:', error);
      return false;
    }
  }

  /**
   * Release database-level lock
   */
  private async releaseDbLock(resourceId: string, lockId: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        DELETE FROM worktree_locks
        WHERE resource_id = ${resourceId} AND lock_id = ${lockId}
      `;
    } catch (error) {
      console.error('DB lock release failed:', error);
    }
  }

  /**
   * Acquire file-based lock
   */
  private async acquireFileLock(
    resourceId: string,
    lockId: string,
    expiresAt: number
  ): Promise<boolean> {
    const lockFilePath = this.getLockFilePath(resourceId);

    try {
      // Check if lock file exists and is not expired
      if (existsSync(lockFilePath)) {
        const content = readFileSync(lockFilePath, 'utf-8');
        const lockData = JSON.parse(content);

        if (Date.now() < lockData.expiresAt) {
          // Lock is held by another process
          return false;
        }

        // Lock expired, we can take it
        unlinkSync(lockFilePath);
      }

      // Create new lock file
      const lockData: LockInfo = {
        lockId,
        resourceId,
        processId: process.pid,
        acquiredAt: Date.now(),
        expiresAt,
      };

      writeFileSync(lockFilePath, JSON.stringify(lockData), 'utf-8');
      return true;
    } catch (error) {
      console.error('File lock acquisition failed:', error);
      return false;
    }
  }

  /**
   * Release file-based lock
   */
  private async releaseFileLock(resourceId: string): Promise<void> {
    const lockFilePath = this.getLockFilePath(resourceId);

    try {
      if (existsSync(lockFilePath)) {
        unlinkSync(lockFilePath);
      }
    } catch (error) {
      console.error('File lock release failed:', error);
    }
  }

  /**
   * Get lock file path for a resource
   */
  private getLockFilePath(resourceId: string): string {
    // Sanitize resource ID for filesystem
    const sanitized = resourceId.replace(/[^a-zA-Z0-9-_]/g, '-');
    return join(this.locksDir, `${sanitized}.lock`);
  }

  /**
   * Get list of expired lock files
   */
  private getExpiredLockFiles(now: number): string[] {
    const expired: string[] = [];

    try {
      const files = require('fs').readdirSync(this.locksDir);

      for (const file of files) {
        if (!file.endsWith('.lock')) continue;

        const lockFilePath = join(this.locksDir, file);
        try {
          const content = readFileSync(lockFilePath, 'utf-8');
          const lockData = JSON.parse(content);

          if (now > lockData.expiresAt) {
            expired.push(lockFilePath);
          }
        } catch {
          // Invalid lock file, consider it expired
          expired.push(lockFilePath);
        }
      }
    } catch (error) {
      console.error('Failed to read locks directory:', error);
    }

    return expired;
  }

  /**
   * Generate unique lock ID
   */
  private generateLockId(resourceId: string): string {
    return `${resourceId}-${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Ensure locks directory exists
   */
  private ensureLocksDir(): void {
    if (!existsSync(this.locksDir)) {
      mkdirSync(this.locksDir, { recursive: true });
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clean up all locks on process exit
   */
  public setupCleanupHandlers(): void {
    const cleanup = async () => {
      for (const [resourceId, lockInfo] of this.activeLocks.entries()) {
        await this.releaseLock(resourceId, lockInfo.lockId);
      }
    };

    process.on('exit', () => {
      // Synchronous cleanup
      for (const [resourceId] of this.activeLocks.entries()) {
        this.releaseFileLock(resourceId);
      }
    });

    process.on('SIGINT', async () => {
      await cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await cleanup();
      process.exit(0);
    });

    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);
      await cleanup();
      process.exit(1);
    });
  }
}

// Singleton instance
let lockServiceInstance: WorktreeLockService | null = null;

export function getWorktreeLockService(locksDir?: string): WorktreeLockService {
  if (!lockServiceInstance || locksDir) {
    lockServiceInstance = new WorktreeLockService(locksDir);
    lockServiceInstance.setupCleanupHandlers();
  }
  return lockServiceInstance;
}

export function resetWorktreeLockService(): void {
  lockServiceInstance = null;
}
