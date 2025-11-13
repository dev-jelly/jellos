/**
 * Event Bus Module
 *
 * Pluggable event bus with support for multiple adapters:
 * - InMemoryAdapter: For development and testing
 * - RedisAdapter: For distributed pub/sub with Redis
 * - KafkaAdapter: For production-grade message streaming
 *
 * @example
 * ```ts
 * import { createEventBus, EventTopics } from './lib/event-bus';
 *
 * // Create event bus from environment
 * const eventBus = await createEventBus();
 *
 * // Publish an event
 * await eventBus.publish(
 *   EventTopics.ISSUE_EVENTS,
 *   'issue.state.changed',
 *   { issueId: '123', from: 'TODO', to: 'IN_PROGRESS' }
 * );
 *
 * // Subscribe to events
 * await eventBus.subscribe(
 *   EventTopics.ISSUE_EVENTS,
 *   async (event) => {
 *     console.log('Received event:', event);
 *   },
 *   { maxRetries: 3, useDLQ: true }
 * );
 * ```
 */

export * from './types';
export * from './event-bus';
export * from './factory';
export * from './adapters/memory.adapter';
export * from './adapters/redis.adapter';
// export * from './adapters/kafka.adapter'; // Temporarily disabled due to missing kafkajs dependency

import { EventBus } from './event-bus';
import { createEventBusAdapterFromEnv } from './factory';

/**
 * Standard event topics for the application
 */
export const EventTopics = {
  ISSUE_EVENTS: 'issue.events',
  EXECUTION_EVENTS: 'execution.events',
  PROJECT_EVENTS: 'project.events',
  WORKTREE_EVENTS: 'worktree.events',
  AGENT_EVENTS: 'agent.events',
  PR_EVENTS: 'pr.events',
  DEPLOYMENT_EVENTS: 'deployment.events',
  STATE_TRANSITION_EVENTS: 'state.transition.events',
} as const;

/**
 * Application event types
 */
export interface ApplicationEvents {
  // Issue events
  'issue.created': { issueId: string; projectId: string };
  'issue.updated': { issueId: string; projectId: string; changes: Record<string, any> };
  'issue.deleted': { issueId: string; projectId: string };
  'issue.state.changed': {
    issueId: string;
    projectId: string;
    from: string;
    to: string;
    reason?: string;
  };

  // Execution events
  'execution.started': { executionId: string; issueId: string; agentId: string };
  'execution.completed': { executionId: string; issueId: string; status: string };
  'execution.failed': { executionId: string; issueId: string; error: string };
  'execution.state.changed': {
    executionId: string;
    from: string;
    to: string;
    reason?: string;
  };

  // Project events
  'project.created': { projectId: string; name: string };
  'project.updated': { projectId: string; changes: Record<string, any> };
  'project.deleted': { projectId: string };

  // Worktree events
  'worktree.created': { worktreeId: string; projectId: string; path: string };
  'worktree.deleted': { worktreeId: string; projectId: string };

  // Agent events
  'agent.started': { agentId: string; projectId: string };
  'agent.stopped': { agentId: string; projectId: string };
  'agent.error': { agentId: string; projectId: string; error: string };

  // PR events
  'pr.created': { prId: string; issueId?: string; projectId: string };
  'pr.updated': { prId: string; changes: Record<string, any> };
  'pr.merged': { prId: string; issueId?: string; projectId: string };
  'pr.closed': { prId: string; issueId?: string; projectId: string };

  // Deployment events
  'deployment.started': { deploymentId: string; prId: string; environment: string };
  'deployment.completed': { deploymentId: string; prId: string; environment: string };
  'deployment.failed': { deploymentId: string; prId: string; environment: string; error: string };

  // State transition events
  'state.transition.started': { entityType: string; entityId: string; from: string; to: string };
  'state.transition.completed': { entityType: string; entityId: string; from: string; to: string };
  'state.transition.failed': {
    entityType: string;
    entityId: string;
    from: string;
    to: string;
    error: string;
  };
  'state.transition.rollback': {
    entityType: string;
    entityId: string;
    from: string;
    to: string;
    reason: string;
  };
}

/**
 * Global event bus singleton
 */
let globalEventBus: EventBus | null = null;

/**
 * Create or get the global event bus instance
 */
export async function createEventBus(serviceName?: string): Promise<EventBus> {
  if (!globalEventBus) {
    const adapter = await createEventBusAdapterFromEnv();
    globalEventBus = new EventBus(adapter, serviceName);
  }
  return globalEventBus;
}

/**
 * Get the global event bus instance (throws if not initialized)
 */
export function getEventBus(): EventBus {
  if (!globalEventBus) {
    throw new Error(
      'Event bus not initialized. Call createEventBus() first.'
    );
  }
  return globalEventBus;
}

/**
 * Reset the global event bus (useful for testing)
 */
export async function resetEventBus(): Promise<void> {
  if (globalEventBus) {
    await globalEventBus.close();
    globalEventBus = null;
  }
}
