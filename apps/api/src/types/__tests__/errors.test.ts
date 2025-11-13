/**
 * Error Types Tests
 * Tests for specialized error classes and error classification
 */

import { describe, it, expect } from 'vitest';
import {
  RecoverableError,
  WorktreeError,
  ProcessExecutionError,
  GitOperationError,
  ResourceError,
  TimeoutError,
  ConfigurationError,
  AgentError,
  ErrorCategory,
} from '../errors';

describe('Error Types', () => {
  describe('RecoverableError', () => {
    it('should create error with category and recoverable flag', () => {
      class TestError extends RecoverableError {
        constructor(message: string) {
          super(message, {
            category: ErrorCategory.RETRYABLE,
            recoverable: true,
            context: { test: 'value' },
          });
        }
      }

      const error = new TestError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RecoverableError);
      expect(error.message).toBe('Test error');
      expect(error.category).toBe(ErrorCategory.RETRYABLE);
      expect(error.recoverable).toBe(true);
      expect(error.context).toEqual({ test: 'value' });
      expect(error.name).toBe('TestError');
    });

    it('should support error cause chaining', () => {
      class TestError extends RecoverableError {
        constructor(message: string, cause?: Error) {
          super(message, {
            category: ErrorCategory.NON_RETRYABLE,
            recoverable: false,
            cause,
          });
        }
      }

      const originalError = new Error('Original error');
      const error = new TestError('Wrapped error', originalError);

      expect(error.errorCause).toBe(originalError);
      expect(error.errorCause?.message).toBe('Original error');
    });
  });

  describe('WorktreeError', () => {
    it('should create worktree error with default recoverable=true', () => {
      const error = new WorktreeError('Worktree not found', {
        worktreePath: '/path/to/worktree',
        branch: 'feature/test',
      });

      expect(error).toBeInstanceOf(WorktreeError);
      expect(error).toBeInstanceOf(RecoverableError);
      expect(error.message).toBe('Worktree not found');
      expect(error.recoverable).toBe(true);
      expect(error.category).toBe(ErrorCategory.RETRYABLE);
      expect(error.context).toEqual({
        worktreePath: '/path/to/worktree',
        branch: 'feature/test',
      });
    });

    it('should support non-recoverable worktree errors', () => {
      const error = new WorktreeError('Worktree permanently corrupted', {
        worktreePath: '/path/to/worktree',
        recoverable: false,
      });

      expect(error.recoverable).toBe(false);
      expect(error.category).toBe(ErrorCategory.NON_RETRYABLE);
    });

    it('should support cause chaining', () => {
      const cause = new Error('Permission denied');
      const error = new WorktreeError('Cannot access worktree', {
        worktreePath: '/path/to/worktree',
        cause,
      });

      expect(error.errorCause).toBe(cause);
    });
  });

  describe('ProcessExecutionError', () => {
    it('should create process error with execution context', () => {
      const error = new ProcessExecutionError('Process crashed', {
        processId: 12345,
        exitCode: 1,
        signal: 'SIGTERM',
      });

      expect(error).toBeInstanceOf(ProcessExecutionError);
      expect(error.message).toBe('Process crashed');
      expect(error.recoverable).toBe(true);
      expect(error.category).toBe(ErrorCategory.RETRYABLE);
      expect(error.context).toEqual({
        processId: 12345,
        exitCode: 1,
        signal: 'SIGTERM',
      });
    });

    it('should support non-recoverable process errors', () => {
      const error = new ProcessExecutionError('Process validation failed', {
        processId: 12345,
        exitCode: 127,
        recoverable: false,
      });

      expect(error.recoverable).toBe(false);
      expect(error.category).toBe(ErrorCategory.NON_RETRYABLE);
    });
  });

  describe('GitOperationError', () => {
    it('should create git error with operation context', () => {
      const error = new GitOperationError('Merge conflict detected', {
        operation: 'merge',
        repository: '/path/to/repo',
      });

      expect(error).toBeInstanceOf(GitOperationError);
      expect(error.message).toBe('Merge conflict detected');
      expect(error.recoverable).toBe(true);
      expect(error.category).toBe(ErrorCategory.RETRYABLE);
      expect(error.context).toEqual({
        operation: 'merge',
        repository: '/path/to/repo',
      });
    });

    it('should support non-recoverable git errors', () => {
      const error = new GitOperationError('Repository corrupted', {
        operation: 'checkout',
        repository: '/path/to/repo',
        recoverable: false,
      });

      expect(error.recoverable).toBe(false);
      expect(error.category).toBe(ErrorCategory.NON_RETRYABLE);
    });
  });

  describe('ResourceError', () => {
    it('should create resource error with usage metrics', () => {
      const error = new ResourceError('Disk space exhausted', {
        resourceType: 'disk',
        currentUsage: 95,
        limit: 90,
      });

      expect(error).toBeInstanceOf(ResourceError);
      expect(error.message).toBe('Disk space exhausted');
      expect(error.recoverable).toBe(true);
      expect(error.category).toBe(ErrorCategory.RETRYABLE); // Always retryable
      expect(error.context).toEqual({
        resourceType: 'disk',
        currentUsage: 95,
        limit: 90,
      });
    });

    it('should support all resource types', () => {
      const resourceTypes: Array<'disk' | 'memory' | 'cpu' | 'network'> = [
        'disk',
        'memory',
        'cpu',
        'network',
      ];

      for (const resourceType of resourceTypes) {
        const error = new ResourceError(`${resourceType} exhausted`, {
          resourceType,
          currentUsage: 100,
          limit: 90,
        });

        expect(error.context?.resourceType).toBe(resourceType);
        expect(error.category).toBe(ErrorCategory.RETRYABLE);
      }
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error with timing information', () => {
      const error = new TimeoutError('Execution timeout', {
        timeoutMs: 30000,
        elapsedMs: 35000,
      });

      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.message).toBe('Execution timeout');
      expect(error.recoverable).toBe(false); // Default: false
      expect(error.category).toBe(ErrorCategory.RETRYABLE);
      expect(error.context).toEqual({
        timeoutMs: 30000,
        elapsedMs: 35000,
      });
    });

    it('should support recoverable timeouts', () => {
      const error = new TimeoutError('Temporary timeout', {
        timeoutMs: 5000,
        elapsedMs: 5001,
        recoverable: true,
      });

      expect(error.recoverable).toBe(true);
    });
  });

  describe('ConfigurationError', () => {
    it('should create non-recoverable configuration error', () => {
      const error = new ConfigurationError('Invalid configuration', {
        configKey: 'agent.timeout',
        expectedType: 'number',
        actualValue: 'invalid',
      });

      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.message).toBe('Invalid configuration');
      expect(error.recoverable).toBe(false); // Always false
      expect(error.category).toBe(ErrorCategory.NON_RETRYABLE); // Always non-retryable
      expect(error.context).toEqual({
        configKey: 'agent.timeout',
        expectedType: 'number',
        actualValue: 'invalid',
      });
    });

    it('should support cause chaining for config errors', () => {
      const cause = new TypeError('Invalid type');
      const error = new ConfigurationError('Config validation failed', {
        configKey: 'test.key',
        cause,
      });

      expect(error.errorCause).toBe(cause);
    });
  });

  describe('AgentError', () => {
    it('should create agent error with agent context', () => {
      const error = new AgentError('Agent execution failed', {
        agentId: 'test-agent-1',
        agentCmd: 'node agent.js',
      });

      expect(error).toBeInstanceOf(AgentError);
      expect(error.message).toBe('Agent execution failed');
      expect(error.recoverable).toBe(true); // Default: true
      expect(error.category).toBe(ErrorCategory.RETRYABLE);
      expect(error.context).toEqual({
        agentId: 'test-agent-1',
        agentCmd: 'node agent.js',
      });
    });

    it('should support non-recoverable agent errors', () => {
      const error = new AgentError('Agent not found', {
        agentId: 'missing-agent',
        recoverable: false,
      });

      expect(error.recoverable).toBe(false);
      expect(error.category).toBe(ErrorCategory.NON_RETRYABLE);
    });
  });

  describe('Error Hierarchy', () => {
    it('should maintain instanceof relationships', () => {
      const errors = [
        new WorktreeError('test'),
        new ProcessExecutionError('test'),
        new GitOperationError('test'),
        new ResourceError('test'),
        new TimeoutError('test'),
        new ConfigurationError('test'),
        new AgentError('test'),
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(RecoverableError);
      }
    });

    it('should preserve error names for debugging', () => {
      const errors = [
        { error: new WorktreeError('test'), expectedName: 'WorktreeError' },
        { error: new ProcessExecutionError('test'), expectedName: 'ProcessExecutionError' },
        { error: new GitOperationError('test'), expectedName: 'GitOperationError' },
        { error: new ResourceError('test'), expectedName: 'ResourceError' },
        { error: new TimeoutError('test'), expectedName: 'TimeoutError' },
        { error: new ConfigurationError('test'), expectedName: 'ConfigurationError' },
        { error: new AgentError('test'), expectedName: 'AgentError' },
      ];

      for (const { error, expectedName } of errors) {
        expect(error.name).toBe(expectedName);
      }
    });
  });

  describe('Error Context', () => {
    it('should support optional context fields', () => {
      const error1 = new WorktreeError('test');
      const error2 = new ProcessExecutionError('test');
      const error3 = new GitOperationError('test');

      expect(error1.context?.worktreePath).toBeUndefined();
      expect(error2.context?.processId).toBeUndefined();
      expect(error3.context?.operation).toBeUndefined();
    });

    it('should preserve all context fields', () => {
      const error = new ProcessExecutionError('test', {
        processId: 123,
        exitCode: 1,
        signal: 'SIGTERM',
      });

      expect(error.context).toHaveProperty('processId', 123);
      expect(error.context).toHaveProperty('exitCode', 1);
      expect(error.context).toHaveProperty('signal', 'SIGTERM');
    });
  });

  describe('Error Categories', () => {
    it('should correctly categorize retryable errors', () => {
      const retryableErrors = [
        new WorktreeError('test'),
        new ProcessExecutionError('test'),
        new GitOperationError('test'),
        new ResourceError('test'),
        new TimeoutError('test'),
        new AgentError('test'),
      ];

      for (const error of retryableErrors) {
        expect(error.category).toBe(ErrorCategory.RETRYABLE);
      }
    });

    it('should correctly categorize non-retryable errors', () => {
      const nonRetryableErrors = [
        new ConfigurationError('test'),
        new WorktreeError('test', { recoverable: false }),
        new ProcessExecutionError('test', { recoverable: false }),
        new GitOperationError('test', { recoverable: false }),
        new AgentError('test', { recoverable: false }),
      ];

      for (const error of nonRetryableErrors) {
        expect(error.category).toBe(ErrorCategory.NON_RETRYABLE);
      }
    });
  });

  describe('Real-world scenarios', () => {
    it('should model disk space exhaustion', () => {
      const error = new ResourceError('Insufficient disk space for worktree', {
        resourceType: 'disk',
        currentUsage: 95,
        limit: 90,
      });

      expect(error.recoverable).toBe(true);
      expect(error.category).toBe(ErrorCategory.RETRYABLE);
      expect(error.context?.resourceType).toBe('disk');
    });

    it('should model git merge conflict', () => {
      const error = new GitOperationError('Merge conflict in main.ts', {
        operation: 'merge',
        repository: '/project/repo',
      });

      expect(error.recoverable).toBe(true);
      expect(error.context?.operation).toBe('merge');
    });

    it('should model agent not found', () => {
      const error = new AgentError('Agent configuration not found', {
        agentId: 'missing-agent',
        recoverable: false,
      });

      expect(error.recoverable).toBe(false);
      expect(error.category).toBe(ErrorCategory.NON_RETRYABLE);
    });

    it('should model process crash with signal', () => {
      const error = new ProcessExecutionError('Process killed by signal', {
        processId: 12345,
        signal: 'SIGKILL',
        exitCode: 137,
      });

      expect(error.context?.signal).toBe('SIGKILL');
      expect(error.context?.exitCode).toBe(137);
    });

    it('should model configuration validation error', () => {
      const validationError = new TypeError('Expected number, got string');
      const error = new ConfigurationError('Invalid timeout configuration', {
        configKey: 'execution.timeout',
        expectedType: 'number',
        actualValue: 'invalid',
        cause: validationError,
      });

      expect(error.recoverable).toBe(false);
      expect(error.errorCause).toBe(validationError);
    });
  });
});
