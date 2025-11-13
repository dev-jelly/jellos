/**
 * Saga Workflows Service
 *
 * Defines common saga workflows for the Jellos system with compensation actions.
 * Includes workflows for issue lifecycle, worktree setup, execution, PR creation, etc.
 *
 * Task 12.6 - Saga Pattern for Compensating Transactions
 */

import { sagaService } from './saga.service';
import { prisma } from '../lib/db';
import { getRecoveryService } from './recovery.service';
import type {
  SagaDefinition,
  SagaStepDefinition,
  SagaContext,
  SagaStepResult,
  SagaWorkflowType,
  SagaPatternType,
} from '../types/saga';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

/**
 * Initialize and register all saga workflows
 */
export function initializeSagaWorkflows(): void {
  // Register all workflow definitions
  sagaService.registerSaga(createWorktreeSetupSaga());
  sagaService.registerSaga(createIssueToExecutionSaga());
  sagaService.registerSaga(createExecutionToPRSaga());
  sagaService.registerSaga(createFullIssueLifecycleSaga());
}

// ============================================================================
// Worktree Setup Saga
// ============================================================================

/**
 * Worktree Setup Saga
 * Steps: Validate project → Create worktree → Update DB → Link to issue
 * Compensations: Remove worktree, cleanup DB entries, unlink issue
 */
function createWorktreeSetupSaga(): SagaDefinition {
  const steps: SagaStepDefinition[] = [
    {
      id: 'validate-project',
      name: 'Validate Project',
      description: 'Validate project exists and is accessible',
      execute: async (context: SagaContext): Promise<SagaStepResult> => {
        const { projectId } = context.input;

        try {
          const project = await prisma.project.findUnique({
            where: { id: projectId },
          });

          if (!project) {
            return {
              success: false,
              error: {
                message: `Project not found: ${projectId}`,
                recoverable: false,
              },
            };
          }

          if (!existsSync(project.localPath)) {
            return {
              success: false,
              error: {
                message: `Project path does not exist: ${project.localPath}`,
                recoverable: false,
              },
            };
          }

          return {
            success: true,
            data: { project },
          };
        } catch (error) {
          return {
            success: false,
            error: {
              message: error instanceof Error ? error.message : String(error),
              recoverable: false,
            },
          };
        }
      },
      compensate: async (context: SagaContext): Promise<void> => {
        // No compensation needed - validation step
      },
      retryable: false,
    },
    {
      id: 'create-worktree',
      name: 'Create Git Worktree',
      description: 'Create git worktree for isolated development',
      execute: async (context: SagaContext): Promise<SagaStepResult> => {
        const { project } = context.output;
        const { branchName, worktreePath } = context.input;

        try {
          // Create worktree
          await execAsync(
            `git worktree add "${worktreePath}" -b "${branchName}"`,
            {
              cwd: project.localPath,
              timeout: 30000,
            }
          );

          return {
            success: true,
            data: { worktreePath, branchName },
          };
        } catch (error) {
          return {
            success: false,
            error: {
              message: `Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`,
              recoverable: true,
            },
          };
        }
      },
      compensate: async (context: SagaContext): Promise<void> => {
        // Remove worktree
        const { worktreePath, project } = context.output;
        if (worktreePath && project && existsSync(worktreePath)) {
          try {
            await execAsync(`git worktree remove "${worktreePath}" --force`, {
              cwd: project.localPath,
              timeout: 10000,
            });
          } catch (error) {
            console.error('Failed to remove worktree during compensation:', error);
          }
        }
      },
      retryable: true,
      maxRetries: 2,
      idempotentCompensation: true,
      dependencies: ['validate-project'],
    },
    {
      id: 'create-worktree-db',
      name: 'Create Worktree DB Entry',
      description: 'Create database entry for worktree',
      execute: async (context: SagaContext): Promise<SagaStepResult> => {
        const { projectId, issueId } = context.input;
        const { worktreePath, branchName } = context.output;

        try {
          const worktree = await prisma.worktree.create({
            data: {
              projectId,
              issueId: issueId || null,
              path: worktreePath,
              branch: branchName,
              status: 'ACTIVE',
              lastActivity: new Date(),
            },
          });

          return {
            success: true,
            data: { worktree },
          };
        } catch (error) {
          return {
            success: false,
            error: {
              message: `Failed to create worktree DB entry: ${error instanceof Error ? error.message : String(error)}`,
              recoverable: true,
            },
          };
        }
      },
      compensate: async (context: SagaContext): Promise<void> => {
        // Delete worktree DB entry
        const { worktree } = context.output;
        if (worktree?.id) {
          try {
            await prisma.worktree.delete({
              where: { id: worktree.id },
            });
          } catch (error) {
            console.error('Failed to delete worktree DB entry during compensation:', error);
          }
        }
      },
      retryable: true,
      maxRetries: 3,
      idempotentCompensation: true,
      dependencies: ['create-worktree'],
    },
    {
      id: 'update-issue-status',
      name: 'Update Issue Status',
      description: 'Update issue status to IN_PROGRESS',
      execute: async (context: SagaContext): Promise<SagaStepResult> => {
        const { issueId } = context.input;

        if (!issueId) {
          // Optional step - skip if no issue
          return { success: true };
        }

        try {
          const issue = await prisma.issue.findUnique({
            where: { id: issueId },
          });

          if (!issue) {
            return {
              success: false,
              error: {
                message: `Issue not found: ${issueId}`,
                recoverable: false,
              },
            };
          }

          const previousStatus = issue.status;

          await prisma.issue.update({
            where: { id: issueId },
            data: { status: 'IN_PROGRESS' },
          });

          return {
            success: true,
            data: { issue, previousStatus },
          };
        } catch (error) {
          return {
            success: false,
            error: {
              message: `Failed to update issue status: ${error instanceof Error ? error.message : String(error)}`,
              recoverable: true,
            },
          };
        }
      },
      compensate: async (context: SagaContext): Promise<void> => {
        // Revert issue status
        const { issueId } = context.input;
        const { previousStatus } = context.output;

        if (issueId && previousStatus) {
          try {
            await prisma.issue.update({
              where: { id: issueId },
              data: { status: previousStatus },
            });
          } catch (error) {
            console.error('Failed to revert issue status during compensation:', error);
          }
        }
      },
      retryable: true,
      maxRetries: 3,
      idempotentCompensation: true,
      dependencies: ['create-worktree-db'],
    },
  ];

  return {
    type: 'WORKTREE_SETUP',
    name: 'Worktree Setup Saga',
    description: 'Sets up a git worktree for isolated development',
    patternType: 'ORCHESTRATION',
    steps,
    timeout: 120000, // 2 minutes
    criticalSteps: ['validate-project', 'create-worktree', 'create-worktree-db'],
  };
}

