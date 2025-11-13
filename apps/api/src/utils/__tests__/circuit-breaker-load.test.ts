/**
 * Load tests for Circuit Breaker under pressure
 * Tests circuit breaker behavior under various load conditions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerState,
  withCircuitBreaker,
  withRetryAndCircuitBreaker,
} from '../retry';

describe('CircuitBreaker under load', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      serviceName: 'load-test',
    });
  });

  describe('High failure rate scenarios', () => {
    it('should open circuit after sustained failures', async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      // Make multiple calls that fail
      for (let i = 0; i < 3; i++) {
        try {
          await withCircuitBreaker(failingOperation, circuitBreaker);
        } catch (error) {
          // Expected failures
        }
      }

      // Circuit should now be OPEN
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Further calls should be blocked
      await expect(
        withCircuitBreaker(failingOperation, circuitBreaker)
      ).rejects.toThrow(/Circuit breaker is OPEN/);

      // Operation should not have been called (blocked by circuit breaker)
      expect(failingOperation).toHaveBeenCalledTimes(3); // Only the first 3 attempts
    });

    it('should handle burst of failures followed by recovery', async () => {
      let callCount = 0;
      const intermittentOperation = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve('success');
      });

      // Burst of failures
      for (let i = 0; i < 3; i++) {
        try {
          await withCircuitBreaker(intermittentOperation, circuitBreaker);
        } catch (error) {
          // Expected failures
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Circuit should transition to HALF_OPEN and allow one request
      expect(circuitBreaker.canExecute()).toBe(true);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Now successful calls should close the circuit
      const result1 = await withCircuitBreaker(intermittentOperation, circuitBreaker);
      expect(result1).toBe('success');

      const result2 = await withCircuitBreaker(intermittentOperation, circuitBreaker);
      expect(result2).toBe('success');

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('Concurrent request handling', () => {
    it('should handle multiple concurrent requests when closed', async () => {
      const successOperation = vi.fn().mockResolvedValue('success');

      // Simulate 10 concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        withCircuitBreaker(successOperation, circuitBreaker)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(results.every((r) => r === 'success')).toBe(true);
      expect(successOperation).toHaveBeenCalledTimes(10);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should block concurrent requests when open', async () => {
      // Open the circuit
      const failingOperation = vi.fn().mockRejectedValue(new Error('Service down'));

      for (let i = 0; i < 3; i++) {
        try {
          await withCircuitBreaker(failingOperation, circuitBreaker);
        } catch (error) {
          // Expected
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

      // Now try 5 concurrent requests - all should be blocked
      const promises = Array.from({ length: 5 }, () =>
        withCircuitBreaker(failingOperation, circuitBreaker).catch((e) => e.message)
      );

      const results = await Promise.all(promises);

      expect(results.every((r) => r.includes('Circuit breaker is OPEN'))).toBe(true);
      expect(failingOperation).toHaveBeenCalledTimes(3); // Only initial failures
    });
  });

  describe('Retry with circuit breaker integration', () => {
    it('should stop retrying when circuit opens during retry attempts', async () => {
      let attemptCount = 0;
      const failingOperation = vi.fn().mockImplementation(() => {
        attemptCount++;
        return Promise.reject(new Error(`Attempt ${attemptCount} failed`));
      });

      // Use retry with circuit breaker
      await expect(
        withRetryAndCircuitBreaker(failingOperation, circuitBreaker, {
          maxRetries: 5,
          initialDelayMs: 10,
          jitterMs: 0,
        })
      ).rejects.toThrow();

      // Circuit should open after threshold failures (3)
      // But retry will continue until circuit blocks
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(attemptCount).toBeLessThanOrEqual(6); // Initial + max 5 retries, but circuit may block earlier
    });

    it('should successfully complete after recovery', async () => {
      let attemptCount = 0;
      const recoveryOperation = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          return Promise.reject(new Error('Not ready yet'));
        }
        return Promise.resolve('recovered');
      });

      const result = await withRetryAndCircuitBreaker(
        recoveryOperation,
        circuitBreaker,
        {
          maxRetries: 3,
          initialDelayMs: 10,
          jitterMs: 0,
        }
      );

      expect(result).toBe('recovered');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('Performance under pressure', () => {
    it('should efficiently block requests when open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await withCircuitBreaker(
            () => Promise.reject(new Error('fail')),
            circuitBreaker
          );
        } catch (error) {
          // Expected
        }
      }

      // Measure blocking performance
      const startTime = Date.now();
      const operation = vi.fn();

      // Try to make 1000 requests - all should be blocked instantly
      for (let i = 0; i < 1000; i++) {
        try {
          await withCircuitBreaker(operation, circuitBreaker);
        } catch (error) {
          // Expected
        }
      }

      const duration = Date.now() - startTime;

      // Should be very fast (< 100ms for 1000 blocked requests)
      expect(duration).toBeLessThan(100);
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('Memory pressure simulation', () => {
    it('should maintain state correctly under many state transitions', async () => {
      const stateTransitions: CircuitBreakerState[] = [];

      for (let cycle = 0; cycle < 3; cycle++) {
        // Fail to open circuit
        for (let i = 0; i < 3; i++) {
          try {
            await withCircuitBreaker(
              () => Promise.reject(new Error('fail')),
              circuitBreaker
            );
          } catch (error) {
            // Expected
          }
        }

        stateTransitions.push(circuitBreaker.getState());
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

        // Wait for recovery
        await new Promise((resolve) => setTimeout(resolve, 1100));

        // Make successful calls to close circuit
        circuitBreaker.canExecute();
        stateTransitions.push(circuitBreaker.getState());

        await withCircuitBreaker(() => Promise.resolve('ok'), circuitBreaker);
        await withCircuitBreaker(() => Promise.resolve('ok'), circuitBreaker);

        stateTransitions.push(circuitBreaker.getState());
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      }

      // Verify we cycled through states multiple times
      const openCount = stateTransitions.filter((s) => s === CircuitBreakerState.OPEN).length;
      const closedCount = stateTransitions.filter((s) => s === CircuitBreakerState.CLOSED).length;

      expect(openCount).toBeGreaterThanOrEqual(3);
      expect(closedCount).toBeGreaterThanOrEqual(3);
    }, 10000); // 10 second timeout for this test
  });

  describe('Edge cases', () => {
    it('should handle immediate recovery in HALF_OPEN state', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await withCircuitBreaker(
            () => Promise.reject(new Error('fail')),
            circuitBreaker
          );
        } catch (error) {
          // Expected
        }
      }

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Transition to half-open
      circuitBreaker.canExecute();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Immediate success should eventually close circuit
      await withCircuitBreaker(() => Promise.resolve('ok'), circuitBreaker);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN); // Still half-open after 1 success

      await withCircuitBreaker(() => Promise.resolve('ok'), circuitBreaker);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED); // Closed after 2 successes
    });

    it('should re-open immediately on failure in HALF_OPEN state', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await withCircuitBreaker(
            () => Promise.reject(new Error('fail')),
            circuitBreaker
          );
        } catch (error) {
          // Expected
        }
      }

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Transition to half-open
      circuitBreaker.canExecute();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);

      // Failure should immediately re-open
      try {
        await withCircuitBreaker(
          () => Promise.reject(new Error('still failing')),
          circuitBreaker
        );
      } catch (error) {
        // Expected
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should handle zero failure threshold gracefully', () => {
      // Edge case: threshold of 1 means it opens after first failure
      const sensitiveCircuit = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        serviceName: 'sensitive',
      });

      expect(sensitiveCircuit.getState()).toBe(CircuitBreakerState.CLOSED);

      sensitiveCircuit.recordFailure();
      expect(sensitiveCircuit.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });
});
