/**
 * PR Template Configuration
 * Configuration loader and validator for PR template system
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { PRTemplateConfig } from '../types/pr-template';

/**
 * Configuration file schema
 */
interface PRTemplateConfigFile {
  template?: {
    path?: string;
    useDefault?: boolean;
  };
  includes?: {
    issueLinks?: boolean;
    executionSummary?: boolean;
    changedFiles?: boolean;
    diffStats?: boolean;
  };
  limits?: {
    maxFilesListed?: number;
  };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<PRTemplateConfig> = {
  templatePath: undefined,
  useDefaultTemplate: true,
  includeIssueLinks: true,
  includeExecutionSummary: true,
  includeChangedFiles: true,
  includeDiffStats: true,
  maxFilesListed: 50,
};

/**
 * Load PR template configuration
 */
export async function loadPRTemplateConfig(
  projectPath?: string
): Promise<PRTemplateConfig> {
  // Start with defaults
  let config: PRTemplateConfig = { ...DEFAULT_CONFIG };

  // Try to load from environment variables
  config = mergeEnvConfig(config);

  // Try to load from config file
  if (projectPath) {
    const fileConfig = await loadConfigFile(projectPath);
    if (fileConfig) {
      config = mergeFileConfig(config, fileConfig);
    }
  }

  return config;
}

/**
 * Merge environment variable configuration
 */
function mergeEnvConfig(config: PRTemplateConfig): PRTemplateConfig {
  const merged = { ...config };

  if (process.env.PR_TEMPLATE_PATH) {
    merged.templatePath = process.env.PR_TEMPLATE_PATH;
  }

  if (process.env.PR_TEMPLATE_USE_DEFAULT !== undefined) {
    merged.useDefaultTemplate = process.env.PR_TEMPLATE_USE_DEFAULT === 'true';
  }

  if (process.env.PR_TEMPLATE_INCLUDE_ISSUE_LINKS !== undefined) {
    merged.includeIssueLinks =
      process.env.PR_TEMPLATE_INCLUDE_ISSUE_LINKS === 'true';
  }

  if (process.env.PR_TEMPLATE_INCLUDE_EXECUTION !== undefined) {
    merged.includeExecutionSummary =
      process.env.PR_TEMPLATE_INCLUDE_EXECUTION === 'true';
  }

  if (process.env.PR_TEMPLATE_INCLUDE_FILES !== undefined) {
    merged.includeChangedFiles = process.env.PR_TEMPLATE_INCLUDE_FILES === 'true';
  }

  if (process.env.PR_TEMPLATE_INCLUDE_DIFF_STATS !== undefined) {
    merged.includeDiffStats =
      process.env.PR_TEMPLATE_INCLUDE_DIFF_STATS === 'true';
  }

  if (process.env.PR_TEMPLATE_MAX_FILES) {
    const maxFiles = parseInt(process.env.PR_TEMPLATE_MAX_FILES, 10);
    if (!isNaN(maxFiles) && maxFiles > 0) {
      merged.maxFilesListed = maxFiles;
    }
  }

  return merged;
}

/**
 * Load configuration from file
 */
async function loadConfigFile(
  projectPath: string
): Promise<PRTemplateConfigFile | null> {
  // Try multiple config file names
  const configNames = [
    'jellos.config.json',
    '.jellosrc.json',
    '.jellosrc',
    'package.json', // Can have a "jellos" field
  ];

  for (const configName of configNames) {
    const configPath = join(projectPath, configName);

    if (existsSync(configPath)) {
      try {
        const content = await readFile(configPath, 'utf-8');
        const json = JSON.parse(content);

        // For package.json, look for "jellos" field
        if (configName === 'package.json') {
          return json.jellos?.prTemplate || null;
        }

        // For dedicated config files, look for "prTemplate" field
        return json.prTemplate || null;
      } catch (error) {
        console.warn(`Failed to load config from ${configPath}:`, error);
      }
    }
  }

  return null;
}

/**
 * Merge file configuration with current config
 */
function mergeFileConfig(
  config: PRTemplateConfig,
  fileConfig: PRTemplateConfigFile
): PRTemplateConfig {
  const merged = { ...config };

  if (fileConfig.template) {
    if (fileConfig.template.path !== undefined) {
      merged.templatePath = fileConfig.template.path;
    }
    if (fileConfig.template.useDefault !== undefined) {
      merged.useDefaultTemplate = fileConfig.template.useDefault;
    }
  }

  if (fileConfig.includes) {
    if (fileConfig.includes.issueLinks !== undefined) {
      merged.includeIssueLinks = fileConfig.includes.issueLinks;
    }
    if (fileConfig.includes.executionSummary !== undefined) {
      merged.includeExecutionSummary = fileConfig.includes.executionSummary;
    }
    if (fileConfig.includes.changedFiles !== undefined) {
      merged.includeChangedFiles = fileConfig.includes.changedFiles;
    }
    if (fileConfig.includes.diffStats !== undefined) {
      merged.includeDiffStats = fileConfig.includes.diffStats;
    }
  }

  if (fileConfig.limits) {
    if (fileConfig.limits.maxFilesListed !== undefined) {
      merged.maxFilesListed = fileConfig.limits.maxFilesListed;
    }
  }

  return merged;
}

/**
 * Validate template configuration
 */
export function validatePRTemplateConfig(config: PRTemplateConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate template path if provided
  if (config.templatePath && !existsSync(config.templatePath)) {
    errors.push(`Template path does not exist: ${config.templatePath}`);
  }

  // Validate max files listed
  if (
    config.maxFilesListed !== undefined &&
    (config.maxFilesListed < 1 || config.maxFilesListed > 1000)
  ) {
    errors.push('maxFilesListed must be between 1 and 1000');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get default configuration
 */
export function getDefaultPRTemplateConfig(): Required<PRTemplateConfig> {
  return { ...DEFAULT_CONFIG };
}
