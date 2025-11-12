/**
 * Node.js Permission Model configuration
 * Provides sandboxing capabilities for child processes
 * Requires Node.js 20.x+ with --permission flag
 */

/**
 * Permission model configuration
 */
export interface PermissionConfig {
  /** Enable permission model */
  enabled: boolean;
  /** Allowed filesystem read paths (--allow-fs-read) */
  allowedReadPaths?: string[];
  /** Allowed filesystem write paths (--allow-fs-write) */
  allowedWritePaths?: string[];
  /** Allow child process spawning (--allow-child-process) */
  allowChildProcess?: boolean;
  /** Allow worker threads (--allow-worker) */
  allowWorker?: boolean;
}

/**
 * Default permission configuration for agent health checks
 */
export const DEFAULT_AGENT_PERMISSIONS: PermissionConfig = {
  enabled: false, // Disabled by default for compatibility
  allowChildProcess: true, // Health checks need to spawn processes
  allowWorker: false,
  allowedReadPaths: [
    // Common binary paths
    '/usr/bin',
    '/usr/local/bin',
    '/opt/homebrew/bin',
    // User home directory for global installs
    process.env.HOME ? `${process.env.HOME}/.npm/bin` : '',
    process.env.HOME ? `${process.env.HOME}/.cargo/bin` : '',
    process.env.HOME ? `${process.env.HOME}/go/bin` : '',
  ].filter(Boolean),
  allowedWritePaths: [], // Health checks don't need write access
};

/**
 * Create permission config for a specific project worktree
 */
export function createWorktreePermissions(
  projectPath: string
): PermissionConfig {
  return {
    ...DEFAULT_AGENT_PERMISSIONS,
    allowedReadPaths: [
      ...(DEFAULT_AGENT_PERMISSIONS.allowedReadPaths || []),
      projectPath, // Allow reading project files
    ],
    allowedWritePaths: [
      projectPath, // Allow writing to project directory
    ],
  };
}

/**
 * Build Node.js command-line arguments for permission model
 */
export function buildPermissionArgs(config: PermissionConfig): string[] {
  if (!config.enabled) {
    return [];
  }

  const args: string[] = ['--permission'];

  // Filesystem read permissions
  if (config.allowedReadPaths && config.allowedReadPaths.length > 0) {
    for (const path of config.allowedReadPaths) {
      args.push(`--allow-fs-read=${path}`);
    }
  }

  // Filesystem write permissions
  if (config.allowedWritePaths && config.allowedWritePaths.length > 0) {
    for (const path of config.allowedWritePaths) {
      args.push(`--allow-fs-write=${path}`);
    }
  }

  // Child process permission
  if (config.allowChildProcess) {
    args.push('--allow-child-process');
  }

  // Worker threads permission
  if (config.allowWorker) {
    args.push('--allow-worker');
  }

  return args;
}

/**
 * Check if current Node.js version supports Permission Model
 */
export function supportsPermissionModel(): boolean {
  const [major] = process.versions.node.split('.').map(Number);
  return major >= 20;
}
