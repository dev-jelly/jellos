/**
 * Diagnostics Channel Integration
 *
 * This module provides integration with Node.js Diagnostics Channel API
 * for Fastify v5, enabling observability and request tracing.
 *
 * Features:
 * - Request lifecycle event subscription (start, end, error)
 * - AsyncLocalStorage-based context propagation
 * - Request ID tracking across async boundaries
 * - Centralized logging integration with Pino
 * - Configurable log levels and event filtering
 *
 * @module diagnostics
 */

export { setupDiagnostics, hasDiagnosticSubscribers } from './subscriber';
export {
  requestContextStore,
  getRequestContext,
  hasRequestContext,
  createRequestContext,
  updateContextMetadata,
  getRequestDuration,
  type RequestContext,
} from './context-store';
export {
  DiagnosticChannels,
  type DiagnosticsConfig,
  type DiagnosticLogLevel,
  type RequestStartMessage,
  type RequestEndMessage,
  type RequestErrorMessage,
} from './types';
