/**
 * Event Bus
 *
 * Main event bus class that provides a high-level API for publishing and subscribing to events.
 * Automatically handles event metadata generation and provides type-safe event handling.
 */

import { randomUUID } from 'crypto';
import type {
  EventBusAdapter,
  BaseEvent,
  EventHandler,
  PublishOptions,
  SubscriptionOptions,
  EventMetadata,
  EventBusStats,
} from './types';

export class EventBus {
  private adapter: EventBusAdapter;
  private serviceName: string;

  constructor(adapter: EventBusAdapter, serviceName: string = 'jellos-api') {
    this.adapter = adapter;
    this.serviceName = serviceName;
  }

  /**
   * Publish an event to a topic
   */
  async publish<T = any>(
    topic: string,
    eventType: string,
    payload: T,
    options?: PublishOptions & { metadata?: Partial<EventMetadata> }
  ): Promise<void> {
    const event: BaseEvent<T> = {
      type: eventType,
      payload,
      metadata: this.createMetadata(options?.metadata),
    };

    await this.adapter.publish(topic, event, options);
  }

  /**
   * Subscribe to events on a topic
   */
  async subscribe<T = any>(
    topic: string,
    handler: EventHandler<T>,
    options?: SubscriptionOptions
  ): Promise<string> {
    return this.adapter.subscribe(topic, handler, options);
  }

  /**
   * Unsubscribe from a topic
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    return this.adapter.unsubscribe(subscriptionId);
  }

  /**
   * Check if the event bus is healthy
   */
  async isHealthy(): Promise<boolean> {
    return this.adapter.isHealthy();
  }

  /**
   * Close the event bus and cleanup resources
   */
  async close(): Promise<void> {
    return this.adapter.close();
  }

  /**
   * Get the adapter name
   */
  getAdapterName(): string {
    return this.adapter.getName();
  }

  /**
   * Get event bus statistics
   */
  async getStats(): Promise<EventBusStats> {
    const isHealthy = await this.isHealthy();

    // Try to get adapter-specific stats if available
    let adapterStats = {
      publishedEvents: 0,
      subscribedTopics: 0,
      activeSubscriptions: 0,
      failedPublishes: 0,
      failedHandlers: 0,
    };

    if ('getStats' in this.adapter && typeof this.adapter.getStats === 'function') {
      const stats = (this.adapter as any).getStats();
      adapterStats = {
        publishedEvents: stats.publishedEvents || 0,
        subscribedTopics: stats.topics?.length || 0,
        activeSubscriptions: stats.activeSubscriptions || 0,
        failedPublishes: stats.failedPublishes || 0,
        failedHandlers: stats.failedHandlers || 0,
      };
    }

    return {
      adapter: this.adapter.getName(),
      isHealthy,
      ...adapterStats,
    };
  }

  /**
   * Create event metadata with default values
   */
  private createMetadata(partial?: Partial<EventMetadata>): EventMetadata {
    return {
      eventId: partial?.eventId || randomUUID(),
      timestamp: partial?.timestamp || new Date().toISOString(),
      source: partial?.source || this.serviceName,
      correlationId: partial?.correlationId,
      userId: partial?.userId,
      ...partial,
    };
  }
}

/**
 * Typed event bus for specific event schemas
 */
export class TypedEventBus<TEvents extends Record<string, any>> {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Publish a typed event
   */
  async publish<K extends keyof TEvents>(
    topic: string,
    eventType: K,
    payload: TEvents[K],
    options?: PublishOptions & { metadata?: Partial<EventMetadata> }
  ): Promise<void> {
    return this.eventBus.publish(topic, eventType as string, payload, options);
  }

  /**
   * Subscribe to a typed event
   */
  async subscribe<K extends keyof TEvents>(
    topic: string,
    handler: (event: BaseEvent<TEvents[K]>) => void | Promise<void>,
    options?: SubscriptionOptions
  ): Promise<string> {
    return this.eventBus.subscribe(topic, handler, options);
  }

  /**
   * Unsubscribe from a topic
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    return this.eventBus.unsubscribe(subscriptionId);
  }

  /**
   * Get the underlying event bus
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }
}
