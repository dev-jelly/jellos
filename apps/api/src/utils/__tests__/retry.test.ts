/**
 * Tests for retry utilities and circuit breaker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerState,
  withRetry,
  withCircuitBreaker,
  classifyError,
  ErrorCategory,
  RetryableError,
  NonRetryableError,
} from '../retry';
import { eventBus } from '../../lib/event-bus';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let eventEmitSpy: any;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      serviceName: 'test-service',
    });
    eventEmitSpy = vi.spyOn(eventBus, 'emitEvent');
  });

  afterEach(() => {
    eventEmitSpy.mockRestore();
  });

  describe('State transitions', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to OPEN after threshold failures', () => {
      // Record failures up to threshold
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);

      // One more failure should open circuit
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Verify event was emitted
      expect(eventEmitSpy).toHaveBeenCalledWith('circuit-breaker.opened', {
        service: 'test-service',
        failureCount: 3,
        timestamp: expect.any(Date),
      });
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Open the circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Circuit should allow execution and transition to HALF_OPEN
      expect(circuitBreaker.canExecute()).toBe(true);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Verify event was emitted
      expect(eventEmitSpy).toHaveBeenCalledWith('circuit-breaker.half-open', {
        service: 'test-service',
        timestamp: expect.any(Date),
      });
    });

    it('should transition to CLOSED after 2 successes in HALF_OPEN', async () => {
      // Open the circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));
      circuitBreaker.canExecute();

      // Record 2 successes
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      circuitBreaker.recordSuccess();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);

      // Verify event was emitted
      expect(eventEmitSpy).toHaveBeenCalledWith('circuit-breaker.closed', {
        service: 'test-service',
        successCount: 0,
        timestamp: expect.any(Date),
      });
    });

    it('should transition back to OPEN on failure in HALF_OPEN', async () => {
      // Open the circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));
      circuitBreaker.canExecute();

      // Record a failure in half-open state
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('canExecute', () => {
    it('should allow execution in CLOSED state', () => {
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should block execution in OPEN state', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      expect(circuitBreaker.canExecute()).toBe(false);
    });

    it('should allow execution in HALF_OPEN state', async () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(circuitBreaker.canExecute()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker to initial state', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      circuitBreaker.reset();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.canExecute()).toBe(true);
    });
  });

  describe('Event emission', () => {
    it('should not emit duplicate events for same state', () => {
      // Open the circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      const openEventCalls = eventEmitSpy.mock.calls.filter(
        (call: any[]) => call[0] === 'circuit-breaker.opened'
      );
      expect(openEventCalls.length).toBe(1);

      // Additional failures should not emit more events
      circuitBreaker.recordFailure();
      const openEventCallsAfter = eventEmitSpy.mock.calls.filter(
        (call: any[]) => call[0] === 'circuit-breaker.opened'
      );
      expect(openEventCallsAfter.length).toBe(1);
    });
  });
});

describe('withCircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 1000,
      serviceName: 'test',
    });
  });

  it('should execute function when circuit is closed', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withCircuitBreaker(fn, circuitBreaker);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
  });

  it('should record failure when function throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('test error'));

    await expect(withCircuitBreaker(fn, circuitBreaker)).rejects.toThrow('test error');
    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
  });

  it('should block execution when circuit is open', async () => {
    // Open the circuit
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();

    const fn = vi.fn();
    await expect(withCircuitBreaker(fn, circuitBreaker)).rejects.toThrow(
      /Circuit breaker is OPEN/
    );
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('withRetry', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxRetries: 3 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new RetryableError('Network error'))
      .mockRejectedValueOnce(new RetryableError('Network error'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 10,
      jitterMs: 0,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new NonRetryableError('Invalid input'));

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
      })
    ).rejects.toThrow('Invalid input');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should respect max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new RetryableError('Network error'));

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
        jitterMs: 0,
      })
    ).rejects.toThrow('Network error');

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should call onRetry callback', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValue('success');

    const onRetry = vi.fn();

    await withRetry(fn, {
      maxRetries: 3,
      initialDelayMs: 10,
      jitterMs: 0,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      1,
      expect.any(Error),
      expect.any(Number)
    );
  });
});

describe('classifyError', () => {
  it('should classify network errors as retryable', () => {
    expect(classifyError(new Error('ECONNREFUSED'))).toBe(ErrorCategory.RETRYABLE);
    expect(classifyError(new Error('ETIMEDOUT'))).toBe(ErrorCategory.RETRYABLE);
    expect(classifyError(new Error('network timeout'))).toBe(ErrorCategory.RETRYABLE);
  });

  it('should classify permission errors as non-retryable', () => {
    expect(classifyError(new Error('permission denied'))).toBe(
      ErrorCategory.NON_RETRYABLE
    );
    expect(classifyError(new Error('EACCES'))).toBe(ErrorCategory.NON_RETRYABLE);
    expect(classifyError(new Error('unauthorized'))).toBe(ErrorCategory.NON_RETRYABLE);
  });

  it('should classify validation errors as non-retryable', () => {
    expect(classifyError(new Error('syntax error'))).toBe(ErrorCategory.NON_RETRYABLE);
    expect(classifyError(new Error('invalid input'))).toBe(ErrorCategory.NON_RETRYABLE);
  });

  it('should use explicit category from custom errors', () => {
    expect(classifyError(new RetryableError('test'))).toBe(ErrorCategory.RETRYABLE);
    expect(classifyError(new NonRetryableError('test'))).toBe(
      ErrorCategory.NON_RETRYABLE
    );
  });

  it('should default to retryable for unknown errors', () => {
    expect(classifyError(new Error('unknown error'))).toBe(ErrorCategory.RETRYABLE);
  });
});
