/**
 * Saga Pattern Types
 *
 * Types for implementing saga pattern with compensating transactions.
 * Supports both orchestration and choreography patterns for multi-step workflows.
 *
 * Task 12.6 - Saga Pattern for Compensating Transactions
 */

import { z } from 'zod';

/**
 * Saga status
 */
export enum SagaStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
  FAILED = 'FAILED',
}

/**
 * Saga step status
 */
export enum SagaStepStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
  SKIPPED = 'SKIPPED',
}

/**
 * Saga pattern type
 */
export enum SagaPatternType {
  ORCHESTRATION = 'ORCHESTRATION', // Centralized coordinator
  CHOREOGRAPHY = 'CHOREOGRAPHY', // Distributed event-driven
}

/**
 * Saga workflow type
 */
export enum SagaWorkflowType {
  ISSUE_TO_EXECUTION = 'ISSUE_TO_EXECUTION',
  EXECUTION_TO_PR = 'EXECUTION_TO_PR',
  PR_TO_MERGE = 'PR_TO_MERGE',
  FULL_ISSUE_LIFECYCLE = 'FULL_ISSUE_LIFECYCLE',
  WORKTREE_SETUP = 'WORKTREE_SETUP',
  CUSTOM = 'CUSTOM',
}

/**
 * Saga step definition
 */
export interface SagaStepDefinition {
  /**
   * Step identifier
   */
  id: string;

  /**
   * Step name
   */
  name: string;

  /**
   * Step description
   */
  description?: string;

  /**
   * Step execution handler
   */
  execute: (context: SagaContext) => Promise<SagaStepResult>;

  /**
   * Compensation handler (undo logic)
   */
  compensate: (context: SagaContext) => Promise<void>;

  /**
   * Whether this step can be retried on failure
   */
  retryable?: boolean;

  /**
   * Maximum retry attempts
   */
  maxRetries?: number;

  /**
   * Timeout for step execution (ms)
   */
  timeout?: number;

  /**
   * Whether compensation is idempotent
   */
  idempotentCompensation?: boolean;

  /**
   * Step dependencies (other step IDs that must complete first)
   */
  dependencies?: string[];
}

/**
 * Saga step result
 */
export interface SagaStepResult {
  /**
   * Whether the step succeeded
   */
  success: boolean;

  /**
   * Result data to pass to next steps
   */
  data?: Record<string, any>;

  /**
   * Error information if failed
   */
  error?: {
    message: string;
    code?: string;
    recoverable?: boolean;
    cause?: Error;
  };

  /**
   * Metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Saga context - shared state across steps
 */
export interface SagaContext {
  /**
   * Saga instance ID
   */
  sagaId: string;

  /**
   * Correlation ID for tracing
   */
  correlationId: string;

  /**
   * Initial input data
   */
  input: Record<string, any>;

  /**
   * Accumulated output data from completed steps
   */
  output: Record<string, any>;

  /**
   * Step execution history
   */
  stepResults: Map<string, SagaStepResult>;

  /**
   * Saga metadata
   */
  metadata: Record<string, any>;

  /**
   * Timeout for entire saga (ms)
   */
  timeout?: number;

  /**
   * Started at timestamp
   */
  startedAt?: Date;
}

/**
 * Saga definition
 */
export interface SagaDefinition {
  /**
   * Saga type identifier
   */
  type: SagaWorkflowType;

  /**
   * Saga name
   */
  name: string;

  /**
   * Saga description
   */
  description?: string;

  /**
   * Pattern type (orchestration or choreography)
   */
  patternType: SagaPatternType;

  /**
   * Ordered steps
   */
  steps: SagaStepDefinition[];

  /**
   * Global saga timeout (ms)
   */
  timeout?: number;

  /**
   * Whether to continue on non-critical step failures
   */
  continueOnNonCriticalFailure?: boolean;

  /**
   * Critical steps that must succeed (by step ID)
   */
  criticalSteps?: string[];
}

/**
 * Saga instance - runtime state of a saga
 */
export interface SagaInstance {
  /**
   * Instance ID
   */
  id: string;

  /**
   * Saga definition type
   */
  type: SagaWorkflowType;

