/**
 * Saga Pattern Usage Examples
 *
 * Examples demonstrating how to use the saga service for compensating transactions.
 * Task 12.6 - Saga Pattern for Compensating Transactions
 */

import { sagaService } from './saga.service';
import { initializeSagaWorkflows, sagaWorkflows } from './saga-workflows.service';
import {
  SagaDefinition,
  SagaStepDefinition,
  SagaContext,
  SagaWorkflowType,
} from '../types/saga';

/**
 * Example 1: Simple Saga with Automatic Compensation
 */
export async function exampleSimpleSaga() {
  // Define a simple saga for a payment workflow
  const paymentSaga: SagaDefinition = {
    type: 'CUSTOM' as SagaWorkflowType,
    name: 'Payment Processing Saga',
    description: 'Process payment with automatic rollback on failure',
    patternType: 'ORCHESTRATION',
    steps: [
      {
        id: 'reserve-inventory',
        name: 'Reserve Inventory',
        execute: async (context) => {
          // Reserve inventory
          console.log('Reserving inventory...');
          return { success: true, data: { reservationId: 'res-123' } };
        },
        compensate: async (context) => {
          // Release inventory
          console.log('Releasing inventory reservation:', context.output.reservationId);
        },
        retryable: true,
        maxRetries: 3,
      },
      {
        id: 'charge-payment',
        name: 'Charge Payment',
        execute: async (context) => {
          // Charge payment
          console.log('Charging payment...');
          // Simulate failure
          return {
            success: false,
            error: { message: 'Payment declined', recoverable: false },
          };
        },
        compensate: async (context) => {
          // Refund payment
          console.log('Refunding payment...');
        },
        retryable: false,
        dependencies: ['reserve-inventory'],
      },
      {
        id: 'send-confirmation',
        name: 'Send Confirmation',
        execute: async (context) => {
          // Send confirmation email
          console.log('Sending confirmation email...');
          return { success: true };
        },
        compensate: async (context) => {
          // Send cancellation email
          console.log('Sending cancellation email...');
        },
        dependencies: ['charge-payment'],
      },
    ],
    timeout: 60000,
    criticalSteps: ['reserve-inventory', 'charge-payment'],
  };

  // Register the saga
  sagaService.registerSaga(paymentSaga);

  try {
    // Execute the saga
    const instance = await sagaService.executeSaga(
      'CUSTOM',
      { orderId: 'order-123', amount: 100 },
      { autoCompensate: true } // Automatically compensate on failure
    );

    console.log('Saga completed:', instance.status);
  } catch (error) {
    console.error('Saga failed and was compensated:', error);
  }
}

/**
 * Example 2: Using Built-in Worktree Setup Saga
 */
export async function exampleWorktreeSetup() {
  // Initialize workflows
  initializeSagaWorkflows();

  try {
    // Setup a worktree for an issue
    const instance = await sagaWorkflows.setupWorktree({
      projectId: 'proj-123',
      issueId: 'issue-456',
      branchName: 'feature/new-feature',
      worktreePath: '/tmp/worktrees/feature-new-feature',
    });

    console.log('Worktree setup completed:', instance.id);
    console.log('Completed steps:', instance.completedSteps);
  } catch (error) {
    console.error('Worktree setup failed:', error);
    // Compensation will have automatically cleaned up:
    // - Removed git worktree
    // - Deleted DB entry
    // - Reverted issue status
  }
}

/**
 * Example 3: Manual Compensation
 */
export async function exampleManualCompensation() {
  const saga: SagaDefinition = {
    type: 'CUSTOM' as SagaWorkflowType,
    name: 'Manual Compensation Example',
    patternType: 'ORCHESTRATION',
    steps: [
      {
        id: 'step1',
        name: 'Step 1',
        execute: async () => {
          console.log('Executing step 1');
          return { success: true };
        },
        compensate: async () => {
          console.log('Compensating step 1');
        },
      },
      {
        id: 'step2',
        name: 'Step 2',
        execute: async () => {
          console.log('Executing step 2');
          return { success: true };
        },
        compensate: async () => {
          console.log('Compensating step 2');
        },
      },
    ],
  };

  sagaService.registerSaga(saga);

  // Execute without auto-compensation
  const instance = await sagaService.executeSaga(
    'CUSTOM',
    { data: 'test' },
    { autoCompensate: false }
  );

  // Later, manually trigger compensation
  await sagaService.compensateSaga(instance.id, {
    reverseOrder: true, // Compensate in reverse order (default)
    stopOnFailure: false, // Continue even if compensation fails
  });
}

