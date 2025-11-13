/**
 * Secret Manager
 * Orchestrates multiple secret providers with priority-based resolution
 */

import type {
  ISecretProvider,
  SecretManagerConfig,
  SecretReference,
  SecretResolutionResult,
  SecretValidationError,
  SecretAccessLog,
  SecretValue,
  ProviderHealthCheck,
} from './types';
import { SecretProviderType, SecretEnvironment, ProviderHealthStatus } from './types';
import { createKeychainProvider } from './providers/keychain.provider';
import { createOnePasswordProvider } from './providers/1password.provider';
import { createEnvProvider } from './providers/env.provider';
import {
  findSecretReferences,
  replaceSecretReferences,
  replaceSecretReferencesInObject,
} from './parser';

/**
 * Default secret manager configuration
 */
const DEFAULT_CONFIG: SecretManagerConfig = {
  providers: [
    { type: SecretProviderType.KEYCHAIN, priority: 3, enabled: true },
    { type: SecretProviderType.ONE_PASSWORD, priority: 2, enabled: true },
    { type: SecretProviderType.ENV, priority: 1, enabled: true },
  ],
  defaultEnvironment: SecretEnvironment.DEVELOPMENT,
  enableLogging: true,
  throwOnMissing: false,
  cacheTimeout: 300, // 5 minutes
};

/**
 * Secret Manager implementation
 */
export class SecretManager {
  private providers: ISecretProvider[] = [];
  private config: SecretManagerConfig;
  private accessLogs: SecretAccessLog[] = [];
  private cache: Map<string, SecretValue> = new Map();

  constructor(config?: Partial<SecretManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the secret manager
   * Discovers and initializes available providers
   */
  async initialize(): Promise<void> {
    // Create all provider instances
    const allProviders: ISecretProvider[] = [
      createKeychainProvider(),
      createOnePasswordProvider(),
      createEnvProvider(),
    ];

    // Filter enabled providers and check availability
    const availableProviders: ISecretProvider[] = [];

    for (const provider of allProviders) {
      const providerConfig = this.config.providers.find(
        (p) => p.type === provider.type
      );

      if (!providerConfig?.enabled) {
        continue;
      }

      const isAvailable = await provider.isAvailable();
      if (isAvailable) {
        availableProviders.push(provider);
      } else {
        console.warn(`[SecretManager] Provider ${provider.name} is not available`);
      }
    }

    // Sort by priority (highest first)
    this.providers = availableProviders.sort((a, b) => {
      const aPriority = this.config.providers.find((p) => p.type === a.type)?.priority || 0;
      const bPriority = this.config.providers.find((p) => p.type === b.type)?.priority || 0;
      return bPriority - aPriority;
    });

    console.log(
      `[SecretManager] Initialized with providers: ${this.providers.map((p) => p.name).join(', ')}`
    );
  }

  /**
   * Get a secret value with the specified key and namespace
   * Tries providers in priority order until one returns a value
   */
  async getSecret(
    key: string,
    namespace?: string
  ): Promise<SecretResolutionResult> {
    const effectiveNamespace = namespace || this.config.defaultEnvironment;
    const cacheKey = `${effectiveNamespace}/${key}`;

    // Check cache first
    if (this.config.cacheTimeout && this.config.cacheTimeout > 0) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        const age = Date.now() - cached.retrievedAt.getTime();
        if (age < this.config.cacheTimeout * 1000) {
          return {
            resolved: true,
            value: cached.value,
            provider: cached.source,
          };
        } else {
          // Cache expired
          this.cache.delete(cacheKey);
        }
      }
    }

