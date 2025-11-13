# Pino-based Structured Logging System

A comprehensive structured logging solution built on Pino for the Jellos API.

## Features

- **Structured JSON Logging**: All logs are structured for easy parsing and analysis
- **Environment-based Configuration**: Automatic configuration for development vs production
- **Sensitive Data Redaction**: Automatic redaction of passwords, tokens, and other sensitive fields
- **Request Correlation**: Automatic request ID tracking across async operations
- **Child Logger Patterns**: Easy creation of contextual child loggers
- **Diagnostics Channel Integration**: Seamless integration with Node.js diagnostics
- **Configurable Log Levels**: Support for trace, debug, info, warn, error, fatal
- **Pretty Printing**: Human-readable logs in development, JSON in production

## Quick Start

### Basic Usage

```typescript
import { createLoggerConfig } from './lib/logger';
import Fastify from 'fastify';

const app = Fastify({
  logger: createLoggerConfig()
});

app.log.info('Server starting');
app.log.error({ err: new Error('Failed') }, 'Operation failed');
```

### Child Loggers

```typescript
import { createChildLogger, createUserLogger } from './lib/logger';

// Create child logger with request context (automatically includes requestId)
const logger = createChildLogger(app.log, { component: 'AuthService' });
logger.info('Processing authentication');

// Create user-specific logger
const userLogger = createUserLogger(app.log, 'user-123');
userLogger.info('User action logged');
```

### Request Correlation

```typescript
import { createChildLogger, extractRequestBindings } from './lib/logger';

// In a route handler
app.get('/api/users/:id', async (request, reply) => {
  // Create child logger with request bindings
  const logger = createChildLogger(
    request.log,
    extractRequestBindings(request)
  );

  logger.info('Fetching user');
  // All logs will include requestId automatically
});
```

## Configuration

### Environment Variables

```bash
# Set log level (default: info)
LOG_LEVEL=debug

# Set environment (affects formatting)
NODE_ENV=production
```

### Log Levels

```typescript
import { LOG_LEVELS } from './lib/logger';

// Available levels:
// - trace: Most verbose
// - debug: Debug information
// - info: Informational messages (default)
// - warn: Warning messages
// - error: Error messages
// - fatal: Critical errors
```

## Sensitive Data Redaction

The logger automatically redacts sensitive fields:

```typescript
// This log will have password redacted automatically
logger.info({
  username: 'john',
  password: 'secret123' // Will appear as [REDACTED]
}, 'User login');

// Redacted fields include:
// - password, token, apiKey, secret
// - authorization, cookie headers
// - creditCard, cvv, ssn
// - session, sessionId
// And many more...
```

## Request Context Integration

The logger integrates with AsyncLocalStorage for automatic request tracking:

```typescript
import { requestContextStore, createRequestContext } from './lib/diagnostics';

// Request context is automatically created by the diagnostics plugin
// All child loggers created within a request will have access to:
// - requestId
// - routePath
// - routeMethod
// - startTime

const logger = createChildLogger(app.log);
// Automatically includes requestId from context
logger.info('Processing request');
```

## Child Logger Patterns

### Component Logger

```typescript
import { createComponentLogger } from './lib/logger';

const logger = createComponentLogger(app.log, 'DatabaseService');
logger.info('Executing query');
```

### Correlated Logger

```typescript
import { createCorrelatedLogger } from './lib/logger';

// Track related operations across multiple requests
const logger = createCorrelatedLogger(app.log, 'correlation-123');
logger.info('Starting batch operation');
```

### Traced Logger

```typescript
import { createTracedLogger } from './lib/logger';

// Integration with distributed tracing systems
const logger = createTracedLogger(app.log, 'trace-id', 'span-id');
logger.info('Traced operation');
```

## Log Rotation (Future Enhancement)

The rotation module provides basic infrastructure for log rotation:

