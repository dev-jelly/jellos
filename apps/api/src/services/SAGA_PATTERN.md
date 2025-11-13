# Saga Pattern Implementation

## Overview

The saga pattern implementation provides compensating transactions for multi-step workflows in the Jellos system. When a workflow fails, the saga automatically rolls back completed steps to maintain system consistency.

**Task 12.6 - Saga Pattern for Compensating Transactions**

## Key Features

- ✅ **Automatic Compensation**: Failed workflows automatically trigger rollback of completed steps
- ✅ **Orchestration Pattern**: Centralized coordinator manages step execution
- ✅ **Choreography Pattern**: Event-driven distributed execution (framework ready)
- ✅ **Retry Logic**: Configurable retry with exponential backoff
- ✅ **Step Dependencies**: Define dependencies between steps
- ✅ **Timeout Handling**: Per-step and global saga timeouts
- ✅ **Idempotent Compensation**: Safe to retry compensation operations
- ✅ **Event Emission**: Observable saga lifecycle events
- ✅ **Persistent State**: Saga state persisted to database
- ✅ **History Tracking**: Query saga execution history

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Saga Service                            │
│  - Register saga definitions                                 │
│  - Execute sagas                                             │
│  - Coordinate compensation                                   │
│  - Emit lifecycle events                                     │
└─────────────────────────────────────────────────────────────┘
                           │
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Step 1     │  │   Step 2     │  │   Step 3     │
│              │  │              │  │              │
│ execute()    │  │ execute()    │  │ execute()    │
│ compensate() │  │ compensate() │  │ compensate() │
└──────────────┘  └──────────────┘  └──────────────┘
        │                  │                  │
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                           ▼
                  ┌────────────────┐
                  │   Database     │
                  │  saga_instances│
                  └────────────────┘
```

## Core Concepts

### Saga Definition

A saga is defined by a workflow type, steps, and compensation logic:

```typescript
const sagaDefinition: SagaDefinition = {
  type: 'WORKTREE_SETUP',
  name: 'Worktree Setup Saga',
  patternType: 'ORCHESTRATION',
  steps: [
    {
      id: 'create-worktree',
      name: 'Create Git Worktree',
      execute: async (context) => {
        // Create worktree
        return { success: true, data: { path: '/tmp/worktree' } };
      },
      compensate: async (context) => {
        // Remove worktree
        await removeWorktree(context.output.path);
      },
      retryable: true,
      maxRetries: 3,
      timeout: 30000,
    },
    // More steps...
  ],
  timeout: 120000,
  criticalSteps: ['create-worktree'],
};
```

### Step Execution

Each step has:
- **execute**: Forward transaction logic
- **compensate**: Rollback logic (undo the step)
- **retryable**: Whether the step can be retried
- **maxRetries**: Maximum retry attempts
- **timeout**: Step execution timeout
- **dependencies**: Other steps that must complete first
- **idempotentCompensation**: Whether compensation can be safely retried

### Saga Context

Shared state across steps:

```typescript
interface SagaContext {
  sagaId: string;           // Unique saga instance ID
  correlationId: string;    // For tracing
  input: Record<string, any>;   // Initial input
  output: Record<string, any>;  // Accumulated output from steps
  stepResults: Map<string, SagaStepResult>;  // Results from each step
  metadata: Record<string, any>;  // Custom metadata
}
```

## Compensation Flow

When a saga fails:

1. **Failure Detected**: A step fails or times out
2. **Saga Marked Failed**: Saga status set to `FAILED`
3. **Compensation Started**: Status set to `COMPENSATING`
4. **Steps Compensated**: Completed steps compensated in reverse order
5. **Saga Compensated**: Final status set to `COMPENSATED`

Example flow:

```
Step 1 ✓ → Step 2 ✓ → Step 3 ✗ (FAILED)
                                    ↓
         Compensation Triggered
                                    ↓
