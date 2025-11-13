/**
 * Types for Agent Discovery System
 */

/**
 * Agent source indicating where it was discovered
 */
export enum AgentSource {
  PROJECT_CONFIG = 'project', // From .jellos.yml in project directory
  GLOBAL_CONFIG = 'global', // From ~/.jellos/config.yml
  AUTO_DETECTED = 'auto', // Auto-detected from PATH or known locations
}

/**
 * Agent discovery priority
 * Higher number = higher priority
 */
export const AGENT_SOURCE_PRIORITY: Record<AgentSource, number> = {
  [AgentSource.PROJECT_CONFIG]: 3,
  [AgentSource.GLOBAL_CONFIG]: 2,
  [AgentSource.AUTO_DETECTED]: 1,
};

/**
 * Agent runtime metadata
 */
export interface AgentMetadata {
  externalId: string; // Unique identifier (e.g., "claude-code", "playwright")
  label: string; // Display name
  cmd: string; // Command to execute
  args: string[]; // Command arguments
  envMask: string[]; // Environment variables to use
  version?: string; // Version string
  path?: string; // Full path to executable
  source: AgentSource; // Where it was discovered
  priority: number; // Discovery priority
  config?: Record<string, unknown>; // Additional configuration
}

/**
 * Link template configuration for external tools
 */
export interface LinkTemplate {
  baseUrl: string;
  prTemplate?: string;
  commitTemplate?: string;
  fileTemplate?: string;
  blameTemplate?: string;
  diffTemplate?: string;
  issueTemplate?: string;
  workspaceUrl?: string;
  pipelineTemplate?: string;
  jobTemplate?: string;
  deploymentTemplate?: string;
}

/**
 * Links section configuration for external tool URLs
 */
export interface LinksConfig {
  github?: LinkTemplate;
  linear?: LinkTemplate;
  jenkins?: LinkTemplate;
  githubActions?: LinkTemplate;
  deployment?: LinkTemplate;
}

/**
 * .jellos.yml file structure
 */
export interface JellosConfig {
  agents?: AgentConfigEntry[];
  links?: LinksConfig;
  worktree?: {
    'post-create'?: string[];
    'env-files'?: string[];
    'git-hooks'?: string[];
  };
  // Other config options can be added here
}

/**
 * Agent entry in .jellos.yml
 */
export interface AgentConfigEntry {
  id: string; // Unique identifier
  name: string; // Display name
  command: string; // Command to run
  args?: string[]; // Optional arguments
  env?: Record<string, string>; // Environment variables
  enabled?: boolean; // Whether agent is enabled (default: true)
  version?: string; // Version requirement or constraint
  config?: Record<string, unknown>; // Additional config
}

/**
 * Known agent definitions for auto-detection
 */
export interface KnownAgent {
  id: string;
  name: string;
  commands: string[]; // Possible command names to look for
  versionArgs?: string[]; // Args to get version (default: --version)
  versionPattern?: RegExp; // Pattern to extract version from output
  env?: string[]; // Required environment variables
}
