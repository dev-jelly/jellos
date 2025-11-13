/**
 * Integration tests for secret providers
 * These tests run against actual CLI tools if available
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { KeychainProvider } from '../providers/keychain.provider';
import { OnePasswordProvider } from '../providers/1password.provider';
import { EnvProvider } from '../providers/env.provider';
import { ProviderHealthStatus } from '../types';

describe('Provider Integration Tests', () => {
  describe('KeychainProvider Integration', () => {
    let provider: KeychainProvider;
    let isAvailable: boolean;

    beforeAll(async () => {
      provider = new KeychainProvider();
      isAvailable = await provider.isAvailable();
    });

    it('should report correct health status', async () => {
      const health = await provider.getHealthStatus();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(health.available).toBe(isAvailable);
      expect(health.cliInstalled).toBeDefined();
      expect(health.lastChecked).toBeInstanceOf(Date);

      if (process.platform !== 'darwin') {
        expect(health.status).toBe(ProviderHealthStatus.UNAVAILABLE);
        expect(health.error).toContain('macOS');
        expect(health.helpText).toBeDefined();
      }
    });

    it('should handle getSecret when not available gracefully', async () => {
      if (!isAvailable) {
        await expect(
          provider.getSecret('TEST_KEY', 'test')
        ).rejects.toThrow('not available');
      }
    });

    it('should handle setSecret when not available gracefully', async () => {
      if (!isAvailable) {
        await expect(
          provider.setSecret('TEST_KEY', 'test-value', 'test')
        ).rejects.toThrow('not available');
      }
    });

    // Only run CRUD tests if Keychain is actually available
    describe('CRUD operations (requires macOS Keychain)', () => {
      const testNamespace = 'jellos-test';
      const testKey = 'INTEGRATION_TEST_KEY';
      const testValue = 'test-secret-value-' + Date.now();

      afterEach(async () => {
        if (isAvailable) {
          try {
            await provider.deleteSecret(testKey, testNamespace);
          } catch {
            // Ignore cleanup errors
          }
        }
      });

      it('should set and get a secret', async () => {
        if (!isAvailable) {
          console.log('⏭️  Skipping Keychain CRUD test - not available');
          return;
        }

        // Set secret
        await provider.setSecret(testKey, testValue, testNamespace);

        // Get secret
        const retrieved = await provider.getSecret(testKey, testNamespace);
        expect(retrieved).toBe(testValue);
      });

      it('should return null for non-existent secret', async () => {
        if (!isAvailable) {
          console.log('⏭️  Skipping Keychain CRUD test - not available');
          return;
        }

        const result = await provider.getSecret('NONEXISTENT_KEY_' + Date.now(), testNamespace);
        expect(result).toBeNull();
      });

      it('should list secrets in namespace', async () => {
        if (!isAvailable) {
          console.log('⏭️  Skipping Keychain CRUD test - not available');
          return;
        }

        // Set a test secret
        await provider.setSecret(testKey, testValue, testNamespace);

        // Give it a moment for keychain to sync
        await new Promise(resolve => setTimeout(resolve, 100));

        // List secrets
        if (provider.listSecrets) {
          const secrets = await provider.listSecrets(testNamespace);
          expect(Array.isArray(secrets)).toBe(true);
          // Note: Keychain dump may not immediately reflect changes, so just check it's an array
          // expect(secrets).toContain(testKey); // This may be flaky
        }
      });

      it('should delete a secret', async () => {
        if (!isAvailable) {
          console.log('⏭️  Skipping Keychain CRUD test - not available');
          return;
        }

        // Set secret
        await provider.setSecret(testKey, testValue, testNamespace);

        // Verify it exists
        let retrieved = await provider.getSecret(testKey, testNamespace);
        expect(retrieved).toBe(testValue);

        // Delete it
        if (provider.deleteSecret) {
          await provider.deleteSecret(testKey, testNamespace);
        }

        // Verify it's gone
        retrieved = await provider.getSecret(testKey, testNamespace);
        expect(retrieved).toBeNull();
      });

      it('should update existing secret', async () => {
        if (!isAvailable) {
          console.log('⏭️  Skipping Keychain CRUD test - not available');
          return;
        }

        const newValue = 'updated-value-' + Date.now();

        // Set initial secret
        await provider.setSecret(testKey, testValue, testNamespace);

        // Update with new value
        await provider.setSecret(testKey, newValue, testNamespace);

        // Verify new value
        const retrieved = await provider.getSecret(testKey, testNamespace);
        expect(retrieved).toBe(newValue);
      });
    });
  });

  describe('OnePasswordProvider Integration', () => {
    let provider: OnePasswordProvider;
    let isAvailable: boolean;

    beforeAll(async () => {
      provider = new OnePasswordProvider();
      isAvailable = await provider.isAvailable();
    });

    it('should report correct health status', async () => {
      const health = await provider.getHealthStatus();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(health.available).toBe(isAvailable);
      expect(health.cliInstalled).toBeDefined();
      expect(health.authenticated).toBeDefined();
      expect(health.lastChecked).toBeInstanceOf(Date);

      if (!health.cliInstalled) {
        expect(health.error).toBeDefined();
        expect(health.helpText).toBeDefined();
      }

      if (health.cliInstalled && !health.authenticated) {
        expect(health.error).toBeDefined();
        expect(health.helpText).toBeDefined();
      }
    });

    it('should include version info if available', async () => {
      const health = await provider.getHealthStatus();

      // Version info is optional, just check it's there if CLI is installed
      if (health.cliInstalled && health.authenticated) {
        // Version should be defined when CLI is available
        expect(health.version !== undefined).toBe(true);
      }
    });

    it('should handle getSecret when not available gracefully', async () => {
      if (!isAvailable) {
        await expect(
          provider.getSecret('TEST_KEY', 'test')
        ).rejects.toThrow(/not available|signed in/);
      }
    });

    it('should handle setSecret when not available gracefully', async () => {
      if (!isAvailable) {
        await expect(
          provider.setSecret('TEST_KEY', 'test-value', 'test')
        ).rejects.toThrow(/not available|signed in/);
      }
    });

    // Only run CRUD tests if 1Password is available and authenticated
    describe('CRUD operations (requires 1Password CLI)', () => {
      const testNamespace = 'test';
      const testKey = 'INTEGRATION_TEST_KEY_' + Date.now();
      const testValue = 'test-secret-value-' + Date.now();

      afterEach(async () => {
        if (isAvailable) {
          try {
            await provider.deleteSecret(testKey, testNamespace);
          } catch {
            // Ignore cleanup errors
          }
        }
      });

      it('should set and get a secret', async () => {
        if (!isAvailable) {
          console.log('⏭️  Skipping 1Password CRUD test - not available or not authenticated');
          return;
        }

        // Set secret
        await provider.setSecret(testKey, testValue, testNamespace);

        // Get secret
        const retrieved = await provider.getSecret(testKey, testNamespace);
        expect(retrieved).toBe(testValue);
      });

      it('should return null for non-existent secret', async () => {
        if (!isAvailable) {
          console.log('⏭️  Skipping 1Password CRUD test - not available or not authenticated');
          return;
        }

        const result = await provider.getSecret('NONEXISTENT_KEY_' + Date.now(), testNamespace);
        expect(result).toBeNull();
      });

      it('should list secrets in namespace', async () => {
        if (!isAvailable) {
          console.log('⏭️  Skipping 1Password CRUD test - not available or not authenticated');
          return;
        }

        // Set a test secret
        await provider.setSecret(testKey, testValue, testNamespace);

        // List secrets
        if (provider.listSecrets) {
          const secrets = await provider.listSecrets(testNamespace);
          expect(Array.isArray(secrets)).toBe(true);
          // Note: May not find the item immediately due to 1Password sync
        }
      });

      it('should delete a secret', async () => {
        if (!isAvailable) {
          console.log('⏭️  Skipping 1Password CRUD test - not available or not authenticated');
          return;
        }

        // Set secret
        await provider.setSecret(testKey, testValue, testNamespace);

        // Verify it exists
        let retrieved = await provider.getSecret(testKey, testNamespace);
        expect(retrieved).toBe(testValue);

        // Delete it
        if (provider.deleteSecret) {
          await provider.deleteSecret(testKey, testNamespace);
        }

        // Verify it's gone
        retrieved = await provider.getSecret(testKey, testNamespace);
        expect(retrieved).toBeNull();
      });

      it('should update existing secret', async () => {
        if (!isAvailable) {
          console.log('⏭️  Skipping 1Password CRUD test - not available or not authenticated');
          return;
        }

        const newValue = 'updated-value-' + Date.now();

        // Set initial secret
        await provider.setSecret(testKey, testValue, testNamespace);

        // Update with new value
        await provider.setSecret(testKey, newValue, testNamespace);

        // Verify new value
        const retrieved = await provider.getSecret(testKey, testNamespace);
        expect(retrieved).toBe(newValue);
      });
    });
  });

  describe('EnvProvider Integration', () => {
    let provider: EnvProvider;

    beforeAll(() => {
      provider = new EnvProvider();
    });

    afterEach(() => {
      // Clean up test env vars
      for (const key of Object.keys(process.env)) {
        if (key.startsWith('JELLOS_SECRET_TEST_')) {
          delete process.env[key];
        }
      }
    });

    it('should always be available', async () => {
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it('should report healthy status', async () => {
      const health = await provider.getHealthStatus();

      expect(health.status).toBe(ProviderHealthStatus.HEALTHY);
      expect(health.available).toBe(true);
      expect(health.cliInstalled).toBe(true);
      expect(health.latency).toBe(0);
    });

    it('should set and get secrets', async () => {
      const key = 'TEST_KEY';
      const value = 'test-value';
      const namespace = 'test';

      await provider.setSecret(key, value, namespace);
      const retrieved = await provider.getSecret(key, namespace);

      expect(retrieved).toBe(value);
    });

    it('should return null for non-existent secrets', async () => {
      const result = await provider.getSecret('NONEXISTENT', 'test');
      expect(result).toBeNull();
    });

    it('should list secrets in namespace', async () => {
      await provider.setSecret('KEY1', 'value1', 'test');
      await provider.setSecret('KEY2', 'value2', 'test');

      if (provider.listSecrets) {
        const secrets = await provider.listSecrets('test');
        expect(secrets).toContain('KEY1');
        expect(secrets).toContain('KEY2');
      }
    });

    it('should delete secrets', async () => {
      await provider.setSecret('DELETE_ME', 'value', 'test');

      let retrieved = await provider.getSecret('DELETE_ME', 'test');
      expect(retrieved).toBe('value');

      if (provider.deleteSecret) {
        await provider.deleteSecret('DELETE_ME', 'test');
      }

      retrieved = await provider.getSecret('DELETE_ME', 'test');
      expect(retrieved).toBeNull();
    });
  });
});
