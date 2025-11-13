import type { Logger } from 'pino';
import { getRequestContext } from '../diagnostics/context-store';

/**
 * Child logger bindings for request correlation
 */
export interface ChildLoggerBindings {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  sessionId?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: any;
}

/**
 * Create a child logger with request context
 *
 * Automatically includes requestId from AsyncLocalStorage context if available
 */
export function createChildLogger(
  logger: Logger,
  bindings: ChildLoggerBindings = {}
): Logger {
  // Try to get request context from AsyncLocalStorage
  const context = getRequestContext();

  const childBindings: ChildLoggerBindings = {
    ...bindings,
  };

  // Add request ID from context if not already provided
  if (context?.requestId && !bindings.requestId) {
    childBindings.requestId = context.requestId;
  }

  // Add route information if available
  if (context?.routePath && !bindings.routePath) {
    childBindings.routePath = context.routePath;
    childBindings.routeMethod = context.routeMethod;
  }

  return logger.child(childBindings);
}

/**
 * Create a child logger with correlation ID
 *
 * Useful for tracking related operations across multiple requests
 */
export function createCorrelatedLogger(
  logger: Logger,
  correlationId: string,
  additionalBindings: ChildLoggerBindings = {}
): Logger {
  return createChildLogger(logger, {
    correlationId,
    ...additionalBindings,
  });
}

/**
 * Create a child logger with user context
 *
 * Useful for tracking user-specific operations
 */
export function createUserLogger(
  logger: Logger,
  userId: string,
  additionalBindings: ChildLoggerBindings = {}
): Logger {
  return createChildLogger(logger, {
    userId,
    ...additionalBindings,
  });
}

/**
 * Create a child logger with trace context (for distributed tracing)
 *
 * Useful for OpenTelemetry or similar tracing systems
 */
export function createTracedLogger(
  logger: Logger,
  traceId: string,
  spanId: string,
  additionalBindings: ChildLoggerBindings = {}
): Logger {
  return createChildLogger(logger, {
    traceId,
    spanId,
    ...additionalBindings,
  });
}

/**
 * Create a child logger with component context
 *
 * Useful for identifying which part of the application emitted the log
 */
export function createComponentLogger(
  logger: Logger,
  component: string,
  additionalBindings: ChildLoggerBindings = {}
): Logger {
  return createChildLogger(logger, {
    component,
    ...additionalBindings,
  });
}

/**
 * Helper to extract common bindings from Fastify request
 */
export function extractRequestBindings(request: any): ChildLoggerBindings {
  return {
    requestId: request.id,
    method: request.method,
    url: request.url,
    routePath: request.routerPath,
    ip: request.ip,
    userAgent: request.headers?.['user-agent'],
  };
}
