#!/usr/bin/env node
/**
 * Worktree CLI Commands
 * CLI interface for managing git worktrees
 */

import { Command } from 'commander';
import ora from 'ora';
import Table from 'cli-table3';
import { getWorktreeService } from '../services/worktree.service';
import { getWorktreeLifecycleService } from '../services/worktree-lifecycle.service';
import { worktreeRepository } from '../repositories/worktree.repository';
import { WorktreeStatus } from '../types/worktree';
import type { Worktree } from '../lib/db';

const program = new Command();

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date | null): string {
  if (!date) return 'Never';

  const now = Date.now();
  const timestamp = date.getTime();
  const diff = now - timestamp;

  // Less than 1 hour
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / 60 / 1000);
    return `${minutes}m ago`;
  }

  // Less than 1 day
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / 60 / 60 / 1000);
    return `${hours}h ago`;
  }

  // Less than 7 days
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / 24 / 60 / 60 / 1000);
    return `${days}d ago`;
  }

  // Format as date
  return date.toISOString().split('T')[0];
}

/**
 * Get status color for terminal output
 */
function getStatusColor(status: string): string {
  switch (status) {
    case WorktreeStatus.ACTIVE:
      return '\x1b[32m'; // Green
    case WorktreeStatus.DIRTY:
      return '\x1b[33m'; // Yellow
    case WorktreeStatus.STALE:
      return '\x1b[31m'; // Red
    case WorktreeStatus.REMOVED:
      return '\x1b[90m'; // Gray
    default:
      return '\x1b[0m'; // Reset
  }
}

/**
 * Reset terminal color
 */
const RESET_COLOR = '\x1b[0m';

/**
 * List all worktrees
 */
