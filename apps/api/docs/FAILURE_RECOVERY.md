# Failure Recovery System

## Overview

The Jellos API implements a comprehensive failure recovery system that automatically detects, classifies, and recovers from various execution failures. The system is designed to minimize manual intervention while providing detailed diagnostics when automatic recovery is not possible.

## Architecture

### Error Classification

Errors are classified into two main categories:

1. **RETRYABLE** - Temporary failures that can be retried (network errors, resource exhaustion, process crashes)
2. **NON_RETRYABLE** - Permanent failures that require code or configuration changes (validation errors, permission denied, configuration errors)

### Error Types

#### RecoverableError (Base Class)

All specialized errors extend `RecoverableError`, which provides:

- `category`: ErrorCategory (RETRYABLE or NON_RETRYABLE)
- `recoverable`: boolean flag indicating if automatic recovery is possible
- `context`: Additional error-specific metadata
- `errorCause`: Optional original error for error chaining

#### Specialized Error Types

##### WorktreeError

**Use Case**: Git worktree-related failures

**Context Fields**:
- `worktreePath`: Path to the affected worktree
- `branch`: Branch name
- `recoverable`: Whether the worktree can be automatically recovered

**Recovery Strategies**:
1. Check if worktree exists
2. Remove stale git lock files (`.git/index.lock`)
3. Validate git status
4. Attempt `git reset --hard HEAD`
5. Run `git clean -fd` to remove untracked files
6. Flag for manual recreation if unrecoverable

**Example**:
```typescript
throw new WorktreeError('Worktree corrupted', {
  worktreePath: '/path/to/worktree',
  branch: 'feature/test',
  recoverable: true,
});
```

##### ProcessExecutionError

**Use Case**: Child process spawn failures, crashes, or unexpected terminations

**Context Fields**:
- `processId`: PID of the failed process
- `exitCode`: Process exit code
- `signal`: Signal that terminated the process (e.g., SIGTERM, SIGKILL)
- `recoverable`: Whether the process can be retried

**Recovery Strategies**:
1. Check if process still exists
2. Attempt graceful shutdown (SIGTERM)
3. Force kill if necessary (SIGKILL)
4. Update execution status in database
5. Clean up process resources

**Example**:
```typescript
throw new ProcessExecutionError('Process crashed unexpectedly', {
  processId: proc.pid,
  exitCode: 137,
  signal: 'SIGKILL',
  recoverable: true,
});
```

##### GitOperationError

**Use Case**: Git repository operations (merge, commit, checkout, etc.)

**Context Fields**:
- `operation`: Git operation that failed (merge, commit, checkout, etc.)
- `repository`: Repository path
- `recoverable`: Whether the git state can be recovered

**Recovery Strategies**:
1. Remove git lock files
2. Check for merge conflicts (UU or AA status)
3. Abort in-progress merge (`git merge --abort`)
4. Abort in-progress rebase (`git rebase --abort`)
5. Reset to clean state if needed

**Example**:
```typescript
throw new GitOperationError('Merge conflict detected', {
  operation: 'merge',
  repository: '/path/to/repo',
  recoverable: true,
});
```

##### ResourceError

**Use Case**: Resource exhaustion (disk, memory, CPU, network)

**Context Fields**:
- `resourceType`: 'disk' | 'memory' | 'cpu' | 'network'
- `currentUsage`: Current resource usage
- `limit`: Resource limit that was exceeded
- `recoverable`: Always true (resources may become available)

**Recovery Strategies**:
1. **Disk**: Clean temporary files with `git clean -fd`
2. **Memory**: Log guidance to reduce concurrent executions
3. **CPU**: Wait and retry (handled by retry logic)
4. **Network**: Retry with exponential backoff

**Example**:
```typescript
throw new ResourceError('Insufficient disk space', {
  resourceType: 'disk',
  currentUsage: 95,
  limit: 90,
  recoverable: true,
});
```

