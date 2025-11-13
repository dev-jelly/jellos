/**
 * Examples of using the Pino-based structured logging system
 *
 * This file demonstrates various logging patterns and best practices
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  createChildLogger,
  createUserLogger,
  createComponentLogger,
  createCorrelatedLogger,
  extractRequestBindings,
} from './index';

/**
 * Example 1: Basic structured logging in a route handler
 */
export function basicRouteLogging(app: FastifyInstance) {
  app.get('/api/users/:id', async (request, reply) => {
    // Use the request logger (automatically includes requestId from diagnostics channel)
    request.log.info({ userId: request.params.id }, 'Fetching user');

    try {
      // Simulate user fetch
      const user = { id: request.params.id, name: 'John Doe' };

      request.log.info({ userId: user.id }, 'User fetched successfully');
      return user;
    } catch (error) {
      request.log.error({ err: error, userId: request.params.id }, 'Failed to fetch user');
      throw error;
    }
  });
}

/**
 * Example 2: Using child loggers for context
 */
export function childLoggerExample(app: FastifyInstance) {
  app.post('/api/orders', async (request, reply) => {
    // Create a child logger with additional context
    const logger = createChildLogger(request.log, {
      operation: 'createOrder',
      ...extractRequestBindings(request),
    });

    logger.info('Starting order creation');

    try {
      logger.debug({ body: request.body }, 'Validating order data');

      // Simulate order creation
      const order = { id: '123', ...request.body };

      logger.info({ orderId: order.id }, 'Order created successfully');
      return order;
    } catch (error) {
      logger.error({ err: error }, 'Order creation failed');
      throw error;
    }
  });
}

/**
 * Example 3: Service class with component logger
 */
export class UserService {
  private logger;

  constructor(baseLogger: any) {
    // Create a component logger for this service
    this.logger = createComponentLogger(baseLogger, 'UserService');
  }

  async getUser(userId: string) {
    // Create a child logger with user context
    const logger = createChildLogger(this.logger, { userId });

    logger.debug('Fetching user from database');

    try {
      // Simulate database query
      const user = { id: userId, name: 'John Doe' };

      logger.info('User fetched successfully');
      return user;
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch user');
      throw error;
    }
  }

  async updateUser(userId: string, data: any) {
    const logger = createChildLogger(this.logger, { userId, operation: 'update' });

    logger.info({ updateData: data }, 'Updating user');

    try {
      // Simulate update
      logger.debug('Validating update data');
      logger.debug('Executing database update');

      logger.info('User updated successfully');
      return { id: userId, ...data };
    } catch (error) {
      logger.error({ err: error, data }, 'Failed to update user');
      throw error;
    }
  }
}

/**
 * Example 4: Correlated logging across multiple operations
 */
export async function batchOperationExample(app: FastifyInstance) {
  app.post('/api/batch-import', async (request, reply) => {
    const correlationId = `batch-${Date.now()}`;

    // Create correlated logger to track all operations in this batch
    const logger = createCorrelatedLogger(request.log, correlationId, {
      operation: 'batchImport',
    });

    logger.info({ itemCount: request.body.items?.length }, 'Starting batch import');

    const results = [];
    for (const item of request.body.items || []) {
      // Each item gets its own child logger with correlation ID
      const itemLogger = createChildLogger(logger, { itemId: item.id });

      try {
        itemLogger.debug('Processing item');
        // Process item...
        itemLogger.info('Item processed successfully');
        results.push({ id: item.id, status: 'success' });
      } catch (error) {
        itemLogger.error({ err: error }, 'Failed to process item');
        results.push({ id: item.id, status: 'failed' });
      }
    }

    logger.info(
      {
        total: results.length,
        successful: results.filter((r) => r.status === 'success').length,
        failed: results.filter((r) => r.status === 'failed').length,
      },
      'Batch import completed'
    );

    return { correlationId, results };
  });
}

/**
 * Example 5: User-specific logging for audit trails
 */
export function auditLoggingExample(app: FastifyInstance) {
  // Middleware to add user context
  app.addHook('preHandler', async (request: any, reply) => {
    // Assume user info is extracted from auth token
    const userId = request.headers['x-user-id'] as string;

    if (userId) {
      // Create user logger and attach to request
      request.userLog = createUserLogger(request.log, userId);
    }
  });

  app.post('/api/profile', async (request: any, reply) => {
    const logger = request.userLog || request.log;

    // This log will include userId automatically
    logger.info({ action: 'updateProfile' }, 'User updating profile');

    try {
      // Update profile...
      logger.info({ changes: request.body }, 'Profile updated successfully');
      return { success: true };
    } catch (error) {
      logger.error({ err: error, action: 'updateProfile' }, 'Failed to update profile');
      throw error;
    }
  });
}

/**
 * Example 6: Performance logging with duration tracking
 */
export function performanceLoggingExample(app: FastifyInstance) {
  app.get('/api/reports/:id', async (request, reply) => {
    const logger = createChildLogger(request.log, {
      operation: 'generateReport',
      reportId: request.params.id,
    });

    const startTime = Date.now();
    logger.info('Starting report generation');

    try {
      // Simulate report generation phases
      logger.debug('Fetching data');
      const dataFetchTime = Date.now();

      // Simulate data fetch
      await new Promise((resolve) => setTimeout(resolve, 100));

      logger.debug(
        { duration: Date.now() - dataFetchTime },
        'Data fetched'
      );

      logger.debug('Processing data');
      const processingStartTime = Date.now();

      // Simulate processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      logger.debug(
        { duration: Date.now() - processingStartTime },
        'Data processed'
      );

      const totalDuration = Date.now() - startTime;
      logger.info(
        { totalDuration, dataFetchTime: Date.now() - dataFetchTime },
        'Report generated successfully'
      );

      return { reportId: request.params.id, generatedAt: new Date() };
    } catch (error) {
      logger.error(
        { err: error, duration: Date.now() - startTime },
        'Failed to generate report'
      );
      throw error;
    }
  });
}

/**
 * Example 7: Error logging with context
 */
export function errorLoggingExample(app: FastifyInstance) {
  app.get('/api/data/:id', async (request, reply) => {
    const logger = createChildLogger(request.log, {
      dataId: request.params.id,
    });

    try {
      // Simulate an operation that might fail
      if (request.params.id === 'invalid') {
        throw new Error('Invalid data ID');
      }

      return { id: request.params.id, data: 'Some data' };
    } catch (error) {
      // Log error with full context
      logger.error(
        {
          err: error,
          dataId: request.params.id,
          requestUrl: request.url,
          requestMethod: request.method,
        },
        'Operation failed'
      );

      // Re-throw for error handler
      throw error;
    }
  });
}

/**
 * Example 8: Integration with diagnostics channel
 *
 * The diagnostics plugin automatically logs request lifecycle events.
 * These logs include requestId from AsyncLocalStorage, so all child
 * loggers created during the request will have the same requestId.
 */
export async function setupWithDiagnostics(app: FastifyInstance) {
  // The diagnostics plugin is already registered in app.ts
  // It automatically logs:
  // - request.start: When request begins
  // - request.end: When request completes (includes duration, statusCode)
  // - request.error: When request fails

  // All logs within a request handler automatically have requestId
  app.get('/api/example', async (request, reply) => {
    // This log will include requestId from diagnostics channel
    request.log.info('Processing request');

    // Child logger also inherits requestId
    const logger = createChildLogger(request.log, { step: 'validation' });
    logger.info('Validating input');

    return { success: true };
  });
}