Step 1 ← Step 2 ← Step 3 (compensate in reverse)
```

## Built-in Workflows

### 1. Worktree Setup Saga

**Type**: `WORKTREE_SETUP`

**Steps**:
1. Validate project exists
2. Create git worktree
3. Create worktree DB entry
4. Update issue status to IN_PROGRESS

**Compensations**:
- Remove git worktree
- Delete DB entry
- Revert issue status

**Usage**:
```typescript
await sagaWorkflows.setupWorktree({
  projectId: 'proj-123',
  issueId: 'issue-456',
  branchName: 'feature/new-feature',
  worktreePath: '/tmp/worktrees/feature',
});
```

### 2. Issue to Execution Saga

**Type**: `ISSUE_TO_EXECUTION`

**Steps**:
1. Validate issue exists
2. Create execution record
3. Start agent process

**Compensations**:
- Terminate agent process
- Mark execution as cancelled
- Revert issue state

**Usage**:
```typescript
await sagaWorkflows.startExecution({
  issueId: 'issue-456',
  agentId: 'agent-789',
  worktreePath: '/tmp/worktrees/feature',
});
```

### 3. Execution to PR Saga

**Type**: `EXECUTION_TO_PR`

**Steps**:
1. Validate execution completed
2. Create pull request
3. Update issue to IN_REVIEW

**Compensations**:
- Close PR
- Revert issue status
- Cleanup PR mapping

**Usage**:
```typescript
await sagaWorkflows.createPRFromExecution({
  executionId: 'exec-123',
  title: 'Fix: Important bug fix',
  body: 'Description of changes',
});
```

## Usage Examples

### Basic Saga

```typescript
import { sagaService } from './saga.service';

// Define saga
const saga: SagaDefinition = {
  type: 'CUSTOM',
  name: 'Payment Processing',
  patternType: 'ORCHESTRATION',
  steps: [
    {
      id: 'reserve-inventory',
      name: 'Reserve Inventory',
      execute: async (context) => {
        // Reserve items
        return { success: true, data: { reservationId: 'res-123' } };
      },
      compensate: async (context) => {
        // Release reservation
        await releaseInventory(context.output.reservationId);
      },
    },
    {
      id: 'charge-payment',
      name: 'Charge Payment',
      execute: async (context) => {
        // Charge customer
        return { success: true, data: { transactionId: 'txn-456' } };
      },
      compensate: async (context) => {
        // Refund payment
        await refundPayment(context.output.transactionId);
      },
      dependencies: ['reserve-inventory'],
    },
  ],
};

// Register saga
sagaService.registerSaga(saga);

// Execute saga
try {
  const instance = await sagaService.executeSaga('CUSTOM', {
    orderId: 'order-789',
    amount: 100,
  });
  console.log('Saga completed:', instance.id);
} catch (error) {
  console.error('Saga failed and was compensated:', error);
}
```

### Manual Compensation

```typescript
// Execute without auto-compensation
const instance = await sagaService.executeSaga(
  'CUSTOM',
  { data: 'test' },
  { autoCompensate: false }
);

// Manually trigger compensation later
await sagaService.compensateSaga(instance.id, {
  reverseOrder: true,
  stopOnFailure: false,
  timeout: 30000,
});
```

### Listening to Events

```typescript
sagaService.on('saga.started', ({ sagaId, type }) => {
  console.log(`Saga ${sagaId} started`);
});

sagaService.on('saga.step.completed', ({ sagaId, stepId, result }) => {
  console.log(`Step ${stepId} completed`, result);
});

sagaService.on('saga.failed', ({ sagaId, error }) => {
  console.error(`Saga ${sagaId} failed`, error);
});

