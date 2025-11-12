/**
 * Worktree Monitor Service
 * Background scheduler for monitoring worktree status and detecting stale/dirty states
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { worktreeRepository } from '../repositories/worktree.repository';
import { WorktreeStatus } from '../types/worktree';
import type { Worktree } from '../lib/db';

const execAsync = promisify(exec);

export interface MonitorConfig {
  interval?: number; // Check interval in milliseconds (default: 5 minutes)
  dirtyThreshold?: number; // Time in ms before warning about dirty state (default: 1 hour)
  staleThreshold?: number; // Time in ms before marking as stale (default: 3 days)
  enableAutoStaleMarking?: boolean; // Automatically mark stale worktrees
}

export interface WorktreeStatusCheckResult {
  worktreeId: string;
  path: string;
  branch: string;
  isDirty: boolean;
  uncommittedChanges: number;
  lastActivity: Date | null;
  timeSinceLastActivity: number;
  previousStatus: string;
  newStatus: string;
  needsWarning: boolean;
  needsStaleMarking: boolean;
}

/**
 * Worktree monitoring service with background scheduling
 */
export class WorktreeMonitorService extends EventEmitter {
  private config: MonitorConfig;
  private interval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastCheckTimestamp: number = 0;

  constructor(config?: MonitorConfig) {
    super();
    this.config = {
      interval: config?.interval || 5 * 60 * 1000, // 5 minutes
      dirtyThreshold: config?.dirtyThreshold || 60 * 60 * 1000, // 1 hour
      staleThreshold: config?.staleThreshold || 3 * 24 * 60 * 60 * 1000, // 3 days
      enableAutoStaleMarking: config?.enableAutoStaleMarking ?? true,
    };
  }