##### TimeoutError

**Use Case**: Execution timeouts

**Context Fields**:
- `timeoutMs`: Configured timeout value
- `elapsedMs`: Actual elapsed time
- `recoverable`: Usually false (timeout indicates systemic issue)

**Recovery Strategies**:
1. Terminate process (SIGTERM)
2. Update execution status to TIMEOUT
3. Clean up resources
4. Log detailed timing information

**Example**:
```typescript
throw new TimeoutError('Execution exceeded timeout', {
  timeoutMs: 30000,
  elapsedMs: 35000,
  recoverable: false,
});
```

##### ConfigurationError

**Use Case**: Invalid configuration, missing required fields, type mismatches

**Context Fields**:
- `configKey`: Configuration key that failed validation
- `expectedType`: Expected type or format
- `actualValue`: Actual invalid value
- `recoverable`: Always false (requires code/config change)

**Recovery Strategies**:
- No automatic recovery
- Provide clear error message with expected vs actual values
- Flag for manual intervention

**Example**:
```typescript
throw new ConfigurationError('Invalid timeout value', {
  configKey: 'execution.timeout',
  expectedType: 'number',
  actualValue: 'invalid',
});
```

##### AgentError

**Use Case**: Agent-specific failures (discovery, initialization, execution)

**Context Fields**:
- `agentId`: Agent identifier
- `agentCmd`: Agent command that failed
- `recoverable`: Whether the agent can be retried

**Recovery Strategies**:
1. Verify agent configuration
2. Check agent availability
3. Retry with backoff if recoverable
4. Flag for manual intervention if agent not found

**Example**:
```typescript
throw new AgentError('Agent initialization failed', {
  agentId: 'test-agent',
  agentCmd: 'node agent.js',
  recoverable: true,
});
```

## Recovery Service

### Usage

```typescript
import { getRecoveryService } from './services/recovery.service';
import { WorktreeError } from './types/errors';

const recoveryService = getRecoveryService();

try {
  // Some operation that might fail
  await createWorktree(path);
} catch (error) {
  const result = await recoveryService.recover(error, {
    executionId: 'exec-123',
    worktreePath: '/path/to/worktree',
    processId: proc.pid,
  });

  if (result.success) {
    console.log('Recovery successful:', result.message);
    console.log('Actions taken:', result.actionsTaken);
    // Retry the operation
  } else if (result.needsManualIntervention) {
    console.error('Manual intervention required');
    console.error('Actions attempted:', result.actionsTaken);
    // Alert admin
  } else {
    // Can retry with backoff
    console.log('Recovery not successful, but retry may work');
  }
}
```

### Recovery Result

```typescript
interface RecoveryResult {
  success: boolean;              // True if recovery succeeded
  message: string;               // Human-readable recovery message
  actionsTaken: string[];        // List of recovery actions attempted
  needsManualIntervention: boolean; // True if manual intervention required
}
```

### Configuration

```typescript
const recoveryService = new RecoveryService({
  maxRecoveryAttempts: 2,  // Maximum recovery attempts per error
  cleanupTimeout: 5000,    // Timeout for cleanup operations (ms)
});
```

## Integration with Retry Logic

The recovery system integrates with the retry mechanism:

```typescript
import { withRetry } from './utils/retry';
import { getRecoveryService } from './services/recovery.service';

async function executeWithRecovery() {
  const recoveryService = getRecoveryService();

  return withRetry(
    async () => {
      try {
        return await dangerousOperation();
      } catch (error) {
        // Attempt recovery
        const result = await recoveryService.recover(error, context);

        if (result.success) {
          // Recovery succeeded, retry the operation
          return await dangerousOperation();
        }

        // Re-throw for retry logic to handle
        throw error;
      }
    },
    {
      maxRetries: 3,
      initialDelayMs: 1000,
      onRetry: (attempt, error, delayMs) => {
        console.log(`Retry attempt ${attempt} after ${delayMs}ms`);
      },
    }
  );
}
```

