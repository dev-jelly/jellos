/**
 * Event Bus Usage Examples
 *
 * This file demonstrates common patterns and use cases for the event bus system.
 */

import { createEventBus, EventTopics, type ApplicationEvents } from './index';

/**
 * Example 1: Basic Event Publishing and Subscribing
 */
export async function basicUsageExample() {
  // Initialize event bus
  const eventBus = await createEventBus('example-service');

  // Subscribe to events
  const subscriptionId = await eventBus.subscribe(
    EventTopics.ISSUE_EVENTS,
    async (event) => {
      console.log('Received event:', event.type);
      console.log('Payload:', event.payload);
      console.log('Metadata:', event.metadata);
    }
  );

  // Publish an event
  await eventBus.publish(
    EventTopics.ISSUE_EVENTS,
    'issue.created',
    {
      issueId: 'issue-123',
      projectId: 'proj-456',
    }
  );

  // Unsubscribe when done
  await eventBus.unsubscribe(subscriptionId);
}

/**
 * Example 2: State Machine Integration
 */
export async function stateMachineExample() {
  const eventBus = await createEventBus();

  // Subscribe to state transition events
  await eventBus.subscribe(
    EventTopics.STATE_TRANSITION_EVENTS,
    async (event) => {
      if (event.type === 'issue.state.changed') {
        const { issueId, from, to, reason } = event.payload;

        console.log(`Issue ${issueId} transitioned from ${from} to ${to}`);

        // Persist state change to database
        await saveStateHistory({
          entityType: 'issue',
          entityId: issueId,
          fromState: from,
          toState: to,
          reason,
          timestamp: event.metadata.timestamp,
        });

        // Trigger side effects based on state
        if (to === 'DONE') {
          await eventBus.publish(
            EventTopics.ISSUE_EVENTS,
            'issue.completed',
            { issueId },
            { metadata: { correlationId: event.metadata.correlationId } }
          );
        }
      }
    }
  );

  // Publish state transition
  await eventBus.publish(
    EventTopics.STATE_TRANSITION_EVENTS,
    'issue.state.changed',
    {
      issueId: 'issue-123',
      projectId: 'proj-456',
      from: 'IN_PROGRESS',
      to: 'DONE',
      reason: 'All tasks completed',
    },
    {
      metadata: {
        correlationId: 'exec-789',
        userId: 'user-001',
      },
    }
  );
}

/**
 * Example 3: Event Sourcing Pattern
 */
export async function eventSourcingExample() {
  const eventBus = await createEventBus();

  // Event store
  const eventStore: any[] = [];

  // Subscribe to all issue events for event sourcing
  await eventBus.subscribe(EventTopics.ISSUE_EVENTS, async (event) => {
    // Store every event
    eventStore.push({
      eventId: event.metadata.eventId,
      eventType: event.type,
      timestamp: event.metadata.timestamp,
      payload: event.payload,
      metadata: event.metadata,
    });

    console.log(`Stored event: ${event.type}`);
  });

  // Publish multiple events
  await eventBus.publish(EventTopics.ISSUE_EVENTS, 'issue.created', {
    issueId: 'issue-1',
    title: 'Implement feature X',
  });

  await eventBus.publish(EventTopics.ISSUE_EVENTS, 'issue.state.changed', {
    issueId: 'issue-1',
    from: 'TODO',
    to: 'IN_PROGRESS',
  });

  await eventBus.publish(EventTopics.ISSUE_EVENTS, 'issue.updated', {
    issueId: 'issue-1',
    changes: { assignee: 'user-123' },
  });

  // Replay events to rebuild state
  function replayEvents(issueId: string) {
    const issueEvents = eventStore.filter(
      (e) => e.payload.issueId === issueId
    );

    let state: any = {};

    for (const event of issueEvents) {
      switch (event.eventType) {
        case 'issue.created':
          state = { ...event.payload, status: 'TODO' };
          break;
        case 'issue.state.changed':
          state.status = event.payload.to;
          break;
        case 'issue.updated':
          state = { ...state, ...event.payload.changes };
          break;
      }
    }

    return state;
  }

  const currentState = replayEvents('issue-1');
  console.log('Replayed state:', currentState);
}

/**
 * Example 4: Saga Pattern with Compensation
 */
export async function sagaPatternExample() {
  const eventBus = await createEventBus();

  // Listen for saga failures and execute compensations
  await eventBus.subscribe('saga.events', async (event) => {
    if (event.type === 'saga.failed') {
      const { sagaId, failedStep, compensationActions } = event.payload;

      console.log(`Saga ${sagaId} failed at step ${failedStep}`);

      // Execute compensating transactions in reverse order
      for (const action of compensationActions.reverse()) {
        console.log(`Executing compensation: ${action.type}`);

        switch (action.type) {
          case 'deleteWorktree':
            await deleteWorktree(action.worktreeId);
            break;
          case 'revertIssueState':
            await revertIssueState(action.issueId, action.previousState);
            break;
          case 'deletePR':
            await deletePR(action.prId);
            break;
        }
      }

      // Publish compensation completed event
      await eventBus.publish(
        'saga.events',
        'saga.compensated',
        { sagaId },
        { metadata: { correlationId: event.metadata.correlationId } }
      );
    }
  });

  // Simulate saga execution
  try {
    await createWorktree('wt-123');
    await updateIssueState('issue-123', 'IN_PROGRESS');
    await createPR('pr-456');

    // Simulate failure
    throw new Error('Deployment failed');
  } catch (error) {
    // Publish saga failure event
    await eventBus.publish('saga.events', 'saga.failed', {
      sagaId: 'saga-789',
      failedStep: 'deploy',
      compensationActions: [
        { type: 'deletePR', prId: 'pr-456' },
        { type: 'revertIssueState', issueId: 'issue-123', previousState: 'TODO' },
        { type: 'deleteWorktree', worktreeId: 'wt-123' },
      ],
    });
  }
}