sagaService.on('saga.compensated', ({ sagaId }) => {
  console.log(`Saga ${sagaId} compensated`);
});
```

### Retry Logic

```typescript
{
  id: 'unreliable-api-call',
  name: 'Call External API',
  execute: async () => {
    // May fail occasionally
    return await callExternalAPI();
  },
  compensate: async () => {
    // Cleanup
  },
  retryable: true,
  maxRetries: 5,
  timeout: 10000,
}
```

### Step Dependencies

```typescript
steps: [
  {
    id: 'init',
    name: 'Initialize',
    execute: async () => ({ success: true }),
    compensate: async () => {},
  },
  {
    id: 'process-a',
    name: 'Process A',
    execute: async () => ({ success: true }),
    compensate: async () => {},
    dependencies: ['init'],  // Must wait for init
  },
  {
    id: 'process-b',
    name: 'Process B',
    execute: async () => ({ success: true }),
    compensate: async () => {},
    dependencies: ['init'],  // Must wait for init
  },
  {
    id: 'finalize',
    name: 'Finalize',
    execute: async () => ({ success: true }),
    compensate: async () => {},
    dependencies: ['process-a', 'process-b'],  // Must wait for both
  },
]
```

## Database Schema

The saga state is persisted to the database:

```sql
CREATE TABLE saga_instances (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  context TEXT NOT NULL,           -- JSON
  step_states TEXT NOT NULL,       -- JSON
  completed_steps TEXT NOT NULL,   -- JSON array
  failed_steps TEXT NOT NULL,      -- JSON array
  compensated_steps TEXT NOT NULL, -- JSON array
  error TEXT,                      -- JSON
  metadata TEXT,                   -- JSON
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE INDEX idx_saga_instances_type ON saga_instances(type);
CREATE INDEX idx_saga_instances_status ON saga_instances(status);
CREATE INDEX idx_saga_instances_type_status ON saga_instances(type, status);
```

## Common Compensation Actions

### Worktree Cleanup

```typescript
compensate: async (context) => {
  const { worktreePath, project } = context.output;
  if (worktreePath && existsSync(worktreePath)) {
    await execAsync(`git worktree remove "${worktreePath}" --force`, {
      cwd: project.localPath,
    });
  }
}
```

### Process Termination

```typescript
compensate: async (context) => {
  const { execution } = context.output;
  if (execution?.processId) {
    try {
      process.kill(execution.processId, 'SIGTERM');
    } catch {
      // Process may not exist
    }
  }
  await prisma.agentExecution.update({
    where: { id: execution.id },
    data: { status: 'CANCELLED' },
  });
}
```

### State Reversion

```typescript
compensate: async (context) => {
  const { issueId, previousStatus } = context.output;
  if (issueId && previousStatus) {
    await prisma.issue.update({
      where: { id: issueId },
      data: { status: previousStatus },
    });
  }
}
```

### Resource Cleanup

```typescript
compensate: async (context) => {
  const { resourceId } = context.output;
  // Idempotent cleanup - check if resource exists
  const exists = await checkResourceExists(resourceId);
  if (exists) {
    await deleteResource(resourceId);
  }
}
```

## Best Practices

### 1. Idempotent Compensations

Always make compensation actions idempotent:

```typescript
compensate: async (context) => {
  // Check if resource exists before deleting
  const resource = await getResource(context.output.resourceId);
  if (resource) {
    await deleteResource(resource.id);
  }
}
```

### 2. Error Handling

Handle errors gracefully in compensation:

```typescript
compensate: async (context) => {
  try {
    await cleanup(context.output.resourceId);
  } catch (error) {
    console.error('Compensation failed:', error);
    // Log but don't throw - allow other compensations to run
  }
}
```

### 3. State Preservation

Store necessary state for compensation:

```typescript
execute: async (context) => {
  const issue = await prisma.issue.findUnique({ where: { id: issueId } });
  const previousStatus = issue.status;  // Save for compensation

  await prisma.issue.update({
    where: { id: issueId },
    data: { status: 'IN_PROGRESS' },
  });

  return { success: true, data: { previousStatus } };  // Return for compensation
}
```

### 4. Timeout Configuration

Set appropriate timeouts:

```typescript
{
  timeout: 30000,  // Step-level timeout
  execute: async () => {
    // Long-running operation
  },
}

// Global saga timeout
{
  timeout: 300000,  // 5 minutes for entire saga
}
```

### 5. Critical Steps

Mark critical steps that must succeed:

```typescript
{
  criticalSteps: ['validate-input', 'create-primary-resource'],
  continueOnNonCriticalFailure: true,
}
```

## Integration with Event Sourcing

Sagas integrate with the event sourcing system:

```typescript
// Saga events are also stored in the event store
sagaService.on('saga.step.completed', async ({ sagaId, stepId, result }) => {
  await eventStoreService.appendEvent({
    aggregateType: 'Saga',
    aggregateId: sagaId,
    eventType: 'saga.step.completed',
    payload: { stepId, result },
    metadata: { /* ... */ },
  });
});
```

## Monitoring and Observability

### Query Saga History

```typescript
const history = await sagaService.getSagaHistory('Issue', 'issue-123');
console.log(`Found ${history.length} sagas for issue-123`);
```

### Check Saga Status

```typescript
const instance = await sagaService.getSagaInstance(sagaId);
console.log('Status:', instance?.status);
console.log('Completed steps:', instance?.completedSteps);
console.log('Failed steps:', instance?.failedSteps);
```

### Event Monitoring

```typescript
sagaService.on('saga.step.failed', ({ sagaId, stepId, error }) => {
  // Send alert
  alertService.send({
    level: 'error',
    message: `Saga ${sagaId} step ${stepId} failed`,
    error,
  });
});
```

## Testing

See `saga.service.test.ts` for comprehensive test examples.

## Future Enhancements

- [ ] Choreography pattern full implementation with event bus integration
- [ ] Saga visualization dashboard
- [ ] Distributed saga coordination across services
- [ ] Saga versioning and migration
- [ ] Saga scheduling and delayed execution
- [ ] Saga composition (sagas calling other sagas)

## References

- [Saga Pattern by Chris Richardson](https://microservices.io/patterns/data/saga.html)
- [Compensating Transactions](https://docs.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction)
- Task 12.6 - Saga Pattern for Compensating Transactions
