/**
 * Error Types
 * Specialized error classes for different failure scenarios
 */

import { ErrorCategory } from '../utils/retry';

// Re-export ErrorCategory for convenience
export { ErrorCategory };

/**
 * Base error class with recovery support
 */
export abstract class RecoverableError extends Error {
  public readonly category: ErrorCategory;
  public readonly recoverable: boolean;
  public readonly context?: Record<string, any>;
  public readonly errorCause?: Error;

  constructor(
    message: string,
    options: {
      category: ErrorCategory;
      recoverable: boolean;
      context?: Record<string, any>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.category = options.category;
    this.recoverable = options.recoverable;
    this.context = options.context;
    this.errorCause = options.cause;
  }
}

/**
 * Worktree-related errors
 */
export class WorktreeError extends RecoverableError {
  constructor(
    message: string,
    options: {
      worktreePath?: string;
      branch?: string;
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      category: options.recoverable === false
        ? ErrorCategory.NON_RETRYABLE
        : ErrorCategory.RETRYABLE,
      recoverable: options.recoverable ?? true,
      context: {
        worktreePath: options.worktreePath,
        branch: options.branch,
      },
      cause: options.cause,
    });
  }
}

/**
 * Process execution errors
 */
export class ProcessExecutionError extends RecoverableError {
  constructor(
    message: string,
    options: {
      processId?: number;
      exitCode?: number;
      signal?: string;
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      category: options.recoverable === false
        ? ErrorCategory.NON_RETRYABLE
        : ErrorCategory.RETRYABLE,
      recoverable: options.recoverable ?? true,
      context: {
        processId: options.processId,
        exitCode: options.exitCode,
        signal: options.signal,
      },
      cause: options.cause,
    });
  }
}

/**
 * Git operation errors
 */
export class GitOperationError extends RecoverableError {
  constructor(
    message: string,
    options: {
      operation?: string;
      repository?: string;
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      category: options.recoverable === false
        ? ErrorCategory.NON_RETRYABLE
        : ErrorCategory.RETRYABLE,
      recoverable: options.recoverable ?? true,
      context: {
        operation: options.operation,
        repository: options.repository,
      },
      cause: options.cause,
    });
  }
}

/**
 * Resource exhaustion errors
 */
export class ResourceError extends RecoverableError {
  constructor(
    message: string,
    options: {
      resourceType?: 'disk' | 'memory' | 'cpu' | 'network';
      currentUsage?: number;
      limit?: number;
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      category: ErrorCategory.RETRYABLE,
      recoverable: options.recoverable ?? true,
      context: {
        resourceType: options.resourceType,
        currentUsage: options.currentUsage,
        limit: options.limit,
      },
      cause: options.cause,
    });
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends RecoverableError {
  constructor(
    message: string,
    options: {
      timeoutMs?: number;
      elapsedMs?: number;
      recoverable?: boolean;
    } = {}
  ) {
    super(message, {
      category: ErrorCategory.RETRYABLE,
      recoverable: options.recoverable ?? false,
      context: {
        timeoutMs: options.timeoutMs,
        elapsedMs: options.elapsedMs,
      },
    });
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends RecoverableError {
  constructor(
    message: string,
    options: {
      configKey?: string;
      expectedType?: string;
      actualValue?: any;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      category: ErrorCategory.NON_RETRYABLE,
      recoverable: false,
      context: {
        configKey: options.configKey,
        expectedType: options.expectedType,
        actualValue: options.actualValue,
      },
      cause: options.cause,
    });
  }
}

/**
 * Agent-specific errors
 */
export class AgentError extends RecoverableError {
  constructor(
    message: string,
    options: {
      agentId?: string;
      agentCmd?: string;
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      category: options.recoverable === false
        ? ErrorCategory.NON_RETRYABLE
        : ErrorCategory.RETRYABLE,
      recoverable: options.recoverable ?? true,
      context: {
        agentId: options.agentId,
        agentCmd: options.agentCmd,
      },
      cause: options.cause,
    });
  }
}
