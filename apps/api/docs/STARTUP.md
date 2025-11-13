# Server Startup Process

This document explains the complete server startup sequence for the Jellos API, with a focus on the environment variable injection pipeline and secret management.

## Startup Sequence

The server follows a strict initialization sequence to ensure all dependencies are properly configured before accepting requests:

### 1. Environment Variable Loading (Step 1)

**Location**: `/apps/api/src/index.ts:16-32`

The first step loads environment variables from `.env` files and injects secrets from Keychain/1Password.

```typescript
const envResult = await loadEnvironmentVariables({
  envFilePath: '.env',
  environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
  override: false,
  throwOnMissing: process.env.NODE_ENV === 'production',
  enableMasking: true,
});
```

**What happens**:
- Reads `.env` file (or `.env.production`, `.env.development`, etc.)
- Parses environment variables in dotenv-compatible format
- Resolves `${secret:KEY}` references using SecretManager
- Injects resolved secrets into Keychain/1Password
- Injects all variables into `process.env`
- Tracks secret values for masking in logs
- Returns statistics (loaded, failed, masked counts)

**Configuration Options**:
- `envFilePath`: Path to .env file (default: `.env`)
- `environment`: Namespace for secrets (`dev`, `staging`, `prod`, `test`)
- `override`: Whether to override existing `process.env` variables
- `throwOnMissing`: Whether to fail if secrets can't be resolved (recommended for production)
- `enableMasking`: Whether to enable automatic secret detection and masking

**Error Handling**:
- In development: Warnings are logged, but server continues
- In production: Missing secrets throw errors and prevent startup

### 2. Required Variable Validation (Step 2)

**Location**: `/apps/api/src/index.ts:34-42`

Validates that critical environment variables are present before proceeding.

```typescript
const requiredVars = ['PORT', 'DATABASE_URL'];
const validation = validateRequiredEnvVars(requiredVars);

if (!validation.valid) {
  throw new Error(
    `Missing required environment variables: ${validation.missing.join(', ')}`
  );
}
```

**Required Variables**:
- `PORT`: Server port (default: 3001)
- `DATABASE_URL`: PostgreSQL connection string

**Why This Matters**:
- Fails fast with clear error messages
- Prevents server from starting with incomplete configuration
- Saves debugging time by catching config issues early

### 3. Secret Masking Setup (Step 3)

**Location**: `/apps/api/src/index.ts:44-46`

Sets up automatic masking of secrets in console output.

```typescript
setupSecretMasking();
console.log('✓ Secret masking enabled');
```

**What happens**:
- Intercepts `console.log`, `console.error`, `console.warn`, `console.info`, `console.debug`
- Masks any tracked secret values before output
- Masks secrets in Error objects (message and stack trace)
- Deep masks secrets in nested objects

**Masking Format**:
```
Original: ghp_1234567890abcdefghijklmnopqrstuv
Masked:   ghp_********************
```

**Note**: This works alongside Pino logger's built-in redaction for double protection.

### 4. Permission Configuration (Step 4)

**Location**: `/apps/api/src/index.ts:48-51`

Displays and validates the permission model configuration for child processes.

```typescript
const permissionConfig = getPermissionConfig();
validatePermissionConfig(permissionConfig);
displayPermissionConfig(permissionConfig);
```

**See Also**: `PERMISSION_MODEL.md`, `PERMISSION_VALIDATION.md`

### 5. Application Build & Startup (Step 5)

**Location**: `/apps/api/src/index.ts:53-60`

Builds the Fastify application with all plugins and routes, then starts listening.

```typescript
const app = await buildApp();
const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '0.0.0.0';

await app.listen({ port, host });
```

**What happens in buildApp()**:
- Creates Fastify instance with structured logging
- Registers CORS
- Registers raw body plugin (for webhook signature verification)
- Registers system pressure plugin (for load shedding)
- Registers diagnostics plugin (for request tracing)
- Registers event hooks plugin (for state tracking)
- Registers SSE plugin (for real-time updates)
- Registers all route handlers
- Sets up global error handler

## Environment Variable Injection Pipeline

### Overview

The environment variable injection pipeline provides:
- **Secret Resolution**: Resolves `${secret:KEY}` references from Keychain/1Password
- **Template Parsing**: Parses .env files with dotenv-compatible syntax
- **Dynamic Injection**: Runtime injection into `process.env`
- **Secret Masking**: Automatic detection and masking of secrets in logs
- **Validation**: Pre-startup validation of required variables

### Secret Reference Syntax

In your `.env` file:

```bash
# Regular variables
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

# Secret references (resolved from Keychain/1Password)
DATABASE_URL=${secret:prod/DATABASE_URL}
GITHUB_TOKEN=${secret:prod/GITHUB_TOKEN}
LINEAR_API_KEY=${secret:prod/LINEAR_API_KEY}
REDIS_PASSWORD=${secret:prod/REDIS_PASSWORD}

# Simple reference (uses default environment)
API_KEY=${secret:API_KEY}
```

### Secret Providers

The SecretManager tries providers in priority order:

1. **macOS Keychain** (Priority: 3)
   - Service: `com.jellos.secret.<namespace>`
   - Account: `<key>`
   - Example: `security add-generic-password -s com.jellos.secret.prod -a DATABASE_URL -w "postgres://..."`

2. **1Password CLI** (Priority: 2)
   - Vault: `Jellos-<namespace>`
   - Reference: `op://Jellos-<namespace>/<key>/password`
   - Example: `op item create --vault=Jellos-prod --title=DATABASE_URL password="postgres://..."`

3. **Environment Variables** (Priority: 1, Fallback)
   - Format: `JELLOS_SECRET_<NAMESPACE>_<KEY>`
   - Example: `JELLOS_SECRET_PROD_DATABASE_URL="postgres://..."`

### Secret Detection Patterns

Secrets are automatically detected based on:

**Variable Names**: PASSWORD, SECRET, TOKEN, API_KEY, DATABASE_URL, etc.

**Value Patterns**:
- GitHub tokens: `ghp_*`, `ghs_*`, `github_pat_*`
- OpenAI keys: `sk-*`
- AWS keys: `AKIA*`
- Google API keys: `AIza*`
- JWTs: `eyJ*`
- Connection strings: `postgres://`, `mongodb://`, etc.
- Private keys: `-----BEGIN PRIVATE KEY-----`

### Logging & Monitoring

**Startup Logs**:
```
🔐 Loading environment variables...
✓ Loaded 15 variables, masked 8 secrets
✓ Secret masking enabled
🔐 Permission Configuration (production)
🚀 Server ready at http://0.0.0.0:3001
```

**Error Logs**:
```
🔐 Loading environment variables...
⚠️  Failed to load 2 variables
   - Failed to load .env file: ENOENT: no such file or directory
❌ Missing required environment variables: DATABASE_URL, GITHUB_TOKEN
```

**Statistics Available**:
- `envResult.loaded`: Number of variables loaded
- `envResult.failed`: Number that failed to load
- `envResult.masked`: Number of secrets masked
- `envResult.errors`: Array of error messages
- `envResult.variables`: Names of loaded variables

### Integration with .jellos.yml

When loading `.jellos.yml` configuration files, secrets are automatically injected:

```yaml
agents:
  - id: github-bot
    name: GitHub Bot
    command: gh-bot
    env:
      GITHUB_TOKEN: ${secret:prod/GITHUB_TOKEN}
      WEBHOOK_SECRET: ${secret:prod/WEBHOOK_SECRET}
```

The `loadProjectConfig()` function in `config-parser.ts` automatically calls `injectSecretsIntoConfig()` to resolve these references.

## Development vs Production

### Development Mode

```bash
npm run dev
```

**Characteristics**:
- Uses `dev` namespace for secrets
- `throwOnMissing: false` (warnings only)
- Continues startup even with missing secrets
- Secret masking enabled but less strict
- Uses `.env` or `.env.development`

### Production Mode

```bash
NODE_ENV=production npm start
```

**Characteristics**:
- Uses `prod` namespace for secrets
- `throwOnMissing: true` (fails fast)
- Stops startup if any required secret is missing
- Strict secret masking enabled
- Uses `.env.production`
- All console output is masked

## Security Considerations

### Secret Storage Best Practices

1. **Never commit secrets to git**: Use `.env.example` as a template
2. **Use appropriate namespaces**: Separate `dev`/`staging`/`prod` secrets
3. **Prefer Keychain/1Password**: Higher security than environment variables
4. **Rotate secrets regularly**: Update in provider, restart app
5. **Enable masking in production**: Always set `enableMasking: true`
6. **Validate before deployment**: Use `throwOnMissing: true` in production

### Secret Masking Layers

The system provides multiple layers of protection:

1. **Environment Variable Injection**: Detects and tracks secrets during loading
2. **Console Masking**: Intercepts console.* methods to mask secrets
3. **Error Masking**: Masks secrets in Error messages and stack traces
4. **Pino Logger Redaction**: Built-in field redaction in structured logs
5. **Object Deep Masking**: Recursively masks secrets in nested objects

