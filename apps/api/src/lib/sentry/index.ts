/**
 * Sentry Integration
 * Task 14.7: Error tracking and telemetry pipeline
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import type { FastifyRequest, FastifyReply } from 'fastify';

export interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
  profilesSampleRate: number;
  enabled: boolean;
}

/**
 * Initialize Sentry
 */
export function initSentry(config: SentryConfig): void {
  if (!config.enabled || !config.dsn) {
    console.log('[Sentry] Disabled - no DSN provided');
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.tracesSampleRate,
    profilesSampleRate: config.profilesSampleRate,

    integrations: [
      // Performance monitoring
      nodeProfilingIntegration(),
    ],

    // Breadcrumbs
    beforeBreadcrumb(breadcrumb) {
      // Redact sensitive data from breadcrumbs
      if (breadcrumb.data) {
        breadcrumb.data = redactSensitiveData(breadcrumb.data);
      }
      return breadcrumb;
    },

    // Event processing
    beforeSend(event) {
      // Redact sensitive data from events
      if (event.request) {
        event.request.headers = redactSensitiveData(event.request.headers);
        event.request.cookies = redactSensitiveData(event.request.cookies);
      }
      return event;
    },
  });

  console.log('[Sentry] Initialized:', {
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.tracesSampleRate,
  });
}

/**
 * Redact sensitive data
 */
function redactSensitiveData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveKeys = [
    'password',
    'token',
    'api_key',
    'apiKey',
    'secret',
    'authorization',
    'cookie',
    'session',
  ];

  const redacted = { ...data };

  for (const key of Object.keys(redacted)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      redacted[key] = '[REDACTED]';
    }
  }

  return redacted;
}

/**
 * Capture exception with context
 */
export function captureException(
  error: Error,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    user?: { id?: string; email?: string; username?: string };
  }
): string {
  return Sentry.captureException(error, {
    tags: context?.tags,
    extra: context?.extra,
    user: context?.user,
  });
}

/**
 * Capture message
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
  }
): string {
  return Sentry.captureMessage(message, {
    level,
    tags: context?.tags,
    extra: context?.extra,
  });
}

/**
 * Set user context
 */
export function setUser(user: { id?: string; email?: string; username?: string } | null): void {
  Sentry.setUser(user);
}

/**
 * Set tags
 */
export function setTags(tags: Record<string, string>): void {
  Sentry.setTags(tags);
}

/**
 * Set context
 */
export function setContext(name: string, context: Record<string, any>): void {
  Sentry.setContext(name, context);
}

/**
 * Start transaction for performance monitoring
 */
export function startTransaction(name: string, op: string): ReturnType<typeof Sentry.startTransaction> {
  return Sentry.startTransaction({ name, op });
}

/**
 * Fastify error handler integration
 */
export function sentryErrorHandler() {
  return async (error: Error, request: FastifyRequest, reply: FastifyReply) => {
    // Set request context
    Sentry.setContext('request', {
      method: request.method,
      url: request.url,
      headers: redactSensitiveData(request.headers),
      query: request.query,
      params: request.params,
    });

    // Capture exception
    const eventId = captureException(error, {
      tags: {
        route: request.routeOptions.url || 'unknown',
        method: request.method,
      },
      extra: {
        requestId: request.id,
        ip: request.ip,
      },
    });

    // Add event ID to response headers for debugging
    reply.header('X-Sentry-Event-Id', eventId);

    throw error; // Re-throw for Fastify's error handler
  };
}

/**
 * Request tracking middleware
 */
export function sentryRequestTracker() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const transaction = startTransaction(
      `${request.method} ${request.routeOptions.url || request.url}`,
      'http.server'
    );

    // Set request context
    transaction.setData('request', {
      method: request.method,
      url: request.url,
      headers: redactSensitiveData(request.headers),
    });

    // Finish transaction after response
    reply.addHook('onSend', async () => {
      transaction.setHttpStatus(reply.statusCode);
      transaction.finish();
    });
  };
}

/**
 * Flush and close Sentry
 */
export async function closeSentry(): Promise<void> {
  await Sentry.close(2000);
}

// Re-export Sentry for advanced usage
export { Sentry };