/**
 * Example 4: Saga with Retry Logic
 */
export async function exampleRetryLogic() {
  let attemptCount = 0;

  const saga: SagaDefinition = {
    type: 'CUSTOM' as SagaWorkflowType,
    name: 'Retry Example',
    patternType: 'ORCHESTRATION',
    steps: [
      {
        id: 'unreliable-step',
        name: 'Unreliable Network Call',
        execute: async () => {
          attemptCount++;
          console.log(`Attempt ${attemptCount}`);

          // Fail first 2 times, succeed on 3rd
          if (attemptCount < 3) {
            return {
              success: false,
              error: { message: 'Network timeout', recoverable: true },
            };
          }

          return { success: true, data: { result: 'success' } };
        },
        compensate: async () => {
          console.log('Cleaning up...');
        },
        retryable: true,
        maxRetries: 5,
        timeout: 5000,
      },
    ],
  };

  sagaService.registerSaga(saga);

  const instance = await sagaService.executeSaga('CUSTOM', {});
  console.log('Final status:', instance.status);
  console.log('Total attempts:', attemptCount);
}

/**
 * Example 5: Complex Workflow with Dependencies
 */
export async function exampleComplexWorkflow() {
  const saga: SagaDefinition = {
    type: 'CUSTOM' as SagaWorkflowType,
    name: 'Complex Workflow',
    patternType: 'ORCHESTRATION',
    steps: [
      {
        id: 'init',
        name: 'Initialize',
        execute: async () => {
          console.log('Initializing...');
          return { success: true, data: { initialized: true } };
        },
        compensate: async () => {
          console.log('Cleaning up initialization...');
        },
      },
      {
        id: 'process-a',
        name: 'Process A',
        execute: async () => {
          console.log('Processing A...');
          return { success: true, data: { processAResult: 'A' } };
        },
        compensate: async () => {
          console.log('Reverting Process A...');
        },
        dependencies: ['init'],
      },
      {
        id: 'process-b',
        name: 'Process B',
        execute: async () => {
          console.log('Processing B...');
          return { success: true, data: { processBResult: 'B' } };
        },
        compensate: async () => {
          console.log('Reverting Process B...');
        },
        dependencies: ['init'],
      },
      {
        id: 'finalize',
        name: 'Finalize',
        execute: async (context) => {
          console.log('Finalizing with:', context.output);
          return { success: true };
        },
        compensate: async () => {
          console.log('Reverting finalization...');
        },
        dependencies: ['process-a', 'process-b'],
      },
    ],
  };

  sagaService.registerSaga(saga);

  const instance = await sagaService.executeSaga('CUSTOM', {});
  console.log('Workflow completed:', instance.completedSteps);
}

/**
 * Example 6: Listening to Saga Events
 */
export async function exampleSagaEvents() {
  const saga: SagaDefinition = {
    type: 'CUSTOM' as SagaWorkflowType,
    name: 'Event Example',
    patternType: 'ORCHESTRATION',
    steps: [
      {
        id: 'step1',
        name: 'Step 1',
        execute: async () => ({ success: true }),
        compensate: async () => {},
      },
    ],
  };

  sagaService.registerSaga(saga);

  // Subscribe to events
  sagaService.on('saga.started', ({ sagaId, type }) => {
    console.log(`Saga ${sagaId} of type ${type} started`);
  });

  sagaService.on('saga.step.started', ({ sagaId, stepId }) => {
    console.log(`Step ${stepId} started in saga ${sagaId}`);
  });

  sagaService.on('saga.step.completed', ({ sagaId, stepId, result }) => {
    console.log(`Step ${stepId} completed in saga ${sagaId}`, result);
  });

  sagaService.on('saga.completed', ({ sagaId, result }) => {
    console.log(`Saga ${sagaId} completed with result:`, result);
  });

  sagaService.on('saga.failed', ({ sagaId, error }) => {
    console.error(`Saga ${sagaId} failed:`, error);
  });

  sagaService.on('saga.compensated', ({ sagaId }) => {
    console.log(`Saga ${sagaId} was compensated`);
  });

  await sagaService.executeSaga('CUSTOM', {});
}

