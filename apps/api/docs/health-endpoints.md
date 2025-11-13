# Health Check Endpoints

This document describes the health check endpoints implemented for Kubernetes-style observability.

## Endpoints

### `/health/healthz` - Liveness Probe

**Purpose**: Checks if the application is alive and can respond to requests.

**Method**: `GET`

**Response**: Always returns `200 OK` unless the application crashes.

**Example Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-13T10:00:00.000Z",
  "uptime": 123.456
}
```

**Use Case**: Kubernetes liveness probe to detect if the pod needs to be restarted.

```yaml
livenessProbe:
  httpGet:
    path: /health/healthz
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

---

### `/health/readyz` - Readiness Probe

**Purpose**: Checks if the application is ready to serve traffic (all dependencies are available).

**Method**: `GET`

**Query Parameters**:
- `verbose` (optional): Set to `true` to include detailed component information

**Response Codes**:
- `200 OK`: Application is healthy or degraded but functional
- `503 Service Unavailable`: Application is unhealthy (critical dependencies failed)

**Example Response (Normal)**:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-13T10:00:00.000Z",
  "uptime": 123.456,
  "components": {
    "database": {
      "status": "healthy",
      "responseTime": 12,
      "message": "Database connection successful"
    },
    "cache": {
      "status": "healthy",
      "responseTime": 5,
      "message": "Redis cache available"
    },
    "git": {
      "status": "healthy",
      "responseTime": 8,
      "message": "Git available"
    },
    "github": {
      "status": "healthy",
      "responseTime": 156,
      "message": "GitHub API available"
    },
    "linear": {
      "status": "degraded",
      "responseTime": 0,
      "message": "Linear not configured (optional)"
    }
  },
  "checks": {
    "passed": 5,
    "failed": 0,
    "total": 5
  }
}
```

**Example Response (Verbose)**:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-13T10:00:00.000Z",
  "uptime": 123.456,
  "components": {
    "database": {
      "status": "healthy",
      "responseTime": 12,
      "message": "Database connection successful",
      "details": {
        "type": "postgresql",
        "connectionPool": "active"
      }
    },
    "git": {
      "status": "healthy",
      "responseTime": 8,
      "message": "Git available",
      "details": {
        "version": "git version 2.39.0"
      }
    },
    "github": {
      "status": "degraded",
      "responseTime": 156,
      "message": "GitHub API rate limit low",
      "details": {
        "rateLimit": {
          "remaining": 50,
          "limit": 5000,
          "reset": "2025-11-13T11:00:00.000Z"
        }
      }
    }
  },
  "checks": {
    "passed": 4,
    "failed": 0,
    "total": 5
  }
}
```

**Use Case**: Kubernetes readiness probe to determine if the pod should receive traffic.

```yaml
readinessProbe:
  httpGet:
    path: /health/readyz
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  successThreshold: 1
  failureThreshold: 3
```

---

## Component Health Statuses

### Critical Components (Unhealthy causes overall unhealthy)
- **database**: PostgreSQL connection via Prisma
- **git**: Git command availability

### Non-Critical Components (Degraded causes overall degraded)
- **cache**: Redis availability (falls back to in-memory)
- **github**: GitHub API connectivity and rate limits
- **linear**: Linear API connectivity

## Health Status Levels

- **healthy**: Component is working normally
- **degraded**: Component has issues but application can still function (e.g., optional service unavailable, slow response, low rate limits)
- **unhealthy**: Component has failed and application cannot function properly

## Configuration

Health checks are configured with:
- **Timeout**: 3 seconds per component check
- **Details**: Disabled by default, enabled with `?verbose=true`

## Timeout Handling

Each component check has an individual timeout of 3 seconds. If a component exceeds this timeout:
- The component is marked as unhealthy
- The error message indicates a timeout
- Other components continue to be checked

## Structured Logging

Failed health checks are automatically logged with structured data:
- **Unhealthy**: Logged at ERROR level
- **Degraded**: Logged at WARN level
- **Healthy**: Not logged (unless verbose logging enabled)

---

## Legacy Endpoints (Backwards Compatibility)

### `/health/` - Basic Health

Simple health check that returns `200 OK` if the app is running.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-11-13T10:00:00.000Z",
  "uptime": 123.456
}
```

### `/health/db` - Database Health

Checks database connectivity only.

**Response (Healthy)**:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-11-13T10:00:00.000Z"
}
```

**Response (Unhealthy)** - `503 Service Unavailable`:
```json
{
  "status": "error",
  "database": "disconnected",
  "timestamp": "2025-11-13T10:00:00.000Z",
  "error": "Database connection failed"
}
```

### `/health/ready` - Simple Readiness

Legacy readiness check with simplified response.

**Response**:
```json
{
  "ready": true,
  "checks": {
    "database": true
  }
}
```

---

## Testing

Run health check service tests:
```bash
npm test -- health-check.service.test.ts
```

Manual testing:
```bash
# Liveness
curl http://localhost:3000/health/healthz

# Readiness
curl http://localhost:3000/health/readyz

# Readiness with verbose output
curl http://localhost:3000/health/readyz?verbose=true
```

## Implementation Details

See:
- `/apps/api/src/services/health-check.service.ts` - Health check service
- `/apps/api/src/routes/health.routes.ts` - Route handlers
- `/apps/api/src/services/__tests__/health-check.service.test.ts` - Tests
