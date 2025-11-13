/**
 * Permission Whitelist Validation System
 *
 * Validates filesystem paths, network access, and process execution permissions
 * against configured whitelists before operations occur.
 *
 * Task 15.5: Permission whitelist validation system
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ServerPermissionConfig } from './server-permissions';

/**
 * Permission violation error
 */
export class PermissionViolationError extends Error {
  constructor(
    public readonly operation: string,
    public readonly path: string,
    public readonly reason: string
  ) {
    super(`Permission denied: ${operation} on "${path}" - ${reason}`);
    this.name = 'PermissionViolationError';
  }
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Path access type
 */
export type PathAccessType = 'read' | 'write' | 'execute';

/**
 * Validate filesystem path against whitelist
 *
 * @param targetPath - Path to validate
 * @param accessType - Type of access (read/write/execute)
 * @param config - Permission configuration
 * @returns True if path is allowed, false otherwise
 */
export function validatePathAccess(
  targetPath: string,
  accessType: PathAccessType,
  config: ServerPermissionConfig
): boolean {
  // If permission model is disabled, allow all access
  if (!config.enabled) {
    return true;
  }

  const resolvedPath = path.resolve(targetPath);

  // Determine which roots to check based on access type
  const allowedRoots =
    accessType === 'write'
      ? config.projectRoots // Write only allowed in project roots
      : [...config.projectRoots]; // Read can also access common paths

  // Check if path is within any allowed root
  for (const root of allowedRoots) {
    const resolvedRoot = path.resolve(root);

    // Check if target is within this root
    if (resolvedPath.startsWith(resolvedRoot)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate filesystem path and throw error if denied
 *
 * @param targetPath - Path to validate
 * @param accessType - Type of access
 * @param config - Permission configuration
 * @throws PermissionViolationError if access is denied
 */
export function validatePathAccessOrThrow(
  targetPath: string,
  accessType: PathAccessType,
  config: ServerPermissionConfig
): void {
  if (!validatePathAccess(targetPath, accessType, config)) {
    throw new PermissionViolationError(
      accessType,
      targetPath,
      `Path is not in allowed ${accessType} whitelist`
    );
  }
}

/**
 * Validate that all configured paths exist and are accessible
 *
 * @param config - Permission configuration to validate
 * @returns Validation result with errors and warnings
 */
export function validateConfiguredPaths(
  config: ServerPermissionConfig
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Skip validation if permission model is disabled
  if (!config.enabled) {
    result.warnings.push(
      'Permission model is disabled - no path validation performed'
    );
    return result;
  }

  // Validate project roots exist
  for (const root of config.projectRoots) {
    try {
      const stats = fs.statSync(root);

      if (!stats.isDirectory()) {
        result.errors.push(`Configured path is not a directory: ${root}`);
        result.valid = false;
      }

      // Check if readable
      try {
        fs.accessSync(root, fs.constants.R_OK);
      } catch {
        result.errors.push(`Configured path is not readable: ${root}`);
        result.valid = false;
      }

      // Check if writable
      try {
        fs.accessSync(root, fs.constants.W_OK);
      } catch {
        result.warnings.push(`Configured path is not writable: ${root}`);
      }
    } catch (error) {
      result.errors.push(
        `Configured path does not exist: ${root}`
      );
      result.valid = false;
    }
  }

  // Warn if no project roots configured in production
  if (
    process.env.NODE_ENV === 'production' &&
    config.projectRoots.length === 0
  ) {
    result.warnings.push(
      'No project roots configured in production environment'
    );
  }

  return result;
}

/**
 * Validate child process execution is allowed
 *
 * @param config - Permission configuration
 * @throws PermissionViolationError if child processes are not allowed
 */
export function validateChildProcessAllowed(
  config: ServerPermissionConfig
): void {
  if (config.enabled && !config.allowChildProcess) {
    throw new PermissionViolationError(
      'spawn',
      'child_process',
      'Child process execution is not allowed by permission model'
    );
  }
}

/**
 * Validate worker thread execution is allowed
 *
 * @param config - Permission configuration
 * @throws PermissionViolationError if worker threads are not allowed
 */
export function validateWorkerAllowed(config: ServerPermissionConfig): void {
  if (config.enabled && !config.allowWorker) {
    throw new PermissionViolationError(
      'worker',
      'worker_threads',
      'Worker thread execution is not allowed by permission model'
    );
  }
}

/**
 * Get human-readable error message with resolution guidance
 *
 * @param error - Permission violation error
 * @returns Formatted error message with guidance
 */
export function formatPermissionError(error: PermissionViolationError): string {
  const lines: string[] = [
    '',
    '🚫 Permission Denied',
    '─'.repeat(80),
    `Operation: ${error.operation}`,
    `Path:      ${error.path}`,
    `Reason:    ${error.reason}`,
    '',
    '💡 Resolution:',
  ];

  // Provide specific guidance based on operation
  switch (error.operation) {
    case 'read':
    case 'write':
      lines.push(
        '   1. Add the path to PROJECT_ROOTS environment variable:',
        `      PROJECT_ROOTS=/path/to/allowed,${error.path}`,
        '',
        '   2. Or disable permission model for development:',
        '      NODE_PERMISSIONS=false',
        ''
      );
      break;

    case 'spawn':
      lines.push(
        '   1. Enable child process permission:',
        '      ALLOW_CHILD_PROCESS=true',
        '',
        '   2. Or use a less restrictive permission profile:',
        '      NODE_ENV=development',
        ''
      );
      break;

    case 'worker':
      lines.push(
        '   1. Enable worker thread permission:',
        '      ALLOW_WORKER=true',
        ''
      );
      break;
  }

  lines.push('─'.repeat(80), '');

  return lines.join('\n');
}

/**
 * Check if a path is within allowed boundaries (no path traversal)
 *
 * @param targetPath - Path to check
 * @param allowedRoot - Root directory that should contain the path
 * @returns True if path is safely within root
 */
export function isPathWithinRoot(targetPath: string, allowedRoot: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(allowedRoot);

  return resolvedTarget.startsWith(resolvedRoot);
}

/**
 * Sanitize and validate a path for safe access
 *
 * @param inputPath - User-provided path
 * @param baseRoot - Base directory to resolve relative paths against
 * @param config - Permission configuration
 * @returns Sanitized absolute path
 * @throws PermissionViolationError if path validation fails
 */
export function sanitizePath(
  inputPath: string,
  baseRoot: string,
  config: ServerPermissionConfig
): string {
  // Resolve to absolute path
  const absolutePath = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(baseRoot, inputPath);

  // Check for path traversal attempts
  if (!isPathWithinRoot(absolutePath, baseRoot)) {
    throw new PermissionViolationError(
      'read',
      inputPath,
      'Path traversal detected - path escapes allowed root'
    );
  }

  // Validate against whitelist
  validatePathAccessOrThrow(absolutePath, 'read', config);

  return absolutePath;
}
