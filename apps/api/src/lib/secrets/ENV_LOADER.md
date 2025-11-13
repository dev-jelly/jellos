# Environment Variable Injection Pipeline

A comprehensive pipeline for loading environment variables with secret injection and masking capabilities. Integrates with the existing Secret Management System to provide secure, dotenv-compatible environment variable loading.

## Features

### Core Capabilities

- **dotenv-Compatible**: Parses `.env` files with standard format
- **Secret Injection**: Resolves `${secret:KEY}` references using SecretManager
- **Dynamic Injection**: Runtime injection into `process.env`
- **Override Control**: Choose whether to override existing variables
- **Fallback Support**: `.env` file serves as fallback for secrets

### Security Features

- **Comprehensive Secret Masking**: Automatically detects and masks secrets
- **Pattern-Based Detection**: Recognizes common secret formats (API keys, tokens, JWTs)
- **Console Output Masking**: Intercepts console.log/error/warn to mask secrets
- **Error Message Masking**: Masks secrets in error messages and stack traces
- **Structured Log Integration**: Works with Pino logger redaction

### Validation & Monitoring

- **Required Variable Validation**: Ensure critical variables are present
- **Loading Statistics**: Track loaded, failed, and masked variables
- **Custom Pattern Support**: Add application-specific secret patterns

## Installation & Setup

### Basic Setup

```typescript
import { loadEnvironmentVariables, setupSecretMasking } from './lib/secrets';

// Load environment variables
await loadEnvironmentVariables({
  envFilePath: '.env',
  enableMasking: true,
});

// Setup console masking
setupSecretMasking();
```

### Application Startup (Recommended)

```typescript
import {
  loadEnvironmentVariables,
  validateRequiredEnvVars,
  setupSecretMasking
} from './lib/secrets';

async function initializeEnvironment() {
  // 1. Load variables with secrets
  const result = await loadEnvironmentVariables({
    envFilePath: '.env',
    environment: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
    override: false,
    throwOnMissing: true,
    enableMasking: true,
  });

  console.log(`Loaded ${result.loaded} variables, masked ${result.masked} secrets`);

  // 2. Validate required variables
  const required = ['DATABASE_URL', 'API_KEY', 'GITHUB_TOKEN'];
  const validation = validateRequiredEnvVars(required);

  if (!validation.valid) {
    throw new Error(`Missing: ${validation.missing.join(', ')}`);
  }

  // 3. Setup masking
  setupSecretMasking();

  console.log('Environment ready');
}
```

## Configuration

### EnvLoaderConfig

```typescript
interface EnvLoaderConfig {
  // Path to .env file (default: '.env')
  envFilePath?: string;

  // Environment namespace for secrets (default: 'dev')
  environment?: SecretEnvironment | string;

  // Override existing process.env variables (default: false)
  override?: boolean;

  // Throw error if secrets can't be loaded (default: false)
  throwOnMissing?: boolean;

  // Secret manager instance (optional, uses default)
  secretManager?: SecretManager;

  // Enable secret masking (default: true)
  enableMasking?: boolean;

  // Additional regex patterns for secret detection
  additionalSecretPatterns?: RegExp[];
}
```

### Default Configuration

```typescript
{
  envFilePath: '.env',
  environment: 'dev',
  override: false,
  throwOnMissing: false,
  enableMasking: true,
  additionalSecretPatterns: [],
}
```

## .env File Format

### Basic Format

```bash
# Comments start with #
NODE_ENV=production
PORT=3000

# Quoted values
API_ENDPOINT="https://api.example.com"
MESSAGE='Hello World'

# Secret references
GITHUB_TOKEN=${secret:prod/GITHUB_TOKEN}
DATABASE_URL=${secret:prod/DATABASE_URL}
```

### Secret References

Secret references use the `${secret:KEY}` or `${secret:NAMESPACE/KEY}` syntax:

```bash
# Simple reference (uses default environment)
API_KEY=${secret:API_KEY}

# Namespaced reference
PROD_TOKEN=${secret:prod/GITHUB_TOKEN}
DEV_TOKEN=${secret:dev/GITHUB_TOKEN}

# Mix with regular values
DATABASE_URL=${secret:prod/DATABASE_URL}
DATABASE_POOL_SIZE=10
```

## Secret Detection & Masking

### Automatic Detection

The system automatically detects secrets based on:

1. **Variable Name**: Names containing `PASSWORD`, `TOKEN`, `SECRET`, `API_KEY`, etc.
2. **Pattern Matching**: Common secret formats