    // Try each provider in priority order
    for (const provider of this.providers) {
      try {
        const value = await provider.getSecret(key, effectiveNamespace);

        if (value !== null) {
          // Log access
          this.logAccess({
            key,
            namespace: effectiveNamespace,
            provider: provider.type,
            accessedAt: new Date(),
            success: true,
          });

          // Cache the result
          if (this.config.cacheTimeout && this.config.cacheTimeout > 0) {
            this.cache.set(cacheKey, {
              value,
              source: provider.type,
              retrievedAt: new Date(),
              namespace: effectiveNamespace,
            });
          }

          return {
            resolved: true,
            value,
            provider: provider.type,
          };
        }
      } catch (error) {
        console.error(
          `[SecretManager] Error retrieving secret from ${provider.name}:`,
          error
        );

        this.logAccess({
          key,
          namespace: effectiveNamespace,
          provider: provider.type,
          accessedAt: new Date(),
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // No provider found the secret
    const errorMessage = `Secret not found: ${effectiveNamespace}/${key}`;

    this.logAccess({
      key,
      namespace: effectiveNamespace,
      provider: SecretProviderType.ENV, // Fallback provider
      accessedAt: new Date(),
      success: false,
      error: errorMessage,
    });

    if (this.config.throwOnMissing) {
      throw new Error(errorMessage);
    }

    return {
      resolved: false,
      error: errorMessage,
    };
  }

  /**
   * Resolve a secret reference
   */
  async resolveReference(ref: SecretReference): Promise<string> {
    const result = await this.getSecret(ref.key, ref.namespace);

    if (!result.resolved || !result.value) {
      if (this.config.throwOnMissing) {
        throw new Error(
          `Failed to resolve secret reference: ${ref.raw} (${result.error || 'not found'})`
        );
      }
      // Return the original reference if not found and not throwing
      return ref.raw;
    }

    return result.value;
  }

  /**
   * Replace all secret references in a string
   */
  async injectSecrets(text: string): Promise<string> {
    return replaceSecretReferences(text, (ref) => this.resolveReference(ref));
  }

  /**
   * Replace all secret references in an object (deep)
   */
  async injectSecretsIntoObject<T extends Record<string, any>>(obj: T): Promise<T> {
    return replaceSecretReferencesInObject(obj, (ref) => this.resolveReference(ref));
  }

  /**
   * Validate that all secret references in text can be resolved
   * Returns array of validation errors
   */
  async validateSecrets(text: string): Promise<SecretValidationError[]> {
    const references = findSecretReferences(text);
    const errors: SecretValidationError[] = [];

    for (const ref of references) {
      const result = await this.getSecret(ref.key, ref.namespace);

      if (!result.resolved) {
        errors.push({
          reference: ref.raw,
          key: ref.key,
          namespace: ref.namespace || this.config.defaultEnvironment,
          message: result.error || 'Secret not found',
        });
      }
    }

    return errors;
  }

  /**
   * Validate secrets in an object (deep)
   */
  async validateSecretsInObject(
    obj: Record<string, any>
  ): Promise<SecretValidationError[]> {
    const errors: SecretValidationError[] = [];

    const validateValue = async (value: any, path: string): Promise<void> => {
      if (typeof value === 'string') {
        const valueErrors = await this.validateSecrets(value);
        errors.push(
          ...valueErrors.map((err) => ({
            ...err,
            reference: `${path}: ${err.reference}`,
          }))
        );
      } else if (value !== null && typeof value === 'object') {
        for (const [key, subValue] of Object.entries(value)) {
          await validateValue(subValue, `${path}.${key}`);
        }
      }
    };

    for (const [key, value] of Object.entries(obj)) {
      await validateValue(value, key);
    }

    return errors;
  }

  /**
   * Get access logs
   */
  getAccessLogs(): SecretAccessLog[] {
    return [...this.accessLogs];
  }

  /**
   * Clear access logs
   */
  clearAccessLogs(): void {
    this.accessLogs = [];
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get available providers
   */
  getProviders(): ISecretProvider[] {
    return [...this.providers];
  }

  /**
   * Get health status for all configured providers
   */
  async getProvidersHealth(): Promise<Map<SecretProviderType, ProviderHealthCheck>> {
    const healthMap = new Map<SecretProviderType, ProviderHealthCheck>();

    for (const provider of this.providers) {
      try {
        const health = await provider.getHealthStatus();
        healthMap.set(provider.type, health);
      } catch (error) {
        // If health check fails, mark as unavailable
        healthMap.set(provider.type, {
          status: ProviderHealthStatus.UNAVAILABLE,
          available: false,
          cliInstalled: false,
          lastChecked: new Date(),
          error: error instanceof Error ? error.message : 'Health check failed',
        });
      }
    }

    return healthMap;
  }

  /**
   * Log secret access
   */
  private logAccess(log: SecretAccessLog): void {
    if (this.config.enableLogging) {
      this.accessLogs.push(log);

      // Keep only last 1000 logs to prevent memory issues
      if (this.accessLogs.length > 1000) {
        this.accessLogs = this.accessLogs.slice(-1000);
      }
    }
  }
}

/**
 * Create and initialize a secret manager instance
 */
export async function createSecretManager(
  config?: Partial<SecretManagerConfig>
): Promise<SecretManager> {
  const manager = new SecretManager(config);
  await manager.initialize();
  return manager;
}

/**
 * Singleton instance for convenience
 */
let defaultManager: SecretManager | null = null;

/**
 * Get or create the default secret manager instance
 */
export async function getDefaultSecretManager(): Promise<SecretManager> {
  if (!defaultManager) {
    defaultManager = await createSecretManager();
  }
  return defaultManager;
}

/**
 * Reset the default secret manager (useful for testing)
 */
export function resetDefaultSecretManager(): void {
  defaultManager = null;
}
