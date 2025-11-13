# Permission Whitelist Validation System

**Task 15.5**: Runtime validation and enforcement of Node.js Permission Model configuration.

## Overview

This system provides comprehensive validation, logging, and auditing of filesystem and process permissions. It ensures that the application operates within defined security boundaries and helps identify configuration issues before deployment.

## Components

### 1. Permission Validator (`permission-validator.ts`)

Core validation logic for checking permissions before operations occur.

**Key Functions:**

- `validatePathAccess()` - Check if a path is allowed for read/write
- `validatePathAccessOrThrow()` - Validate and throw on denial
- `validateConfiguredPaths()` - Validate all configured paths exist
- `validateChildProcessAllowed()` - Check child process permission
- `sanitizePath()` - Sanitize user input and prevent path traversal

**Example Usage:**

```typescript
import { validatePathAccessOrThrow, getPermissionConfig } from './permission-validator';

const config = getPermissionConfig();

// Validate before file operation
validatePathAccessOrThrow('/app/data/file.txt', 'write', config);
fs.writeFileSync('/app/data/file.txt', data);
```

### 2. Permission Logger (`permission-logger.ts`)

Tracks and reports permission violations for security auditing.

**Features:**

- In-memory violation log with size limits
- Automatic console logging
- Violation statistics and filtering
- JSON export for external analysis

**Example Usage:**

```typescript
import { getPermissionLogger, logPermissionViolation } from './permission-logger';

// Log violations (automatically done by validator)
try {
  validatePathAccessOrThrow('/forbidden/path', 'read', config);
} catch (error) {
  if (error instanceof PermissionViolationError) {
    logPermissionViolation(error);
  }
  throw error;
}

// Query violations
const logger = getPermissionLogger();
const stats = logger.getStatistics();
console.log(`Total violations: ${stats.totalViolations}`);
```

### 3. Permission Audit (`permission-audit.ts`)

Tools for inspecting and validating permission configurations.

**Key Functions:**

- `auditPermissionConfiguration()` - Generate comprehensive audit report
- `preflightValidation()` - Pre-startup validation checks
- `generateDriftReport()` - Detect configuration drift
- `displayAuditReport()` - Pretty-print audit results

**Example Usage:**

```typescript
import { auditPermissionConfiguration, displayAuditReport } from './permission-audit';

const config = getPermissionConfig();
const report = auditPermissionConfiguration(config);

displayAuditReport(report);

if (report.healthCheck.securityPosture === 'insecure') {
  console.error('Security issues detected!');
  process.exit(1);
}
```

### 4. Validation Script (`scripts/validate-permissions.ts`)

Standalone script for pre-deployment validation.

**Usage:**

```bash
# Development validation
npm run validate:permissions

# Production validation
npm run validate:permissions:prod
NODE_ENV=production npm run validate:permissions
```

## Integration

### Application Startup

Add pre-flight validation to your application startup:

```typescript
// src/index.ts
import { preflightValidation } from './lib/process/permission-audit';
import { getPermissionConfig } from './lib/process/permission-profiles';

async function main() {
  // Validate permissions before starting server
  const config = getPermissionConfig();

  if (!preflightValidation(config)) {
    console.error('Permission validation failed - exiting');
    process.exit(1);
  }

  // Start application...
}
```

### Child Process Spawning

The `safeSpawn()` function now includes automatic validation:

```typescript
import { safeSpawn } from './lib/process/safe-spawn';

// Automatically validates:
// 1. Child process permission is allowed
// 2. Working directory is accessible
// 3. Logs violations if denied

const result = await safeSpawn('git', ['status'], {
  cwd: '/app/project',
  timeout: 5000,
});
```

### CI/CD Pipeline

Add to your CI/CD workflow:

```yaml
# .github/workflows/deploy.yml
- name: Validate Permissions
  run: |
    npm run validate:permissions:prod
  env:
    NODE_ENV: production
    PROJECT_ROOTS: /app/dist,/var/lib/jellos,/var/log/jellos
```

## Permission Violation Handling

### Error Formatting

Human-readable error messages with resolution guidance:

```typescript
import { formatPermissionError } from './permission-validator';

try {
  validatePathAccessOrThrow('/etc/passwd', 'read', config);
} catch (error) {
  if (error instanceof PermissionViolationError) {
    console.error(formatPermissionError(error));
    // Output:
    // 🚫 Permission Denied
    // ──────────────────────────────────────────
    // Operation: read
    // Path:      /etc/passwd
    // Reason:    Path is not in allowed read whitelist
    //
    // 💡 Resolution:
    //    1. Add the path to PROJECT_ROOTS...
  }
}
```

### Logging Configuration

Configure the global logger:

```typescript
import { initializePermissionLogger } from './permission-logger';

initializePermissionLogger({
  enabled: true,
  logToConsole: process.env.NODE_ENV !== 'production',
  includeStackTrace: true,
  maxViolations: 1000,
});
```

## Audit Reports

### Report Structure

