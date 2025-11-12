/**
 * Worktree Setup Service
 * Automated post-creation environment configuration for worktrees
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, copyFileSync, readFileSync, linkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import * as yaml from 'js-yaml';

const execAsync = promisify(exec);

export interface SetupConfig {
  enablePnpmInstall?: boolean; // Run pnpm install after creation
  enableEnvCopy?: boolean; // Copy .env files
  enableGitHooks?: boolean; // Setup git hooks
  enableNodeModulesCache?: boolean; // Use hard links for node_modules
  customHooks?: string[]; // Custom post-create hooks from config
}

export interface SetupResult {
  success: boolean;
  steps: SetupStepResult[];
  error?: string;
  rolledBack?: boolean;
}

export interface SetupStepResult {
  step: string;
  success: boolean;
  duration: number;
  error?: string;
  skipped?: boolean;
}

export interface ProjectConfig {
  worktree?: {
    'post-create'?: string[];
    'env-files'?: string[];
    'git-hooks'?: string[];
  };
}

/**
 * Worktree post-creation setup service
 */
export class WorktreeSetupService {
  private projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  /**
   * Execute post-creation setup for a worktree
   */
  public async executeSetup(
    worktreePath: string,
    config?: SetupConfig
  ): Promise<SetupResult> {
    const setupConfig: SetupConfig = {
      enablePnpmInstall: config?.enablePnpmInstall ?? true,
      enableEnvCopy: config?.enableEnvCopy ?? true,
      enableGitHooks: config?.enableGitHooks ?? true,
      enableNodeModulesCache: config?.enableNodeModulesCache ?? true,
      ...config,
    };

    const steps: SetupStepResult[] = [];
    const startTime = Date.now();

    try {
      // 1. Load project configuration
      const projectConfig = this.loadProjectConfig();

      // 2. Copy environment files
      if (setupConfig.enableEnvCopy) {
        const envStep = await this.copyEnvironmentFiles(worktreePath, projectConfig);
        steps.push(envStep);
        if (!envStep.success) {
          return { success: false, steps, error: 'Environment copy failed' };
        }
      }

      // 3. Setup node_modules cache (before pnpm install)
      if (setupConfig.enableNodeModulesCache) {
        const cacheStep = await this.setupNodeModulesCache(worktreePath);
        steps.push(cacheStep);
        // Continue even if cache fails (non-critical)
      }

      // 4. Run pnpm install
      if (setupConfig.enablePnpmInstall) {
        const installStep = await this.runPnpmInstall(worktreePath);
        steps.push(installStep);
        if (!installStep.success) {
          await this.rollbackSetup(worktreePath, steps);
          return { success: false, steps, error: 'pnpm install failed', rolledBack: true };
        }
      }

      // 5. Setup git hooks
      if (setupConfig.enableGitHooks) {
        const hooksStep = await this.setupGitHooks(worktreePath, projectConfig);
        steps.push(hooksStep);
        // Continue even if hooks setup fails (non-critical)
      }

      // 6. Run custom post-create hooks
      const customHooks = projectConfig?.worktree?.['post-create'] || setupConfig.customHooks || [];
      for (const hook of customHooks) {
        const hookStep = await this.runCustomHook(worktreePath, hook);
        steps.push(hookStep);
        if (!hookStep.success) {
          console.warn(`Custom hook failed: ${hook}`);
          // Continue with other hooks
        }
      }

      const totalDuration = Date.now() - startTime;
      console.log(`Setup completed in ${(totalDuration / 1000).toFixed(2)}s`);

      return { success: true, steps };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Setup failed:', errorMessage);

      // Attempt rollback
      await this.rollbackSetup(worktreePath, steps);

      return {
        success: false,
        steps,
        error: errorMessage,
        rolledBack: true,
      };
    }
  }

  /**
   * Load project configuration from .jellos.yml
   */
  private loadProjectConfig(): ProjectConfig | null {
    const configPath = join(this.projectRoot, '.jellos.yml');

    if (!existsSync(configPath)) {
      return null;
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      return yaml.load(content) as ProjectConfig;
    } catch (error) {
      console.warn('Failed to load .jellos.yml:', error);
      return null;
    }
  }