```typescript
import { setupLogRotation } from './lib/logger';

// For production, use pino-roll or rotating-file-stream
const streams = setupLogRotation({
  error: {
    logDir: './logs',
    filename: 'error.log',
    maxSize: 5 * 1024 * 1024, // 5MB
  },
  combined: {
    logDir: './logs',
    filename: 'combined.log',
  }
});
```

## Best Practices

### 1. Use Structured Fields

```typescript
// Good: Structured fields
logger.info({
  userId: '123',
  action: 'login',
  duration: 150,
  success: true
}, 'User login successful');

// Avoid: Interpolated strings
logger.info(`User 123 login successful in 150ms`);
```

### 2. Use Child Loggers for Context

```typescript
// Good: Child logger with context
const userLogger = createUserLogger(app.log, userId);
userLogger.info('Action performed');
userLogger.info('Another action');

// Avoid: Repeating context
logger.info({ userId }, 'Action performed');
logger.info({ userId }, 'Another action');
```

### 3. Log Errors with Context

```typescript
// Good: Error with context
logger.error({
  err: error,
  userId: '123',
  operation: 'updateProfile'
}, 'Failed to update user profile');

// Avoid: Error message only
logger.error(error.message);
```

### 4. Use Appropriate Log Levels

```typescript
logger.trace('Entering function'); // Very detailed debugging
logger.debug('Processing item', { item }); // Debug information
logger.info('User logged in', { userId }); // Informational
logger.warn('Rate limit approaching', { current, limit }); // Warnings
logger.error({ err }, 'Operation failed'); // Errors
logger.fatal({ err }, 'System failure'); // Critical errors
```

## Integration with Diagnostics Channel

The logging system is fully integrated with the diagnostics channel (Task 14.1):

```typescript
// Diagnostics plugin automatically logs request lifecycle events
await app.register(diagnosticsPlugin, {
  logRequestStart: true,
  logRequestEnd: true,
  logRequestError: true,
  requestStartLogLevel: 'debug',
  requestEndLogLevel: 'info',
  requestErrorLogLevel: 'error',
});

// All request logs will include:
// - requestId
// - method, url
// - routePath, routeMethod
// - duration
// - statusCode (for end events)
// - error details (for error events)
```

## Testing

Run tests with:

```bash
pnpm test src/lib/logger
```

Test coverage includes:
- Configuration tests
- Child logger creation
- Sensitive data redaction
- Request context integration
- Serializers
- Environment-based configuration

## Examples

### Complete Request Handler Example

```typescript
app.post('/api/orders', async (request, reply) => {
  // Create child logger with request context
  const logger = createChildLogger(
    request.log,
    extractRequestBindings(request)
  );

  try {
    logger.info({ body: request.body }, 'Creating order');

    const order = await orderService.create(request.body);

    logger.info({ orderId: order.id }, 'Order created successfully');

    return { success: true, orderId: order.id };
  } catch (error) {
    logger.error({ err: error, body: request.body }, 'Failed to create order');
    throw error;
  }
});
```

### Service Logger Example

```typescript
class UserService {
  private logger: Logger;

  constructor(baseLogger: Logger) {
    this.logger = createComponentLogger(baseLogger, 'UserService');
  }

  async getUser(userId: string) {
    const logger = createChildLogger(this.logger, { userId });

    logger.debug('Fetching user from database');

    try {
      const user = await db.user.findUnique({ where: { id: userId } });

      if (!user) {
        logger.warn('User not found');
        return null;
      }

      logger.info('User fetched successfully');
      return user;
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch user');
      throw error;
    }
  }
}
```

## Performance Considerations

- Pino is extremely fast (benchmarked as one of the fastest Node.js loggers)
- JSON serialization is optimized
- Pretty printing is only enabled in development
- Redaction happens at serialization time with minimal overhead
- Child logger creation is lightweight

## Future Enhancements

- [ ] Log aggregation integration (Loki, Elasticsearch)
- [ ] Log rotation with pino-roll
- [ ] Metrics collection from logs
- [ ] Custom transports for external services
- [ ] Log sampling for high-volume scenarios
- [ ] OpenTelemetry integration
