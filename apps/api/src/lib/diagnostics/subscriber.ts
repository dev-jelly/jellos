import diagnostics_channel from 'node:diagnostics_channel';
import type { FastifyInstance } from 'fastify';
import {
  type RequestStartMessage,
  type RequestEndMessage,
  type RequestErrorMessage,
  DiagnosticChannels,
  type DiagnosticsConfig,
} from './types';
import {
  requestContextStore,
  createRequestContext,
  getRequestDuration,
  type RequestContext,
} from './context-store';

/**
 * Default configuration for diagnostics
 */
const DEFAULT_CONFIG: Required<DiagnosticsConfig> = {
  logRequestStart: true,
  logRequestEnd: true,
  logRequestError: true,
  requestStartLogLevel: 'debug',
  requestEndLogLevel: 'info',
  requestErrorLogLevel: 'error',
  includeBody: false,
  includeHeaders: false,
  enableContextPropagation: true,
};

/**
 * Setup diagnostics channel subscribers for Fastify
 * Subscribes to request lifecycle events and logs them using the Fastify logger
 */
export function setupDiagnostics(
  fastify: FastifyInstance,
  config: DiagnosticsConfig = {}
): () => void {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const logger = fastify.log;

  // Get diagnostic channels
  const startChannel = diagnostics_channel.channel(
    DiagnosticChannels.REQUEST_START
  );
  const endChannel = diagnostics_channel.channel(DiagnosticChannels.REQUEST_END);
  const errorChannel = diagnostics_channel.channel(
    DiagnosticChannels.REQUEST_ERROR
  );

  // Bind AsyncLocalStorage to channels if context propagation is enabled
  if (mergedConfig.enableContextPropagation) {
    startChannel.bindStore(requestContextStore, (msg: unknown) => {
      const message = msg as RequestStartMessage;
      const requestId =
        message.request.id ||
        `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      return createRequestContext(
        requestId,
        message.request.method,
        message.request.url
      );
    });
  }

  /**
   * Handler for request start events
   */
  const handleRequestStart = (msg: unknown) => {
    const message = msg as RequestStartMessage;
    if (!mergedConfig.logRequestStart) return;

    const logData: Record<string, any> = {
      event: 'request.start',
      method: message.request.method,
      url: message.request.url,
      routePath: message.route?.routePath || message.route?.url,
      routeMethod: message.route?.method,
      requestId: message.request.id,
    };

    if (mergedConfig.includeHeaders) {
      logData.headers = message.request.headers;
    }

    logger[mergedConfig.requestStartLogLevel](logData, 'Request started');
  };

  /**
   * Handler for request end events
   */
  const handleRequestEnd = (msg: unknown) => {
    const message = msg as RequestEndMessage;
    if (!mergedConfig.logRequestEnd) return;

    const duration = getRequestDuration();

    const logData: Record<string, any> = {
      event: 'request.end',
      method: message.request.method,
      url: message.request.url,
      routePath: message.route?.routePath || message.route?.url,
      routeMethod: message.route?.method,
      statusCode: message.reply.statusCode,
      requestId: message.request.id,
      duration: duration ? `${duration}ms` : undefined,
    };

    if (mergedConfig.includeHeaders) {
      logData.responseHeaders = message.reply.getHeaders();
    }

    logger[mergedConfig.requestEndLogLevel](logData, 'Request completed');
  };

  /**
   * Handler for request error events
   */
  const handleRequestError = (msg: unknown) => {
    const message = msg as RequestErrorMessage;
    if (!mergedConfig.logRequestError) return;

    const duration = getRequestDuration();

    const logData: Record<string, any> = {
      event: 'request.error',
      method: message.request.method,
      url: message.request.url,
      routePath: message.route?.routePath || message.route?.url,
      routeMethod: message.route?.method,
      requestId: message.request.id,
      duration: duration ? `${duration}ms` : undefined,
      error: {
        name: message.error.name,
        message: message.error.message,
        stack: message.error.stack,
      },
    };

    logger[mergedConfig.requestErrorLogLevel](
      logData,
      `Request error: ${message.error.message}`
    );
  };

  // Subscribe to channels
  diagnostics_channel.subscribe(
    DiagnosticChannels.REQUEST_START,
    handleRequestStart
  );
  diagnostics_channel.subscribe(
    DiagnosticChannels.REQUEST_END,
    handleRequestEnd
  );
  diagnostics_channel.subscribe(
    DiagnosticChannels.REQUEST_ERROR,
    handleRequestError
  );

  logger.info(
    {
      channels: Object.values(DiagnosticChannels),
      config: mergedConfig,
    },
    'Diagnostics channel subscribers initialized'
  );

  /**
   * Cleanup function to unsubscribe from all channels
   */
  return () => {
    diagnostics_channel.unsubscribe(
      DiagnosticChannels.REQUEST_START,
      handleRequestStart
    );
    diagnostics_channel.unsubscribe(
      DiagnosticChannels.REQUEST_END,
      handleRequestEnd
    );
    diagnostics_channel.unsubscribe(
      DiagnosticChannels.REQUEST_ERROR,
      handleRequestError
    );
    logger.info('Diagnostics channel subscribers cleaned up');
  };
}

/**
 * Check if diagnostics channel has active subscribers
 */
export function hasDiagnosticSubscribers(
  channel: keyof typeof DiagnosticChannels
): boolean {
  return diagnostics_channel.hasSubscribers(DiagnosticChannels[channel]);
}
