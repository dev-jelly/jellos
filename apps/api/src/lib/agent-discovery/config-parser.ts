/**
 * Config file parser for .jellos.yml files
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import type { JellosConfig, AgentConfigEntry } from '../../types/agent';
import { injectSecretsIntoConfig } from '../secrets/config-integration';

const CONFIG_FILE_NAMES = ['.jellos.yml', '.jellos.yaml', 'jellos.yml', 'jellos.yaml'];

/**
 * Parse .jellos.yml file
 */
export async function parseConfigFile(filePath: string): Promise<JellosConfig> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = yaml.load(content) as JellosConfig;
    const config = parsed || {};

    // Validate links section if present
    if (config.links) {
      const validation = validateLinksConfig(config);
      if (!validation.valid) {
        console.warn(`Invalid links configuration in ${filePath}:`, validation.errors);
        // Remove invalid links section to prevent issues downstream
        delete config.links;
      }
    }

    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}; // File not found, return empty config
    }

    // Handle YAML parsing errors
    if (error instanceof Error && error.name === 'YAMLException') {
      throw new Error(`Invalid YAML syntax in ${filePath}: ${error.message}`);
    }

    throw new Error(`Failed to parse config file ${filePath}: ${error}`);
  }
}

/**
 * Find .jellos.yml file in directory (checks multiple naming variants)
 */
export async function findConfigFile(directory: string): Promise<string | null> {
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = path.join(directory, fileName);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // File doesn't exist, continue to next
    }
  }
  return null;
}

/**
 * Load project config from .jellos.yml
 */
export async function loadProjectConfig(projectPath: string): Promise<JellosConfig> {
  const configPath = await findConfigFile(projectPath);
  if (!configPath) {
    return {}; // No config found
  }
  const config = await parseConfigFile(configPath);

  // Inject secrets if present
  return injectSecretsIntoConfig(config);
}

/**
 * Load global config from user home directory
 */
export async function loadGlobalConfig(): Promise<JellosConfig> {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    return {};
  }

  const configDir = path.join(homeDir, '.jellos');
  const configPath = await findConfigFile(configDir);
  if (!configPath) {
    return {};
  }

  const config = await parseConfigFile(configPath);

  // Inject secrets if present
  return injectSecretsIntoConfig(config);
}

/**
 * Validate agent config entry
 */
export function validateAgentConfig(agent: AgentConfigEntry): boolean {
  if (!agent.id || !agent.name || !agent.command) {
    return false;
  }
  return true;
}

/**
 * Get enabled agents from config
 */
export function getEnabledAgents(config: JellosConfig): AgentConfigEntry[] {
  if (!config.agents || !Array.isArray(config.agents)) {
    return [];
  }

  return config.agents.filter((agent) => {
    // Validate structure
    if (!validateAgentConfig(agent)) {
      return false;
    }
    // Check if enabled (default to true)
    return agent.enabled !== false;
  });
}

/**
 * Validate link template structure
 */
export function validateLinkTemplate(template: any, provider: string): boolean {
  if (!template || typeof template !== 'object') {
    return false;
  }

  // baseUrl is required for all providers except deployment
  if (provider !== 'deployment' && (!template.baseUrl || typeof template.baseUrl !== 'string')) {
    return false;
  }

  // Validate that template strings, if provided, are strings
  const templateFields = [
    'prTemplate',
    'commitTemplate',
    'fileTemplate',
    'blameTemplate',
    'diffTemplate',
    'issueTemplate',
    'workspaceUrl',
    'pipelineTemplate',
    'jobTemplate',
    'deploymentTemplate',
  ];

  for (const field of templateFields) {
    if (template[field] !== undefined && typeof template[field] !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * Validate links configuration
 */
export function validateLinksConfig(config: JellosConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.links) {
    return { valid: true, errors: [] };
  }

  if (typeof config.links !== 'object') {
    return { valid: false, errors: ['links must be an object'] };
  }

  const providers = ['github', 'linear', 'jenkins', 'githubActions', 'deployment'];

  for (const provider of providers) {
    const template = (config.links as any)[provider];
    if (template !== undefined && !validateLinkTemplate(template, provider)) {
      errors.push(`Invalid link template for provider: ${provider}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get links configuration from config
 */
export function getLinksConfig(config: JellosConfig) {
  if (!config.links) {
    return null;
  }

  const validation = validateLinksConfig(config);
  if (!validation.valid) {
    console.warn('Invalid links configuration:', validation.errors);
    return null;
  }

  return config.links;
}
