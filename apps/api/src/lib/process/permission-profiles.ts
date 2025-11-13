/**
 * Permission Profiles for different deployment environments
 *
 * Node.js Permission Model provides sandboxing capabilities that restrict
 * what the application can access. This file defines environment-specific
 * permission profiles for development, staging, and production.
 *
 * @see https://nodejs.org/api/permissions.html
 */

import path from 'path';
import type { ServerPermissionConfig } from './server-permissions';

/**
 * Permission profile names
 */
export type PermissionProfile = 'development' | 'staging' | 'production' | 'test';

/**
 * Permission profiles for different environments
 */
export const PERMISSION_PROFILES: Record<PermissionProfile, ServerPermissionConfig> = {
  /**
   * Development profile - Most permissive for local development
   * - Allows child processes (required for agent health checks)
   * - Allows reading from common development paths
   * - Permission model disabled by default (can be enabled for testing)
   */
  development: {
    enabled: false, // Disabled by default for development ease
    projectRoots: [],
    allowChildProcess: true,
    allowWorker: false,
  },

  /**
   * Test profile - Restrictive but allows test execution
   * - Enables permission model for testing security behavior
   * - Allows child processes (needed for spawning test commands)
   * - Restricts filesystem to test directories only
   */
  test: {
    enabled: true,
    projectRoots: [
      path.resolve(process.cwd(), 'src'),
      path.resolve(process.cwd(), 'dist'),
      path.resolve(process.cwd(), 'test'),
      '/tmp', // Allow temp directory for test artifacts
    ],
    allowChildProcess: true,
    allowWorker: false,
  },

  /**
   * Staging profile - Production-like restrictions for validation
   * - Enables permission model to validate production behavior
   * - Allows child processes (required for agent operations)
   * - Restricts filesystem to application directory and specific paths
   */
  staging: {
    enabled: true,
    projectRoots: [
      path.resolve(process.cwd(), 'dist'),
      '/var/lib/jellos', // Example: data directory
      '/var/log/jellos', // Example: log directory
    ],
    allowChildProcess: true,
    allowWorker: false,
  },

  /**
   * Production profile - Most restrictive for security
   * - Enables permission model for maximum security
   * - Allows child processes (required for agent health checks)
   * - Strictly limits filesystem access to application paths only
   * - No worker threads unless explicitly needed
   */
  production: {
    enabled: true,
    projectRoots: [
      path.resolve(process.cwd(), 'dist'),
      '/var/lib/jellos',
      '/var/log/jellos',
    ],
    allowChildProcess: true,
    allowWorker: false,
  },
};

/**
 * Get permission profile based on NODE_ENV
 */
export function getPermissionProfileFromEnv(): PermissionProfile {
  const env = process.env.NODE_ENV?.toLowerCase() || 'development';

  switch (env) {
    case 'production':
      return 'production';
    case 'staging':
      return 'staging';
    case 'test':
      return 'test';
    case 'development':
    default:
      return 'development';
  }
}

/**
 * Get permission configuration for current environment
 *
 * Priority:
 * 1. Environment variables (NODE_PERMISSIONS, PROJECT_ROOTS)
 * 2. Permission profile based on NODE_ENV
 * 3. Default development profile
 */
export function getPermissionConfig(): ServerPermissionConfig {
  // Check if explicitly configured via environment variables
  const explicitEnabled = process.env.NODE_PERMISSIONS;
  if (explicitEnabled !== undefined) {
    const enabled = explicitEnabled === 'true';
    const projectRoots = process.env.PROJECT_ROOTS
      ? process.env.PROJECT_ROOTS.split(',').map((p) => p.trim())
      : [];

    return {
      enabled,
      projectRoots,
      allowChildProcess: process.env.ALLOW_CHILD_PROCESS !== 'false',
      allowWorker: process.env.ALLOW_WORKER === 'true',
    };
  }

  // Fall back to profile based on NODE_ENV
  const profile = getPermissionProfileFromEnv();
  return PERMISSION_PROFILES[profile];
}

/**
 * Validate permission configuration
 * Throws error if configuration is invalid
 */
