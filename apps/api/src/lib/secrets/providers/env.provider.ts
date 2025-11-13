/**
 * Environment Variable Secret Provider
 * Fallback provider that reads from process.env
 */

import type { ISecretProvider, ProviderHealthCheck } from '../types';
import { SecretProviderType, ProviderHealthStatus } from '../types';

/**
 * Environment variable provider implementation
 * This is a fallback provider with lowest priority
 */
export class EnvProvider implements ISecretProvider {
  type = SecretProviderType.ENV;
  name = 'Environment Variables';

  /**
   * Always available (process.env always exists)
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Get health status - always healthy since process.env always exists
   */
  async getHealthStatus(): Promise<ProviderHealthCheck> {
    return {
      status: ProviderHealthStatus.HEALTHY,
      available: true,
      cliInstalled: true, // N/A for env provider
      lastChecked: new Date(),
      latency: 0, // Instant access
    };
  }

  /**
   * Get secret from environment variables
   * Builds env var name: JELLOS_SECRET_<NAMESPACE>_<KEY>
   */
  async getSecret(key: string, namespace: string): Promise<string | null> {
    const envVarName = this.buildEnvVarName(key, namespace);
    return process.env[envVarName] || null;
  }

  /**
   * Environment variables cannot be set at runtime (not persistent)
   */
  async setSecret(key: string, value: string, namespace: string): Promise<void> {
    const envVarName = this.buildEnvVarName(key, namespace);
    process.env[envVarName] = value;
    console.warn(
      `[EnvProvider] Set ${envVarName} in process.env (not persistent - only for current process)`
    );
  }

  /**
   * List all Jellos secrets in environment
   */
  async listSecrets(namespace: string): Promise<string[]> {
    const prefix = this.buildEnvVarPrefix(namespace);
    const keys: string[] = [];

    for (const envVar of Object.keys(process.env)) {
      if (envVar.startsWith(prefix)) {
        // Extract the key part
        const key = envVar.substring(prefix.length);
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * Delete from process.env (not persistent)
   */
  async deleteSecret(key: string, namespace: string): Promise<void> {
    const envVarName = this.buildEnvVarName(key, namespace);
    delete process.env[envVarName];
  }

  /**
   * Build environment variable name
   * Format: JELLOS_SECRET_<NAMESPACE>_<KEY>
   * Example: JELLOS_SECRET_PROD_API_KEY
   */
  private buildEnvVarName(key: string, namespace: string): string {
    const normalizedNamespace = namespace.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const normalizedKey = key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return `JELLOS_SECRET_${normalizedNamespace}_${normalizedKey}`;
  }

  /**
   * Build environment variable prefix for a namespace
   */
  private buildEnvVarPrefix(namespace: string): string {
    const normalizedNamespace = namespace.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return `JELLOS_SECRET_${normalizedNamespace}_`;
  }
}

/**
 * Create a new environment variable provider instance
 */
export function createEnvProvider(): ISecretProvider {
  return new EnvProvider();
}