```typescript
interface PermissionAuditReport {
  timestamp: Date;
  configuration: ServerPermissionConfig;
  validation: ValidationResult;
  violations: ViolationStatistics;
  recommendations: string[];
  healthCheck: {
    configurationValid: boolean;
    noRecentViolations: boolean;
    pathsAccessible: boolean;
    securityPosture: 'secure' | 'moderate' | 'insecure';
  };
}
```

### Generating Reports

```typescript
import {
  auditPermissionConfiguration,
  exportAuditReport
} from './permission-audit';

const config = getPermissionConfig();
const report = auditPermissionConfiguration(config);

// Display to console
displayAuditReport(report);

// Export to file
exportAuditReport(report, '/var/log/permission-audit.json');
```

## Security Best Practices

### 1. Path Traversal Prevention

Always use `sanitizePath()` for user-provided paths:

```typescript
import { sanitizePath } from './permission-validator';

// User input
const userPath = req.query.path;

// Sanitize before use
const safePath = sanitizePath(
  userPath,
  '/app/project', // Base directory
  config
);

// Now safe to use
fs.readFileSync(safePath);
```

### 2. Pre-flight Validation

Always validate configuration before deployment:

```bash
# In deployment script
npm run validate:permissions:prod || exit 1
npm run build
npm run start
```

### 3. Monitor Violations

Set up monitoring for permission violations:

```typescript
import { getPermissionLogger } from './permission-logger';

// Periodic check
setInterval(() => {
  const stats = getPermissionLogger().getStatistics();

  if (stats.totalViolations > 0) {
    console.warn(`⚠️  ${stats.totalViolations} permission violations detected`);
    // Alert ops team, send metrics, etc.
  }
}, 60000); // Every minute
```

### 4. Configuration Drift Detection

Monitor for unexpected configuration changes:

```typescript
import { generateDriftReport } from './permission-audit';

const expectedConfig = loadExpectedConfig();
const actualConfig = getPermissionConfig();

const drift = generateDriftReport(expectedConfig, actualConfig);

if (drift.hasDrift) {
  console.error('Configuration drift detected!');
  for (const item of drift.drift) {
    console.error(`  ${item.field}: ${item.severity}`);
  }
}
```

## Environment Variables

Control validation behavior via environment variables:

```bash
# Enable/disable permission model
NODE_PERMISSIONS=true

# Configure project roots (comma-separated)
PROJECT_ROOTS=/app/dist,/var/lib/jellos,/var/log/jellos

# Control child process permission
ALLOW_CHILD_PROCESS=true

# Control worker threads
ALLOW_WORKER=false
```

## Testing

Run validation tests:

```bash
# All permission tests
npm run test -- src/lib/process/__tests__/permission-*.test.ts

# Specific test suites
npm run test -- src/lib/process/__tests__/permission-validator.test.ts
npm run test -- src/lib/process/__tests__/permission-logger.test.ts
npm run test -- src/lib/process/__tests__/permission-audit.test.ts
```

## Production Deployment

Recommended production configuration:

```bash
# Environment variables
NODE_ENV=production
NODE_PERMISSIONS=true
PROJECT_ROOTS=/app/dist,/var/lib/jellos,/var/log/jellos
ALLOW_CHILD_PROCESS=true
ALLOW_WORKER=false

# Start command with validation
npm run validate:permissions:prod && npm run start
```

Expected output:

```
════════════════════════════════════════════════════════════════════════════════
🔍 PERMISSION AUDIT REPORT
════════════════════════════════════════════════════════════════════════════════

📋 Configuration:
   Permission Model: ✅ ENABLED
   Project Roots: 3
   Child Process: ✅
   Worker Threads: ❌

✓ Validation:
   Status: ✅ VALID

🏥 Health Check:
   Configuration Valid: ✅
   No Recent Violations: ✅
   Paths Accessible: ✅
   Security Posture: ✅ SECURE

✅ All validation checks passed
```

## Troubleshooting

### Common Issues

**1. "Path does not exist" error during validation**

```bash
# Ensure all PROJECT_ROOTS exist before starting
mkdir -p /var/lib/jellos /var/log/jellos
```

**2. Permission denied when spawning processes**

```bash
# Enable child process permission
ALLOW_CHILD_PROCESS=true npm run start
```

**3. Configuration drift detected**

```bash
# Review and update expected configuration
# Check for unauthorized changes in deployment
```

## Architecture

```
Permission Validation System
├── permission-validator.ts     # Core validation logic
├── permission-logger.ts        # Violation tracking
├── permission-audit.ts         # Audit and reporting
└── scripts/
    └── validate-permissions.ts # CLI validation tool

Integration Points
├── safe-spawn.ts              # Auto-validates child processes
├── permission-profiles.ts     # Env-specific configs
└── server-permissions.ts      # Server startup config
```

## Related Tasks

- Task 15.3: Node.js Permission Model 구성 (foundation)
- Task 15.5: Permission whitelist validation system (this task)
- Task 15.6: 코드 검증 및 sanitization (upcoming)

## References

- [Node.js Permission Model](https://nodejs.org/api/permissions.html)
- [Security Best Practices](https://nodejs.org/en/docs/guides/security/)
