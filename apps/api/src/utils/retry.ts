/**
 * Retry Utility
 * Exponential backoff retry logic with jitter and circuit breaker
 */

import { eventBus } from '../lib/event-bus';

export interface RetryOptions {
  maxRetries?: number; // Default: 3
  initialDelayMs?: number; // Default: 1000 (1 second)
  maxDelayMs?: number; // Default: 30000 (30 seconds)
  jitterMs?: number; // Default: 1000 (0-1 second random jitter)
  onRetry?: (attempt: number, error: Error, delayMs: number) => void | Promise<void>;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Default: 5 consecutive failures
  resetTimeoutMs?: number; // Default: 60000 (1 minute)
  serviceName?: string; // Service name for event tracking
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Blocking requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private successCount = 0;
  private serviceName: string;

  constructor(private options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      resetTimeoutMs: options.resetTimeoutMs || 60000,
      serviceName: options.serviceName || 'unknown',
    };
    this.serviceName = this.options.serviceName!;
  }

  /**
   * Check if circuit breaker allows request
   */
  public canExecute(): boolean {
    if (this.state === CircuitBreakerState.CLOSED) {
      return true;
    }

    if (this.state === CircuitBreakerState.OPEN) {
      // Check if enough time has passed to try again
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs!
      ) {
        this.transitionToHalfOpen();
        return true;
      }
      return false;
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      return true;
    }

    return false;
  }

  /**
   * Record successful execution
   */
  public recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      // After 2 successes in half-open state, close the circuit
      if (this.successCount >= 2) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Record failed execution
   */
  public recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Immediately open circuit on failure in half-open state
      this.transitionToOpen();
    } else if (this.failureCount >= this.options.failureThreshold!) {
      this.transitionToOpen();
    }
  }

  /**
   * Get current state
   */
  public getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Reset circuit breaker
   */
  public reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }

  /**
   * Transition to OPEN state and emit event
   */
  private transitionToOpen(): void {
    if (this.state !== CircuitBreakerState.OPEN) {
      this.state = CircuitBreakerState.OPEN;
      eventBus.emitEvent('circuit-breaker.opened', {
        service: this.serviceName,
        failureCount: this.failureCount,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Transition to HALF_OPEN state and emit event
   */
  private transitionToHalfOpen(): void {
    if (this.state !== CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.HALF_OPEN;
      this.successCount = 0;
      eventBus.emitEvent('circuit-breaker.half-open', {
        service: this.serviceName,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Transition to CLOSED state and emit event
   */
  private transitionToClosed(): void {
    if (this.state !== CircuitBreakerState.CLOSED) {
      this.state = CircuitBreakerState.CLOSED;
      this.successCount = 0;
      eventBus.emitEvent('circuit-breaker.closed', {
        service: this.serviceName,
        successCount: this.successCount,
        timestamp: new Date(),
      });
    }
  }
}

/**
 * Error classification
 */
export enum ErrorCategory {
  RETRYABLE = 'RETRYABLE',
  NON_RETRYABLE = 'NON_RETRYABLE',
}

export class RetryableError extends Error {
  public readonly category = ErrorCategory.RETRYABLE;

  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class NonRetryableError extends Error {
  public readonly category = ErrorCategory.NON_RETRYABLE;

  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

/**
 * Classify error as retryable or non-retryable
 */
export function classifyError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();

  // Check if error has explicit category (from our custom error types)
  if ('category' in error && typeof (error as any).category === 'string') {
    return (error as any).category as ErrorCategory;
  }

  // Check if error has recoverable flag
  if ('recoverable' in error && typeof (error as any).recoverable === 'boolean') {
    return (error as any).recoverable
      ? ErrorCategory.RETRYABLE
      : ErrorCategory.NON_RETRYABLE;
  }

  // Network errors - retryable
  if (
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('etimedout') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('socket hang up') ||
    error.name === 'RetryableError'
  ) {
    return ErrorCategory.RETRYABLE;
  }

  // Permission errors - non-retryable
  if (
    message.includes('permission denied') ||
    message.includes('eacces') ||
    message.includes('eperm') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    error.name === 'NonRetryableError'
  ) {
    return ErrorCategory.NON_RETRYABLE;
  }

  // Syntax/validation errors - non-retryable
  if (
    message.includes('syntax error') ||
    message.includes('parse error') ||
    message.includes('invalid') ||
    message.includes('not found') &&
    !message.includes('enotfound') // DNS errors are retryable
  ) {
    return ErrorCategory.NON_RETRYABLE;
  }

  // Default to retryable for unknown errors
  return ErrorCategory.RETRYABLE;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  jitterMs: number
): number {
  // Exponential backoff: delay = initialDelay * 2^attempt
  const exponentialDelay = initialDelayMs * Math.pow(2, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add random jitter to prevent thundering herd
  const jitter = Math.random() * jitterMs;

  return cappedDelay + jitter;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    jitterMs = 1000,
    onRetry,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      const category = classifyError(lastError);

      if (category === ErrorCategory.NON_RETRYABLE) {
        throw lastError;
      }

      // If this was the last attempt, throw
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Calculate delay
      const delayMs = calculateDelay(attempt, initialDelayMs, maxDelayMs, jitterMs);

      // Call onRetry callback
      if (onRetry) {
        await onRetry(attempt + 1, lastError, delayMs);
      }

      // Wait before next retry
      await sleep(delayMs);
    }
  }

  // Should never reach here, but TypeScript doesn't know that
  throw lastError || new Error('Retry failed');
}

/**
 * Execute function with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  circuitBreaker: CircuitBreaker
): Promise<T> {
  if (!circuitBreaker.canExecute()) {
    throw new Error(
      `Circuit breaker is ${circuitBreaker.getState()}, request blocked`
    );
  }

  try {
    const result = await fn();
    circuitBreaker.recordSuccess();
    return result;
  } catch (error) {
    circuitBreaker.recordFailure();
    throw error;
  }
}

/**
 * Combined retry with circuit breaker
 */
export async function withRetryAndCircuitBreaker<T>(
  fn: () => Promise<T>,
  circuitBreaker: CircuitBreaker,
  retryOptions: RetryOptions = {}
): Promise<T> {
  return withRetry(
    () => withCircuitBreaker(fn, circuitBreaker),
    retryOptions
  );
}
