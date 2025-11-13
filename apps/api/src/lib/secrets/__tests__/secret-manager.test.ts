/**
 * Tests for SecretManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SecretManager } from '../secret-manager';
import { SecretProviderType, SecretEnvironment, ProviderHealthStatus } from '../types';
import type { ISecretProvider, ProviderHealthCheck } from '../types';

// Mock provider for testing
class MockProvider implements ISecretProvider {
  type: SecretProviderType;
  name: string;
  private secrets: Map<string, string> = new Map();

  constructor(type: SecretProviderType, name: string) {
    this.type = type;
    this.name = name;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getHealthStatus(): Promise<ProviderHealthCheck> {
    return {
      status: ProviderHealthStatus.HEALTHY,
      available: true,
      cliInstalled: true,
      lastChecked: new Date(),
      latency: 0,
    };
  }

  async getSecret(key: string, namespace: string): Promise<string | null> {
    return this.secrets.get(`${namespace}/${key}`) || null;
  }

  async setSecret(key: string, value: string, namespace: string): Promise<void> {
    this.secrets.set(`${namespace}/${key}`, value);
  }

  async listSecrets(namespace: string): Promise<string[]> {
    const keys: string[] = [];
    for (const [k, _] of this.secrets) {
      if (k.startsWith(`${namespace}/`)) {
        keys.push(k.split('/')[1]);
      }
    }
    return keys;
  }

  async deleteSecret(key: string, namespace: string): Promise<void> {
    this.secrets.delete(`${namespace}/${key}`);
  }
}

describe('SecretManager', () => {
  let manager: SecretManager;

  beforeEach(() => {
    manager = new SecretManager({
      enableLogging: true,
      throwOnMissing: false,
      cacheTimeout: 0, // Disable cache for tests
    });
  });

  describe('initialization', () => {
    it('should initialize without errors', async () => {
      await expect(manager.initialize()).resolves.not.toThrow();
    });

    it('should have at least the env provider available', async () => {
      await manager.initialize();
      const providers = manager.getProviders();

      expect(providers.length).toBeGreaterThan(0);
      expect(providers.some((p) => p.type === SecretProviderType.ENV)).toBe(true);
    });
  });

  describe('getSecret', () => {
    it('should resolve secret from environment variables', async () => {
      await manager.initialize();

      // Set a test environment variable
      process.env.JELLOS_SECRET_DEV_TEST_KEY = 'test-value';

      const result = await manager.getSecret('TEST_KEY', 'dev');

      expect(result.resolved).toBe(true);
      expect(result.value).toBe('test-value');
      expect(result.provider).toBe(SecretProviderType.ENV);

      // Cleanup
      delete process.env.JELLOS_SECRET_DEV_TEST_KEY;
    });

    it('should return not resolved when secret not found', async () => {
      await manager.initialize();

      const result = await manager.getSecret('NONEXISTENT_KEY', 'dev');

      expect(result.resolved).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should use default environment when namespace not provided', async () => {
      await manager.initialize();

      // Set a test environment variable
      process.env.JELLOS_SECRET_DEV_DEFAULT_KEY = 'default-value';

      const result = await manager.getSecret('DEFAULT_KEY');

      expect(result.resolved).toBe(true);
      expect(result.value).toBe('default-value');

      // Cleanup
      delete process.env.JELLOS_SECRET_DEV_DEFAULT_KEY;
    });

    it('should throw error when throwOnMissing is true', async () => {
      const strictManager = new SecretManager({
        throwOnMissing: true,
        enableLogging: false,
      });
      await strictManager.initialize();

      await expect(
        strictManager.getSecret('NONEXISTENT_KEY', 'prod')
      ).rejects.toThrow();
    });
  });

  describe('injectSecrets', () => {
    it('should inject secrets into text', async () => {
      await manager.initialize();

      process.env.JELLOS_SECRET_DEV_API_KEY = 'secret-api-key';

      const text = 'API_KEY=${secret:API_KEY}';
      const result = await manager.injectSecrets(text);

      expect(result).toBe('API_KEY=secret-api-key');

      delete process.env.JELLOS_SECRET_DEV_API_KEY;
    });

    it('should inject multiple secrets', async () => {
      await manager.initialize();

      process.env.JELLOS_SECRET_DEV_KEY1 = 'value1';
      process.env.JELLOS_SECRET_DEV_KEY2 = 'value2';

      const text = 'K1=${secret:KEY1} K2=${secret:KEY2}';
      const result = await manager.injectSecrets(text);

      expect(result).toBe('K1=value1 K2=value2');

      delete process.env.JELLOS_SECRET_DEV_KEY1;
      delete process.env.JELLOS_SECRET_DEV_KEY2;
    });

    it('should handle namespaced secrets', async () => {
      await manager.initialize();

      process.env.JELLOS_SECRET_PROD_API_KEY = 'prod-key';

      const text = '${secret:prod/API_KEY}';
      const result = await manager.injectSecrets(text);

      expect(result).toBe('prod-key');

      delete process.env.JELLOS_SECRET_PROD_API_KEY;
    });
  });

  describe('injectSecretsIntoObject', () => {
    it('should inject secrets into object', async () => {
      await manager.initialize();

      process.env.JELLOS_SECRET_DEV_DB_PASSWORD = 'db-secret';

      const config = {
        database: {
          password: '${secret:DB_PASSWORD}',
        },
      };

      const result = await manager.injectSecretsIntoObject(config);

      expect(result.database.password).toBe('db-secret');

      delete process.env.JELLOS_SECRET_DEV_DB_PASSWORD;
    });

    it('should preserve non-secret values', async () => {
      await manager.initialize();

      const config = {
        host: 'localhost',
        port: 5432,
        enabled: true,
      };

      const result = await manager.injectSecretsIntoObject(config);

      expect(result).toEqual(config);
    });
  });

  describe('validateSecrets', () => {
    it('should return errors for missing secrets', async () => {
      await manager.initialize();

      const text = '${secret:MISSING_KEY}';
      const errors = await manager.validateSecrets(text);

      expect(errors).toHaveLength(1);
      expect(errors[0].key).toBe('MISSING_KEY');
    });

    it('should return empty array when all secrets found', async () => {
      await manager.initialize();

      process.env.JELLOS_SECRET_DEV_VALID_KEY = 'value';

      const text = '${secret:VALID_KEY}';
      const errors = await manager.validateSecrets(text);

      expect(errors).toHaveLength(0);

      delete process.env.JELLOS_SECRET_DEV_VALID_KEY;
    });

    it('should validate multiple secrets', async () => {
      await manager.initialize();

      process.env.JELLOS_SECRET_DEV_KEY1 = 'value1';
      // KEY2 is missing

      const text = '${secret:KEY1} ${secret:KEY2}';
      const errors = await manager.validateSecrets(text);

      expect(errors).toHaveLength(1);
      expect(errors[0].key).toBe('KEY2');

      delete process.env.JELLOS_SECRET_DEV_KEY1;
    });
  });

  describe('access logging', () => {
    it('should log secret access', async () => {
      await manager.initialize();

      process.env.JELLOS_SECRET_DEV_LOGGED_KEY = 'logged-value';

      await manager.getSecret('LOGGED_KEY', 'dev');

      const logs = manager.getAccessLogs();

      expect(logs).toHaveLength(1);
      expect(logs[0].key).toBe('LOGGED_KEY');
      expect(logs[0].namespace).toBe('dev');
      expect(logs[0].success).toBe(true);

      delete process.env.JELLOS_SECRET_DEV_LOGGED_KEY;
    });

    it('should log failed access attempts', async () => {
      await manager.initialize();

      await manager.getSecret('MISSING_KEY', 'prod');

      const logs = manager.getAccessLogs();

      expect(logs.length).toBeGreaterThan(0);
      const lastLog = logs[logs.length - 1];
      expect(lastLog.key).toBe('MISSING_KEY');
      expect(lastLog.success).toBe(false);
    });

    it('should clear logs', async () => {
      await manager.initialize();

      process.env.JELLOS_SECRET_DEV_KEY = 'value';
      await manager.getSecret('KEY', 'dev');

      expect(manager.getAccessLogs()).toHaveLength(1);

      manager.clearAccessLogs();

      expect(manager.getAccessLogs()).toHaveLength(0);

      delete process.env.JELLOS_SECRET_DEV_KEY;
    });
  });

  describe('caching', () => {
    it('should cache secret values', async () => {
      const cachingManager = new SecretManager({
        cacheTimeout: 60, // 60 seconds
        enableLogging: true,
      });

      await cachingManager.initialize();

      process.env.JELLOS_SECRET_DEV_CACHED_KEY = 'cached-value';

      // First call
      const result1 = await cachingManager.getSecret('CACHED_KEY', 'dev');
      expect(result1.resolved).toBe(true);

      // Delete the env var to prove cache is working
      delete process.env.JELLOS_SECRET_DEV_CACHED_KEY;

      // Second call should still succeed due to cache
      const result2 = await cachingManager.getSecret('CACHED_KEY', 'dev');
      expect(result2.resolved).toBe(true);
      expect(result2.value).toBe('cached-value');
    });

    it('should clear cache', async () => {
      const cachingManager = new SecretManager({
        cacheTimeout: 60,
      });

      await cachingManager.initialize();

      process.env.JELLOS_SECRET_DEV_KEY = 'value';
      await cachingManager.getSecret('KEY', 'dev');

      cachingManager.clearCache();

      delete process.env.JELLOS_SECRET_DEV_KEY;

      const result = await cachingManager.getSecret('KEY', 'dev');
      expect(result.resolved).toBe(false);
    });
  });

  describe('Provider Health Checks', () => {
    it('should get health status for all providers', async () => {
      const manager = new SecretManager({
        providers: [
          { type: SecretProviderType.ENV, priority: 1, enabled: true },
        ],
        defaultEnvironment: SecretEnvironment.DEVELOPMENT,
        enableLogging: false,
        throwOnMissing: false,
      });

      await manager.initialize();

      const healthMap = await manager.getProvidersHealth();

      expect(healthMap).toBeInstanceOf(Map);
      expect(healthMap.size).toBeGreaterThan(0);

      // Check that env provider is healthy
      const envHealth = healthMap.get(SecretProviderType.ENV);
      if (envHealth) {
        expect(envHealth.status).toBeDefined();
        expect(envHealth.available).toBeDefined();
        expect(envHealth.lastChecked).toBeInstanceOf(Date);
      }
    });

    it('should handle provider health check failures gracefully', async () => {
      // Create a provider that throws during health check
      class FailingProvider implements ISecretProvider {
        type = SecretProviderType.KEYCHAIN;
        name = 'Failing Provider';

        async isAvailable(): Promise<boolean> {
          return true;
        }

        async getHealthStatus(): Promise<ProviderHealthCheck> {
          throw new Error('Health check failed');
        }

        async getSecret(): Promise<string | null> {
          return null;
        }
      }

      const manager = new SecretManager({
        providers: [
          { type: SecretProviderType.KEYCHAIN, priority: 1, enabled: true },
        ],
        defaultEnvironment: SecretEnvironment.DEVELOPMENT,
        enableLogging: false,
        throwOnMissing: false,
      });

      // Manually inject the failing provider for testing
      (manager as any).providers = [new FailingProvider()];

      const healthMap = await manager.getProvidersHealth();

      expect(healthMap.size).toBe(1);
      const health = healthMap.get(SecretProviderType.KEYCHAIN);
      expect(health).toBeDefined();
      expect(health?.available).toBe(false);
      expect(health?.error).toContain('Health check failed');
    });
  });
});
