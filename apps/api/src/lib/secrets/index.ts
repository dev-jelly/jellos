/**
 * Secret Management System
 * Exports all components for secret management
 */

// Main secret manager
export { SecretManager, createSecretManager, getDefaultSecretManager, resetDefaultSecretManager } from './secret-manager';

// Types
export type {
  ISecretProvider,
  SecretReference,
  SecretValue,
  SecretAccessLog,
  SecretProviderConfig,
  SecretManagerConfig,
  SecretResolutionResult,
  SecretValidationError,
  ProviderHealthCheck,
} from './types';

export {
  SecretProviderType,
  SecretEnvironment,
  ProviderHealthStatus,
} from './types';

// Parser utilities
export {
  findSecretReferences,
  replaceSecretReferences,
  replaceSecretReferencesInObject,
  hasSecretReferences,
  objectHasSecretReferences,
  parseSecretReference,
  validateSecretReference,
  extractUniqueSecretKeys,
} from './parser';

// Providers
export { KeychainProvider, createKeychainProvider } from './providers/keychain.provider';
export { OnePasswordProvider, createOnePasswordProvider } from './providers/1password.provider';
export { EnvProvider, createEnvProvider } from './providers/env.provider';

// Environment variable injection and masking
export {
  loadEnvironmentVariables,
  validateRequiredEnvVars,
  maskSecret,
  maskSecretsInString,
  setupSecretMasking,
  restoreConsole,
  clearTrackedSecrets,
  addTrackedSecret,
  getMaskedEnv,
  getTrackedSecretsCount,
} from './env-loader';

export type { EnvLoaderConfig, EnvLoadResult } from './env-loader';