  /**
   * Start the monitoring scheduler
   */
  public start(): void {
    if (this.isRunning) {
      console.warn('Worktree monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting worktree monitor...');

    // Run immediately on start
    this.checkAllWorktrees();

    // Schedule periodic checks
    this.interval = setInterval(() => {
      this.checkAllWorktrees();
    }, this.config.interval);

    this.emit('started');
  }

  /**
   * Stop the monitoring scheduler
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isRunning = false;
    console.log('Worktree monitor stopped');
    this.emit('stopped');
  }

  /**
   * Check all active worktrees
   */
  public async checkAllWorktrees(): Promise<WorktreeStatusCheckResult[]> {
    const now = Date.now();
    this.lastCheckTimestamp = now;

    try {
      const activeWorktrees = await worktreeRepository.findActive();
      const results: WorktreeStatusCheckResult[] = [];

      for (const worktree of activeWorktrees) {
        try {
          const result = await this.checkWorktree(worktree, now);
          results.push(result);

          // Emit events based on check results
          this.emitEvents(result);

          // Auto-update status if needed
          if (result.newStatus !== result.previousStatus) {
            await this.updateWorktreeStatus(result);
          }
        } catch (error) {
          console.error(`Failed to check worktree ${worktree.id}:`, error);
          this.emit('check-error', {
            worktree,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      this.emit('check-completed', {
        timestamp: now,
        checked: results.length,
        warnings: results.filter((r) => r.needsWarning).length,
        stale: results.filter((r) => r.needsStaleMarking).length,
      });

      return results;
    } catch (error) {
      console.error('Failed to check worktrees:', error);
      this.emit('error', error);
      return [];
    }
  }

  /**
   * Check individual worktree status
   */
  private async checkWorktree(
    worktree: Worktree,
    now: number
  ): Promise<WorktreeStatusCheckResult> {
    const isDirty = await this.checkDirtyStatus(worktree.path);
    const uncommittedChanges = isDirty ? await this.countUncommittedChanges(worktree.path) : 0;

    const lastActivity = worktree.lastActivity || worktree.createdAt;
    const timeSinceLastActivity = now - lastActivity.getTime();

    const needsWarning =
      isDirty && timeSinceLastActivity > (this.config.dirtyThreshold || 0);
    const needsStaleMarking =
      !isDirty && timeSinceLastActivity > (this.config.staleThreshold || 0);

    let newStatus = worktree.status;

    if (needsStaleMarking && this.config.enableAutoStaleMarking) {
      newStatus = WorktreeStatus.STALE;
    } else if (isDirty) {
      newStatus = WorktreeStatus.DIRTY;
    } else if (worktree.status === WorktreeStatus.DIRTY && !isDirty) {
      // Clean up: was dirty, now clean
      newStatus = WorktreeStatus.ACTIVE;
    }

    return {
      worktreeId: worktree.id,
      path: worktree.path,
      branch: worktree.branch,
      isDirty,
      uncommittedChanges,
      lastActivity,
      timeSinceLastActivity,
      previousStatus: worktree.status,
      newStatus,
      needsWarning,
      needsStaleMarking,
    };
  }

  /**
   * Check if worktree has uncommitted changes using git status --porcelain
   */
  private async checkDirtyStatus(path: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync('git status --porcelain', {
        cwd: path,
        timeout: 10000,
      });

      return stdout.trim().length > 0;
    } catch (error) {
      console.error(`Failed to check dirty status for ${path}:`, error);
      return false;
    }
  }

  /**
   * Count uncommitted changes in worktree
   */
  private async countUncommittedChanges(path: string): Promise<number> {
    try {
      const { stdout } = await execAsync('git status --porcelain', {
        cwd: path,
        timeout: 10000,
      });

      const lines = stdout.trim().split('\n').filter((line) => line.length > 0);
      return lines.length;
    } catch (error) {
      console.error(`Failed to count changes for ${path}:`, error);
      return 0;
    }
  }

  /**
   * Update worktree status in database
   */
  private async updateWorktreeStatus(result: WorktreeStatusCheckResult): Promise<void> {
    try {
      await worktreeRepository.updateStatus(result.worktreeId, result.newStatus);
      console.log(
        `Updated worktree ${result.worktreeId} status: ${result.previousStatus} -> ${result.newStatus}`
      );
    } catch (error) {
      console.error(`Failed to update worktree status:`, error);
    }
  }

  /**
   * Emit events based on check results
   */
  private emitEvents(result: WorktreeStatusCheckResult): void {
    if (result.isDirty) {
      this.emit('worktree-dirty', result);
    }

    if (result.needsWarning) {
      this.emit('worktree-dirty-warning', result);
    }

    if (result.needsStaleMarking) {
      this.emit('worktree-stale', result);
    }

    if (result.newStatus !== result.previousStatus) {
      this.emit('worktree-status-changed', result);
    }
  }

  /**
   * Get monitor status
   */
  public getStatus(): {
    isRunning: boolean;
    lastCheck: number;
    nextCheck: number;
    config: MonitorConfig;
  } {
    return {
      isRunning: this.isRunning,
      lastCheck: this.lastCheckTimestamp,
      nextCheck: this.lastCheckTimestamp + (this.config.interval || 0),
      config: this.config,
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<MonitorConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart if interval changed
    if (config.interval && this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Force immediate check
   */
  public async forceCheck(): Promise<WorktreeStatusCheckResult[]> {
    console.log('Forcing immediate worktree check...');
    return this.checkAllWorktrees();
  }
}

// Singleton instance
let monitorServiceInstance: WorktreeMonitorService | null = null;

export function getWorktreeMonitorService(
  config?: MonitorConfig
): WorktreeMonitorService {
  if (!monitorServiceInstance || config) {
    monitorServiceInstance = new WorktreeMonitorService(config);
  }
  return monitorServiceInstance;
}

export function resetWorktreeMonitorService(): void {
  if (monitorServiceInstance) {
    monitorServiceInstance.stop();
    monitorServiceInstance = null;
  }
}

// Start monitor on module load (can be configured via env)
if (process.env.WORKTREE_MONITOR_AUTO_START === 'true') {
  const monitor = getWorktreeMonitorService();
  monitor.start();

  // Setup cleanup on process exit
  process.on('exit', () => {
    monitor.stop();
  });

  process.on('SIGINT', () => {
    monitor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    monitor.stop();
    process.exit(0);
  });
}
