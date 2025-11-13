/**
 * Saga Service
 *
 * Implements saga pattern for compensating transactions in multi-step workflows.
 * Supports both orchestration and choreography patterns with automatic rollback.
 *
 * Task 12.6 - Saga Pattern for Compensating Transactions
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { prisma } from '../lib/db';
import { TimeoutError } from '../types/errors';
import {
  SagaDefinition,
  SagaInstance,
  SagaContext,
  SagaStepDefinition,
  SagaStepState,
  SagaStepResult,
  SagaExecutionOptions,
  CompensationOptions,
  SagaStatus,
  SagaStepStatus,
  SagaWorkflowType,
  SagaPatternType,
} from '../types/saga';

/**
 * Saga events
 */
export interface SagaEvents {
  'saga.started': { sagaId: string; type: SagaWorkflowType };
  'saga.step.started': { sagaId: string; stepId: string };
  'saga.step.completed': { sagaId: string; stepId: string; result: SagaStepResult };
  'saga.step.failed': { sagaId: string; stepId: string; error: any };
  'saga.step.compensating': { sagaId: string; stepId: string };
  'saga.step.compensated': { sagaId: string; stepId: string };
  'saga.completed': { sagaId: string; result: any };
  'saga.failed': { sagaId: string; error: any };
  'saga.compensated': { sagaId: string };
}

/**
 * Saga orchestrator service
 */
export class SagaService extends EventEmitter {
  private sagas: Map<SagaWorkflowType, SagaDefinition> = new Map();
  private runningInstances: Map<string, SagaInstance> = new Map();

  /**
   * Register a saga definition
   */
  registerSaga(definition: SagaDefinition): void {
    // Validate definition
    this.validateSagaDefinition(definition);
    this.sagas.set(definition.type, definition);
  }

  /**
   * Execute a saga
   */
  async executeSaga(
    type: SagaWorkflowType,
    input: Record<string, any>,
    options: SagaExecutionOptions = {}
  ): Promise<SagaInstance> {
    const definition = this.sagas.get(type);
    if (!definition) {
      throw new Error(`Saga definition not found for type: ${type}`);
    }

    // Create saga instance
    const instance = await this.createSagaInstance(definition, input, options);

    // Persist initial state
    await this.persistSagaState(instance);

    // Emit started event
    this.emit('saga.started', { sagaId: instance.id, type: instance.type });

    // Execute based on pattern type
    if (definition.patternType === 'ORCHESTRATION') {
      await this.executeOrchestration(instance, definition, options);
    } else {
      await this.executeChoreography(instance, definition, options);
    }

    return instance;
  }

  /**
   * Get saga instance by ID
   */
  async getSagaInstance(sagaId: string): Promise<SagaInstance | null> {
    // Check in-memory first
    const running = this.runningInstances.get(sagaId);
    if (running) {
      return running;
    }

    // Load from database
    return this.loadSagaInstance(sagaId);
  }

