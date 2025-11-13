/**
 * Saga Event Integration Service
 *
 * Integrates saga lifecycle events with the event bus for observability and coordination.
 * Emits saga events to the event bus and persists them to the event store.
 *
 * Task 12.6 - Saga Pattern for Compensating Transactions
 */

import { sagaService } from './saga.service';
import { eventStoreService, AggregateType } from './event-store.service';
import { getEventBus } from '../lib/event-bus';
import { EventTopics } from '../lib/event-bus';
import type { SagaEvents } from './saga.service';

/**
 * Initialize saga event integration with event bus and event store
 */
export function initializeSagaEventIntegration(): void {
  let eventBus: ReturnType<typeof getEventBus> | null = null;

  // Try to get event bus (might not be initialized yet)
  try {
    eventBus = getEventBus();
  } catch (error) {
    console.warn('Event bus not initialized, saga events will not be published');
  }

  // Saga started
  sagaService.on('saga.started', async ({ sagaId, type }) => {
    // Publish to event bus
    if (eventBus) {
      await eventBus.publish(
        EventTopics.STATE_TRANSITION_EVENTS,
        'saga.started',
        {
          sagaId,
          type,
          timestamp: new Date().toISOString(),
        }
      );
    }

    // Store in event store (for saga aggregate)
    await eventStoreService.appendEvent({
      aggregateType: 'Saga' as any,
      aggregateId: sagaId,
      eventType: 'saga.started',
      payload: { type } as any,
      metadata: {
        eventId: `saga-started-${sagaId}`,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        correlationId: sagaId,
        actor: 'system',
      },
    });
  });

  // Saga step started
  sagaService.on('saga.step.started', async ({ sagaId, stepId }) => {
    if (eventBus) {
      await eventBus.publish(
        EventTopics.STATE_TRANSITION_EVENTS,
        'saga.step.started',
        {
          sagaId,
          stepId,
          timestamp: new Date().toISOString(),
        }
      );
    }

    await eventStoreService.appendEvent({
      aggregateType: 'Saga' as any,
      aggregateId: sagaId,
      eventType: 'saga.step.started',
      payload: { stepId } as any,
      metadata: {
        eventId: `saga-step-started-${sagaId}-${stepId}`,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        correlationId: sagaId,
        actor: 'system',
      },
    });
  });

  // Saga step completed
  sagaService.on('saga.step.completed', async ({ sagaId, stepId, result }) => {
    if (eventBus) {
      await eventBus.publish(
        EventTopics.STATE_TRANSITION_EVENTS,
        'saga.step.completed',
        {
          sagaId,
          stepId,
          success: result.success,
          timestamp: new Date().toISOString(),
        }
      );
    }

    await eventStoreService.appendEvent({
      aggregateType: 'Saga' as any,
      aggregateId: sagaId,
      eventType: 'saga.step.completed',
      payload: { stepId, result } as any,
      metadata: {
        eventId: `saga-step-completed-${sagaId}-${stepId}`,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        correlationId: sagaId,
        actor: 'system',
      },
    });
  });

  // Saga step failed
  sagaService.on('saga.step.failed', async ({ sagaId, stepId, error }) => {
    if (eventBus) {
      await eventBus.publish(
        EventTopics.STATE_TRANSITION_EVENTS,
        'saga.step.failed',
        {
          sagaId,
          stepId,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }
      );
    }

    await eventStoreService.appendEvent({
      aggregateType: 'Saga' as any,
      aggregateId: sagaId,
      eventType: 'saga.step.failed',
      payload: {
        stepId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      } as any,
      metadata: {
        eventId: `saga-step-failed-${sagaId}-${stepId}`,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        correlationId: sagaId,
        actor: 'system',
      },
    });
  });

  // Saga step compensating
  sagaService.on('saga.step.compensating', async ({ sagaId, stepId }) => {
    if (eventBus) {
      await eventBus.publish(
        EventTopics.STATE_TRANSITION_EVENTS,
        'saga.step.compensating',
        {
          sagaId,
          stepId,
          timestamp: new Date().toISOString(),
        }
      );
    }

    await eventStoreService.appendEvent({
      aggregateType: 'Saga' as any,
      aggregateId: sagaId,
      eventType: 'saga.step.compensating',
      payload: { stepId } as any,
      metadata: {
        eventId: `saga-step-compensating-${sagaId}-${stepId}`,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        correlationId: sagaId,
        actor: 'system',
      },
    });
  });

  // Saga step compensated
  sagaService.on('saga.step.compensated', async ({ sagaId, stepId }) => {
    if (eventBus) {
      await eventBus.publish(
        EventTopics.STATE_TRANSITION_EVENTS,
        'saga.step.compensated',
        {
          sagaId,
          stepId,
          timestamp: new Date().toISOString(),
        }
      );
    }

    await eventStoreService.appendEvent({
      aggregateType: 'Saga' as any,
      aggregateId: sagaId,
      eventType: 'saga.step.compensated',
      payload: { stepId } as any,
      metadata: {
        eventId: `saga-step-compensated-${sagaId}-${stepId}`,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        correlationId: sagaId,
        actor: 'system',
      },
    });
  });

  // Saga completed
  sagaService.on('saga.completed', async ({ sagaId, result }) => {
    if (eventBus) {
      await eventBus.publish(
        EventTopics.STATE_TRANSITION_EVENTS,
        'saga.completed',
        {
          sagaId,
          timestamp: new Date().toISOString(),
        }
      );
    }

    await eventStoreService.appendEvent({
      aggregateType: 'Saga' as any,
      aggregateId: sagaId,
      eventType: 'saga.completed',
      payload: { result } as any,
      metadata: {
        eventId: `saga-completed-${sagaId}`,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        correlationId: sagaId,
        actor: 'system',
      },
    });
  });

  // Saga failed
  sagaService.on('saga.failed', async ({ sagaId, error }) => {
    if (eventBus) {
      await eventBus.publish(
        EventTopics.STATE_TRANSITION_EVENTS,
        'saga.failed',
        {
          sagaId,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }
      );
    }

    await eventStoreService.appendEvent({
      aggregateType: 'Saga' as any,
      aggregateId: sagaId,
      eventType: 'saga.failed',
      payload: {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      } as any,
      metadata: {
        eventId: `saga-failed-${sagaId}`,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        correlationId: sagaId,
        actor: 'system',
      },
    });
  });

  // Saga compensated
  sagaService.on('saga.compensated', async ({ sagaId }) => {
    if (eventBus) {
      await eventBus.publish(
        EventTopics.STATE_TRANSITION_EVENTS,
        'saga.compensated',
        {
          sagaId,
          timestamp: new Date().toISOString(),
        }
      );
    }

    await eventStoreService.appendEvent({
      aggregateType: 'Saga' as any,
      aggregateId: sagaId,
      eventType: 'saga.compensated',
      payload: {} as any,
      metadata: {
        eventId: `saga-compensated-${sagaId}`,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        correlationId: sagaId,
        actor: 'system',
      },
    });
  });
}