## Stream Events

Recovery actions are communicated via stream events:

### RECOVERY Event

```typescript
{
  type: StreamEventType.RECOVERY,
  data: {
    success: boolean,
    message: string,
    actionsTaken: string[],
    needsManualIntervention: boolean,
  },
  timestamp: Date,
  executionId: string,
}
```

### ERROR Event (with recovery metadata)

```typescript
{
  type: StreamEventType.ERROR,
  data: {
    error: string,
    recovery: {
      attempted: true,
      success: boolean,
      actionsTaken: string[],
    },
  },
  timestamp: Date,
  executionId: string,
}
```

## Best Practices

### 1. Use Specific Error Types

Always throw the most specific error type:

```typescript
// Good
throw new WorktreeError('Worktree not found', {
  worktreePath: path,
  branch: 'main',
});

// Bad
throw new Error('Worktree not found');
```

### 2. Provide Context

Include as much context as possible:

```typescript
throw new ProcessExecutionError('Process failed', {
  processId: proc.pid,
  exitCode: exitCode,
  signal: signal,
  recoverable: exitCode !== 127, // Non-zero but not "command not found"
});
```

### 3. Chain Errors

Preserve the original error when wrapping:

```typescript
try {
  await gitOperation();
} catch (originalError) {
  throw new GitOperationError('Git merge failed', {
    operation: 'merge',
    repository: repoPath,
    cause: originalError, // Preserve original error
  });
}
```

### 4. Set Recoverable Appropriately

Be conservative with the `recoverable` flag:

```typescript
// Temporary network issue - recoverable
throw new ResourceError('Network timeout', {
  resourceType: 'network',
  recoverable: true,
});

// Missing required file - not recoverable
throw new ConfigurationError('Config file not found', {
  configKey: 'agent.config',
  recoverable: false, // Actually defaults to false
});
```

### 5. Test Recovery Paths

Always test both successful recovery and failure scenarios:

```typescript
it('should recover from worktree corruption', async () => {
  const error = new WorktreeError('Corrupted', {
    worktreePath: testPath,
  });

  const result = await recoveryService.recover(error, {
    worktreePath: testPath,
  });

  expect(result.success).toBe(true);
  expect(result.actionsTaken).toContain('git reset --hard');
});

it('should detect unrecoverable corruption', async () => {
  // Mock all recovery attempts to fail
  const result = await recoveryService.recover(error, context);

  expect(result.success).toBe(false);
  expect(result.needsManualIntervention).toBe(true);
});
```

## Monitoring and Debugging

### Logging

Recovery actions are automatically logged:

```typescript
// Recovery service logs all actions
actionsTaken: [
  'Detected missing worktree',
  'Attempting to validate worktree state',
  'Removing stale git lock file',
  'Attempting git reset --hard',
  'Attempting git clean -fd',
  'Worktree reset to clean state',
]
```

### Metrics

Track recovery metrics for monitoring:

- Recovery success rate by error type
- Time to recovery
- Most common failure patterns
- Manual intervention frequency

### Debug Information

All errors include context for debugging:

```typescript
{
  name: 'WorktreeError',
  message: 'Worktree corrupted',
  category: 'RETRYABLE',
  recoverable: true,
  context: {
    worktreePath: '/path/to/worktree',
    branch: 'feature/test',
  },
  errorCause: {
    name: 'Error',
    message: 'fatal: not a git repository',
  },
}
```

## Future Enhancements

1. **Pattern Detection**: Analyze failure patterns to predict and prevent issues
2. **Auto-scaling**: Automatically adjust resource limits based on usage
3. **Health Checks**: Proactive health monitoring to prevent failures
4. **Recovery Playbooks**: Customizable recovery strategies per error type
5. **Circuit Breaker Integration**: Prevent cascading failures
6. **Metrics Dashboard**: Real-time recovery metrics and trends
