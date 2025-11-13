import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { createEventBus, EventTopics } from '../lib/event-bus';
import type { ApplicationEvents } from '../lib/event-bus';
import { getRequestContext, hasRequestContext } from '../lib/diagnostics';

/**
 * Configuration options for the event hooks plugin
 */
export interface EventHooksConfig {
  /**
   * Enable request lifecycle event emission
   * @default true
   */
  emitRequestEvents?: boolean;

  /**
   * Enable error event emission
   * @default true
   */
  emitErrorEvents?: boolean;

  /**
   * Enable state transition event emission
   * @default true
   */
  emitStateTransitions?: boolean;

  /**
   * Emit events only for specific route prefixes (empty = all routes)
   * @default []
   */
  routeFilters?: string[];

  /**
   * Skip event emission for health check routes
   * @default true
   */
  skipHealthChecks?: boolean;

  /**
   * Custom event metadata enrichment function
   */
  enrichMetadata?: (request: FastifyRequest, reply: FastifyReply) => Record<string, any>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<Omit<EventHooksConfig, 'enrichMetadata'>> & {
  enrichMetadata?: EventHooksConfig['enrichMetadata'];
} = {
  emitRequestEvents: true,
  emitErrorEvents: true,
  emitStateTransitions: true,
  routeFilters: [],
  skipHealthChecks: true,
  enrichMetadata: undefined,
};

/**
 * Event Hooks Plugin for Fastify
 *
 * Integrates Fastify lifecycle hooks with the event bus system to:
 * - Emit events for request lifecycle stages (start, end, error)
 * - Track state transitions through the request/response cycle
 * - Provide request context correlation for event tracing
 * - Enable distributed observability and event-driven workflows
 *
 * This plugin works in conjunction with:
 * - diagnostics.plugin.ts for request context tracking
 * - event-bus system for event distribution
 * - state machine for FSM transitions
 */
const eventHooksPlugin: FastifyPluginAsync<EventHooksConfig> = async (fastify, options) => {
  const config = { ...DEFAULT_CONFIG, ...options };

  // Initialize event bus
  const eventBus = await createEventBus('jellos-api');
  const logger = fastify.log;

  /**
   * Check if event emission should be skipped for this route
   */
  const shouldSkipRoute = (request: FastifyRequest): boolean => {
    const url = request.url;

    // Skip health check routes if configured
    if (config.skipHealthChecks && (url.startsWith('/health') || url === '/')) {
      return true;
    }

    // Apply route filters if configured
    if (config.routeFilters.length > 0) {
      return !config.routeFilters.some((prefix) => url.startsWith(prefix));
    }

    return false;
  };

  /**
   * Build event metadata from request context
   */
  const buildEventMetadata = (request: FastifyRequest, reply?: FastifyReply) => {
    const context = hasRequestContext() ? getRequestContext() : undefined;
    const baseMetadata: Record<string, any> = {
      requestId: request.id,
      correlationId: context?.requestId || request.id,
      source: 'jellos-api',
      route: request.routeOptions?.url,
      method: request.method,
      url: request.url,
    };

    // Add custom enrichment if provided
    if (config.enrichMetadata && reply) {
      Object.assign(baseMetadata, config.enrichMetadata(request, reply));
    }

    return baseMetadata;
  };

  /**
   * onRequest Hook - Fired at the start of a request
   * Emits state.transition.started event
   */
  if (config.emitRequestEvents && config.emitStateTransitions) {
    fastify.addHook('onRequest', async (request, reply) => {
      if (shouldSkipRoute(request)) return;

      try {
        const metadata = buildEventMetadata(request, reply);

        await eventBus.publish(
          EventTopics.STATE_TRANSITION_EVENTS,
          'state.transition.started',
          {
            entityType: 'request',
            entityId: request.id,
            from: 'idle',
            to: 'processing',
          },
          { metadata, waitForAck: false }
        );

        logger.debug(
          { requestId: request.id, event: 'request.lifecycle.start' },
          'Request lifecycle started - event emitted'
        );
      } catch (error) {
        // Log error but don't block request processing
        logger.warn(
          { requestId: request.id, error: (error as Error).message },
          'Failed to emit request start event'
        );
      }
    });
  }

  /**
   * preHandler Hook - Fired before route handler execution
   * Can be used for additional state transitions or validation events
   */
  fastify.addHook('preHandler', async (request, reply) => {
    if (shouldSkipRoute(request)) return;

    // Store request start time in request context for duration calculation
    if (hasRequestContext()) {
      const context = getRequestContext();
      if (context) {
        context.metadata.handlerStartTime = Date.now();
      }
    }
  });

  /**
   * onResponse Hook - Fired after response is sent
   * Emits state.transition.completed event
   */
  if (config.emitRequestEvents && config.emitStateTransitions) {
    fastify.addHook('onResponse', async (request, reply) => {
      if (shouldSkipRoute(request)) return;

      try {
        const metadata = buildEventMetadata(request, reply);
        const context = hasRequestContext() ? getRequestContext() : undefined;

        // Calculate handler duration if available
        const handlerDuration = context?.metadata.handlerStartTime
          ? Date.now() - context.metadata.handlerStartTime
          : undefined;

        await eventBus.publish(
          EventTopics.STATE_TRANSITION_EVENTS,
          'state.transition.completed',
          {
            entityType: 'request',
            entityId: request.id,
            from: 'processing',
            to: 'completed',
            statusCode: reply.statusCode,
            duration: handlerDuration,
          },
          { metadata, waitForAck: false }
        );

        logger.debug(
          {
            requestId: request.id,
            statusCode: reply.statusCode,
            duration: handlerDuration,
            event: 'request.lifecycle.complete',
          },
          'Request lifecycle completed - event emitted'
        );
      } catch (error) {
        // Log error but don't affect response
        logger.warn(
          { requestId: request.id, error: (error as Error).message },
          'Failed to emit request complete event'
        );
      }
    });
  }

  /**
   * onError Hook - Fired when an error occurs during request processing
   * Emits state.transition.failed event
   */
  if (config.emitErrorEvents && config.emitStateTransitions) {
    fastify.addHook('onError', async (request, reply, error) => {
      if (shouldSkipRoute(request)) return;

      try {
        const metadata = buildEventMetadata(request, reply);
        const context = hasRequestContext() ? getRequestContext() : undefined;

        // Calculate handler duration if available
        const handlerDuration = context?.metadata.handlerStartTime
          ? Date.now() - context.metadata.handlerStartTime
          : undefined;

        await eventBus.publish(
          EventTopics.STATE_TRANSITION_EVENTS,
          'state.transition.failed',
          {
            entityType: 'request',
            entityId: request.id,
            from: 'processing',
            to: 'error',
            error: error.message,
            errorName: error.name,
            errorStack: error.stack,
            statusCode: reply.statusCode || 500,
            duration: handlerDuration,
          },
          { metadata, waitForAck: false }
        );

        logger.debug(
          {
            requestId: request.id,
            error: error.message,
            duration: handlerDuration,
            event: 'request.lifecycle.error',
          },
          'Request lifecycle error - event emitted'
        );
      } catch (emitError) {
        // Log error but don't affect error handling
        logger.warn(
          { requestId: request.id, error: (emitError as Error).message },
          'Failed to emit request error event'
        );
      }
    });
  }

  /**
   * Cleanup on server close
   */
  fastify.addHook('onClose', async () => {
    try {
      await eventBus.close();
      logger.info('Event bus closed gracefully');
    } catch (error) {
      logger.error(
        { error: (error as Error).message },
        'Error closing event bus'
      );
    }
  });

  // Decorate fastify instance with event bus for use in routes
  fastify.decorate('eventBus', eventBus);

  logger.info(
    {
      config: {
        emitRequestEvents: config.emitRequestEvents,
        emitErrorEvents: config.emitErrorEvents,
        emitStateTransitions: config.emitStateTransitions,
        skipHealthChecks: config.skipHealthChecks,
        routeFilters: config.routeFilters,
      },
      adapter: eventBus.getAdapterName(),
    },
    'Event hooks plugin registered'
  );
};

export default fp(eventHooksPlugin, {
  name: 'event-hooks',
  fastify: '5.x',
  dependencies: ['diagnostics'], // Ensure diagnostics plugin is loaded first
});

/**
 * Type augmentation for Fastify instance
 */
declare module 'fastify' {
  interface FastifyInstance {
    eventBus: Awaited<ReturnType<typeof createEventBus>>;
  }
}