export function validatePermissionConfig(config: ServerPermissionConfig): void {
  if (!config.enabled) {
    return; // No validation needed when disabled
  }

  // Warn if no project roots configured in production
  if (process.env.NODE_ENV === 'production' && config.projectRoots.length === 0) {
    console.warn(
      '⚠️  WARNING: Permission model is enabled but no PROJECT_ROOTS configured. ' +
      'This may cause filesystem access issues.'
    );
  }

  // Validate paths exist
  const fs = require('fs');
  for (const root of config.projectRoots) {
    if (!fs.existsSync(root)) {
      console.warn(`⚠️  WARNING: Configured project root does not exist: ${root}`);
    }
  }
}

/**
 * Additional filesystem paths that should be readable by the application
 * These are added to any profile automatically
 */
export const COMMON_READ_PATHS = [
  // System binary paths
  '/usr/bin',
  '/usr/local/bin',
  '/opt/homebrew/bin', // macOS Homebrew

  // Common language runtime paths
  process.env.HOME ? `${process.env.HOME}/.npm/bin` : null,
  process.env.HOME ? `${process.env.HOME}/.cargo/bin` : null,
  process.env.HOME ? `${process.env.HOME}/go/bin` : null,
  process.env.HOME ? `${process.env.HOME}/.local/bin` : null,

  // Node.js runtime
  process.execPath,
  path.dirname(process.execPath),
].filter((p): p is string => Boolean(p));

/**
 * Build complete permission arguments including common paths
 */
export function buildCompletePermissionArgs(config: ServerPermissionConfig): string[] {
  if (!config.enabled) {
    return [];
  }

  const args: string[] = ['--permission'];

  // Child process permission
  if (config.allowChildProcess) {
    args.push('--allow-child-process');
  }

  // Worker threads permission
  if (config.allowWorker) {
    args.push('--allow-worker');
  }

  // Filesystem read permissions - project roots
  for (const root of config.projectRoots) {
    args.push(`--allow-fs-read=${path.resolve(root)}`);
  }

  // Filesystem read permissions - common paths
  for (const commonPath of COMMON_READ_PATHS) {
    args.push(`--allow-fs-read=${commonPath}`);
  }

  // Add write permissions for project roots only
  for (const root of config.projectRoots) {
    args.push(`--allow-fs-write=${root}`);
  }

  return args;
}

/**
 * Display permission configuration on startup
 */
export function displayPermissionConfig(config: ServerPermissionConfig): void {
  if (!config.enabled) {
    console.log('\n🔓 Node.js Permission Model: DISABLED');
    console.log('   Running in unrestricted mode (suitable for development)');
    console.log('   To enable: Set NODE_PERMISSIONS=true or NODE_ENV=production\n');
    return;
  }

  console.log('\n🔒 Node.js Permission Model: ENABLED');
  console.log('   Security sandbox is active\n');

  console.log('📋 Permissions:');
  console.log(`   ├─ Child Process: ${config.allowChildProcess ? '✅ ALLOWED' : '❌ DENIED'}`);
  console.log(`   ├─ Worker Threads: ${config.allowWorker ? '✅ ALLOWED' : '❌ DENIED'}`);
  console.log(`   └─ WASI: ❌ DENIED (default)\n`);

  console.log('📁 Filesystem Access:');
  if (config.projectRoots.length > 0) {
    console.log('   Project Roots (read + write):');
    for (const root of config.projectRoots) {
      console.log(`     • ${root}`);
    }
  } else {
    console.log('   ⚠️  No project roots configured!');
  }

  console.log('\n   Common Paths (read-only):');
  console.log(`     • ${COMMON_READ_PATHS.length} system paths enabled`);
  console.log('');
}

/**
 * Get recommended permission configuration for production deployment
 */
export function getProductionRecommendations(): string[] {
  return [
    '# Recommended production configuration:',
    '',
    'NODE_ENV=production',
    'NODE_PERMISSIONS=true',
    'PROJECT_ROOTS=/app/dist,/var/lib/jellos,/var/log/jellos',
    'ALLOW_CHILD_PROCESS=true  # Required for agent health checks',
    'ALLOW_WORKER=false',
    '',
    '# Start command:',
    'node dist/index.js',
    '',
    '# Or manually specify permissions:',
    'node --permission --allow-child-process \\',
    '  --allow-fs-read=/app/dist \\',
    '  --allow-fs-read=/var/lib/jellos \\',
    '  --allow-fs-read=/usr/bin \\',
    '  --allow-fs-write=/var/lib/jellos \\',
    '  --allow-fs-write=/var/log/jellos \\',
    '  dist/index.js',
  ];
}
