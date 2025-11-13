# Circuit Breaker and System Pressure Monitoring

## Overview

This document describes the circuit breaker pattern implementation and system pressure monitoring for the Jellos API.

## Circuit Breaker Pattern

### Purpose

Circuit breakers prevent cascading failures by automatically blocking requests to failing services and allowing them time to recover.

### States

1. **CLOSED**: Normal operation - all requests are allowed
2. **OPEN**: Service is failing - requests are blocked
3. **HALF_OPEN**: Testing recovery - limited requests allowed

### State Transitions

```
CLOSED --[threshold failures]--> OPEN
OPEN --[timeout elapsed]--> HALF_OPEN
HALF_OPEN --[2 successes]--> CLOSED
HALF_OPEN --[1 failure]--> OPEN
```

### Configuration

Circuit breakers can be configured per service:

```typescript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,      // Number of failures before opening
  resetTimeoutMs: 60000,    // 1 minute before trying half-open
  serviceName: 'github',    // For event tracking
});
```

### Event Bus Integration

Circuit breakers emit events for monitoring and alerting:

- `circuit-breaker.opened`: When circuit opens (service failing)
- `circuit-breaker.half-open`: When testing recovery
- `circuit-breaker.closed`: When service recovered

### Services with Circuit Breakers

1. **GitHub API** (`github-client.service.ts`)
   - Threshold: 5 failures
   - Reset timeout: 60 seconds
   - Protects against GitHub API outages and rate limits

2. **Linear API** (`linear-client.service.ts`)
   - Threshold: 5 failures
   - Reset timeout: 60 seconds
   - Protects against Linear API outages

### Usage Example

```typescript
import { GitHubClientService } from './services/github-client.service';

const github = new GitHubClientService();

// Circuit breaker is automatically applied to all methods
const result = await github.searchPRsByIssue('123');

// Check circuit state
const state = github.getCircuitBreakerState(); // 'CLOSED', 'OPEN', or 'HALF_OPEN'

// Manual reset (for testing or manual intervention)
github.resetCircuitBreaker();
```

## System Pressure Monitoring

### Purpose

Prevent system overload by monitoring key metrics and returning 503 Service Unavailable when under pressure.

### Monitored Metrics

1. **Event Loop Delay**: Indicates event loop blocking
2. **Memory Usage (RSS)**: Total memory consumption
3. **Heap Usage**: JavaScript heap memory

### Configuration

Configure via environment variables in `.env`:

```bash
# Maximum event loop delay before returning 503 (milliseconds)
MAX_EVENT_LOOP_DELAY_MS=1000

# Maximum memory usage before returning 503 (megabytes)
MAX_MEMORY_USAGE_MB=512

# Maximum heap usage before returning 503 (megabytes)
MAX_HEAP_USAGE_MB=384

# Interval for pressure health checks (milliseconds)
PRESSURE_CHECK_INTERVAL_MS=5000

# Sample interval for pressure monitoring (milliseconds)
PRESSURE_SAMPLE_INTERVAL_MS=1000
```

### Behavior

When system is under pressure:
1. Returns 503 Service Unavailable
2. Emits `system.pressure.high` event with details
3. Logs warning with metric values
4. Includes `retryAfter` header (30 seconds)

When pressure recovers:
1. Resumes normal operation
2. Emits `system.pressure.normal` event
3. Logs recovery information

### Event Bus Integration

System pressure events for monitoring:

- `system.pressure.high`: Threshold exceeded
  ```typescript
  {
    type: 'memory' | 'eventLoop' | 'heap',
    value: number,
    threshold: number,
    timestamp: Date
  }
  ```

- `system.pressure.normal`: Recovered to normal
  ```typescript
  {
    type: 'memory' | 'eventLoop' | 'heap',
    value: number,
    timestamp: Date
  }
  ```

### Health Check Integration

Circuit breaker states and system pressure are exposed in health checks:

```bash
curl http://localhost:3001/health/readyz?verbose=true
```