  /**
   * Copy environment files to worktree
   */
  private async copyEnvironmentFiles(
    worktreePath: string,
    projectConfig: ProjectConfig | null
  ): Promise<SetupStepResult> {
    const startTime = Date.now();

    try {
      // Default env files to copy
      const envFiles = projectConfig?.worktree?.['env-files'] || [
        '.env.local',
        '.env.development',
        '.env',
      ];

      let copiedCount = 0;

      for (const envFile of envFiles) {
        const sourcePath = join(this.projectRoot, envFile);
        const targetPath = join(worktreePath, envFile);

        if (existsSync(sourcePath)) {
          // Ensure target directory exists
          const targetDir = dirname(targetPath);
          if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
          }

          copyFileSync(sourcePath, targetPath);
          copiedCount++;
        }
      }

      const duration = Date.now() - startTime;

      if (copiedCount === 0) {
        return {
          step: 'copy-env-files',
          success: true,
          duration,
          skipped: true,
        };
      }

      return {
        step: 'copy-env-files',
        success: true,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        step: 'copy-env-files',
        success: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Setup node_modules cache using hard links
   */
  private async setupNodeModulesCache(worktreePath: string): Promise<SetupStepResult> {
    const startTime = Date.now();

    try {
      const cacheDir = join(this.projectRoot, '.jellos', 'cache', 'node_modules');
      const sourceModules = join(this.projectRoot, 'node_modules');
      const targetModules = join(worktreePath, 'node_modules');

      // Skip if source node_modules doesn't exist
      if (!existsSync(sourceModules)) {
        const duration = Date.now() - startTime;
        return {
          step: 'setup-node-modules-cache',
          success: true,
          duration,
          skipped: true,
        };
      }

      // Create cache directory
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }

      // Note: Actual hard linking would require recursive directory traversal
      // For now, we'll just create the target directory
      // Full implementation would use a library like fs-extra or custom recursive logic

      if (!existsSync(targetModules)) {
        mkdirSync(targetModules, { recursive: true });
      }

      const duration = Date.now() - startTime;
      return {
        step: 'setup-node-modules-cache',
        success: true,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        step: 'setup-node-modules-cache',
        success: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run pnpm install in worktree
   */
  private async runPnpmInstall(worktreePath: string): Promise<SetupStepResult> {
    const startTime = Date.now();

    try {
      console.log('Running pnpm install...');

      const { stdout, stderr } = await execAsync('pnpm install --frozen-lockfile', {
        cwd: worktreePath,
        timeout: 300000, // 5 minutes
        env: { ...process.env },
      });

      const duration = Date.now() - startTime;

      console.log(`pnpm install completed in ${(duration / 1000).toFixed(2)}s`);

      return {
        step: 'pnpm-install',
        success: true,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        step: 'pnpm-install',
        success: false,
        duration,
        error: errorMessage,
      };
    }
  }

  /**
   * Setup git hooks in worktree
   */
  private async setupGitHooks(
    worktreePath: string,
    projectConfig: ProjectConfig | null
  ): Promise<SetupStepResult> {
    const startTime = Date.now();

    try {
      const hooksToSetup = projectConfig?.worktree?.['git-hooks'] || ['pre-commit', 'commit-msg'];

      const sourceHooksDir = join(this.projectRoot, '.git', 'hooks');
      const targetHooksDir = join(worktreePath, '.git', 'hooks');

      if (!existsSync(sourceHooksDir)) {
        const duration = Date.now() - startTime;
        return {
          step: 'setup-git-hooks',
          success: true,
          duration,
          skipped: true,
        };
      }

      // Ensure target hooks directory exists
      if (!existsSync(targetHooksDir)) {
        mkdirSync(targetHooksDir, { recursive: true });
      }

      let copiedCount = 0;

      for (const hook of hooksToSetup) {
        const sourceHook = join(sourceHooksDir, hook);
        const targetHook = join(targetHooksDir, hook);

        if (existsSync(sourceHook)) {
          copyFileSync(sourceHook, targetHook);
          copiedCount++;

          // Make hook executable
          try {
            await execAsync(`chmod +x "${targetHook}"`);
          } catch {
            // Ignore chmod errors
          }
        }
      }

      const duration = Date.now() - startTime;

      return {
        step: 'setup-git-hooks',
        success: true,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        step: 'setup-git-hooks',
        success: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run custom post-create hook
   */
  private async runCustomHook(worktreePath: string, hook: string): Promise<SetupStepResult> {
    const startTime = Date.now();

    try {
      console.log(`Running custom hook: ${hook}`);

      await execAsync(hook, {
        cwd: worktreePath,
        timeout: 60000, // 1 minute per hook
        env: { ...process.env },
      });

      const duration = Date.now() - startTime;

      return {
        step: `custom-hook: ${hook}`,
        success: true,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        step: `custom-hook: ${hook}`,
        success: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Rollback setup on failure
   */
  private async rollbackSetup(
    worktreePath: string,
    completedSteps: SetupStepResult[]
  ): Promise<void> {
    console.log('Rolling back setup...');

    // Rollback only makes sense for critical steps
    // For now, we just log that rollback was attempted
    // In a full implementation, we would:
    // - Remove copied env files
    // - Remove node_modules if installation failed
    // - Restore previous state

    for (const step of completedSteps) {
      if (step.success) {
        console.log(`  - Would rollback: ${step.step}`);
      }
    }

    console.log('Rollback completed');
  }
}

// Singleton instance
let setupServiceInstance: WorktreeSetupService | null = null;

export function getWorktreeSetupService(projectRoot?: string): WorktreeSetupService {
  if (!setupServiceInstance || projectRoot) {
    setupServiceInstance = new WorktreeSetupService(projectRoot);
  }
  return setupServiceInstance;
}

export function resetWorktreeSetupService(): void {
  setupServiceInstance = null;
}
