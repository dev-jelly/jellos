/**
 * Environment Variable Injection Pipeline
 * Loads secrets from Keychain/1Password and injects them into process.env
 * with comprehensive masking for logs, errors, and console output
 */

import * as fs from 'fs';
import * as path from 'path';
import { SecretManager, getDefaultSecretManager } from './secret-manager';
import { findSecretReferences } from './parser';
import type { SecretEnvironment } from './types';

/**
 * Environment variable injection configuration
 */
export interface EnvLoaderConfig {
  /**
   * Path to .env file for fallback/defaults
   */
  envFilePath?: string;

  /**
   * Environment namespace to use for secrets
   */
  environment?: SecretEnvironment | string;

  /**
   * Whether to override existing process.env variables
   */
  override?: boolean;

  /**
   * Whether to throw on missing secrets
   */
  throwOnMissing?: boolean;

  /**
   * Secret manager instance (optional - will create default if not provided)
   */
  secretManager?: SecretManager;

  /**
   * Whether to enable masking of secrets in console/logs
   */
  enableMasking?: boolean;

  /**
   * Additional patterns to detect as secrets (regex)
   */
  additionalSecretPatterns?: RegExp[];
}

/**
 * Result of environment variable loading
 */
export interface EnvLoadResult {
  loaded: number; // Number of variables loaded
  failed: number; // Number that failed to load
  masked: number; // Number of secrets masked
  errors: string[]; // List of error messages
  variables: string[]; // Names of loaded variables
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<Omit<EnvLoaderConfig, 'secretManager'>> = {
  envFilePath: '.env',
  environment: 'dev',
  override: false,
  throwOnMissing: false,
  enableMasking: true,
  additionalSecretPatterns: [],
};

/**
 * Secret patterns for detection
 * These patterns identify potential secrets in strings
 */
const SECRET_PATTERNS = [
  // API Keys and tokens
  /\b[A-Za-z0-9_-]{32,}\b/, // Generic 32+ char tokens
  /ghp_[A-Za-z0-9]{36}/, // GitHub personal access token
  /ghs_[A-Za-z0-9]{36}/, // GitHub secret scanning token
  /github_pat_[A-Za-z0-9_]{82}/, // GitHub fine-grained PAT
  /glpat-[A-Za-z0-9_-]{20}/, // GitLab PAT
  /sk-[A-Za-z0-9]{48}/, // OpenAI API key
  /AIza[A-Za-z0-9_-]{35}/, // Google API key
  /ya29\.[A-Za-z0-9_-]+/, // Google OAuth token
  /AKIA[A-Z0-9]{16}/, // AWS access key
  /xox[baprs]-[A-Za-z0-9-]+/, // Slack tokens
  /sq0atp-[A-Za-z0-9_-]{22}/, // Square access token
  /sk_live_[A-Za-z0-9]{24}/, // Stripe live key
  /rk_live_[A-Za-z0-9]{24}/, // Stripe restricted key

  // JWTs
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,

  // Connection strings with passwords
  /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@[^/]+/,

  // Private keys
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,

  // Generic secret-like strings (password=, token=, etc.)
  /(?:password|token|secret|api[-_]?key|auth)[\s]*[=:]\s*['"]?([^\s'"]+)/i,
];

/**
 * Environment variable names that likely contain secrets
 */
const SECRET_VAR_NAMES = new Set([
  'PASSWORD',
  'SECRET',
  'TOKEN',
  'API_KEY',
  'APIKEY',
  'ACCESS_TOKEN',
  'REFRESH_TOKEN',
  'PRIVATE_KEY',
  'SESSION_SECRET',
  'JWT_SECRET',
  'DATABASE_URL',
  'DB_PASSWORD',
  'REDIS_PASSWORD',
  'ENCRYPTION_KEY',
  'AUTH_TOKEN',
  'WEBHOOK_SECRET',
  'CLIENT_SECRET',
  'MASTER_KEY',
]);

/**
 * Tracked secrets for masking
 */
const trackedSecrets = new Set<string>();

/**
 * Check if a value matches secret patterns
 */
function isSecretLike(value: string, patterns: RegExp[]): boolean {
  const allPatterns = [...SECRET_PATTERNS, ...patterns];
  return allPatterns.some((pattern) => pattern.test(value));
}

/**
 * Check if a variable name indicates it contains a secret
 */
function isSecretVarName(name: string): boolean {
  const upperName = name.toUpperCase();
  return Array.from(SECRET_VAR_NAMES).some((secretName) =>
    upperName.includes(secretName)
  );
}

/**
 * Track a secret value for masking
 */
function trackSecret(value: string): void {
  if (value && value.length >= 8) {
    // Only track non-empty strings of reasonable length
    trackedSecrets.add(value);
  }
}

/**
 * Mask a secret in a string
 */
export function maskSecret(value: string): string {
  if (!value || value.length < 4) {
    return '[REDACTED]';
  }

  // Show first 4 chars for identification, mask the rest
  const visible = value.substring(0, 4);
  const masked = '*'.repeat(Math.min(value.length - 4, 20));
  return `${visible}${masked}`;
}

/**
 * Replace all tracked secrets in a string with masked versions
 */
export function maskSecretsInString(text: string): string {
  let masked = text;

  for (const secret of trackedSecrets) {
    if (secret && masked.includes(secret)) {
      const replacement = maskSecret(secret);
      // Use global regex replace
      masked = masked.split(secret).join(replacement);
    }
  }

  return masked;
}

/**
 * Parse .env file content
 * Supports:
 * - KEY=value
 * - KEY="value"
 * - KEY='value'
 * - # comments
 * - Empty lines
 * - ${secret:KEY} references
 */
function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();

    // Remove quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

/**
 * Load environment variables from .env file
 */
async function loadEnvFile(
  filePath: string,
  secretManager: SecretManager
): Promise<Record<string, string>> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseEnvFile(content);

    // Inject secrets into values
    const injected: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value.includes('${secret:')) {
        // Resolve secret references
        injected[key] = await secretManager.injectSecrets(value);
      } else {
        injected[key] = value;
      }
    }

    return injected;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist - that's ok
      return {};
    }
    throw error;
  }
}

