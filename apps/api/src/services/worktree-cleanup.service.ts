/**
 * Worktree Cleanup Service
 * Automated cleanup and notification system for stale worktrees
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { worktreeRepository } from '../repositories/worktree.repository';
import { WorktreeStatus } from '../types/worktree';
import type { Worktree } from '../lib/db';

const execAsync = promisify(exec);

export interface CleanupConfig {
  warningPeriod?: number; // Time before cleanup to send warning (default: 24 hours)
  autoClean?: boolean; // Automatically clean stale worktrees without confirmation
  notificationChannels?: NotificationChannel[];
  auditLogPath?: string;
}

export interface NotificationChannel {
  type: 'slack' | 'email' | 'webhook';
  url: string;
  enabled: boolean;
}

export interface CleanupWarning {
  worktreeId: string;
  path: string;
  branch: string;
  scheduledCleanupAt: Date;
  sentAt: Date;
}

export interface CleanupResult {
  worktreeId: string;
  path: string;
  branch: string;
  success: boolean;
  error?: string;
  cleanedAt: Date;
}

export interface AuditLogEntry {
  timestamp: Date;
  action: 'cleanup-warning' | 'cleanup-executed' | 'cleanup-cancelled' | 'cleanup-failed';
  worktreeId: string;
  path: string;
  branch: string;
  reason?: string;
  error?: string;
}

/**
 * Worktree cleanup service with automated cleaning and notifications
 */
export class WorktreeCleanupService extends EventEmitter {
  private config: CleanupConfig;
  private pendingCleanups: Map<string, NodeJS.Timeout>;
  private auditLogPath: string;

  constructor(config?: CleanupConfig) {
    super();
    this.config = {
      warningPeriod: config?.warningPeriod || 24 * 60 * 60 * 1000, // 24 hours
      autoClean: config?.autoClean ?? false,
      notificationChannels: config?.notificationChannels || [],
      auditLogPath: config?.auditLogPath || join(process.cwd(), '.jellos', 'logs', 'cleanup-audit.log'),
    };
    this.pendingCleanups = new Map();
    this.auditLogPath = this.config.auditLogPath!;
    this.ensureAuditLogDir();
  }

  /**
   * Schedule cleanup for stale worktrees with warning notification
   */
  public async scheduleCleanup(worktree: Worktree): Promise<void> {
    // Skip if already scheduled
    if (this.pendingCleanups.has(worktree.id)) {
      console.log(`Cleanup already scheduled for worktree ${worktree.id}`);
      return;
    }

    const scheduledCleanupAt = new Date(Date.now() + this.config.warningPeriod!);

    // Send warning notification
    await this.sendWarningNotification({
      worktreeId: worktree.id,
      path: worktree.path,
      branch: worktree.branch,
      scheduledCleanupAt,
      sentAt: new Date(),
    });

    // Log warning
    this.logAudit({
      timestamp: new Date(),
      action: 'cleanup-warning',
      worktreeId: worktree.id,
      path: worktree.path,
      branch: worktree.branch,
      reason: `Stale worktree scheduled for cleanup at ${scheduledCleanupAt.toISOString()}`,
    });

    // Schedule actual cleanup
    const timeoutId = setTimeout(async () => {
      if (this.config.autoClean) {
        await this.executeCleanup(worktree.id);
      } else {
        this.emit('cleanup-pending', {
          worktree,
          scheduledAt: scheduledCleanupAt,
        });
      }
      this.pendingCleanups.delete(worktree.id);
    }, this.config.warningPeriod);

    this.pendingCleanups.set(worktree.id, timeoutId);

    this.emit('cleanup-scheduled', {
      worktree,
      scheduledAt: scheduledCleanupAt,
    });
  }