### Audit Trail

All secret access is logged (without exposing values):

```typescript
const manager = await getDefaultSecretManager();
const logs = manager.getAccessLogs();

// Example log entry:
// {
//   key: 'GITHUB_TOKEN',
//   namespace: 'prod',
//   provider: 'keychain',
//   accessedAt: Date,
//   success: true,
// }
```

## Troubleshooting

### Server Won't Start

**Problem**: Server fails to start with environment variable errors.

**Solutions**:
1. Check `.env` file exists and is readable
2. Verify all required variables are set (see error message)
3. Check secret provider is available (Keychain/1Password)
4. Verify secrets exist in the provider
5. Check namespace matches environment (`dev` vs `prod`)

### Secrets Not Being Injected

**Problem**: `${secret:KEY}` appears as-is in environment.

**Solutions**:
1. Verify secret exists in provider: `security find-generic-password -s com.jellos.secret.dev -a KEY -w`
2. Check namespace is correct: `${secret:prod/KEY}` vs `${secret:dev/KEY}`
3. Ensure provider is available: Check startup logs for provider initialization
4. Try fallback provider: Set `JELLOS_SECRET_DEV_KEY` environment variable

### Secrets Appearing in Logs

**Problem**: Secrets are visible in console or log files.

**Solutions**:
1. Ensure `setupSecretMasking()` is called before any logging
2. Verify `enableMasking: true` in config
3. Check that the secret matches detection patterns
4. Manually track with `addTrackedSecret(value)`
5. Verify Pino logger redaction is configured

### Performance Issues

**Problem**: Startup is slow due to secret loading.

**Solutions**:
1. Enable SecretManager caching (default: 5 minutes)
2. Reduce number of secret references in .env
3. Use .env values as defaults instead of references
4. Pre-load secrets in deployment pipeline

## Files & References

### Core Files

- `/apps/api/src/index.ts` - Main startup script with environment loading
- `/apps/api/src/lib/secrets/env-loader.ts` - Environment variable injection implementation
- `/apps/api/src/lib/secrets/secret-manager.ts` - Secret provider orchestration
- `/apps/api/src/lib/secrets/parser.ts` - `${secret:KEY}` syntax parser
- `/apps/api/src/lib/secrets/config-integration.ts` - `.jellos.yml` integration

### Documentation

- `/apps/api/src/lib/secrets/README.md` - Secret Management System overview
- `/apps/api/src/lib/secrets/ENV_LOADER.md` - Environment loader documentation
- `/apps/api/src/lib/process/PERMISSION_MODEL.md` - Permission model documentation

### Configuration

- `.env` - Development environment variables (not committed)
- `.env.example` - Template for environment variables (committed)
- `.jellos.yml` - Project configuration with secret references

### Tests

- `/apps/api/src/lib/secrets/__tests__/env-loader.test.ts` - 34 test cases
- `/apps/api/src/lib/secrets/__tests__/secret-manager.test.ts` - Secret manager tests
- `/apps/api/src/lib/secrets/__tests__/parser.test.ts` - Parser tests

## Quick Reference

### Add a New Secret

```bash
# Store in Keychain (macOS)
security add-generic-password -s com.jellos.secret.dev -a MY_SECRET -w "secret-value"

# Or use 1Password CLI
op item create --vault=Jellos-dev --title=MY_SECRET password="secret-value"

# Or use environment variable (fallback)
export JELLOS_SECRET_DEV_MY_SECRET="secret-value"
```

### Use Secret in .env

```bash
# Add to .env file
MY_SECRET=${secret:dev/MY_SECRET}
```

### Use Secret in .jellos.yml

```yaml
agents:
  - id: my-agent
    env:
      MY_SECRET: ${secret:dev/MY_SECRET}
```

### Validate Startup

```bash
# Development
npm run dev

# Should see:
# 🔐 Loading environment variables...
# ✓ Loaded X variables, masked Y secrets
# ✓ Secret masking enabled
# 🚀 Server ready at http://0.0.0.0:3001
```

## Summary

The startup process ensures:

1. **Environment variables are loaded** with secret injection from secure providers
2. **Required variables are validated** before proceeding
3. **Secret masking is enabled** to protect sensitive data in logs
4. **Permission model is configured** for child process security
5. **Application starts** only when all prerequisites are met

This approach provides:
- **Fail-fast behavior** for configuration issues
- **Clear error messages** for debugging
- **Comprehensive security** through multiple masking layers
- **Audit trail** for secret access monitoring
- **Production-ready** deployment with strict validation
