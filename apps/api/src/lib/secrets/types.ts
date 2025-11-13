/**
 * Secret Management System Types
 */

/**
 * Supported secret provider types
 */
export enum SecretProviderType {
  KEYCHAIN = 'keychain', // macOS Keychain
  ONE_PASSWORD = '1password', // 1Password CLI
  ENV = 'env', // Environment variables (fallback)
}

/**
 * Secret reference in .jellos.yml
 * Format: ${secret:KEY} or ${secret:NAMESPACE/KEY}
 */
export interface SecretReference {
  key: string; // The secret key
  namespace?: string; // Optional namespace (defaults to environment)
  raw: string; // Original reference string
}

/**
 * Secret value with metadata
 */
export interface SecretValue {
  value: string;
  source: SecretProviderType;
  retrievedAt: Date;
  namespace: string;
}

/**
 * Secret access log entry
 */
export interface SecretAccessLog {
  key: string;
  namespace: string;
  provider: SecretProviderType;
  accessedAt: Date;
  success: boolean;
  error?: string;
}

/**
 * Secret provider configuration
 */
export interface SecretProviderConfig {
  type: SecretProviderType;
  priority: number; // Higher number = higher priority
  enabled: boolean;
  config?: Record<string, unknown>; // Provider-specific config
}

/**
 * Provider health status
 */
export enum ProviderHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNAVAILABLE = 'unavailable',
}

/**
 * Provider health check result
 */
export interface ProviderHealthCheck {
  status: ProviderHealthStatus;
  available: boolean;
  cliInstalled: boolean;
  authenticated?: boolean; // For providers that require authentication (e.g., 1Password)
  version?: string; // CLI tool version if available
  latency?: number; // Response time in milliseconds
  lastChecked: Date;
  error?: string;
  helpText?: string; // Helpful message for fixing issues
}

/**
 * Secret provider interface
 */
export interface ISecretProvider {
  type: SecretProviderType;
  name: string;

  /**
   * Check if the provider is available on the system
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get comprehensive health status of the provider
   * Includes availability, authentication, version, and performance metrics
   */
  getHealthStatus(): Promise<ProviderHealthCheck>;

  /**
   * Retrieve a secret value
   */
  getSecret(key: string, namespace: string): Promise<string | null>;

  /**
   * Store a secret value (optional - not all providers support this)
   */
  setSecret?(key: string, value: string, namespace: string): Promise<void>;

  /**
   * List all secret keys in a namespace (optional)
   */
  listSecrets?(namespace: string): Promise<string[]>;

  /**
   * Delete a secret (optional)
   */
  deleteSecret?(key: string, namespace: string): Promise<void>;
}

/**
 * Secret resolution result
 */
export interface SecretResolutionResult {
  resolved: boolean;
  value?: string;
  provider?: SecretProviderType;
  error?: string;
}

/**
 * Secret validation error
 */
export interface SecretValidationError {
  reference: string;
  key: string;
  namespace: string;
  message: string;
}

/**
 * Environment-based secret namespaces
 */
export enum SecretEnvironment {
  DEVELOPMENT = 'dev',
  STAGING = 'staging',
  PRODUCTION = 'prod',
  TEST = 'test',
}

/**
 * Secret manager configuration
 */
export interface SecretManagerConfig {
  providers: SecretProviderConfig[];
  defaultEnvironment: SecretEnvironment;
  enableLogging: boolean;
  throwOnMissing: boolean; // Whether to throw error on missing secrets
  cacheTimeout?: number; // Cache timeout in seconds (0 = no cache)
}
