/**
 * Config file parser for .jellos.yml files
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import type { JellosConfig, AgentConfigEntry } from '../../types/agent';

const CONFIG_FILE_NAMES = ['.jellos.yml', '.jellos.yaml', 'jellos.yml', 'jellos.yaml'];

/**
 * Parse .jellos.yml file
 */
export async function parseConfigFile(filePath: string): Promise<JellosConfig> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = yaml.load(content) as JellosConfig;
    return parsed || {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}; // File not found, return empty config
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
  return parseConfigFile(configPath);
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

  return parseConfigFile(configPath);
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