  /**
   * Compensate a saga (rollback)
   */
  async compensateSaga(
    sagaId: string,
    options: CompensationOptions = {}
  ): Promise<void> {
    const instance = await this.getSagaInstance(sagaId);
    if (!instance) {
      throw new Error(`Saga instance not found: ${sagaId}`);
    }

    if (instance.status === SagaStatus.COMPENSATED || instance.status === SagaStatus.COMPENSATING) {
      return; // Already compensated or compensating
    }

    // Update status
    instance.status = SagaStatus.COMPENSATING;
    await this.persistSagaState(instance);

    // Get steps to compensate
    const stepsToCompensate = options.steps || [...instance.completedSteps];

    // Reverse order for compensation
    if (options.reverseOrder !== false) {
      stepsToCompensate.reverse();
    }

    const definition = this.sagas.get(instance.type);
    if (!definition) {
      throw new Error(`Saga definition not found for type: ${instance.type}`);
    }

    // Compensate each step
    for (const stepId of stepsToCompensate) {
      const stepDef = definition.steps.find((s) => s.id === stepId);
      if (!stepDef) {
        continue;
      }

      const stepState = instance.stepStates.get(stepId);
      if (!stepState || stepState.status !== 'COMPLETED') {
        continue; // Skip non-completed steps
      }

      try {
        this.emit('saga.step.compensating', { sagaId: instance.id, stepId });

        // Execute compensation with timeout
        await this.executeWithTimeout(
          () => stepDef.compensate(instance.context),
          options.timeout || stepDef.timeout || 30000,
          `Compensation timeout for step ${stepId}`
        );

        // Update step state
        stepState.status = SagaStepStatus.COMPENSATED;
        stepState.compensatedAt = new Date();
        instance.compensatedSteps.push(stepId);

        this.emit('saga.step.compensated', { sagaId: instance.id, stepId });

        await this.persistSagaState(instance);
      } catch (error) {
        stepState.status = SagaStepStatus.FAILED;
        stepState.error = {
          message: error instanceof Error ? error.message : String(error),
          cause: error instanceof Error ? error : undefined,
        };

        await this.persistSagaState(instance);

        if (options.stopOnFailure) {
          throw error;
        }

        // Log but continue with other compensations
        console.error(`Compensation failed for step ${stepId}:`, error);
      }
    }

    // Update final status
    instance.status = SagaStatus.COMPENSATED;
    instance.completedAt = new Date();
    await this.persistSagaState(instance);

    this.emit('saga.compensated', { sagaId: instance.id });

    // Remove from running instances
    this.runningInstances.delete(instance.id);
  }