program
  .command('list')
  .description('List all worktrees')
  .option('-p, --project <projectId>', 'Filter by project ID')
  .option('-s, --status <status>', 'Filter by status (ACTIVE, STALE, DIRTY, REMOVED)')
  .option('-a, --all', 'Show all worktrees including removed')
  .action(async (options) => {
    const spinner = ora('Loading worktrees...').start();

    try {
      // Build filters
      const filters: any = {};
      if (options.project) filters.projectId = options.project;
      if (options.status) filters.status = options.status.toUpperCase();
      if (!options.all && !options.status) {
        // Default: don't show removed worktrees
        filters.status = undefined;
      }

      const worktrees = await worktreeRepository.findMany(filters);
      spinner.stop();

      if (worktrees.length === 0) {
        console.log('\nNo worktrees found.');
        return;
      }

      // Create table
      const table = new Table({
        head: ['ID', 'Branch', 'Status', 'Path', 'Last Activity', 'Project'],
        colWidths: [15, 30, 12, 40, 15, 20],
        style: {
          head: ['cyan'],
        },
      });

      for (const wt of worktrees) {
        const statusColor = getStatusColor(wt.status);
        const projectName = (wt as any).project?.name || 'N/A';

        table.push([
          wt.id.substring(0, 12) + '...',
          wt.branch,
          `${statusColor}${wt.status}${RESET_COLOR}`,
          wt.path.replace(process.cwd(), '.'),
          formatTimestamp(wt.lastActivity),
          projectName,
        ]);
      }

      console.log('\n' + table.toString());
      console.log(`\nTotal: ${worktrees.length} worktrees\n`);
    } catch (error) {
      spinner.fail('Failed to list worktrees');
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Create a new worktree
 */
program
  .command('create')
  .description('Create a new worktree')
  .requiredOption('-p, --project <projectId>', 'Project ID')
  .requiredOption('-b, --branch <branch>', 'Branch name')
  .option('-i, --issue <issueId>', 'Issue ID')
  .option('--base <baseBranch>', 'Base branch for new branch', 'main')
  .option('--path <path>', 'Custom path for worktree')
  .option('--skip-validation', 'Skip pre-creation validation')
  .action(async (options) => {
    const spinner = ora('Creating worktree...').start();

    try {
      const worktreeService = getWorktreeService();

      const result = await worktreeService.createWorktree({
        projectId: options.project,
        issueId: options.issue,
        branch: options.branch,
        baseBranch: options.base,
        customPath: options.path,
        skipValidation: options.skipValidation,
      });

      if (result.success && result.worktree) {
        spinner.succeed('Worktree created successfully');

        console.log('\nWorktree Details:');
        console.log(`  ID: ${result.worktree.id}`);
        console.log(`  Branch: ${result.worktree.branch}`);
        console.log(`  Path: ${result.worktree.path}`);
        console.log(`  Status: ${getStatusColor(result.worktree.status)}${result.worktree.status}${RESET_COLOR}`);
        console.log();
      } else {
        spinner.fail('Failed to create worktree');
        console.error(`\nError: ${result.error}`);

        if (result.validationErrors && result.validationErrors.length > 0) {
          console.log('\nValidation Errors:');
          for (const err of result.validationErrors) {
            console.log(`  - ${err.message}`);
            if (err.hint) console.log(`    Hint: ${err.hint}`);
          }
        }
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Failed to create worktree');
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Prune stale worktrees
 */
program
  .command('prune')
  .description('Remove stale worktrees')
  .option('--force', 'Force removal without confirmation')
  .option('--dry-run', 'Show what would be pruned without actually removing')
  .option('--older-than <days>', 'Only prune worktrees older than N days', '3')
  .action(async (options) => {
    const spinner = ora('Finding stale worktrees...').start();

    try {
      const daysOld = parseInt(options.olderThan, 10);
      const staleThreshold = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

      const staleWorktrees = await worktreeRepository.findStale(staleThreshold);
      spinner.stop();

      if (staleWorktrees.length === 0) {
        console.log('\nNo stale worktrees found.');
        return;
      }

      // Display stale worktrees
      console.log(`\nFound ${staleWorktrees.length} stale worktrees (older than ${daysOld} days):\n`);

      const table = new Table({
        head: ['ID', 'Branch', 'Path', 'Last Activity'],
        colWidths: [15, 30, 40, 20],
      });

      for (const wt of staleWorktrees) {
        table.push([
          wt.id.substring(0, 12) + '...',
          wt.branch,
          wt.path.replace(process.cwd(), '.'),
          formatTimestamp(wt.lastActivity),
        ]);
      }

      console.log(table.toString());

      if (options.dryRun) {
        console.log('\n[DRY RUN] Would prune these worktrees (use --force to actually remove)\n');
        return;
      }

      // Confirm unless --force
      if (!options.force) {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question('\nProceed with removal? (yes/no): ', resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
          console.log('Pruning cancelled.');
          return;
        }
      }

      // Execute prune
      const pruneSpinner = ora('Pruning worktrees...').start();
      const worktreeService = getWorktreeService();
      const cleanupService = getWorktreeLifecycleService().getCleanup();

      let successCount = 0;
      let failCount = 0;

      for (const wt of staleWorktrees) {
        try {
          const result = await cleanupService.forceCleanup(wt.id);
          if (result.success) {
            successCount++;
            pruneSpinner.text = `Pruned ${successCount}/${staleWorktrees.length} worktrees...`;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
        }
      }

      pruneSpinner.stop();

      console.log(`\n✓ Successfully pruned ${successCount} worktrees`);
      if (failCount > 0) {
        console.log(`✗ Failed to prune ${failCount} worktrees`);
      }
      console.log();
    } catch (error) {
      spinner.fail('Failed to prune worktrees');
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Show worktree status summary
 */
program
  .command('status')
  .description('Show worktree status summary')
  .action(async () => {
    const spinner = ora('Loading status...').start();

    try {
      const stats = await worktreeRepository.getStatistics();
      const lifecycleService = getWorktreeLifecycleService();
      const lifecycleStatus = lifecycleService.getStatus();

      spinner.stop();

      console.log('\n╭─────────────────────────────────────╮');
      console.log('│   Worktree Status Summary           │');
      console.log('╰─────────────────────────────────────╯\n');

      console.log('Worktree Statistics:');
      console.log(`  Total:   ${stats.total}`);
      console.log(`  ${getStatusColor(WorktreeStatus.ACTIVE)}Active:  ${stats.active}${RESET_COLOR}`);
      console.log(`  ${getStatusColor(WorktreeStatus.DIRTY)}Dirty:   ${stats.dirty}${RESET_COLOR}`);
      console.log(`  ${getStatusColor(WorktreeStatus.STALE)}Stale:   ${stats.stale}${RESET_COLOR}`);
      console.log(`  ${getStatusColor(WorktreeStatus.REMOVED)}Removed: ${stats.removed}${RESET_COLOR}`);

      console.log('\nMonitor Status:');
      console.log(`  Running:    ${lifecycleStatus.monitor.isRunning ? '✓' : '✗'}`);
      console.log(`  Last Check: ${formatTimestamp(new Date(lifecycleStatus.monitor.lastCheck))}`);
      console.log(`  Next Check: ${formatTimestamp(new Date(lifecycleStatus.monitor.nextCheck))}`);

      console.log('\nCleanup Status:');
      console.log(`  Pending Cleanups: ${lifecycleStatus.pendingCleanups.length}`);

      if (lifecycleStatus.pendingCleanups.length > 0) {
        const cleanupTable = new Table({
          head: ['Worktree ID', 'Scheduled For'],
          colWidths: [25, 25],
        });

        for (const cleanup of lifecycleStatus.pendingCleanups) {
          cleanupTable.push([
            cleanup.worktreeId.substring(0, 12) + '...',
            formatTimestamp(cleanup.scheduledFor),
          ]);
        }

        console.log('\n' + cleanupTable.toString());
      }

      console.log();
    } catch (error) {
      spinner.fail('Failed to get status');
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Sync database with git worktrees
 */
program
  .command('sync')
  .description('Synchronize database with git worktrees')
  .action(async () => {
    const spinner = ora('Synchronizing...').start();

    try {
      const worktreeService = getWorktreeService();
      const result = await worktreeService.syncWithGit();

      spinner.succeed('Synchronization complete');

      console.log('\nSync Results:');
      console.log(`  Added:   ${result.added}`);
      console.log(`  Removed: ${result.removed}`);
      console.log(`  Updated: ${result.updated}`);
      console.log();
    } catch (error) {
      spinner.fail('Failed to sync');
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Force immediate check
 */
program
  .command('check')
  .description('Force immediate worktree status check')
  .action(async () => {
    const spinner = ora('Checking worktrees...').start();

    try {
      const lifecycleService = getWorktreeLifecycleService();
      await lifecycleService.forceCheck();

      spinner.succeed('Check complete');
      console.log('\nRun `worktrees status` to see the results.\n');
    } catch (error) {
      spinner.fail('Failed to check worktrees');
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Configure program
program
  .name('worktrees')
  .description('Manage git worktrees for Jellos')
  .version('1.0.0');

// Parse arguments
program.parse(process.argv);

// Show help if no command specified
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