/**
 * Example 7: Idempotent Compensation
 */
export async function exampleIdempotentCompensation() {
  const saga: SagaDefinition = {
    type: 'CUSTOM' as SagaWorkflowType,
    name: 'Idempotent Example',
    patternType: 'ORCHESTRATION',
    steps: [
      {
        id: 'create-resource',
        name: 'Create Resource',
        execute: async () => {
          console.log('Creating resource...');
          return { success: true, data: { resourceId: 'res-123' } };
        },
        compensate: async (context) => {
          // Idempotent: check if resource exists before deleting
          const resourceId = context.output.resourceId;
          console.log(`Deleting resource ${resourceId} (idempotent)`);
          // Only delete if it exists
        },
        idempotentCompensation: true,
      },
    ],
  };

  sagaService.registerSaga(saga);

  const instance = await sagaService.executeSaga('CUSTOM', {});

  // Compensation can be called multiple times safely
  await sagaService.compensateSaga(instance.id);
  await sagaService.compensateSaga(instance.id); // No error due to idempotency
}

/**
 * Example 8: Full Issue Lifecycle Saga
 */
export async function exampleFullIssueLifecycle() {
  initializeSagaWorkflows();

  try {
    // Step 1: Setup worktree
    const worktreeInstance = await sagaWorkflows.setupWorktree({
      projectId: 'proj-123',
      issueId: 'issue-456',
      branchName: 'feature/auto-workflow',
      worktreePath: '/tmp/worktrees/auto-workflow',
    });

    console.log('Worktree setup completed:', worktreeInstance.id);

    // Step 2: Start execution
    const executionInstance = await sagaWorkflows.startExecution({
      issueId: 'issue-456',
      agentId: 'agent-789',
      worktreePath: '/tmp/worktrees/auto-workflow',
    });

    console.log('Execution started:', executionInstance.id);

    // Step 3: Create PR (after execution completes)
    // This would typically happen after the agent finishes
    const prInstance = await sagaWorkflows.createPRFromExecution({
      executionId: executionInstance.context.output.executionId,
      title: 'Automated PR from Agent',
      body: 'This PR was automatically created by the saga workflow',
    });

    console.log('PR created:', prInstance.id);
  } catch (error) {
    console.error('Workflow failed:', error);
    // Each saga will have automatically compensated its steps
  }
}

/**
 * Example 9: Querying Saga History
 */
export async function exampleSagaHistory() {
  // Get all sagas for a specific issue
  const history = await sagaService.getSagaHistory('Issue', 'issue-123');

  console.log(`Found ${history.length} sagas for issue-123`);

  history.forEach((saga) => {
    console.log(`Saga ${saga.id}:`);
    console.log(`  Type: ${saga.type}`);
    console.log(`  Status: ${saga.status}`);
    console.log(`  Started: ${saga.startedAt}`);
    console.log(`  Completed Steps: ${saga.completedSteps.join(', ')}`);
    console.log(`  Failed Steps: ${saga.failedSteps.join(', ')}`);
    console.log(`  Compensated Steps: ${saga.compensatedSteps.join(', ')}`);
  });
}

/**
 * Example 10: Timeout Handling
 */
export async function exampleTimeout() {
  const saga: SagaDefinition = {
    type: 'CUSTOM' as SagaWorkflowType,
    name: 'Timeout Example',
    patternType: 'ORCHESTRATION',
    steps: [
      {
        id: 'long-running-step',
        name: 'Long Running Step',
        execute: async () => {
          // Simulate long-running operation
          await new Promise((resolve) => setTimeout(resolve, 10000));
          return { success: true };
        },
        compensate: async () => {
          console.log('Cleaning up after timeout...');
        },
        timeout: 2000, // 2 second timeout
      },
    ],
  };

  sagaService.registerSaga(saga);

  try {
    await sagaService.executeSaga('CUSTOM', {});
  } catch (error) {
    console.error('Saga timed out:', error);
    // Compensation will be triggered automatically
  }
}
