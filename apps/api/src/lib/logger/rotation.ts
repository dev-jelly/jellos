import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DestinationStream } from 'pino';

/**
 * Log rotation configuration
 */
export interface LogRotationConfig {
  /**
   * Directory where log files will be stored
   */
  logDir: string;

  /**
   * Base filename for log files (will be appended with date/rotation info)
   */
  filename: string;

  /**
   * Maximum size of a log file before rotation (in bytes)
   * Default: 10MB
   */
  maxSize?: number;

  /**
   * Maximum number of log files to keep
   * Default: 10
   */
  maxFiles?: number;

  /**
   * Whether to compress rotated log files
   * Default: true
   */
  compress?: boolean;
}

/**
 * Default rotation configuration
 */
export const DEFAULT_ROTATION_CONFIG: Required<
  Omit<LogRotationConfig, 'logDir' | 'filename'>
> = {
  maxSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 10,
  compress: true,
};

/**
 * Create a rotating file stream for logs
 *
 * Note: For production use, consider using pino-roll or rotating-file-stream packages
 * This is a basic implementation for demonstration
 */
export function createRotatingFileStream(
  config: LogRotationConfig
): DestinationStream {
  const fullConfig = {
    ...DEFAULT_ROTATION_CONFIG,
    ...config,
  };

  // Ensure log directory exists
  if (!existsSync(fullConfig.logDir)) {
    mkdirSync(fullConfig.logDir, { recursive: true });
  }

  const logPath = join(fullConfig.logDir, fullConfig.filename);

  // Create write stream
  const stream = createWriteStream(logPath, {
    flags: 'a', // append mode
    encoding: 'utf8',
  });

  // TODO: Implement actual rotation logic
  // For production, use pino-roll or rotating-file-stream package:
  //
  // import rfs from 'rotating-file-stream';
  //
  // const stream = rfs.createStream(fullConfig.filename, {
  //   size: `${fullConfig.maxSize}B`,
  //   interval: '1d',
  //   maxFiles: fullConfig.maxFiles,
  //   compress: fullConfig.compress ? 'gzip' : false,
  //   path: fullConfig.logDir,
  // });

  return stream as DestinationStream;
}

/**
 * Setup log rotation with multiple streams
 *
 * Example usage:
 * ```typescript
 * const streams = setupLogRotation({
 *   error: { logDir: './logs', filename: 'error.log' },
 *   combined: { logDir: './logs', filename: 'combined.log' },
 * });
 * ```
 */
export function setupLogRotation(configs: {
  [level: string]: LogRotationConfig;
}): Array<{ level: string; stream: DestinationStream }> {
  return Object.entries(configs).map(([level, config]) => ({
    level,
    stream: createRotatingFileStream(config),
  }));
}

/**
 * Get log file paths for different environments
 */
export function getLogFilePaths(baseDir: string = './logs') {
  const env = process.env.NODE_ENV || 'development';

  return {
    combined: join(baseDir, `${env}-combined.log`),
    error: join(baseDir, `${env}-error.log`),
    access: join(baseDir, `${env}-access.log`),
  };
}

/**
 * Setup environment-specific log rotation
 *
 * Creates separate log files for combined logs and error logs
 */
export function setupEnvironmentRotation(baseDir: string = './logs') {
  const paths = getLogFilePaths(baseDir);

  return {
    combined: createRotatingFileStream({
      logDir: dirname(paths.combined),
      filename: paths.combined.split('/').pop() || 'combined.log',
    }),
    error: createRotatingFileStream({
      logDir: dirname(paths.error),
      filename: paths.error.split('/').pop() || 'error.log',
      maxSize: 5 * 1024 * 1024, // 5MB for error logs
    }),
  };
}
