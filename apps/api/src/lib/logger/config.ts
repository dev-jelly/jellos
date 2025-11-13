import type { LoggerOptions, Level } from 'pino';
import type { PrettyOptions } from 'pino-pretty';

/**
 * Environment-based logger configuration
 */
export const LOG_LEVELS: Record<string, Level> = {
  trace: 'trace',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'fatal',
};

/**
 * Get log level from environment
 */
export function getLogLevel(): Level {
  const level = process.env.LOG_LEVEL?.toLowerCase() as Level;
  return level && Object.values(LOG_LEVELS).includes(level) ? level : 'info';
}

/**
 * Get environment type
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Sensitive fields to redact from logs
 * Combined with secret masking from env-loader for comprehensive protection
 */
export const REDACT_FIELDS = [
  // Authentication & Authorization
  'password',
  'token',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'secret',
  'authorization',
  'cookie',
  'session',
  'sessionId',
  'session_id',
  'privateKey',
  'private_key',
  'clientSecret',
  'client_secret',
  'webhookSecret',
  'webhook_secret',

  // Personal Information
  'ssn',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'pin',

  // Database & Connection strings
  'databaseUrl',
  'database_url',
  'connectionString',
  'connection_string',
  'redisUrl',
  'redis_url',

  // Request headers (nested)
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',

  // Response headers (nested)
  'res.headers.set-cookie',
  'response.headers.set-cookie',

  // Environment variables
  'env.password',
  'env.token',
  'env.secret',
  'env.api_key',
  'env.apiKey',
];

/**
 * Pino pretty options for development
 */
export const PRETTY_OPTIONS: PrettyOptions = {
  translateTime: 'HH:MM:ss.l',
  ignore: 'pid,hostname',
  colorize: true,
  singleLine: false,
  errorLikeObjectKeys: ['err', 'error'],
  messageFormat: '{levelLabel} - {msg}',
  errorProps: 'message,stack,code,statusCode',
};

/**
 * Base logger configuration factory
 * Note: Returns a new config object each time to allow dynamic log level changes
 */
export function getBaseLoggerConfig(): LoggerOptions {
  return {
    level: getLogLevel(),

    // Redact sensitive fields
    redact: {
      paths: REDACT_FIELDS,
      censor: '[REDACTED]',
    },

  // Serializers for common objects
  serializers: {
    err: (err: Error) => ({
      type: err.name,
      message: err.message,
      stack: err.stack,
      ...(err as any), // Capture additional properties
    }),
    req: (req: any) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.routerPath,
      parameters: req.params,
      headers: {
        host: req.headers?.host,
        'user-agent': req.headers?.['user-agent'],
        'content-type': req.headers?.['content-type'],
        // Don't include authorization or cookie headers
      },
      remoteAddress: req.ip,
      remotePort: req.socket?.remotePort,
    }),
    res: (res: any) => ({
      statusCode: res.statusCode,
      headers: {
        'content-type': res.getHeader?.('content-type'),
        'content-length': res.getHeader?.('content-length'),
        // Don't include set-cookie headers
      },
    }),
  },

  // Format timestamps consistently
  timestamp: () => `,"time":"${new Date().toISOString()}"`,

    // Base fields to include in every log
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'unknown',
      env: process.env.NODE_ENV || 'development',
      service: 'jellos-api',
    },
  };
}

/**
 * Get transport configuration based on environment
 */
export function getLogTransport() {
  if (isDevelopment()) {
    // Pretty printing for development
    return {
      target: 'pino-pretty',
      options: PRETTY_OPTIONS,
    };
  }

  // JSON output for production (easier for log aggregators)
  return undefined;
}

/**
 * Create complete logger configuration
 */
export function createLoggerConfig(): LoggerOptions {
  const config: LoggerOptions = {
    ...getBaseLoggerConfig(),
  };

  const transport = getLogTransport();
  if (transport) {
    config.transport = transport;
  }

  return config;
}
