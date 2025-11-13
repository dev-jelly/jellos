/**
 * Event Bus Types
 *
 * Core type definitions for the pluggable event bus architecture.
 * Supports Kafka, Redis pub-sub, and in-memory implementations.
 */

/**
 * Event metadata for tracing and debugging
 */
export interface EventMetadata {
  /**
   * Unique event identifier for idempotency and deduplication
   */
  eventId: string;

  /**
   * Timestamp when the event was created (ISO 8601)
   */
  timestamp: string;

  /**
   * Source service/component that emitted the event
   */
  source: string;

  /**
   * Correlation ID for tracing related events across services
   */
  correlationId?: string;

  /**
   * User ID if the event is associated with a user action
   */
  userId?: string;

  /**
   * Additional custom metadata
   */
  [key: string]: any;
}

/**
 * Base event structure that all events must follow
 */
export interface BaseEvent<T = any> {
  /**
   * Event type identifier (e.g., 'issue.state.changed')
   */
  type: string;

  /**
   * Event payload data
   */
  payload: T;

  /**
   * Event metadata
   */
  metadata: EventMetadata;
}

/**
 * Event handler function signature
 */
export type EventHandler<T = any> = (event: BaseEvent<T>) => void | Promise<void>;

/**
 * Event subscription options
 */
export interface SubscriptionOptions {
  /**
   * Consumer group ID (for Kafka and Redis Streams)
   * Allows load balancing across multiple consumers
   */
  consumerGroup?: string;

  /**
   * Whether to automatically acknowledge messages
   * @default true
   */
  autoAck?: boolean;

  /**
   * Maximum number of retries on handler failure
   * @default 3
   */
  maxRetries?: number;

  /**
   * Whether to use a dead letter queue for failed messages
   * @default false
   */
  useDLQ?: boolean;

  /**
   * Custom dead letter queue topic/channel name
   */
  dlqTopic?: string;
}

/**
 * Event publishing options
 */
export interface PublishOptions {
  /**
   * Partition key for Kafka (ensures ordering within a partition)
   */
  partitionKey?: string;

  /**
   * Message headers (for Kafka)
   */
  headers?: Record<string, string>;

  /**
   * Time-to-live for the message in milliseconds
   */
  ttl?: number;

  /**
   * Whether to wait for acknowledgment before returning
   * @default true
   */
  waitForAck?: boolean;
}

/**
 * Event bus adapter interface
 * All adapters (Kafka, Redis, InMemory) must implement this interface
 */
export interface EventBusAdapter {
  /**
   * Publish an event to the bus
   */
  publish(
    topic: string,
    event: BaseEvent,
    options?: PublishOptions
  ): Promise<void>;

  /**
   * Subscribe to events on a topic
   */
  subscribe(
    topic: string,
    handler: EventHandler,
    options?: SubscriptionOptions
  ): Promise<string>;

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(subscriptionId: string): Promise<void>;

  /**
   * Check if the adapter is connected and ready
   */
  isHealthy(): Promise<boolean>;

  /**
   * Close all connections and cleanup resources
   */
  close(): Promise<void>;

  /**
   * Get adapter name for logging and debugging
   */
  getName(): string;
}

/**
 * Event bus configuration
 */
export interface EventBusConfig {
  /**
   * Adapter type to use
   */
  adapter: 'kafka' | 'redis' | 'memory';

  /**
   * Kafka-specific configuration
   */
  kafka?: {
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
  };

  /**
   * Redis-specific configuration
   */
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    tls?: boolean;
  };

  /**
   * In-memory adapter configuration
   */
  memory?: {
    /**
     * Maximum number of events to keep in history (for replay)
     * @default 1000
     */
    maxHistorySize?: number;

    /**
     * Enable event persistence to disk
     * @default false
     */
    persistToDisk?: boolean;
  };

  /**
   * Default subscription options
   */
  defaultSubscriptionOptions?: SubscriptionOptions;

  /**
   * Default publishing options
   */
  defaultPublishOptions?: PublishOptions;
}

/**
 * Subscription metadata
 */
export interface Subscription {
  id: string;
  topic: string;
  handler: EventHandler;
  options: SubscriptionOptions;
  createdAt: Date;
}

/**
 * Event bus statistics
 */
export interface EventBusStats {
  adapter: string;
  isHealthy: boolean;
  publishedEvents: number;
  subscribedTopics: number;
  activeSubscriptions: number;
  failedPublishes: number;
  failedHandlers: number;
}