### Built-in Patterns

The following patterns are automatically detected:

```typescript
// GitHub Tokens
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// OpenAI Keys
sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// AWS Keys
AKIAxxxxxxxxxxxxxxxx

// Google API Keys
AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// JWTs
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U

// Database URLs with passwords
postgresql://user:password@host/db
mongodb://user:password@host/db

// Private Keys
-----BEGIN PRIVATE KEY-----
-----BEGIN RSA PRIVATE KEY-----

// Generic patterns
password=xxxxxxxx
token=xxxxxxxx
secret=xxxxxxxx
api_key=xxxxxxxx
```

### Masking Format

Secrets are masked to show the first 4 characters followed by asterisks:

```
Original: ghp_1234567890abcdefghijklmnopqrstuv
Masked:   ghp_********************

Original: sk-proj-1234567890abcdefghijklmnopqrstuv
Masked:   sk-p********************

Original: my-secret-key-12345
Masked:   my-s********************
```

### Custom Patterns

Add your own secret patterns:

```typescript
const customPatterns = [
  /MYAPP-[A-Z0-9]{32}/, // Custom token format
  /proj_[a-z0-9]{40}/,  // Project keys
];

await loadEnvironmentVariables({
  envFilePath: '.env',
  enableMasking: true,
  additionalSecretPatterns: customPatterns,
});
```

## API Reference

### loadEnvironmentVariables()

Load and inject environment variables with secret resolution.

```typescript
async function loadEnvironmentVariables(
  config?: EnvLoaderConfig
): Promise<EnvLoadResult>
```

**Returns**: `EnvLoadResult`
```typescript
{
  loaded: number;    // Variables successfully loaded
  failed: number;    // Variables that failed
  masked: number;    // Secrets that were masked
  errors: string[];  // Error messages
  variables: string[]; // Names of loaded variables
}
```

### validateRequiredEnvVars()

Validate that required environment variables are present.

```typescript
function validateRequiredEnvVars(
  required: string[]
): { valid: boolean; missing: string[] }
```

**Example**:
```typescript
const { valid, missing } = validateRequiredEnvVars([
  'DATABASE_URL',
  'API_KEY',
]);

if (!valid) {
  console.error('Missing:', missing);
  process.exit(1);
}
```

### setupSecretMasking()

Setup secret masking for console output (log, error, warn, info, debug).

```typescript
function setupSecretMasking(): void
```

**Example**:
```typescript
setupSecretMasking();

// Now all console output will be masked
console.log('Token:', process.env.API_KEY);
// Output: Token: ghp_********************
```

### maskSecret()

Mask a single secret value.

```typescript
function maskSecret(value: string): string
```

**Example**:
```typescript
const token = 'ghp_1234567890abcdef';
console.log(maskSecret(token));
// Output: ghp_************
```

### maskSecretsInString()

Mask all tracked secrets in a string.

```typescript
function maskSecretsInString(text: string): string
```

**Example**:
```typescript
addTrackedSecret('ghp_secret123');
const text = 'GitHub token: ghp_secret123';
console.log(maskSecretsInString(text));
// Output: GitHub token: ghp_********
```

### getMaskedEnv()

Get a masked copy of process.env for safe logging.

```typescript
function getMaskedEnv(): Record<string, string>
```

**Example**:
```typescript
const maskedEnv = getMaskedEnv();
console.log('Environment:', maskedEnv);
// Secrets will be masked, regular values unchanged
```

### addTrackedSecret()

Manually track a secret value for masking.

```typescript
function addTrackedSecret(value: string): void
```

### clearTrackedSecrets()

Clear all tracked secrets.

```typescript
function clearTrackedSecrets(): void
```

### restoreConsole()

Restore original console methods (useful for testing).

```typescript
function restoreConsole(): void
```

## Integration Examples

### With Fastify

```typescript
import Fastify from 'fastify';
import { createLoggerConfig } from './lib/logger';
import { loadEnvironmentVariables, setupSecretMasking } from './lib/secrets';

async function createApp() {
  // Load environment first
  await loadEnvironmentVariables({
    envFilePath: '.env',
    enableMasking: true,
  });

  // Setup masking
  setupSecretMasking();

  // Create Fastify with logger
  const app = Fastify({
    logger: createLoggerConfig(),
  });

  // Secrets in logs will be automatically masked
  app.log.info({
    config: {
      database: process.env.DATABASE_URL // Masked
    }
  });

  return app;
}
```

### With Testing

