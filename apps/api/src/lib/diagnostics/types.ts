import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Message payload for request handler start event
 */
export interface RequestStartMessage {
  request: FastifyRequest;
  reply: FastifyReply;
  route: {
    url: string;
    method: string;
    routePath?: string;
  };
}

/**
 * Message payload for request handler end event
 */
export interface RequestEndMessage {
  request: FastifyRequest;
  reply: FastifyReply;
  route: {
    url: string;
    method: string;
    routePath?: string;
  };
}

/**
 * Message payload for request handler error event
 */
export interface RequestErrorMessage {
  request: FastifyRequest;
  reply: FastifyReply;
  error: Error;
  route: {
    url: string;
    method: string;
    routePath?: string;
  };
}

/**
 * Diagnostic channel names used by Fastify v5
 */
export const DiagnosticChannels = {
  REQUEST_START: 'tracing:fastify.request.handler:start',
  REQUEST_END: 'tracing:fastify.request.handler:end',
  REQUEST_ERROR: 'tracing:fastify.request.handler:error',
} as const;

/**
 * Log level for diagnostic events
 */
export type DiagnosticLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Configuration for diagnostics channel setup
 */
export interface DiagnosticsConfig {
  /**
   * Enable request start event logging
   * @default true
   */
  logRequestStart?: boolean;

  /**
   * Enable request end event logging
   * @default true
   */
  logRequestEnd?: boolean;

  /**
   * Enable request error event logging
   * @default true
   */
  logRequestError?: boolean;

  /**
   * Log level for request start events
   * @default 'debug'
   */
  requestStartLogLevel?: DiagnosticLogLevel;

  /**
   * Log level for request end events
   * @default 'info'
   */
  requestEndLogLevel?: DiagnosticLogLevel;

  /**
   * Log level for request error events
   * @default 'error'
   */
  requestErrorLogLevel?: DiagnosticLogLevel;

  /**
   * Include request/response bodies in logs
   * @default false
   */
  includeBody?: boolean;

  /**
   * Include request headers in logs
   * @default false
   */
  includeHeaders?: boolean;

  /**
   * Enable AsyncLocalStorage context propagation
   * @default true
   */
  enableContextPropagation?: boolean;
}