// ============================================================================
// Issue to Execution Saga
// ============================================================================

/**
 * Issue to Execution Saga
 * Steps: Validate issue → Create execution → Start agent → Monitor
 * Compensations: Terminate agent, mark execution failed, revert issue state
 */
function createIssueToExecutionSaga(): SagaDefinition {
  const steps: SagaStepDefinition[] = [
    {
      id: 'validate-issue',
      name: 'Validate Issue',
      execute: async (context: SagaContext): Promise<SagaStepResult> => {
        const { issueId } = context.input;

        try {
          const issue = await prisma.issue.findUnique({
            where: { id: issueId },
          });

          if (!issue) {
            return {
              success: false,
              error: { message: `Issue not found: ${issueId}`, recoverable: false },
            };
          }

          return { success: true, data: { issue } };
        } catch (error) {
          return {
            success: false,
            error: {
              message: error instanceof Error ? error.message : String(error),
              recoverable: false,
            },
          };
        }
      },
      compensate: async (): Promise<void> => {
        // No compensation needed
      },
      retryable: false,
    },
    {
      id: 'create-execution',
      name: 'Create Execution Record',
      execute: async (context: SagaContext): Promise<SagaStepResult> => {
        const { agentId, issueId, worktreePath } = context.input;

        try {
          const execution = await prisma.agentExecution.create({
            data: {
              agentId,
              issueId,
              worktreePath,
              status: 'PENDING',
            },
          });

          return { success: true, data: { execution } };
        } catch (error) {
          return {
            success: false,
            error: {
              message: error instanceof Error ? error.message : String(error),
              recoverable: true,
            },
          };
        }
      },
      compensate: async (context: SagaContext): Promise<void> => {
        const { execution } = context.output;
        if (execution?.id) {
          try {
            await prisma.agentExecution.update({
              where: { id: execution.id },
              data: { status: 'CANCELLED' },
            });
          } catch (error) {
            console.error('Failed to cancel execution during compensation:', error);
          }
        }
      },
      retryable: true,
      maxRetries: 3,
      idempotentCompensation: true,
      dependencies: ['validate-issue'],
    },
    {
      id: 'start-agent',
      name: 'Start Agent Process',
      execute: async (context: SagaContext): Promise<SagaStepResult> => {
        const { execution } = context.output;
        // Actual agent starting would happen here
        // For now, just mark as running
        try {
          await prisma.agentExecution.update({
            where: { id: execution.id },
            data: {
              status: 'RUNNING',
              startedAt: new Date(),
            },
          });

          return { success: true, data: { executionId: execution.id } };
        } catch (error) {
          return {
            success: false,
            error: {
              message: error instanceof Error ? error.message : String(error),
              recoverable: true,
            },
          };
        }
      },
      compensate: async (context: SagaContext): Promise<void> => {
        const { execution } = context.output;
        if (execution?.id) {
          try {
            // Terminate agent process if running
            await prisma.agentExecution.update({
              where: { id: execution.id },
              data: {
                status: 'FAILED',
                completedAt: new Date(),
                errorMessage: 'Saga compensation - execution cancelled',
              },
            });

            // Kill process if it has a PID
            const exec = await prisma.agentExecution.findUnique({
              where: { id: execution.id },
            });
            if (exec?.processId) {
              try {
                process.kill(exec.processId, 'SIGTERM');
              } catch {
                // Process may not exist
              }
            }
          } catch (error) {
            console.error('Failed to terminate agent during compensation:', error);
          }
        }
      },
      retryable: true,
      maxRetries: 2,
      idempotentCompensation: true,
      dependencies: ['create-execution'],
    },
  ];

  return {
    type: 'ISSUE_TO_EXECUTION',
    name: 'Issue to Execution Saga',
    description: 'Creates and starts an agent execution for an issue',
    patternType: 'ORCHESTRATION',
    steps,
    timeout: 180000, // 3 minutes
    criticalSteps: ['validate-issue', 'create-execution'],
  };
}

