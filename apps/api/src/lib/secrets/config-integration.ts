/**
 * Integration between Secret Manager and Config Parser
 * Provides utilities to inject secrets into configuration files
 */

import type { JellosConfig, AgentConfigEntry } from '../../types/agent';
import { getDefaultSecretManager } from './secret-manager';
import { objectHasSecretReferences } from './parser';
import type { SecretValidationError } from './types';

/**
 * Process .jellos.yml config and inject secrets
 * @param config - The parsed config object
 * @returns Config with secrets injected
 */
export async function injectSecretsIntoConfig(
  config: JellosConfig
): Promise<JellosConfig> {
  if (!objectHasSecretReferences(config)) {
    // No secrets to inject, return as-is
    return config;
  }

  const secretManager = await getDefaultSecretManager();
  return secretManager.injectSecretsIntoObject(config);
}

/**
 * Inject secrets into a single agent config entry
 */
export async function injectSecretsIntoAgentConfig(
  agentConfig: AgentConfigEntry
): Promise<AgentConfigEntry> {
  if (!objectHasSecretReferences(agentConfig)) {
    return agentConfig;
  }

  const secretManager = await getDefaultSecretManager();
  return secretManager.injectSecretsIntoObject(agentConfig);
}

/**
 * Validate that all secrets in config can be resolved
 * @returns Array of validation errors (empty if all valid)
 */
export async function validateConfigSecrets(
  config: JellosConfig
): Promise<SecretValidationError[]> {
  if (!objectHasSecretReferences(config)) {
    return [];
  }

  const secretManager = await getDefaultSecretManager();
  return secretManager.validateSecretsInObject(config);
}

/**
 * Check if config contains any secret references
 */
export function configHasSecrets(config: JellosConfig): boolean {
  return objectHasSecretReferences(config);
}

/**
 * Process environment variables object and inject secrets
 * Used for agent env configuration
 */
export async function injectSecretsIntoEnv(
  env: Record<string, string>
): Promise<Record<string, string>> {
  if (!objectHasSecretReferences(env)) {
    return env;
  }

  const secretManager = await getDefaultSecretManager();
  return secretManager.injectSecretsIntoObject(env);
}