  /**
   * Current status
   */
  status: SagaStatus;

  /**
   * Current context
   */
  context: SagaContext;

  /**
   * Step execution states
   */
  stepStates: Map<string, SagaStepState>;

  /**
   * Completed steps (ordered)
   */
  completedSteps: string[];

  /**
   * Failed steps
   */
  failedSteps: string[];

  /**
   * Compensated steps (in reverse order)
   */
  compensatedSteps: string[];

  /**
   * Started at
   */
  startedAt: Date;

  /**
   * Completed at
   */
  completedAt?: Date;

  /**
   * Error information if saga failed
   */
  error?: {
    message: string;
    step?: string;
    cause?: Error;
  };

  /**
   * Metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Saga step state - runtime state of a step
 */
export interface SagaStepState {
  /**
   * Step ID
   */
  stepId: string;

  /**
   * Current status
   */
  status: SagaStepStatus;

  /**
   * Attempt count
   */
  attempts: number;

  /**
   * Step result
   */
  result?: SagaStepResult;

  /**
   * Started at
   */
  startedAt?: Date;

  /**
   * Completed at
   */
  completedAt?: Date;

  /**
   * Compensated at
   */
  compensatedAt?: Date;

  /**
   * Error information
   */
  error?: {
    message: string;
    code?: string;
    cause?: Error;
  };
}

/**
 * Saga execution options
 */
export interface SagaExecutionOptions {
  /**
   * Correlation ID for tracing
   */
  correlationId?: string;

  /**
   * Override global timeout
   */
  timeout?: number;

  /**
   * Initial context metadata
   */
  metadata?: Record<string, any>;

  /**
   * Whether to automatically compensate on failure
   */
  autoCompensate?: boolean;

  /**
   * Continue on non-critical failures
   */
  continueOnNonCriticalFailure?: boolean;
}

/**
 * Compensation options
 */
export interface CompensationOptions {
  /**
   * Steps to compensate (defaults to all completed steps)
   */
  steps?: string[];

  /**
   * Compensation order (defaults to reverse of execution)
   */
  reverseOrder?: boolean;

  /**
   * Stop on first compensation failure
   */
  stopOnFailure?: boolean;

  /**
   * Timeout for each compensation step
   */
  timeout?: number;
}

/**
 * Saga persistence data
 */
export interface SagaPersistenceData {
  id: string;
  type: SagaWorkflowType;
  status: SagaStatus;
  patternType: SagaPatternType;
  context: string; // JSON
  stepStates: string; // JSON
  completedSteps: string; // JSON array
  failedSteps: string; // JSON array
  compensatedSteps: string; // JSON array
  error?: string; // JSON
  metadata?: string; // JSON
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const sagaStatusSchema = z.nativeEnum(SagaStatus);
export const sagaStepStatusSchema = z.nativeEnum(SagaStepStatus);
export const sagaPatternTypeSchema = z.nativeEnum(SagaPatternType);
export const sagaWorkflowTypeSchema = z.nativeEnum(SagaWorkflowType);

export const sagaStepResultSchema = z.object({
  success: z.boolean(),
  data: z.record(z.any()).optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
      recoverable: z.boolean().optional(),
    })
    .optional(),
  metadata: z.record(z.any()).optional(),
});

export const sagaContextSchema = z.object({
  sagaId: z.string(),
  correlationId: z.string(),
  input: z.record(z.any()),
  output: z.record(z.any()),
  metadata: z.record(z.any()),
  timeout: z.number().positive().optional(),
  startedAt: z.coerce.date().optional(),
});

export const sagaExecutionOptionsSchema = z.object({
  correlationId: z.string().optional(),
  timeout: z.number().positive().optional(),
  metadata: z.record(z.any()).optional(),
  autoCompensate: z.boolean().default(true),
  continueOnNonCriticalFailure: z.boolean().default(false),
});

export const compensationOptionsSchema = z.object({
  steps: z.array(z.string()).optional(),
  reverseOrder: z.boolean().default(true),
  stopOnFailure: z.boolean().default(false),
  timeout: z.number().positive().optional(),
});