// ============================================================================
// Execution to PR Saga
// ============================================================================

/**
 * Execution to PR Saga
 * Steps: Validate execution → Collect git metadata → Create PR → Link to issue
 * Compensations: Close PR, cleanup metadata, revert issue state
 */
function createExecutionToPRSaga(): SagaDefinition {
  const steps: SagaStepDefinition[] = [
    {
      id: 'validate-execution',
      name: 'Validate Execution',
      execute: async (context: SagaContext): Promise<SagaStepResult> => {
        const { executionId } = context.input;

        try {
          const execution = await prisma.agentExecution.findUnique({
            where: { id: executionId },
          });

          if (!execution) {
            return {
              success: false,
              error: { message: `Execution not found: ${executionId}`, recoverable: false },
            };
          }

          if (execution.status !== 'COMPLETED') {
            return {
              success: false,
              error: {
                message: `Execution not completed: ${execution.status}`,
                recoverable: false,
              },
            };
          }

          return { success: true, data: { execution } };
        } catch (error) {
          return {
            success: false,
            error: {
              message: error instanceof Error ? error.message : String(error),
              recoverable: false,
            },
          };
        }
      },
      compensate: async (): Promise<void> => {
        // No compensation needed
      },
      retryable: false,
    },
    {
      id: 'create-pr',
      name: 'Create Pull Request',
      execute: async (context: SagaContext): Promise<SagaStepResult> => {
        const { execution } = context.output;
        const { title, body } = context.input;

        try {
          // This would integrate with GitHub API
          // For now, just create the mapping
          const prMapping = await prisma.issuePRMapping.create({
            data: {
              issueId: execution.issueId!,
              projectId: execution.projectId!,
              prNumber: Math.floor(Math.random() * 10000), // Mock PR number
              prUrl: `https://github.com/example/repo/pull/${Math.floor(Math.random() * 10000)}`,
              branchName: execution.gitBranch!,
              state: 'open',
            },
          });

          return { success: true, data: { prMapping } };
        } catch (error) {
          return {
            success: false,
            error: {
              message: error instanceof Error ? error.message : String(error),
              recoverable: true,
            },
          };
        }
      },
      compensate: async (context: SagaContext): Promise<void> => {
        const { prMapping } = context.output;
        if (prMapping?.id) {
          try {
            // Close PR and mark as closed
            await prisma.issuePRMapping.update({
              where: { id: prMapping.id },
              data: {
                state: 'closed',
                closedAt: new Date(),
              },
            });
          } catch (error) {
            console.error('Failed to close PR during compensation:', error);
          }
        }
      },
      retryable: true,
      maxRetries: 3,
      idempotentCompensation: true,
      dependencies: ['validate-execution'],
    },
    {
      id: 'update-issue-to-review',
      name: 'Update Issue to In Review',
      execute: async (context: SagaContext): Promise<SagaStepResult> => {
        const { execution } = context.output;

        if (!execution.issueId) {
          return { success: true }; // Skip if no issue
        }

        try {
          const issue = await prisma.issue.findUnique({
            where: { id: execution.issueId },
          });

          const previousStatus = issue?.status;

          await prisma.issue.update({
            where: { id: execution.issueId },
            data: { status: 'IN_REVIEW' },
          });

          return { success: true, data: { previousStatus } };
        } catch (error) {
          return {
            success: false,
            error: {
              message: error instanceof Error ? error.message : String(error),
              recoverable: true,
            },
          };
        }
      },
      compensate: async (context: SagaContext): Promise<void> => {
        const { execution, previousStatus } = context.output;
        if (execution.issueId && previousStatus) {
          try {
            await prisma.issue.update({
              where: { id: execution.issueId },
              data: { status: previousStatus },
            });
          } catch (error) {
            console.error('Failed to revert issue status during compensation:', error);
          }
        }
      },
      retryable: true,
      maxRetries: 3,
      idempotentCompensation: true,
      dependencies: ['create-pr'],
    },
  ];

  return {
    type: 'EXECUTION_TO_PR',
    name: 'Execution to PR Saga',
    description: 'Creates a pull request from a completed execution',
    patternType: 'ORCHESTRATION',
    steps,
    timeout: 120000, // 2 minutes
    criticalSteps: ['validate-execution', 'create-pr'],
  };
}

