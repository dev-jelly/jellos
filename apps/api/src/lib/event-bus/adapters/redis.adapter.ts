/**
 * Redis Event Bus Adapter
 *
 * Implementation using Redis pub/sub for distributed event handling.
 * Uses separate Redis clients for publishing and subscribing.
 */

import Redis from 'ioredis';
import type {
  EventBusAdapter,
  BaseEvent,
  EventHandler,
  PublishOptions,
  SubscriptionOptions,
  Subscription,
} from '../types';

interface RedisAdapterConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
}

export class RedisAdapter implements EventBusAdapter {
  private publisher: Redis;
  private subscriber: Redis;
  private subscriptions: Map<string, Subscription>;
  private topicHandlers: Map<string, Set<string>>; // topic -> subscription IDs
  private stats = {
    publishedEvents: 0,
    failedPublishes: 0,
    failedHandlers: 0,
  };
  private isConnected = false;

  constructor(config: RedisAdapterConfig) {
    const redisOptions = {
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      ...(config.tls && { tls: {} }),
    };

    // Separate clients for pub/sub
    this.publisher = new Redis(redisOptions);
    this.subscriber = new Redis(redisOptions);

    this.subscriptions = new Map();
    this.topicHandlers = new Map();

    this.setupConnectionHandlers();
  }

  getName(): string {
    return 'RedisAdapter';
  }

  async publish(
    topic: string,
    event: BaseEvent,
    options?: PublishOptions
  ): Promise<void> {
    try {
      const message = JSON.stringify(event);

      if (options?.ttl) {
        // Use Redis Streams with TTL
        await this.publisher.xadd(
          topic,
          'MAXLEN',
          '~',
          '10000', // Keep last 10k messages
          '*',
          'data',
          message
        );

        // Set expiration on the stream
        await this.publisher.expire(topic, Math.ceil(options.ttl / 1000));
      } else {
        // Use standard pub/sub
        await this.publisher.publish(topic, message);
      }

      this.stats.publishedEvents++;
    } catch (error) {
      this.stats.failedPublishes++;
      throw new Error(
        `Failed to publish event to Redis topic ${topic}: ${error instanceof Error ? error.message : 'Unknown error'}`
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

    this.subscriptions.set(subscriptionId, subscription);

    // Track which subscription IDs are listening to this topic
    if (!this.topicHandlers.has(topic)) {
      this.topicHandlers.set(topic, new Set());

      // Subscribe to Redis topic (only once per topic)
      await this.subscriber.subscribe(topic);

      // Set up message handler for this topic
      this.subscriber.on('message', (channel, message) => {
        if (channel === topic) {
          this.handleMessage(topic, message);
        }
      });
    }

    this.topicHandlers.get(topic)!.add(subscriptionId);

    return subscriptionId;
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    const { topic } = subscription;

    // Remove subscription
    this.subscriptions.delete(subscriptionId);

    // Remove from topic handlers
    const handlers = this.topicHandlers.get(topic);
    if (handlers) {
      handlers.delete(subscriptionId);

      // If no more handlers for this topic, unsubscribe from Redis
      if (handlers.size === 0) {
        await this.subscriber.unsubscribe(topic);
        this.topicHandlers.delete(topic);
      }
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.publisher.ping();
      await this.subscriber.ping();
      return this.isConnected;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // Unsubscribe from all topics
    const topics = Array.from(this.topicHandlers.keys());
    if (topics.length > 0) {
      await this.subscriber.unsubscribe(...topics);
    }

    // Close connections
    await this.publisher.quit();
    await this.subscriber.quit();

    this.subscriptions.clear();
    this.topicHandlers.clear();
    this.isConnected = false;
  }

  /**
   * Get adapter statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeSubscriptions: this.subscriptions.size,
      topics: Array.from(this.topicHandlers.keys()),
    };
  }

  private setupConnectionHandlers(): void {
    this.publisher.on('connect', () => {
      console.log('[RedisAdapter] Publisher connected');
      this.isConnected = true;
    });

    this.subscriber.on('connect', () => {
      console.log('[RedisAdapter] Subscriber connected');
    });

    this.publisher.on('error', (err) => {
      console.error('[RedisAdapter] Publisher error:', err);
      this.isConnected = false;
    });

    this.subscriber.on('error', (err) => {
      console.error('[RedisAdapter] Subscriber error:', err);
      this.isConnected = false;
    });

    this.publisher.on('close', () => {
      console.log('[RedisAdapter] Publisher disconnected');
      this.isConnected = false;
    });

    this.subscriber.on('close', () => {
      console.log('[RedisAdapter] Subscriber disconnected');
    });
  }

  private async handleMessage(topic: string, message: string): Promise<void> {
    let event: BaseEvent;

    try {
      event = JSON.parse(message);
    } catch (error) {
      console.error('Failed to parse event message:', error);
      return;
    }

    // Get all subscription IDs for this topic
    const subscriptionIds = this.topicHandlers.get(topic);
    if (!subscriptionIds) {
      return;
    }

    // Execute all handlers for this topic
    const handlerPromises: Promise<void>[] = [];

    for (const subscriptionId of subscriptionIds) {
      const subscription = this.subscriptions.get(subscriptionId);
      if (subscription) {
        handlerPromises.push(
          this.executeHandler(subscription, event)
        );
      }
    }

    // Wait for all handlers to complete (or fail)
    await Promise.allSettled(handlerPromises);
  }

  private async executeHandler(
    subscription: Subscription,
    event: BaseEvent
  ): Promise<void> {
    const { handler, options, topic } = subscription;
    const maxRetries = options.maxRetries || 3;
    const useDLQ = options.useDLQ || false;
    const dlqTopic = options.dlqTopic || `${topic}.dlq`;

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
  }

  private generateSubscriptionId(topic: string): string {
    return `${topic}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
