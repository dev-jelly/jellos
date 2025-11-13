/**
 * Tests for secret providers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnvProvider } from '../providers/env.provider';
import { SecretProviderType } from '../types';

describe('EnvProvider', () => {
  let provider: EnvProvider;

  beforeEach(() => {
    provider = new EnvProvider();
  });

  it('should have correct type and name', () => {
    expect(provider.type).toBe(SecretProviderType.ENV);
    expect(provider.name).toBe('Environment Variables');
  });

  it('should always be available', async () => {
    const available = await provider.isAvailable();
    expect(available).toBe(true);
  });

  describe('getSecret', () => {
    it('should get secret from environment', async () => {
      process.env.JELLOS_SECRET_TEST_MY_KEY = 'test-value';

      const value = await provider.getSecret('MY_KEY', 'test');

      expect(value).toBe('test-value');

      delete process.env.JELLOS_SECRET_TEST_MY_KEY;
    });

    it('should return null when secret not found', async () => {
      const value = await provider.getSecret('NONEXISTENT', 'test');
      expect(value).toBe(null);
    });

    it('should handle different namespaces', async () => {
      process.env.JELLOS_SECRET_DEV_KEY = 'dev-value';
      process.env.JELLOS_SECRET_PROD_KEY = 'prod-value';

      const devValue = await provider.getSecret('KEY', 'dev');
      const prodValue = await provider.getSecret('KEY', 'prod');

      expect(devValue).toBe('dev-value');
      expect(prodValue).toBe('prod-value');

      delete process.env.JELLOS_SECRET_DEV_KEY;
      delete process.env.JELLOS_SECRET_PROD_KEY;
    });

    it('should normalize namespace and key names', async () => {
      // Test that special characters are replaced with underscores
      process.env.JELLOS_SECRET_MY_NAMESPACE_MY_KEY = 'value';

      const value = await provider.getSecret('my-key', 'my-namespace');

      expect(value).toBe('value');

      delete process.env.JELLOS_SECRET_MY_NAMESPACE_MY_KEY;
    });
  });

  describe('setSecret', () => {
    it('should set secret in environment', async () => {
      await provider.setSecret('TEST_KEY', 'test-value', 'test');

      expect(process.env.JELLOS_SECRET_TEST_TEST_KEY).toBe('test-value');

      delete process.env.JELLOS_SECRET_TEST_TEST_KEY;
    });

    it('should overwrite existing secrets', async () => {
      await provider.setSecret('KEY', 'value1', 'test');
      await provider.setSecret('KEY', 'value2', 'test');

      expect(process.env.JELLOS_SECRET_TEST_KEY).toBe('value2');

      delete process.env.JELLOS_SECRET_TEST_KEY;
    });
  });

  describe('listSecrets', () => {
    it('should list secrets in namespace', async () => {
      process.env.JELLOS_SECRET_TEST_KEY1 = 'value1';
      process.env.JELLOS_SECRET_TEST_KEY2 = 'value2';
      process.env.JELLOS_SECRET_OTHER_KEY3 = 'value3';

      const secrets = await provider.listSecrets('test');

      expect(secrets).toContain('KEY1');
      expect(secrets).toContain('KEY2');
      expect(secrets).not.toContain('KEY3');

      delete process.env.JELLOS_SECRET_TEST_KEY1;
      delete process.env.JELLOS_SECRET_TEST_KEY2;
      delete process.env.JELLOS_SECRET_OTHER_KEY3;
    });

    it('should return empty array when no secrets found', async () => {
      const secrets = await provider.listSecrets('nonexistent');
      expect(secrets).toEqual([]);
    });
  });

  describe('deleteSecret', () => {
    it('should delete secret from environment', async () => {
      process.env.JELLOS_SECRET_TEST_DELETE_ME = 'value';

      await provider.deleteSecret('DELETE_ME', 'test');

      expect(process.env.JELLOS_SECRET_TEST_DELETE_ME).toBeUndefined();
    });
  });
});

// Note: KeychainProvider and OnePasswordProvider tests are skipped
// because they require actual macOS Keychain and 1Password CLI to be installed
// These should be tested manually or in integration tests

describe('KeychainProvider', () => {
  it('should be skipped in unit tests', () => {
    // Keychain tests require macOS and actual Keychain access
    // These should be tested manually or in integration tests
    expect(true).toBe(true);
  });
});

describe('OnePasswordProvider', () => {
  it('should be skipped in unit tests', () => {
    // 1Password tests require 1Password CLI to be installed
    // These should be tested manually or in integration tests
    expect(true).toBe(true);
  });
});
