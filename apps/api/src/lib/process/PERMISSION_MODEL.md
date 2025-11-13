# Node.js Permission Model Configuration

This document describes how the Jellos API server uses Node.js Permission Model (available in Node.js 20+) to implement security sandboxing.

## Overview

The Permission Model is a security feature that restricts what a Node.js application can access:

- **Filesystem Access**: Control which directories can be read or written
- **Child Processes**: Control whether the app can spawn external processes
- **Worker Threads**: Control whether the app can create worker threads
- **WASI**: Control WebAssembly System Interface access

## Why Use Permission Model?

1. **Defense in Depth**: Even if an attacker compromises your application, they're limited by the permission sandbox
2. **Minimize Attack Surface**: Restrict access to only what's needed for operation
3. **Production Security**: Critical for production deployments handling sensitive data
4. **Compliance**: Helps meet security compliance requirements

## Configuration

### Environment Variables

```bash
# Enable/disable permission model (auto-enabled in production)
NODE_PERMISSIONS=true

# Comma-separated list of project root paths
PROJECT_ROOTS=/app/dist,/var/lib/jellos,/var/log/jellos

# Allow spawning child processes (required for agent health checks)
ALLOW_CHILD_PROCESS=true

# Allow worker threads (disabled by default)
ALLOW_WORKER=false
```

### Permission Profiles

The system includes four built-in profiles:

#### Development Profile (default)
- **Enabled**: No (for developer convenience)
- **Use Case**: Local development and debugging
- **Restrictions**: None

```bash
NODE_ENV=development
# Permission model disabled by default
```

#### Test Profile
- **Enabled**: Yes
- **Use Case**: Testing security behavior
- **Filesystem**: Test directories, temp directory
- **Child Process**: Allowed (for test execution)

```bash
NODE_ENV=test
NODE_PERMISSIONS=true
npm run test:permissions
```

#### Staging Profile
- **Enabled**: Yes
- **Use Case**: Production-like validation environment
- **Filesystem**: Application dist directory, data directories
- **Child Process**: Allowed
- **Worker Threads**: Disabled

```bash
NODE_ENV=staging
NODE_PERMISSIONS=true
PROJECT_ROOTS=/app/dist,/var/lib/jellos,/var/log/jellos
```

#### Production Profile (most restrictive)
- **Enabled**: Yes (automatic)
- **Use Case**: Production deployments
- **Filesystem**: Minimal required paths only
- **Child Process**: Allowed (required for agent operations)
- **Worker Threads**: Disabled

```bash
NODE_ENV=production
# Permission model auto-enabled
PROJECT_ROOTS=/app/dist,/var/lib/jellos,/var/log/jellos
```

## Usage

### Running the Server

#### Development Mode (Unrestricted)
```bash
npm run dev
# or
NODE_ENV=development npm start
```

#### Development Mode with Permissions (Testing)
```bash
npm run dev:secure
# or
NODE_PERMISSIONS=true npm run dev
```

#### Production Mode
```bash
npm run build
npm run start:secure
# or
NODE_ENV=production npm start
```

#### Manual Permission Flags
```bash
npm run start:permissions
# Equivalent to:
node --permission \
  --allow-child-process \
  --allow-fs-read=$(pwd)/dist \
  --allow-fs-read=/usr/bin \
  --allow-fs-read=/usr/local/bin \
  --allow-fs-write=$(pwd)/dist \
  dist/index.js
```

### Docker/Container Deployment

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy built application
COPY dist ./dist
COPY node_modules ./node_modules

# Create data and log directories
RUN mkdir -p /var/lib/jellos /var/log/jellos && \
    chown -R node:node /var/lib/jellos /var/log/jellos

USER node

ENV NODE_ENV=production
ENV PROJECT_ROOTS=/app/dist,/var/lib/jellos,/var/log/jellos

# Permission model auto-enabled via NODE_ENV=production
CMD ["node", "dist/index.js"]
```

## API Reference

### Permission Profiles

#### `getPermissionConfig(): ServerPermissionConfig`
Returns the active permission configuration based on environment variables and NODE_ENV.

```typescript
import { getPermissionConfig } from './lib/process/permission-profiles';

const config = getPermissionConfig();
console.log('Permission model enabled:', config.enabled);
```

#### `buildCompletePermissionArgs(config): string[]`
Generates Node.js command-line arguments for permission model.

```typescript
import { buildCompletePermissionArgs } from './lib/process/permission-profiles';

const config = getPermissionConfig();
const args = buildCompletePermissionArgs(config);
// ['--permission', '--allow-child-process', '--allow-fs-read=/path', ...]
```

#### `validatePermissionConfig(config): void`
Validates permission configuration and warns about potential issues.

```typescript
import { validatePermissionConfig } from './lib/process/permission-profiles';

validatePermissionConfig(config);
// Throws or warns if configuration is invalid
```

#### `displayPermissionConfig(config): void`
Displays permission configuration at server startup.

```typescript
import { displayPermissionConfig } from './lib/process/permission-profiles';

displayPermissionConfig(config);
// Logs formatted permission settings to console
```

### Safe Process Spawning

#### `safeSpawn(command, args, options): Promise<ProcessResult>`
Safely spawn child processes with timeout and permission handling.

```typescript
import { safeSpawn } from './lib/process/safe-spawn';

