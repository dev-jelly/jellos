/**
 * Server-level Node.js Permission Model configuration
 * These permissions apply to the Fastify API server process itself
 */

import path from 'path';

/**
 * Generate Node.js permission flags for starting the API server
 * Usage: node --permission --allow-child-process --allow-fs-read=/path/to/project server.js
 */
export interface ServerPermissionConfig {
  /** Enable permission model */
  enabled: boolean;
  /** Project root paths that need access */
  projectRoots: string[];
  /** Allow child process spawning (required for agent health checks) */
  allowChildProcess: boolean;
  /** Allow worker threads */
  allowWorker: boolean;
}

/**
 * Default server permissions for production deployment
 */
export const DEFAULT_SERVER_PERMISSIONS: ServerPermissionConfig = {
  enabled: false, // Disabled by default for development
  projectRoots: [],
  allowChildProcess: true, // Required for agent health checks
  allowWorker: false,
};

/**
 * Generate command-line arguments for Node.js permission model
 * @returns Array of arguments to pass when starting node
 */
export function generateServerPermissionArgs(
  config: ServerPermissionConfig
): string[] {
  if (!config.enabled) {
    return [];
  }

  const args: string[] = ['--permission'];

  // Child process permission (required for agent discovery)
  if (config.allowChildProcess) {
    args.push('--allow-child-process');
  }

  // Worker threads permission
  if (config.allowWorker) {
    args.push('--allow-worker');
  }

  // Filesystem read permissions for project roots
  if (config.projectRoots.length > 0) {
    for (const root of config.projectRoots) {
      args.push(`--allow-fs-read=${path.resolve(root)}`);
    }
  }

  // Allow reading common binary paths
  const commonPaths = [
    '/usr/bin',
    '/usr/local/bin',
    '/opt/homebrew/bin',
    process.env.HOME ? `${process.env.HOME}/.npm/bin` : null,
    process.env.HOME ? `${process.env.HOME}/.cargo/bin` : null,
    process.env.HOME ? `${process.env.HOME}/go/bin` : null,
  ].filter(Boolean) as string[];

  for (const commonPath of commonPaths) {
    args.push(`--allow-fs-read=${commonPath}`);
  }

  // Allow reading the API codebase itself
  const apiRoot = path.resolve(__dirname, '../..');
  args.push(`--allow-fs-read=${apiRoot}`);

  return args;
}

/**
 * Generate permission configuration from environment
 */
export function getServerPermissionsFromEnv(): ServerPermissionConfig {
  const enabled = process.env.NODE_PERMISSIONS === 'true';
  const projectRoots = process.env.PROJECT_ROOTS
    ? process.env.PROJECT_ROOTS.split(',').map((p) => p.trim())
    : [];

  return {
    enabled,
    projectRoots,
    allowChildProcess: true,
    allowWorker: false,
  };
}

/**
 * Check if server is running with permission model enabled
 */
export function isPermissionModelActive(): boolean {
  // Node.js permission model is active if process.permission exists
  return typeof (process as any).permission !== 'undefined';
}

/**
 * Get helpful error message for permission denied errors
 */
export function getPermissionErrorHelp(operation: string, path?: string): string {
  return `
╔═══════════════════════════════════════════════════════════════════════╗
║                   PERMISSION DENIED ERROR                              ║
╚═══════════════════════════════════════════════════════════════════════╝

Operation: ${operation}
${path ? `Path: ${path}\n` : ''}
The API server is running with Node.js Permission Model enabled,
which restricts access to filesystem and child processes.

To resolve this issue:

1. Add the required path to NODE_PERMISSIONS_PATHS environment variable:
   export NODE_PERMISSIONS_PATHS="/path/to/project,${path || '/additional/path'}"

2. Restart the server with proper permissions:
   node --permission --allow-child-process --allow-fs-read=/path dist/index.js

3. Or disable permission model (not recommended for production):
   export NODE_PERMISSIONS=false

For more information, see: https://nodejs.org/api/permissions.html
`;
}

/**
 * Log permission configuration on server startup
 */
export function logPermissionConfig(config: ServerPermissionConfig): void {
  if (!config.enabled) {
    console.log('🔓 Permission Model: DISABLED (development mode)');
    return;
  }

  console.log('🔒 Permission Model: ENABLED');
  console.log('   ├─ Child Process: ' + (config.allowChildProcess ? '✓ ALLOWED' : '✗ DENIED'));
  console.log('   ├─ Worker Threads: ' + (config.allowWorker ? '✓ ALLOWED' : '✗ DENIED'));
  console.log('   └─ Project Roots: ' + (config.projectRoots.length > 0 ? config.projectRoots.join(', ') : 'NONE'));
}
