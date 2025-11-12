/**
 * Worktree Lifecycle Service
 * Coordinates monitoring and cleanup services for complete lifecycle management
 */

import {
  WorktreeMonitorService,
  getWorktreeMonitorService,
  type MonitorConfig,
  type WorktreeStatusCheckResult,
} from './worktree-monitor.service';
import {
  WorktreeCleanupService,
  getWorktreeCleanupService,
  type CleanupConfig,
  type CleanupResult,
} from './worktree-cleanup.service';

export interface LifecycleConfig {
  monitor?: MonitorConfig;
  cleanup?: CleanupConfig;
  enableAutoCleanup?: boolean; // Connect monitor events to cleanup
}

/**
 * Worktree lifecycle service coordinating monitoring and cleanup
 */
export class WorktreeLifecycleService {
  private monitorService: WorktreeMonitorService;
  private cleanupService: WorktreeCleanupService;
  private config: LifecycleConfig;

  constructor(config?: LifecycleConfig) {
    this.config = {
      enableAutoCleanup: config?.enableAutoCleanup ?? true,
      ...config,
    };

    this.monitorService = getWorktreeMonitorService(config?.monitor);
    this.cleanupService = getWorktreeCleanupService(config?.cleanup);

    this.setupIntegration();
  }

  /**
   * Setup integration between monitoring and cleanup services
   */
  private setupIntegration(): void {
    if (!this.config.enableAutoCleanup) {
      return;
    }

    // When monitor detects stale worktree, schedule cleanup
    this.monitorService.on('worktree-stale', async (result: WorktreeStatusCheckResult) => {
      console.log(`Stale worktree detected: ${result.worktreeId}, scheduling cleanup`);

      try {
        const worktree = {
          id: result.worktreeId,
          path: result.path,
          branch: result.branch,
          status: result.newStatus,
          projectId: '', // Will be filled by repository
          issueId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastActivity: result.lastActivity,
        };

        await this.cleanupService.scheduleCleanup(worktree as any);
      } catch (error) {
        console.error(`Failed to schedule cleanup for ${result.worktreeId}:`, error);
      }
    });

    // Forward cleanup events
    this.cleanupService.on('cleanup-scheduled', (data) => {
      console.log(`Cleanup scheduled for worktree: ${data.worktree.id} at ${data.scheduledAt}`);
    });

    this.cleanupService.on('cleanup-executed', (result: CleanupResult) => {
      console.log(`Cleanup executed for worktree: ${result.worktreeId}`);
    });

    this.cleanupService.on('cleanup-failed', (result: CleanupResult) => {
      console.error(`Cleanup failed for worktree: ${result.worktreeId}`, result.error);
    });

    // Forward monitor events
    this.monitorService.on('worktree-dirty-warning', (result: WorktreeStatusCheckResult) => {
      console.log(
        `Worktree ${result.worktreeId} has been dirty for ${Math.floor(result.timeSinceLastActivity / 1000 / 60)} minutes`
      );
    });
  }

  /**
   * Start the lifecycle management system
   */
  public start(): void {
    console.log('Starting worktree lifecycle management...');
    this.monitorService.start();
  }

  /**
   * Stop the lifecycle management system
   */
  public stop(): void {
    console.log('Stopping worktree lifecycle management...');
    this.monitorService.stop();
    this.cleanupService.shutdown();
  }

  /**
   * Get monitor service
   */
  public getMonitor(): WorktreeMonitorService {
    return this.monitorService;
  }

  /**
   * Get cleanup service
   */
  public getCleanup(): WorktreeCleanupService {
    return this.cleanupService;
  }

  /**
   * Force immediate check and cleanup cycle
   */
  public async forceCheck(): Promise<void> {
    console.log('Forcing immediate worktree check...');
    const results = await this.monitorService.forceCheck();

    if (this.config.enableAutoCleanup) {
      const staleWorktrees = results.filter((r) => r.needsStaleMarking);
      console.log(`Found ${staleWorktrees.length} stale worktrees to schedule for cleanup`);
    }
  }

  /**
   * Get system status
   */
  public getStatus(): {
    monitor: ReturnType<WorktreeMonitorService['getStatus']>;
    pendingCleanups: ReturnType<WorktreeCleanupService['getPendingCleanups']>;
  } {
    return {
      monitor: this.monitorService.getStatus(),
      pendingCleanups: this.cleanupService.getPendingCleanups(),
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<LifecycleConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.monitor) {
      this.monitorService.updateConfig(config.monitor);
    }

    if (config.cleanup) {
      this.cleanupService.updateConfig(config.cleanup);
    }
  }
}

// Singleton instance
let lifecycleServiceInstance: WorktreeLifecycleService | null = null;

export function getWorktreeLifecycleService(
  config?: LifecycleConfig
): WorktreeLifecycleService {
  if (!lifecycleServiceInstance || config) {
    lifecycleServiceInstance = new WorktreeLifecycleService(config);
  }
  return lifecycleServiceInstance;
}

export function resetWorktreeLifecycleService(): void {
  if (lifecycleServiceInstance) {
    lifecycleServiceInstance.stop();
    lifecycleServiceInstance = null;
  }
}

// Auto-start lifecycle management if configured
if (process.env.WORKTREE_LIFECYCLE_AUTO_START === 'true') {
  const lifecycle = getWorktreeLifecycleService({
    enableAutoCleanup: process.env.WORKTREE_AUTO_CLEANUP !== 'false',
  });
  lifecycle.start();

  // Setup cleanup on process exit
  process.on('exit', () => {
    lifecycle.stop();
  });

  process.on('SIGINT', () => {
    lifecycle.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    lifecycle.stop();
    process.exit(0);
  });
}