try {
  const result = await safeSpawn('git', ['--version'], {
    timeout: 5000,
    cwd: '/app/project',
  });
  console.log('Git version:', result.stdout);
} catch (error) {
  if (error instanceof PermissionDeniedError) {
    console.error('Permission denied:', error.helpText);
  }
}
```

## Troubleshooting

### Permission Denied Errors

If you see `ERR_ACCESS_DENIED` errors:

1. **Check Permission Configuration**
   ```bash
   # View current configuration on startup
   npm start
   # Look for the 🔒 Permission Model section
   ```

2. **Add Required Paths**
   ```bash
   # Add the missing path to PROJECT_ROOTS
   export PROJECT_ROOTS="/app/dist,/path/to/needed/directory"
   ```

3. **Verify Path Exists**
   ```bash
   # Ensure the path exists before starting
   mkdir -p /var/lib/jellos /var/log/jellos
   ```

4. **Temporarily Disable (Not Recommended for Production)**
   ```bash
   NODE_PERMISSIONS=false npm start
   ```

### Common Issues

#### "Cannot read file" errors
- **Cause**: File or directory not in allowed read paths
- **Solution**: Add path to `PROJECT_ROOTS` or verify it's in `COMMON_READ_PATHS`

#### "Cannot spawn command" errors
- **Cause**: `ALLOW_CHILD_PROCESS` is disabled or command path not readable
- **Solution**: Set `ALLOW_CHILD_PROCESS=true` and ensure binary path is readable

#### "Worker failed to start" errors
- **Cause**: `ALLOW_WORKER` is disabled
- **Solution**: Set `ALLOW_WORKER=true` (only if workers are needed)

### Debug Mode

To see detailed permission information:

```bash
# Enable debug logging
DEBUG=* npm start

# Check if permission model is active
node -e "console.log(process.permission)"
```

## Security Best Practices

### 1. Enable in Production
Always enable permission model in production environments:

```bash
NODE_ENV=production  # Auto-enables permissions
```

### 2. Principle of Least Privilege
Only grant permissions that are absolutely necessary:

```bash
# ✅ Good: Specific paths only
PROJECT_ROOTS=/app/dist,/var/lib/jellos

# ❌ Bad: Overly broad access
PROJECT_ROOTS=/,/home,/usr,/var
```

### 3. Regular Audits
Periodically review and minimize permissions:

```bash
# List current permission configuration
npm start | grep "Permission Model"
```

### 4. Test Security Behavior
Run tests with permissions enabled:

```bash
npm run test:permissions
```

### 5. Monitor for Permission Errors
Set up monitoring for `ERR_ACCESS_DENIED` errors in production:

```typescript
process.on('uncaughtException', (error) => {
  if (error.code === 'ERR_ACCESS_DENIED') {
    // Alert security team
    console.error('Permission violation detected:', error);
  }
});
```

## Advanced Configuration

### Custom Permission Profiles

Create custom profiles by extending existing ones:

```typescript
import { PERMISSION_PROFILES } from './lib/process/permission-profiles';

const customProfile = {
  ...PERMISSION_PROFILES.production,
  allowWorker: true,
  projectRoots: [
    ...PERMISSION_PROFILES.production.projectRoots,
    '/custom/path',
  ],
};
```

### Dynamic Path Configuration

Configure paths dynamically based on environment:

```typescript
import { getPermissionConfig } from './lib/process/permission-profiles';

const config = getPermissionConfig();

// Add runtime-determined paths
if (process.env.ADDITIONAL_PATHS) {
  config.projectRoots.push(...process.env.ADDITIONAL_PATHS.split(','));
}
```

### Integration with Agent Health Checks

The permission model is designed to work with agent health checks:

```typescript
import { safeSpawn } from './lib/process/safe-spawn';

// Health check with timeout and permission handling
async function checkAgentHealth(agentPath: string) {
  try {
    const result = await safeSpawn(agentPath, ['--version'], {
      timeout: 3000,
      cwd: '/project/path',
    });
    return result.exitCode === 0;
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      console.error('Agent health check blocked by permissions');
    }
    return false;
  }
}
```

## Testing

### Unit Tests

```bash
# Run permission profile tests
npm test permission-profiles.test.ts
```

### Integration Tests

```bash
# Run with permission model active
NODE_PERMISSIONS=true npm run test

# Run specific permission integration tests
npm test permission-integration.test.ts
```

### Manual Testing

```bash
# Test unauthorized access (should fail)
NODE_PERMISSIONS=true node -e "require('fs').readFileSync('/etc/shadow')"
# Expected: ERR_ACCESS_DENIED

# Test authorized access (should succeed)
NODE_PERMISSIONS=true PROJECT_ROOTS=$(pwd) node -e "require('fs').readFileSync('package.json')"
# Expected: Success
```

## Migration Guide

### Enabling Permissions in Existing Deployments

1. **Identify Required Paths**
   ```bash
   # Run in development and log all file access
   strace -e trace=file node dist/index.js 2>&1 | grep -E "(open|stat|access)"
   ```

2. **Create Permission Profile**
   ```bash
   # Based on identified paths
   export PROJECT_ROOTS="/app/dist,/var/lib/jellos"
   ```

3. **Test in Staging**
   ```bash
   NODE_ENV=staging NODE_PERMISSIONS=true npm start
   # Monitor for permission errors
   ```

4. **Deploy to Production**
   ```bash
   NODE_ENV=production npm start
   # Permission model auto-enabled
   ```

## References

- [Node.js Permission Model Documentation](https://nodejs.org/api/permissions.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [OWASP Node.js Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html)

## Support

For issues or questions:

1. Check this documentation
2. Review logs for permission errors
3. Run diagnostic: `npm start | grep "Permission"`
4. Consult Node.js permission documentation
5. Contact security team for production concerns
