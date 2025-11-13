import { EventEmitter } from 'events';

/**
 * Event types emitted by the system
 */
export interface SystemEvents {
  'project.created': { projectId: string };
  'project.updated': { projectId: string; changes: Record<string, any> };
  'project.deleted': { projectId: string };
  'worktree.created': { worktreeId: string; projectId: string };
  'worktree.deleted': { worktreeId: string; projectId: string };
  'issue.created': { issueId: string; projectId: string };
  'issue.updated': { issueId: string; projectId: string };
  'agent.started': { agentId: string; projectId: string };
  'agent.stopped': { agentId: string; projectId: string };

  // Circuit breaker events
  'circuit-breaker.opened': {
    service: string;
    failureCount: number;
    timestamp: Date;
  };
  'circuit-breaker.half-open': {
    service: string;
    timestamp: Date;
  };
  'circuit-breaker.closed': {
    service: string;
    successCount: number;
    timestamp: Date;
  };

  // System pressure events
  'system.pressure.high': {
    type: 'memory' | 'eventLoop' | 'heap';
    value: number;
    threshold: number;
    timestamp: Date;
  };
  'system.pressure.normal': {
    type: 'memory' | 'eventLoop' | 'heap';
    value: number;
    timestamp: Date;
  };
}

/**
 * Type-safe event bus for system-wide events
 */
class TypedEventBus extends EventEmitter {
  /**
   * Emit a typed event
   */
  emitEvent<K extends keyof SystemEvents>(
    event: K,
    payload: SystemEvents[K]
  ): boolean {
    return this.emit(event, payload);
  }

  /**
   * Subscribe to a typed event
   */
  onEvent<K extends keyof SystemEvents>(
    event: K,
    listener: (payload: SystemEvents[K]) => void
  ): this {
    return this.on(event, listener);
  }

  /**
   * Subscribe to a typed event (one-time)
   */
  onceEvent<K extends keyof SystemEvents>(
    event: K,
    listener: (payload: SystemEvents[K]) => void
  ): this {
    return this.once(event, listener);
  }

  /**
   * Unsubscribe from a typed event
   */
  offEvent<K extends keyof SystemEvents>(
    event: K,
    listener: (payload: SystemEvents[K]) => void
  ): this {
    return this.off(event, listener);
  }
}

// Global event bus singleton
export const eventBus = new TypedEventBus();

// Set max listeners to avoid warnings for multiple subscribers
eventBus.setMaxListeners(50);

/**
 * Logging subscriber for development - logs all events
 */
if (process.env.NODE_ENV === 'development') {
  const logAllEvents = (eventName: string) => {
    return (payload: any) => {
      console.log(`[EventBus] ${eventName}:`, JSON.stringify(payload));
    };
  };

  // Subscribe to all defined events for logging
  const events: Array<keyof SystemEvents> = [
    'project.created',
    'project.updated',
    'project.deleted',
    'worktree.created',
    'worktree.deleted',
    'issue.created',
    'issue.updated',
    'agent.started',
    'agent.stopped',
  ];

  events.forEach((event) => {
    eventBus.on(event, logAllEvents(event));
  });
}
