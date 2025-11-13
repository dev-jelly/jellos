import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request context stored in AsyncLocalStorage
 */
export interface RequestContext {
  requestId: string;
  startTime: number;
  method: string;
  url: string;
  routePath?: string;
  routeMethod?: string;
  metadata: Record<string, any>;
}

/**
 * AsyncLocalStorage for request context propagation
 * This enables context to be available throughout the async request lifecycle
 */
export const requestContextStore = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStore.getStore();
}

/**
 * Check if a request context exists
 */
export function hasRequestContext(): boolean {
  return requestContextStore.getStore() !== undefined;
}

/**
 * Create a new request context
 */
export function createRequestContext(
  requestId: string,
  method: string,
  url: string
): RequestContext {
  return {
    requestId,
    startTime: Date.now(),
    method,
    url,
    metadata: {},
  };
}

/**
 * Update the current request context metadata
 */
export function updateContextMetadata(
  key: string,
  value: any
): RequestContext | undefined {
  const context = getRequestContext();
  if (context) {
    context.metadata[key] = value;
  }
  return context;
}

/**
 * Calculate request duration from context
 */
export function getRequestDuration(): number | undefined {
  const context = getRequestContext();
  if (context) {
    return Date.now() - context.startTime;
  }
  return undefined;
}
