/**
 * Pino-based Structured Logging System
 *
 * This module provides a comprehensive logging solution built on Pino:
 *
 * Features:
 * - Environment-based configuration (development vs production)
 * - Structured JSON logging in production
 * - Pretty-printed logs in development
 * - Automatic sensitive data redaction
 * - Request correlation via child loggers
 * - Integration with diagnostics channel
 * - Support for log levels: trace, debug, info, warn, error, fatal
 *
 * Usage:
 * ```typescript
 * import { createLoggerConfig, createChildLogger } from './lib/logger';
 *
 * // In Fastify app setup
 * const app = Fastify({
 *   logger: createLoggerConfig()
 * });
 *
 * // Create child logger with request context
 * const logger = createChildLogger(app.log, { userId: '123' });
 * logger.info('User action');
 * ```
 *
 * @module logger
 */

export {
  createLoggerConfig,
  getLogLevel,
  isDevelopment,
  getLogTransport,
  getBaseLoggerConfig,
  LOG_LEVELS,
  REDACT_FIELDS,
  PRETTY_OPTIONS,
} from './config';

export {
  createChildLogger,
  createCorrelatedLogger,
  createUserLogger,
  createTracedLogger,
  createComponentLogger,
  extractRequestBindings,
  type ChildLoggerBindings,
} from './child-logger';

export {
  setupLogRotation,
  createRotatingFileStream,
  type LogRotationConfig,
  DEFAULT_ROTATION_CONFIG,
} from './rotation';