Response includes:
```json
{
  "components": {
    "github": {
      "status": "healthy",
      "details": {
        "circuitBreaker": "CLOSED"
      }
    },
    "linear": {
      "status": "degraded",
      "message": "Linear API circuit breaker is OPEN",
      "details": {
        "circuitBreaker": "OPEN"
      }
    }
  }
}
```

## Testing

### Circuit Breaker Tests

Located in `src/utils/__tests__/retry.test.ts`:

- State transitions
- Failure threshold behavior
- Reset timeout behavior
- Event emission
- Integration with retry logic

Run tests:
```bash
pnpm test src/utils/__tests__/retry.test.ts
```

### Load Testing

Test system pressure monitoring:

```bash
# Install load testing tool
npm install -g autocannon

# Generate load
autocannon -c 100 -d 30 http://localhost:3001/health/readyz
```

Monitor logs for pressure events and 503 responses.

### Failure Injection

Test circuit breaker behavior:

```bash
# Temporarily break GitHub API access
export GITHUB_TOKEN=invalid

# Make requests to trigger failures
for i in {1..10}; do
  curl http://localhost:3001/api/projects
  sleep 1
done

# Check circuit state in health endpoint
curl http://localhost:3001/health/readyz?verbose=true
```

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Circuit Breaker State Changes**
   - Track `circuit-breaker.opened` events
   - Alert when circuits remain open for extended periods

2. **System Pressure Events**
   - Track `system.pressure.high` events
   - Alert on sustained high pressure (multiple events in short time)

3. **503 Response Rate**
   - Monitor percentage of 503 responses
   - Alert when rate exceeds threshold (e.g., >5%)

### Example Monitoring Setup

Subscribe to events in your monitoring system:

```typescript
import { eventBus } from './lib/event-bus';

// Alert on circuit breaker opening
eventBus.onEvent('circuit-breaker.opened', ({ service, failureCount }) => {
  console.error(`ALERT: Circuit breaker opened for ${service} after ${failureCount} failures`);
  // Send to monitoring system (Datadog, Prometheus, etc.)
});

// Alert on sustained system pressure
eventBus.onEvent('system.pressure.high', ({ type, value, threshold }) => {
  console.warn(`ALERT: System pressure high - ${type}: ${value} (threshold: ${threshold})`);
  // Send to monitoring system
});
```

## Best Practices

1. **Configure Appropriate Thresholds**
   - Set failure thresholds based on service SLA
   - Tune pressure thresholds based on load testing

2. **Monitor Circuit Breaker Events**
   - Set up alerts for circuit openings
   - Investigate root causes when circuits open

3. **Graceful Degradation**
   - Services with circuit breakers return gracefully (empty results)
   - Non-critical services don't block critical operations

4. **Regular Load Testing**
   - Test system under realistic load
   - Verify pressure monitoring triggers appropriately

5. **Document Service Dependencies**
   - Track which services have circuit breakers
   - Document expected failure modes

## Troubleshooting

### Circuit Breaker Stuck Open

**Symptom**: Circuit remains open despite service recovery

**Solutions**:
1. Check service health independently
2. Review failure threshold - may be too low
3. Increase reset timeout if service needs more recovery time
4. Manual reset via API if needed

### Excessive 503 Errors

**Symptom**: Many requests receiving 503 Service Unavailable

**Solutions**:
1. Check system pressure configuration - thresholds may be too low
2. Scale infrastructure (memory, CPU)
3. Optimize slow operations
4. Implement request queuing or rate limiting

### Circuit Breaker Not Opening

**Symptom**: Service failures not triggering circuit breaker

**Solutions**:
1. Verify error classification (retryable vs non-retryable)
2. Check failure threshold configuration
3. Review retry logic - may be masking failures
4. Add logging to circuit breaker transitions

## Future Enhancements

1. **Adaptive Thresholds**: Automatically adjust based on traffic patterns
2. **Bulkhead Pattern**: Isolate thread pools per service
3. **Metrics Dashboard**: Real-time visualization of circuit states
4. **Automatic Recovery Testing**: Periodic health checks in open state
5. **Rate Limiting Integration**: Coordinate with rate limiters