  /**
   * Get saga history for an aggregate
   */
  async getSagaHistory(
    aggregateType: string,
    aggregateId: string
  ): Promise<SagaInstance[]> {
    const records = await prisma.sagaInstance.findMany({
      where: {
        metadata: {
          contains: aggregateId,
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    return Promise.all(records.map((r) => this.hydrateSagaInstance(r)));
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Execute saga using orchestration pattern (centralized)
   */
  private async executeOrchestration(
    instance: SagaInstance,
    definition: SagaDefinition,
    options: SagaExecutionOptions
  ): Promise<void> {
    const { autoCompensate = true } = options;

    try {
      instance.status = SagaStatus.RUNNING;
      await this.persistSagaState(instance);

      // Execute steps in order
      for (const step of definition.steps) {
        // Check dependencies
        if (step.dependencies) {
          const depsCompleted = step.dependencies.every((depId) =>
            instance.completedSteps.includes(depId)
          );
          if (!depsCompleted) {
            throw new Error(
              `Step ${step.id} dependencies not met: ${step.dependencies.join(', ')}`
            );
          }
        }

        // Execute step
        const success = await this.executeStep(instance, step, definition, options);

        if (!success) {
          // Step failed
          const isCritical =
            !definition.criticalSteps ||
            definition.criticalSteps.includes(step.id);

          if (isCritical) {
            throw new Error(`Critical step failed: ${step.id}`);
          }

          if (!options.continueOnNonCriticalFailure) {
            throw new Error(`Step failed: ${step.id}`);
          }

          // Continue with next step
          continue;
        }
      }

      // All steps completed successfully
      instance.status = SagaStatus.COMPLETED;
      instance.completedAt = new Date();
      await this.persistSagaState(instance);

      this.emit('saga.completed', {
        sagaId: instance.id,
        result: instance.context.output,
      });

      // Remove from running instances
      this.runningInstances.delete(instance.id);
    } catch (error) {
      // Saga failed
      instance.status = SagaStatus.FAILED;
      instance.completedAt = new Date();
      instance.error = {
        message: error instanceof Error ? error.message : String(error),
        cause: error instanceof Error ? error : undefined,
      };

      await this.persistSagaState(instance);

      this.emit('saga.failed', { sagaId: instance.id, error });

      // Auto-compensate if enabled
      if (autoCompensate && instance.completedSteps.length > 0) {
        try {
          await this.compensateSaga(instance.id);
        } catch (compensateError) {
          console.error('Auto-compensation failed:', compensateError);
        }
      }

      // Remove from running instances
      this.runningInstances.delete(instance.id);

      throw error;
    }
  }

  /**
   * Execute saga using choreography pattern (event-driven)
   */
  private async executeChoreography(
    instance: SagaInstance,
    definition: SagaDefinition,
    options: SagaExecutionOptions
  ): Promise<void> {
    // For choreography, steps listen to events and trigger each other
    // This is a simplified implementation - in production, this would integrate
    // with the event bus and allow steps to subscribe to specific events

    instance.status = SagaStatus.RUNNING;
    await this.persistSagaState(instance);

    // For now, delegate to orchestration pattern
    // A full choreography implementation would require event subscriptions
    await this.executeOrchestration(instance, definition, options);
  }

  /**
   * Execute a single saga step
   */
  private async executeStep(
    instance: SagaInstance,
    step: SagaStepDefinition,
    definition: SagaDefinition,
    options: SagaExecutionOptions
  ): Promise<boolean> {
    // Initialize step state
    let stepState = instance.stepStates.get(step.id);
    if (!stepState) {
      stepState = {
        stepId: step.id,
        status: SagaStepStatus.PENDING,
        attempts: 0,
      };
      instance.stepStates.set(step.id, stepState);
    }

    const maxRetries = step.retryable ? step.maxRetries || 3 : 1;

    // Retry loop
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      stepState.attempts = attempt + 1;
      stepState.status = SagaStepStatus.RUNNING;
      stepState.startedAt = new Date();

      this.emit('saga.step.started', { sagaId: instance.id, stepId: step.id });

      try {
        // Execute with timeout
        const timeout =
          step.timeout || options.timeout || definition.timeout || 60000;
        const result = await this.executeWithTimeout(
          () => step.execute(instance.context),
          timeout,
          `Step ${step.id} timeout`
        );

        // Store result
        stepState.result = result;
        stepState.completedAt = new Date();

        if (result.success) {
          // Step succeeded
          stepState.status = SagaStepStatus.COMPLETED;
          instance.completedSteps.push(step.id);

          // Merge result data into output
          if (result.data) {
            instance.context.output = {
              ...instance.context.output,
              ...result.data,
            };
          }

          // Store step result
          instance.context.stepResults.set(step.id, result);

          await this.persistSagaState(instance);

          this.emit('saga.step.completed', {
            sagaId: instance.id,
            stepId: step.id,
            result,
          });

          return true;
        } else {
          // Step failed
          throw new Error(
            result.error?.message || `Step ${step.id} failed`
          );
        }
      } catch (error) {
        stepState.error = {
          message: error instanceof Error ? error.message : String(error),
          cause: error instanceof Error ? error : undefined,
        };

        // Check if we should retry
        if (attempt < maxRetries - 1 && step.retryable) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await this.sleep(delay);
          continue;
        }

        // All retries exhausted
        stepState.status = SagaStepStatus.FAILED;
        stepState.completedAt = new Date();
        instance.failedSteps.push(step.id);

        await this.persistSagaState(instance);

        this.emit('saga.step.failed', {
          sagaId: instance.id,
          stepId: step.id,
          error,
        });

        return false;
      }
    }

    return false;
  }

  /**
   * Create a new saga instance
   */
  private async createSagaInstance(
    definition: SagaDefinition,
    input: Record<string, any>,
    options: SagaExecutionOptions
  ): Promise<SagaInstance> {
    const sagaId = randomUUID();
    const correlationId = options.correlationId || randomUUID();

    const context: SagaContext = {
      sagaId,
      correlationId,
      input,
      output: {},
      stepResults: new Map(),
      metadata: options.metadata || {},
      timeout: options.timeout || definition.timeout,
      startedAt: new Date(),
    };

    const instance: SagaInstance = {
      id: sagaId,
      type: definition.type,
      status: SagaStatus.PENDING,
      context,
      stepStates: new Map(),
      completedSteps: [],
      failedSteps: [],
      compensatedSteps: [],
      startedAt: new Date(),
      metadata: options.metadata,
    };

    // Initialize step states
    for (const step of definition.steps) {
      instance.stepStates.set(step.id, {
        stepId: step.id,
        status: SagaStepStatus.PENDING,
        attempts: 0,
      });
    }

    // Store in running instances
    this.runningInstances.set(sagaId, instance);

    return instance;
  }

  /**
   * Persist saga state to database
   */
  private async persistSagaState(instance: SagaInstance): Promise<void> {
    const definition = this.sagas.get(instance.type);
    const patternType = definition?.patternType || 'ORCHESTRATION';

    const data = {
      id: instance.id,
      type: instance.type,
      status: instance.status,
      patternType,
      context: JSON.stringify({
        ...instance.context,
        stepResults: Array.from(instance.context.stepResults.entries()),
      }),
      stepStates: JSON.stringify(
        Array.from(instance.stepStates.entries()).map(([id, state]) => [
          id,
          {
            ...state,
            error: state.error
              ? {
                  message: state.error.message,
                  code: state.error.code,
                }
              : undefined,
          },
        ])
      ),
      completedSteps: JSON.stringify(instance.completedSteps),
      failedSteps: JSON.stringify(instance.failedSteps),
      compensatedSteps: JSON.stringify(instance.compensatedSteps),
      error: instance.error ? JSON.stringify(instance.error) : undefined,
      metadata: instance.metadata ? JSON.stringify(instance.metadata) : undefined,
      startedAt: instance.startedAt,
      completedAt: instance.completedAt,
    };

    await prisma.sagaInstance.upsert({
      where: { id: instance.id },
      create: data,
      update: data,
    });
  }

  /**
   * Load saga instance from database
   */
  private async loadSagaInstance(sagaId: string): Promise<SagaInstance | null> {
    const record = await prisma.sagaInstance.findUnique({
      where: { id: sagaId },
    });

    if (!record) {
      return null;
    }

    return this.hydrateSagaInstance(record);
  }

  /**
   * Hydrate saga instance from database record
   */
  private hydrateSagaInstance(record: any): SagaInstance {
    const context = JSON.parse(record.context);
    const stepResults = new Map(context.stepResults || []);

    const instance: SagaInstance = {
      id: record.id,
      type: record.type,
      status: record.status,
      context: {
        ...context,
        stepResults,
      },
      stepStates: new Map(JSON.parse(record.stepStates)),
      completedSteps: JSON.parse(record.completedSteps),
      failedSteps: JSON.parse(record.failedSteps),
      compensatedSteps: JSON.parse(record.compensatedSteps),
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      error: record.error ? JSON.parse(record.error) : undefined,
      metadata: record.metadata ? JSON.parse(record.metadata) : undefined,
    };

    return instance;
  }

  /**
   * Validate saga definition
   */
  private validateSagaDefinition(definition: SagaDefinition): void {
    if (!definition.type) {
      throw new Error('Saga definition must have a type');
    }

    if (!definition.steps || definition.steps.length === 0) {
      throw new Error('Saga definition must have at least one step');
    }

    // Validate step IDs are unique
    const stepIds = new Set<string>();
    for (const step of definition.steps) {
      if (stepIds.has(step.id)) {
        throw new Error(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);
    }

    // Validate dependencies exist
    for (const step of definition.steps) {
      if (step.dependencies) {
        for (const depId of step.dependencies) {
          if (!stepIds.has(depId)) {
            throw new Error(
              `Step ${step.id} has invalid dependency: ${depId}`
            );
          }
        }
      }
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new TimeoutError(timeoutMessage, { timeoutMs, recoverable: false })
            ),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const sagaService = new SagaService();
