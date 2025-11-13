/**
 * In-Memory Event Bus Adapter
 *
 * Simple in-memory implementation for development and testing.
 * Events are stored in memory and not persisted between restarts.
 */

import { EventEmitter } from 'events';
import type {
  EventBusAdapter,
  BaseEvent,
  EventHandler,
  PublishOptions,
  SubscriptionOptions,
  Subscription,
} from '../types';

interface InMemoryAdapterConfig {
  maxHistorySize?: number;
  persistToDisk?: boolean;
}

export class InMemoryAdapter implements EventBusAdapter {
  private emitter: EventEmitter;
  private subscriptions: Map<string, Subscription>;
  private eventHistory: Map<string, BaseEvent[]>;
  private stats = {
    publishedEvents: 0,
    failedPublishes: 0,
    failedHandlers: 0,
  };
  private config: InMemoryAdapterConfig;

  constructor(config: InMemoryAdapterConfig = {}) {
    this.emitter = new EventEmitter();
    this.subscriptions = new Map();
    this.eventHistory = new Map();
    this.config = {
      maxHistorySize: config.maxHistorySize || 1000,
      persistToDisk: config.persistToDisk || false,
    };

    // Increase max listeners to avoid warnings
    this.emitter.setMaxListeners(100);
  }

  getName(): string {
    return 'InMemoryAdapter';
  }

  async publish(
    topic: string,
    event: BaseEvent,
    options?: PublishOptions
  ): Promise<void> {
    try {
      // Store in history
      this.addToHistory(topic, event);

      // Emit event synchronously to all subscribers
      this.emitter.emit(topic, event);

      this.stats.publishedEvents++;
    } catch (error) {
      this.stats.failedPublishes++;
      throw new Error(
        `Failed to publish event to topic ${topic}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async subscribe(
    topic: string,
    handler: EventHandler,
    options?: SubscriptionOptions
  ): Promise<string> {
    const subscriptionId = this.generateSubscriptionId(topic);

    const subscription: Subscription = {
      id: subscriptionId,
      topic,
      handler,
      options: options || {},
      createdAt: new Date(),
    };

    // Wrap handler with error handling and retry logic
    const wrappedHandler = this.wrapHandler(handler, topic, options);

    // Register with EventEmitter
    this.emitter.on(topic, wrappedHandler);

    // Store subscription metadata
    this.subscriptions.set(subscriptionId, subscription);

    return subscriptionId;
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    // Remove all listeners for this subscription
    // Note: EventEmitter doesn't support removing specific listeners easily,
    // so we need to track the wrapped handler
    this.emitter.removeAllListeners(subscription.topic);

    // Re-register other subscriptions for the same topic
    for (const [id, sub] of this.subscriptions.entries()) {
      if (id !== subscriptionId && sub.topic === subscription.topic) {
        const wrappedHandler = this.wrapHandler(
          sub.handler,
          sub.topic,
          sub.options
        );
        this.emitter.on(sub.topic, wrappedHandler);
      }
    }

    this.subscriptions.delete(subscriptionId);
  }

  async isHealthy(): Promise<boolean> {
    // In-memory adapter is always healthy if it exists
    return true;
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
    this.subscriptions.clear();
    this.eventHistory.clear();
  }

  /**
   * Get event history for a topic (useful for testing and replay)
   */
  getHistory(topic: string): BaseEvent[] {
    return this.eventHistory.get(topic) || [];
  }

  /**
   * Get all subscriptions (useful for debugging)
   */
  getSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get adapter statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeSubscriptions: this.subscriptions.size,
      topics: Array.from(this.eventHistory.keys()),
    };
  }

  /**
   * Clear all event history (useful for testing)
   */
  clearHistory(): void {
    this.eventHistory.clear();
  }

  private addToHistory(topic: string, event: BaseEvent): void {
    if (!this.eventHistory.has(topic)) {
      this.eventHistory.set(topic, []);
    }

    const history = this.eventHistory.get(topic)!;
    history.push(event);

    // Trim history if it exceeds max size
    if (history.length > this.config.maxHistorySize!) {
      history.shift();
    }
  }

  private wrapHandler(
    handler: EventHandler,
    topic: string,
    options?: SubscriptionOptions
  ): (event: BaseEvent) => void {
    const maxRetries = options?.maxRetries || 3;
    const useDLQ = options?.useDLQ || false;
    const dlqTopic = options?.dlqTopic || `${topic}.dlq`;

    return async (event: BaseEvent) => {
      let attempts = 0;
      let lastError: Error | undefined;

      for (let i = 0; i < maxRetries; i++) {
        attempts++;
        try {
          await handler(event);
          return; // Success
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (i < maxRetries - 1) {
            // Exponential backoff (not on last attempt)
            const delay = Math.pow(2, attempts) * 100;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed
      this.stats.failedHandlers++;

      if (useDLQ) {
        // Send to dead letter queue
        try {
          await this.publish(dlqTopic, {
            ...event,
            metadata: {
              ...event.metadata,
              originalTopic: topic,
              failureReason: lastError?.message,
              failedAt: new Date().toISOString(),
            },
          });
        } catch (dlqError) {
          console.error('Failed to send message to DLQ:', dlqError);
        }
      }

      console.error(
        `Handler failed after ${maxRetries} attempts for topic ${topic}:`,
        lastError
      );
    };
  }

  private generateSubscriptionId(topic: string): string {
    return `${topic}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
