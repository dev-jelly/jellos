/**
 * Saga Service Tests
 *
 * Tests for saga pattern implementation with compensating transactions.
 * Task 12.6 - Saga Pattern for Compensating Transactions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SagaService } from '../saga.service';
import {
  SagaDefinition,
  SagaContext,
  SagaStepResult,
  SagaWorkflowType,
} from '../../types/saga';
import { prisma } from '../../lib/db';

describe('SagaService', () => {
  let sagaService: SagaService;

  beforeEach(() => {
    sagaService = new SagaService();
  });

  afterEach(async () => {
    // Cleanup saga instances
    await prisma.sagaInstance.deleteMany();
  });

  describe('Saga Registration', () => {
    it('should register a saga definition', () => {
      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
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

      expect(() => sagaService.registerSaga(definition)).not.toThrow();
    });

    it('should reject saga with duplicate step IDs', () => {
      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Invalid Saga',
        patternType: 'ORCHESTRATION',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => ({ success: true }),
            compensate: async () => {},
          },
          {
            id: 'step1', // Duplicate
            name: 'Step 1 Duplicate',
            execute: async () => ({ success: true }),
            compensate: async () => {},
          },
        ],
      };

      expect(() => sagaService.registerSaga(definition)).toThrow('Duplicate step ID');
    });

    it('should reject saga with invalid dependencies', () => {
      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Invalid Saga',
        patternType: 'ORCHESTRATION',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => ({ success: true }),
            compensate: async () => {},
            dependencies: ['nonexistent'], // Invalid dependency
          },
        ],
      };

      expect(() => sagaService.registerSaga(definition)).toThrow('invalid dependency');
    });
  });

  describe('Saga Execution - Success', () => {
    it('should execute all steps successfully', async () => {
      const step1Mock = vi.fn(async () => ({
        success: true,
        data: { step1Result: 'done' },
      }));
      const step2Mock = vi.fn(async () => ({
        success: true,
        data: { step2Result: 'done' },
      }));

      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
        patternType: 'ORCHESTRATION',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: step1Mock,
            compensate: async () => {},
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: step2Mock,
            compensate: async () => {},
            dependencies: ['step1'],
          },
        ],
      };

      sagaService.registerSaga(definition);

      const instance = await sagaService.executeSaga('CUSTOM', { input: 'test' });

      expect(step1Mock).toHaveBeenCalled();
      expect(step2Mock).toHaveBeenCalled();
      expect(instance.status).toBe('COMPLETED');
      expect(instance.completedSteps).toEqual(['step1', 'step2']);
      expect(instance.failedSteps).toEqual([]);
      expect(instance.context.output).toMatchObject({
        step1Result: 'done',
        step2Result: 'done',
      });
    });

    it('should persist saga state to database', async () => {
      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
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

      sagaService.registerSaga(definition);

      const instance = await sagaService.executeSaga('CUSTOM', { input: 'test' });

      const persisted = await prisma.sagaInstance.findUnique({
        where: { id: instance.id },
      });

      expect(persisted).not.toBeNull();
      expect(persisted?.status).toBe('COMPLETED');
      expect(persisted?.type).toBe('CUSTOM');
    });
  });

  describe('Saga Execution - Failure', () => {
    it('should handle step failure', async () => {
      const step1Mock = vi.fn(async () => ({
        success: true,
        data: { step1Result: 'done' },
      }));
      const step2Mock = vi.fn(async () => ({
        success: false,
        error: { message: 'Step 2 failed', recoverable: true },
      }));

      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
        patternType: 'ORCHESTRATION',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: step1Mock,
            compensate: async () => {},
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: step2Mock,
            compensate: async () => {},
          },
        ],
      };

      sagaService.registerSaga(definition);

      await expect(
        sagaService.executeSaga('CUSTOM', { input: 'test' })
      ).rejects.toThrow();
    });

    it('should auto-compensate on failure', async () => {
      const compensate1Mock = vi.fn(async () => {});
      const compensate2Mock = vi.fn(async () => {});

      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
        patternType: 'ORCHESTRATION',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => ({ success: true }),
            compensate: compensate1Mock,
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: async () => ({ success: true }),
            compensate: compensate2Mock,
          },
          {
            id: 'step3',
            name: 'Step 3',
            execute: async () => ({
              success: false,
              error: { message: 'Step 3 failed' },
            }),
            compensate: async () => {},
          },
        ],
      };

      sagaService.registerSaga(definition);

      await expect(
        sagaService.executeSaga('CUSTOM', { input: 'test' }, { autoCompensate: true })
      ).rejects.toThrow();

      // Wait for compensation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Compensation should happen in reverse order
      expect(compensate2Mock).toHaveBeenCalled();
      expect(compensate1Mock).toHaveBeenCalled();
    });
  });

  describe('Saga Compensation', () => {
    it('should compensate completed steps in reverse order', async () => {
      const compensations: string[] = [];

      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
        patternType: 'ORCHESTRATION',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => ({ success: true }),
            compensate: async () => {
              compensations.push('step1');
            },
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: async () => ({ success: true }),
            compensate: async () => {
              compensations.push('step2');
            },
          },
          {
            id: 'step3',
            name: 'Step 3',
            execute: async () => ({ success: true }),
            compensate: async () => {
              compensations.push('step3');
            },
          },
        ],
      };

      sagaService.registerSaga(definition);

      const instance = await sagaService.executeSaga('CUSTOM', { input: 'test' }, {
        autoCompensate: false,
      });

      expect(instance.status).toBe('COMPLETED');

      await sagaService.compensateSaga(instance.id);

      expect(compensations).toEqual(['step3', 'step2', 'step1']);
    });

    it('should handle compensation timeout', async () => {
      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
        patternType: 'ORCHESTRATION',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => ({ success: true }),
            compensate: async () => {
              // Simulate long-running compensation
              await new Promise((resolve) => setTimeout(resolve, 5000));
            },
            timeout: 100, // Very short timeout
          },
        ],
      };

      sagaService.registerSaga(definition);

      const instance = await sagaService.executeSaga('CUSTOM', { input: 'test' }, {
        autoCompensate: false,
      });

      // With stopOnFailure: true, compensation should throw on timeout
      await expect(
        sagaService.compensateSaga(instance.id, { timeout: 100, stopOnFailure: true })
      ).rejects.toThrow('Compensation timeout');
    });

    it('should mark saga as compensated after successful compensation', async () => {
      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
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

      sagaService.registerSaga(definition);

      const instance = await sagaService.executeSaga('CUSTOM', { input: 'test' }, {
        autoCompensate: false,
      });

      await sagaService.compensateSaga(instance.id);

      const updated = await sagaService.getSagaInstance(instance.id);
      expect(updated?.status).toBe('COMPENSATED');
      expect(updated?.compensatedSteps).toEqual(['step1']);
    });
  });

  describe('Saga Retry Logic', () => {
    it('should retry failed steps', async () => {
      let attempts = 0;
      const stepMock = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          return {
            success: false,
            error: { message: 'Temporary failure', recoverable: true },
          };
        }
        return { success: true };
      });

      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
        patternType: 'ORCHESTRATION',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: stepMock,
            compensate: async () => {},
            retryable: true,
            maxRetries: 3,
          },
        ],
      };

      sagaService.registerSaga(definition);

      const instance = await sagaService.executeSaga('CUSTOM', { input: 'test' });

      expect(stepMock).toHaveBeenCalledTimes(3);
      expect(instance.status).toBe('COMPLETED');
    });

    it('should fail after max retries exhausted', async () => {
      const stepMock = vi.fn(async () => ({
        success: false,
        error: { message: 'Permanent failure', recoverable: false },
      }));

      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
        patternType: 'ORCHESTRATION',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: stepMock,
            compensate: async () => {},
            retryable: true,
            maxRetries: 2,
          },
        ],
      };

      sagaService.registerSaga(definition);

      await expect(
        sagaService.executeSaga('CUSTOM', { input: 'test' })
      ).rejects.toThrow();

      expect(stepMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('Saga Step Dependencies', () => {
    it('should execute steps respecting dependencies', async () => {
      const executionOrder: string[] = [];

      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
        patternType: 'ORCHESTRATION',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async () => {
              executionOrder.push('step1');
              return { success: true };
            },
            compensate: async () => {},
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: async () => {
              executionOrder.push('step2');
              return { success: true };
            },
            compensate: async () => {},
            dependencies: ['step1'],
          },
          {
            id: 'step3',
            name: 'Step 3',
            execute: async () => {
              executionOrder.push('step3');
              return { success: true };
            },
            compensate: async () => {},
            dependencies: ['step1', 'step2'],
          },
        ],
      };

      sagaService.registerSaga(definition);

      await sagaService.executeSaga('CUSTOM', { input: 'test' });

      expect(executionOrder).toEqual(['step1', 'step2', 'step3']);
    });
  });

  describe('Saga Events', () => {
    it('should emit saga lifecycle events', async () => {
      const events: string[] = [];

      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
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

      sagaService.registerSaga(definition);

      sagaService.on('saga.started', () => events.push('started'));
      sagaService.on('saga.step.started', () => events.push('step.started'));
      sagaService.on('saga.step.completed', () => events.push('step.completed'));
      sagaService.on('saga.completed', () => events.push('completed'));

      await sagaService.executeSaga('CUSTOM', { input: 'test' });

      expect(events).toContain('started');
      expect(events).toContain('step.started');
      expect(events).toContain('step.completed');
      expect(events).toContain('completed');
    });
  });

  describe('Saga Context', () => {
    it('should pass context between steps', async () => {
      const definition: SagaDefinition = {
        type: 'CUSTOM' as SagaWorkflowType,
        name: 'Test Saga',
        patternType: 'ORCHESTRATION',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            execute: async (context) => ({
              success: true,
              data: { value: context.input.initial * 2 },
            }),
            compensate: async () => {},
          },
          {
            id: 'step2',
            name: 'Step 2',
            execute: async (context) => ({
              success: true,
              data: { result: context.output.value * 3 },
            }),
            compensate: async () => {},
            dependencies: ['step1'],
          },
        ],
      };

      sagaService.registerSaga(definition);

      const instance = await sagaService.executeSaga('CUSTOM', { initial: 5 });

      expect(instance.context.output.value).toBe(10);
      expect(instance.context.output.result).toBe(30);
    });
  });
});