  /**
   * Cancel scheduled cleanup for a worktree
   */
  public cancelCleanup(worktreeId: string): boolean {
    const timeoutId = this.pendingCleanups.get(worktreeId);
    if (!timeoutId) {
      return false;
    }

    clearTimeout(timeoutId);
    this.pendingCleanups.delete(worktreeId);

    this.logAudit({
      timestamp: new Date(),
      action: 'cleanup-cancelled',
      worktreeId,
      path: 'unknown',
      branch: 'unknown',
      reason: 'User cancelled cleanup',
    });

    this.emit('cleanup-cancelled', { worktreeId });
    return true;
  }

  /**
   * Execute cleanup for a worktree
   */
  public async executeCleanup(worktreeId: string): Promise<CleanupResult> {
    try {
      const worktree = await worktreeRepository.findById(worktreeId);

      if (!worktree) {
        throw new Error(`Worktree ${worktreeId} not found`);
      }

      // Execute git worktree remove --force
      await this.removeWorktreeDirectory(worktree.path);

      // Update database
      await worktreeRepository.markAsRemoved(worktreeId);

      const result: CleanupResult = {
        worktreeId,
        path: worktree.path,
        branch: worktree.branch,
        success: true,
        cleanedAt: new Date(),
      };

      // Log success
      this.logAudit({
        timestamp: new Date(),
        action: 'cleanup-executed',
        worktreeId,
        path: worktree.path,
        branch: worktree.branch,
        reason: 'Automatic cleanup of stale worktree',
      });

      // Send cleanup notification
      await this.sendCleanupNotification(result);

      this.emit('cleanup-executed', result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const result: CleanupResult = {
        worktreeId,
        path: 'unknown',
        branch: 'unknown',
        success: false,
        error: errorMessage,
        cleanedAt: new Date(),
      };

      // Log failure
      this.logAudit({
        timestamp: new Date(),
        action: 'cleanup-failed',
        worktreeId,
        path: 'unknown',
        branch: 'unknown',
        error: errorMessage,
      });

      this.emit('cleanup-failed', result);
      return result;
    }
  }

  /**
   * Cleanup all stale worktrees
   */
  public async cleanupAllStale(): Promise<CleanupResult[]> {
    const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days
    const staleWorktrees = await worktreeRepository.findStale(staleThreshold);

    console.log(`Found ${staleWorktrees.length} stale worktrees to schedule for cleanup`);

    const results: CleanupResult[] = [];

    for (const worktree of staleWorktrees) {
      if (worktree.status === WorktreeStatus.STALE) {
        await this.scheduleCleanup(worktree);
      }
    }

    return results;
  }

  /**
   * Force immediate cleanup without warning
   */
  public async forceCleanup(worktreeId: string): Promise<CleanupResult> {
    // Cancel any pending cleanup
    this.cancelCleanup(worktreeId);

    // Execute immediately
    return this.executeCleanup(worktreeId);
  }

  /**
   * Get pending cleanup schedule
   */
  public getPendingCleanups(): Array<{ worktreeId: string; scheduledFor: Date }> {
    const pending: Array<{ worktreeId: string; scheduledFor: Date }> = [];

    for (const [worktreeId] of this.pendingCleanups.entries()) {
      pending.push({
        worktreeId,
        scheduledFor: new Date(Date.now() + this.config.warningPeriod!),
      });
    }

    return pending;
  }

  /**
   * Send warning notification before cleanup
   */
  private async sendWarningNotification(warning: CleanupWarning): Promise<void> {
    const message = this.formatWarningMessage(warning);

    for (const channel of this.config.notificationChannels || []) {
      if (!channel.enabled) continue;

      try {
        await this.sendNotification(channel, message, 'warning');
      } catch (error) {
        console.error(`Failed to send warning notification via ${channel.type}:`, error);
      }
    }

    this.emit('notification-sent', {
      type: 'warning',
      warning,
    });
  }

  /**
   * Send cleanup completion notification
   */
  private async sendCleanupNotification(result: CleanupResult): Promise<void> {
    const message = this.formatCleanupMessage(result);

    for (const channel of this.config.notificationChannels || []) {
      if (!channel.enabled) continue;

      try {
        await this.sendNotification(channel, message, result.success ? 'success' : 'error');
      } catch (error) {
        console.error(`Failed to send cleanup notification via ${channel.type}:`, error);
      }
    }

    this.emit('notification-sent', {
      type: 'cleanup',
      result,
    });
  }

  /**
   * Send notification via configured channel
   */
  private async sendNotification(
    channel: NotificationChannel,
    message: string,
    level: 'warning' | 'success' | 'error'
  ): Promise<void> {
    const payload = this.formatPayload(channel.type, message, level);

    try {
      const response = await fetch(channel.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Notification failed: ${response.statusText}`);
      }
    } catch (error) {
      throw new Error(
        `Failed to send ${channel.type} notification: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Format warning message
   */
  private formatWarningMessage(warning: CleanupWarning): string {
    return `
⚠️ Worktree Cleanup Warning

Worktree ID: ${warning.worktreeId}
Path: ${warning.path}
Branch: ${warning.branch}
Scheduled Cleanup: ${warning.scheduledCleanupAt.toISOString()}

This worktree has been inactive and is scheduled for automatic cleanup in 24 hours.
If you need to keep this worktree, please use it or cancel the cleanup.
    `.trim();
  }

  /**
   * Format cleanup completion message
   */
  private formatCleanupMessage(result: CleanupResult): string {
    if (result.success) {
      return `
✅ Worktree Cleaned Up

Worktree ID: ${result.worktreeId}
Path: ${result.path}
Branch: ${result.branch}
Cleaned At: ${result.cleanedAt.toISOString()}

The stale worktree has been successfully removed.
      `.trim();
    } else {
      return `
❌ Worktree Cleanup Failed

Worktree ID: ${result.worktreeId}
Error: ${result.error}

Manual intervention may be required.
      `.trim();
    }
  }

  /**
   * Format payload for notification channel
   */
  private formatPayload(
    type: string,
    message: string,
    level: 'warning' | 'success' | 'error'
  ): any {
    switch (type) {
      case 'slack':
        return {
          text: message,
          attachments: [
            {
              color: level === 'warning' ? 'warning' : level === 'success' ? 'good' : 'danger',
              text: message,
            },
          ],
        };
      case 'email':
        return {
          subject: `Worktree Cleanup ${level === 'warning' ? 'Warning' : 'Notification'}`,
          body: message,
        };
      case 'webhook':
      default:
        return {
          level,
          message,
          timestamp: new Date().toISOString(),
        };
    }
  }

  /**
   * Remove worktree directory using git command
   */
  private async removeWorktreeDirectory(path: string): Promise<void> {
    try {
      await execAsync(`git worktree remove "${path}" --force`, {
        timeout: 30000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    } catch (error) {
      console.error(`Failed to remove worktree at ${path}:`, error);
      throw error;
    }
  }

  /**
   * Log audit entry
   */
  private logAudit(entry: AuditLogEntry): void {
    try {
      const logLine = JSON.stringify(entry) + '\n';
      appendFileSync(this.auditLogPath, logLine, 'utf-8');
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  /**
   * Ensure audit log directory exists
   */
  private ensureAuditLogDir(): void {
    const logDir = join(process.cwd(), '.jellos', 'logs');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<CleanupConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clean up all pending operations
   */
  public shutdown(): void {
    for (const [worktreeId, timeoutId] of this.pendingCleanups.entries()) {
      clearTimeout(timeoutId);
      this.pendingCleanups.delete(worktreeId);
    }
    console.log('Worktree cleanup service shut down');
  }
}

// Singleton instance
let cleanupServiceInstance: WorktreeCleanupService | null = null;

export function getWorktreeCleanupService(config?: CleanupConfig): WorktreeCleanupService {
  if (!cleanupServiceInstance || config) {
    cleanupServiceInstance = new WorktreeCleanupService(config);
  }
  return cleanupServiceInstance;
}

export function resetWorktreeCleanupService(): void {
  if (cleanupServiceInstance) {
    cleanupServiceInstance.shutdown();
    cleanupServiceInstance = null;
  }
}
