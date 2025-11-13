/**
 * PR Template Types
 * Type definitions for PR template rendering system
 */

import type { Issue, ExternalIssueLink } from './issue';
import type { AgentExecution } from '../lib/db';

/**
 * Template data context for PR rendering
 */
export interface PRTemplateContext {
  issue: PRIssueData;
  execution?: PRExecutionData;
  changes?: PRChangesData;
  metadata: PRMetadata;
}

/**
 * Issue data for PR template
 */
export interface PRIssueData {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  externalLinks: PRExternalLink[];
}

/**
 * External issue link for PR template
 */
export interface PRExternalLink {
  provider: string;
  externalId: string;
  url: string;
}

/**
 * Execution data for PR template
 */
export interface PRExecutionData {
  id: string;
  status: string;
  startedAt?: Date;
  completedAt?: Date;
  exitCode?: number;
  gitCommitHash?: string;
  gitCommitMsg?: string;
  gitBranch?: string;
  filesChanged?: number;
  linesAdded?: number;
  linesDeleted?: number;
  duration?: number; // milliseconds
}

/**
 * Changed files data for PR template
 */
export interface PRChangesData {
  files: string[];
  summary: string;
}

/**
 * PR metadata
 */
export interface PRMetadata {
  branch: string;
  baseBranch: string;
  author?: string;
  timestamp: Date;
  repoOwner?: string;
  repoName?: string;
}

/**
 * Template configuration
 */
export interface PRTemplateConfig {
  templatePath?: string; // Path to custom template file
  useDefaultTemplate?: boolean; // Use built-in default template
  includeIssueLinks?: boolean; // Include external issue links
  includeExecutionSummary?: boolean; // Include agent execution summary
  includeChangedFiles?: boolean; // Include list of changed files
  includeDiffStats?: boolean; // Include diff statistics
  maxFilesListed?: number; // Maximum number of files to list (default: 50)
}

/**
 * Template rendering result
 */
export interface PRTemplateResult {
  title: string;
  body: string;
  labels?: string[];
}