/**
 * Example 5: Retry and Dead Letter Queue
 */
export async function retryAndDLQExample() {
  const eventBus = await createEventBus();

  // Subscribe to DLQ to monitor failures
  await eventBus.subscribe('orders.failed', async (event) => {
    console.error('Order processing permanently failed:', {
      originalEvent: event.payload,
      failureReason: event.metadata.failureReason,
      failedAt: event.metadata.failedAt,
    });

    // Send alert to operations team
    await sendAlert({
      severity: 'critical',
      message: `Order ${event.payload.orderId} failed after retries`,
      metadata: event.metadata,
    });
  });

  // Subscribe with retry and DLQ
  await eventBus.subscribe(
    'orders.processing',
    async (event) => {
      // Simulate flaky processing
      const { orderId, amount } = event.payload;

      // This might fail temporarily
      await processPayment(orderId, amount);

      console.log(`Successfully processed order ${orderId}`);
    },
    {
      maxRetries: 3,
      useDLQ: true,
      dlqTopic: 'orders.failed',
    }
  );

  // Publish order
  await eventBus.publish('orders.processing', 'order.created', {
    orderId: 'order-123',
    amount: 99.99,
  });
}

/**
 * Example 6: Correlation IDs for Distributed Tracing
 */
export async function correlationIdExample() {
  const eventBus = await createEventBus();
  const correlationId = generateCorrelationId();

  // All related events share the same correlation ID
  await eventBus.publish(
    EventTopics.ISSUE_EVENTS,
    'issue.created',
    { issueId: 'issue-123' },
    { metadata: { correlationId } }
  );

  await eventBus.publish(
    EventTopics.EXECUTION_EVENTS,
    'execution.started',
    { executionId: 'exec-456', issueId: 'issue-123' },
    { metadata: { correlationId } }
  );

  await eventBus.publish(
    EventTopics.PR_EVENTS,
    'pr.created',
    { prId: 'pr-789', issueId: 'issue-123' },
    { metadata: { correlationId } }
  );

  // Later, query all events by correlation ID to see the complete flow
  // const relatedEvents = await queryEventsByCorrelationId(correlationId);
}

/**
 * Example 7: Fan-out Pattern
 */
export async function fanOutExample() {
  const eventBus = await createEventBus();

  // Multiple independent subscribers process the same event
  await eventBus.subscribe(EventTopics.ISSUE_EVENTS, async (event) => {
    if (event.type === 'issue.created') {
      await sendNotification(event.payload);
    }
  });

  await eventBus.subscribe(EventTopics.ISSUE_EVENTS, async (event) => {
    if (event.type === 'issue.created') {
      await updateAnalytics(event.payload);
    }
  });

  await eventBus.subscribe(EventTopics.ISSUE_EVENTS, async (event) => {
    if (event.type === 'issue.created') {
      await triggerWebhook(event.payload);
    }
  });

  // Single publish triggers all three handlers
  await eventBus.publish(EventTopics.ISSUE_EVENTS, 'issue.created', {
    issueId: 'issue-123',
    projectId: 'proj-456',
  });
}

// Helper functions (stubs for examples)
async function saveStateHistory(data: any) {
  console.log('Saving state history:', data);
}
async function deleteWorktree(id: string) {
  console.log('Deleting worktree:', id);
}
async function revertIssueState(id: string, state: string) {
  console.log(`Reverting issue ${id} to ${state}`);
}
async function deletePR(id: string) {
  console.log('Deleting PR:', id);
}
async function createWorktree(id: string) {
  console.log('Creating worktree:', id);
}
async function updateIssueState(id: string, state: string) {
  console.log(`Updating issue ${id} to ${state}`);
}
async function createPR(id: string) {
  console.log('Creating PR:', id);
}
async function processPayment(orderId: string, amount: number) {
  console.log(`Processing payment for ${orderId}: $${amount}`);
}
async function sendAlert(alert: any) {
  console.log('Sending alert:', alert);
}
function generateCorrelationId() {
  return `corr-${Date.now()}`;
}
async function sendNotification(payload: any) {
  console.log('Sending notification:', payload);
}
async function updateAnalytics(payload: any) {
  console.log('Updating analytics:', payload);
}
async function triggerWebhook(payload: any) {
  console.log('Triggering webhook:', payload);
}