/**
 * Inject variables into process.env
 */
function injectIntoProcessEnv(
  variables: Record<string, string>,
  override: boolean,
  patterns: RegExp[]
): { loaded: number; masked: number; variables: string[] } {
  let loaded = 0;
  let masked = 0;
  const loadedVars: string[] = [];

  for (const [key, value] of Object.entries(variables)) {
    // Skip if already set and not overriding
    if (!override && process.env[key] !== undefined) {
      continue;
    }

    // Set the variable
    process.env[key] = value;
    loaded++;
    loadedVars.push(key);

    // Track for masking if it looks like a secret
    if (isSecretVarName(key) || isSecretLike(value, patterns)) {
      trackSecret(value);
      masked++;
    }
  }

  return { loaded, masked, variables: loadedVars };
}

/**
 * Load and inject environment variables
 *
 * This function:
 * 1. Loads .env file (if exists) with dotenv-compatible format
 * 2. Resolves ${secret:KEY} references using SecretManager
 * 3. Injects into process.env
 * 4. Tracks secrets for masking
 * 5. Optionally validates required secrets
 */
export async function loadEnvironmentVariables(
  config?: EnvLoaderConfig
): Promise<EnvLoadResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const errors: string[] = [];

  // Get or create secret manager
  const secretManager =
    finalConfig.secretManager || (await getDefaultSecretManager());

  // Load from .env file
  let envVariables: Record<string, string> = {};
  if (finalConfig.envFilePath) {
    try {
      const resolvedPath = path.resolve(process.cwd(), finalConfig.envFilePath);
      envVariables = await loadEnvFile(resolvedPath, secretManager);
    } catch (error) {
      const message = `Failed to load .env file: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(message);

      if (finalConfig.throwOnMissing) {
        throw new Error(message);
      }
    }
  }

  // Inject into process.env
  const result = injectIntoProcessEnv(
    envVariables,
    finalConfig.override,
    finalConfig.additionalSecretPatterns
  );

  // Setup masking if enabled
  if (finalConfig.enableMasking) {
    setupSecretMasking();
  }

  return {
    loaded: result.loaded,
    failed: errors.length,
    masked: result.masked,
    errors,
    variables: result.variables,
  };
}

/**
 * Validate that required environment variables are present
 */
export function validateRequiredEnvVars(
  required: string[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Setup secret masking for console and error output
 * Intercepts console.log, console.error, console.warn, etc.
 * and masks any tracked secrets
 */
export function setupSecretMasking(): void {
  // Save original console methods
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalDebug = console.debug;

  // Mask arguments before logging
  function maskArgs(args: any[]): any[] {
    return args.map((arg) => {
      if (typeof arg === 'string') {
        return maskSecretsInString(arg);
      } else if (arg instanceof Error) {
        // Mask error messages and stacks
        const maskedError = new Error(maskSecretsInString(arg.message));
        maskedError.stack = arg.stack ? maskSecretsInString(arg.stack) : undefined;
        maskedError.name = arg.name;
        return maskedError;
      } else if (typeof arg === 'object' && arg !== null) {
        // Deep mask objects
        return maskSecretsInObject(arg);
      }
      return arg;
    });
  }

  // Override console methods
  console.log = (...args: any[]) => originalLog(...maskArgs(args));
  console.error = (...args: any[]) => originalError(...maskArgs(args));
  console.warn = (...args: any[]) => originalWarn(...maskArgs(args));
  console.info = (...args: any[]) => originalInfo(...maskArgs(args));
  console.debug = (...args: any[]) => originalDebug(...maskArgs(args));

  // Store original methods for restoration if needed
  (console as any)._originalLog = originalLog;
  (console as any)._originalError = originalError;
  (console as any)._originalWarn = originalWarn;
  (console as any)._originalInfo = originalInfo;
  (console as any)._originalDebug = originalDebug;
}

/**
 * Restore original console methods (useful for testing)
 */
export function restoreConsole(): void {
  if ((console as any)._originalLog) {
    console.log = (console as any)._originalLog;
    console.error = (console as any)._originalError;
    console.warn = (console as any)._originalWarn;
    console.info = (console as any)._originalInfo;
    console.debug = (console as any)._originalDebug;

    delete (console as any)._originalLog;
    delete (console as any)._originalError;
    delete (console as any)._originalWarn;
    delete (console as any)._originalInfo;
    delete (console as any)._originalDebug;
  }
}

/**
 * Deep mask secrets in objects
 */
function maskSecretsInObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => maskSecretsInObject(item));
  }

  if (typeof obj === 'object') {
    const masked: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Check if the key name suggests it's a secret
        if (isSecretVarName(key)) {
          masked[key] = maskSecret(value);
        } else {
          masked[key] = maskSecretsInString(value);
        }
      } else if (typeof value === 'object') {
        masked[key] = maskSecretsInObject(value);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  return obj;
}

/**
 * Clear all tracked secrets
 */
export function clearTrackedSecrets(): void {
  trackedSecrets.clear();
}

/**
 * Get count of tracked secrets
 */
export function getTrackedSecretsCount(): number {
  return trackedSecrets.size;
}

/**
 * Manually track a secret value
 */
export function addTrackedSecret(value: string): void {
  trackSecret(value);
}

/**
 * Create a masked version of process.env for logging
 */
export function getMaskedEnv(): Record<string, string> {
  const masked: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (!value) {
      masked[key] = '';
      continue;
    }

    if (isSecretVarName(key)) {
      masked[key] = maskSecret(value);
    } else {
      masked[key] = maskSecretsInString(value);
    }
  }

  return masked;
}
