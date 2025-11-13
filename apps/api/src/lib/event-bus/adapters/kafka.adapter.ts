/**
 * Kafka Event Bus Adapter
 *
 * Implementation using KafkaJS for distributed, scalable event handling.
 * Supports consumer groups, partitioning, and offset management.
 */

import type {
  EventBusAdapter,
  BaseEvent,
  EventHandler,
  PublishOptions,
  SubscriptionOptions,
  Subscription,
} from '../types';

// Import kafkajs dynamically to make it an optional dependency
type Kafka = any;
type Producer = any;
type Consumer = any;
type Admin = any;

interface KafkaAdapterConfig {
  brokers: string[];
  clientId: string;
  ssl?: boolean;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
  connectionTimeout?: number;
  requestTimeout?: number;
}

export class KafkaAdapter implements EventBusAdapter {
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private consumers: Map<string, Consumer>;
  private admin: Admin | null = null;
  private subscriptions: Map<string, Subscription>;
  private topicConsumers: Map<string, Consumer>; // topic -> consumer
  private stats = {
    publishedEvents: 0,
    failedPublishes: 0,
    failedHandlers: 0,
  };
  private isConnected = false;
  private config: KafkaAdapterConfig;

  constructor(config: KafkaAdapterConfig) {
    this.config = config;
    this.consumers = new Map();
    this.subscriptions = new Map();
    this.topicConsumers = new Map();
  }

  getName(): string {
    return 'KafkaAdapter';
  }

  async initialize(): Promise<void> {
    try {
      // Dynamically import kafkajs
      const { Kafka } = await import('kafkajs');

      this.kafka = new Kafka({
        clientId: this.config.clientId,
        brokers: this.config.brokers,
        ssl: this.config.ssl,
        sasl: this.config.sasl,
        connectionTimeout: this.config.connectionTimeout || 30000,
        requestTimeout: this.config.requestTimeout || 30000,
      });

      // Create producer
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: true,
        idempotent: true, // Ensure exactly-once delivery
      });

      await this.producer.connect();

      // Create admin client for topic management
      this.admin = this.kafka.admin();
      await this.admin.connect();

      this.isConnected = true;
      console.log('[KafkaAdapter] Connected successfully');
    } catch (error) {
      throw new Error(
        `Failed to initialize Kafka adapter: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async publish(
    topic: string,
    event: BaseEvent,
    options?: PublishOptions
  ): Promise<void> {
    if (!this.producer) {
      throw new Error('Kafka adapter not initialized. Call initialize() first.');
    }

    try {
      const message = JSON.stringify(event);

      await this.producer.send({
        topic,
        messages: [
          {
            key: options?.partitionKey || event.metadata.eventId,
            value: message,
            headers: options?.headers,
            timestamp: event.metadata.timestamp,
          },
        ],
        ...(options?.waitForAck !== false && { acks: -1 }), // Wait for all replicas
      });

      this.stats.publishedEvents++;
    } catch (error) {
      this.stats.failedPublishes++;
      throw new Error(
        `Failed to publish event to Kafka topic ${topic}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async subscribe(
    topic: string,
    handler: EventHandler,
    options?: SubscriptionOptions
  ): Promise<string> {
    if (!this.kafka) {
      throw new Error('Kafka adapter not initialized. Call initialize() first.');
    }

    const subscriptionId = this.generateSubscriptionId(topic);
    const consumerGroup = options?.consumerGroup || `${this.config.clientId}-${topic}`;

    const subscription: Subscription = {
      id: subscriptionId,
      topic,
      handler,
      options: options || {},
      createdAt: new Date(),
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Create or reuse consumer for this topic
    let consumer = this.topicConsumers.get(topic);

    if (!consumer) {
      consumer = this.kafka.consumer({
        groupId: consumerGroup,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
        retry: {
          retries: 8,
          initialRetryTime: 100,
          maxRetryTime: 30000,
        },
      });

      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: false });

      // Set up message handler
      await consumer.run({
        autoCommit: options?.autoAck !== false,
        eachMessage: async ({ topic: msgTopic, message }) => {
          await this.handleMessage(msgTopic, message);
        },
      });

      this.topicConsumers.set(topic, consumer);
      this.consumers.set(subscriptionId, consumer);
    } else {
      this.consumers.set(subscriptionId, consumer);
    }

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

    // Check if there are any other subscriptions for this topic
    const hasOtherSubscriptions = Array.from(this.subscriptions.values()).some(
      (sub) => sub.topic === topic
    );

    // If no other subscriptions, disconnect consumer
    if (!hasOtherSubscriptions) {
      const consumer = this.topicConsumers.get(topic);
      if (consumer) {
        await consumer.disconnect();
        this.topicConsumers.delete(topic);
      }
    }

    this.consumers.delete(subscriptionId);
  }

  async isHealthy(): Promise<boolean> {
    try {
      if (!this.admin) {
        return false;
      }

      // Check if we can list topics (verifies connection)
      await this.admin.listTopics();
      return this.isConnected;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // Disconnect all consumers
    for (const consumer of this.consumers.values()) {
      try {
        await consumer.disconnect();
      } catch (error) {
        console.error('Error disconnecting consumer:', error);
      }
    }

    // Disconnect producer
    if (this.producer) {
      await this.producer.disconnect();
    }

    // Disconnect admin
    if (this.admin) {
      await this.admin.disconnect();
    }

    this.consumers.clear();
    this.subscriptions.clear();
    this.topicConsumers.clear();
    this.isConnected = false;
  }

  /**
   * Get adapter statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeSubscriptions: this.subscriptions.size,
      topics: Array.from(this.topicConsumers.keys()),
    };
  }

  private async handleMessage(topic: string, message: any): Promise<void> {
    let event: BaseEvent;

    try {
      const value = message.value?.toString();
      if (!value) {
        console.error('Received empty message');
        return;
      }

      event = JSON.parse(value);
    } catch (error) {
      console.error('Failed to parse event message:', error);
      return;
    }

    // Get all subscriptions for this topic
    const subscriptions = Array.from(this.subscriptions.values()).filter(
      (sub) => sub.topic === topic
    );

    // Execute all handlers for this topic
    const handlerPromises = subscriptions.map((subscription) =>
      this.executeHandler(subscription, event)
    );

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
