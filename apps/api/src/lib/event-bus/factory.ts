/**
 * Event Bus Adapter Factory
 *
 * Creates the appropriate event bus adapter based on configuration.
 * Supports environment-based configuration for easy switching between adapters.
 */

import type { EventBusAdapter, EventBusConfig } from './types';
import { InMemoryAdapter } from './adapters/memory.adapter';
import { RedisAdapter } from './adapters/redis.adapter';
// import { KafkaAdapter } from './adapters/kafka.adapter'; // Temporarily disabled due to missing kafkajs dependency

/**
 * Create an event bus adapter based on configuration
 */
export async function createEventBusAdapter(
  config: EventBusConfig
): Promise<EventBusAdapter> {
  switch (config.adapter) {
    case 'memory': {
      return new InMemoryAdapter(config.memory);
    }

    case 'redis': {
      if (!config.redis) {
        throw new Error('Redis configuration is required for Redis adapter');
      }

      return new RedisAdapter(config.redis);
    }

    case 'kafka': {
      throw new Error('Kafka adapter is temporarily disabled. Please use memory or redis adapter.');
      // if (!config.kafka) {
      //   throw new Error('Kafka configuration is required for Kafka adapter');
      // }
      //
      // const adapter = new KafkaAdapter(config.kafka);
      // await adapter.initialize();
      // return adapter;
    }

    default: {
      throw new Error(`Unknown adapter type: ${config.adapter}`);
    }
  }
}

/**
 * Create an event bus adapter from environment variables
 */
export async function createEventBusAdapterFromEnv(): Promise<EventBusAdapter> {
  const adapterType = (process.env.EVENT_BUS_ADAPTER || 'memory') as
    | 'kafka'
    | 'redis'
    | 'memory';

  const config: EventBusConfig = {
    adapter: adapterType,
  };

  switch (adapterType) {
    case 'memory': {
      config.memory = {
        maxHistorySize: parseInt(
          process.env.EVENT_BUS_MEMORY_MAX_HISTORY || '1000',
          10
        ),
        persistToDisk: process.env.EVENT_BUS_MEMORY_PERSIST === 'true',
      };
      break;
    }

    case 'redis': {
      config.redis = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0', 10),
        tls: process.env.REDIS_TLS === 'true',
      };
      break;
    }

    case 'kafka': {
      const brokers = process.env.KAFKA_BROKERS?.split(',') || [
        'localhost:9092',
      ];
      const clientId = process.env.KAFKA_CLIENT_ID || 'jellos-api';

      config.kafka = {
        brokers,
        clientId,
        ssl: process.env.KAFKA_SSL === 'true',
        connectionTimeout: parseInt(
          process.env.KAFKA_CONNECTION_TIMEOUT || '30000',
          10
        ),
        requestTimeout: parseInt(
          process.env.KAFKA_REQUEST_TIMEOUT || '30000',
          10
        ),
      };

      // SASL configuration
      if (process.env.KAFKA_SASL_MECHANISM) {
        config.kafka.sasl = {
          mechanism: process.env.KAFKA_SASL_MECHANISM as
            | 'plain'
            | 'scram-sha-256'
            | 'scram-sha-512',
          username: process.env.KAFKA_SASL_USERNAME || '',
          password: process.env.KAFKA_SASL_PASSWORD || '',
        };
      }
      break;
    }
  }

  // Default subscription options
  if (process.env.EVENT_BUS_DEFAULT_MAX_RETRIES) {
    config.defaultSubscriptionOptions = {
      maxRetries: parseInt(process.env.EVENT_BUS_DEFAULT_MAX_RETRIES, 10),
      autoAck: process.env.EVENT_BUS_DEFAULT_AUTO_ACK !== 'false',
      useDLQ: process.env.EVENT_BUS_DEFAULT_USE_DLQ === 'true',
    };
  }

  return createEventBusAdapter(config);
}

/**
 * Get configuration summary for logging
 */
export function getConfigSummary(config: EventBusConfig): string {
  switch (config.adapter) {
    case 'memory':
      return `InMemory (maxHistory: ${config.memory?.maxHistorySize || 1000})`;

    case 'redis':
      return `Redis (${config.redis?.host}:${config.redis?.port})`;

    case 'kafka':
      return `Kafka (brokers: ${config.kafka?.brokers.join(', ')})`;

    default:
      return 'Unknown';
  }
}