```typescript
import { loadEnvironmentVariables, clearTrackedSecrets } from './lib/secrets';

describe('MyService', () => {
  beforeEach(async () => {
    clearTrackedSecrets();

    await loadEnvironmentVariables({
      envFilePath: '.env.test',
      environment: 'test',
      override: true,
      enableMasking: false, // Disable for easier debugging
    });
  });

  it('should work', () => {
    // Test with loaded environment
  });
});
```

### Environment-Specific Loading

```typescript
const nodeEnv = process.env.NODE_ENV || 'development';

const envFile = {
  production: '.env.production',
  staging: '.env.staging',
  development: '.env.development',
  test: '.env.test',
}[nodeEnv] || '.env';

const environment = {
  production: 'prod',
  staging: 'staging',
  development: 'dev',
  test: 'test',
}[nodeEnv] || 'dev';

await loadEnvironmentVariables({
  envFilePath: envFile,
  environment,
  enableMasking: nodeEnv === 'production',
});
```

## Security Best Practices

### 1. Always Enable Masking in Production

```typescript
await loadEnvironmentVariables({
  enableMasking: process.env.NODE_ENV === 'production',
});
```

### 2. Use Secret References in .env

```bash
# ❌ Bad: Secrets in .env file
GITHUB_TOKEN=ghp_1234567890

# ✅ Good: Secret references
GITHUB_TOKEN=${secret:prod/GITHUB_TOKEN}
```

### 3. Validate Required Variables

```typescript
const { valid, missing } = validateRequiredEnvVars([
  'DATABASE_URL',
  'API_KEY',
]);

if (!valid) {
  throw new Error(`Missing: ${missing.join(', ')}`);
}
```

### 4. Don't Log Raw Environment

```typescript
// ❌ Bad: Exposes secrets
console.log(process.env);

// ✅ Good: Use masked version
console.log(getMaskedEnv());
```

### 5. Setup Masking Early

```typescript
// Setup masking before any logging
setupSecretMasking();

// Now safe to log
console.log('Config:', process.env);
```

### 6. Use throwOnMissing in Production

```typescript
await loadEnvironmentVariables({
  throwOnMissing: process.env.NODE_ENV === 'production',
});
```

### 7. Rotate Secrets Regularly

Update secrets in Keychain/1Password, then reload:

```typescript
await loadEnvironmentVariables({
  override: true, // Override with new values
});
```

## Troubleshooting

### Secrets Not Being Masked

**Problem**: Secrets appear in logs unmasked.

**Solutions**:
1. Ensure `enableMasking: true` in config
2. Call `setupSecretMasking()` before any logging
3. Check that the secret matches detection patterns
4. Manually track with `addTrackedSecret()`

### Variables Not Loading

**Problem**: Environment variables not set in process.env.

**Solutions**:
1. Check .env file path is correct
2. Verify .env file format (KEY=value)
3. Set `override: true` if variables already exist
4. Check file permissions

### Secret References Not Resolved

**Problem**: `${secret:KEY}` appears as-is in environment.

**Solutions**:
1. Ensure SecretManager is initialized
2. Check secret exists in Keychain/1Password
3. Verify namespace is correct
4. Set `throwOnMissing: true` to see errors

### Performance Issues

**Problem**: Loading takes too long.

**Solutions**:
1. Enable SecretManager caching
2. Reduce number of secret references
3. Use .env values as fallback
4. Pre-load secrets in deployment

## Performance Considerations

- **Caching**: SecretManager caches resolved secrets (default: 5 minutes)
- **Pattern Matching**: Regex patterns run on all variable values
- **Console Interception**: Adds overhead to all console.log calls
- **Recommendation**: In production, use masking; in development, consider disabling for performance

## Migration Guide

### From dotenv

```typescript
// Before (dotenv)
import dotenv from 'dotenv';
dotenv.config();

// After (env-loader)
import { loadEnvironmentVariables } from './lib/secrets';
await loadEnvironmentVariables({
  envFilePath: '.env',
});
```

### From Manual Secret Loading

```typescript
// Before
process.env.API_KEY = await getSecretFromKeychain('API_KEY');

// After (.env file)
// API_KEY=${secret:API_KEY}

// Load with
await loadEnvironmentVariables();
```

## Testing

Run the test suite:

```bash
npm test src/lib/secrets/__tests__/env-loader.test.ts
```

Test coverage includes:
- .env file parsing
- Secret injection
- Masking functionality
- Pattern detection
- Console interception
- Validation
- Error handling

## License

Part of the Jellos project.