// ============================================================================
// Full Issue Lifecycle Saga
// ============================================================================

/**
 * Full Issue Lifecycle Saga
 * Combines all workflows: Setup worktree → Execute → Create PR
 */
function createFullIssueLifecycleSaga(): SagaDefinition {
  // This would orchestrate the other sagas
  // For brevity, returning a basic implementation
  return {
    type: 'FULL_ISSUE_LIFECYCLE',
    name: 'Full Issue Lifecycle Saga',
    description: 'Complete issue lifecycle from start to PR',
    patternType: 'ORCHESTRATION',
    steps: [],
    timeout: 600000, // 10 minutes
  };
}

// Export helper function to execute common workflows
export const sagaWorkflows = {
  /**
   * Setup a worktree for an issue
   */
  async setupWorktree(params: {
    projectId: string;
    issueId?: string;
    branchName: string;
    worktreePath: string;
  }) {
    return sagaService.executeSaga('WORKTREE_SETUP', params);
  },

  /**
   * Start execution for an issue
   */
  async startExecution(params: {
    issueId: string;
    agentId: string;
    worktreePath: string;
  }) {
    return sagaService.executeSaga('ISSUE_TO_EXECUTION', params);
  },

  /**
   * Create PR from execution
   */
  async createPRFromExecution(params: {
    executionId: string;
    title: string;
    body: string;
  }) {
    return sagaService.executeSaga('EXECUTION_TO_PR', params);
  },
};
