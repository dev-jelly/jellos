# Secret Management System

A comprehensive secret management system for Jellos that integrates with macOS Keychain, 1Password CLI, and environment variables. Supports `${secret:KEY}` variable substitution in `.jellos.yml` configuration files.

## Features

- **Multiple Provider Support**: macOS Keychain, 1Password CLI, and environment variables
- **Priority-based Resolution**: Configure provider priority for secret lookups
- **Variable Substitution**: Use `${secret:KEY}` syntax in configuration files
- **Environment Namespaces**: Separate secrets by environment (dev, staging, prod, test)
- **Access Logging**: Track all secret access attempts for security auditing
- **Caching**: Optional caching to reduce provider calls
- **Validation**: Pre-validate configurations to ensure all secrets are available
- **Type-safe**: Full TypeScript support with comprehensive types

## Usage

### Basic Usage

```typescript
import { getDefaultSecretManager } from './lib/secrets';

// Initialize the secret manager
const secretManager = await getDefaultSecretManager();

// Get a secret
const result = await secretManager.getSecret('API_KEY', 'prod');
if (result.resolved) {
  console.log('Secret value:', result.value);
  console.log('Provider:', result.provider);
}
```

### Configuration File Integration

In your `.jellos.yml` file:

```yaml
agents:
  - id: my-agent
    name: My Agent
    command: my-command
    env:
      API_KEY: ${secret:API_KEY}
      DB_PASSWORD: ${secret:prod/DB_PASSWORD}
      WEBHOOK_URL: ${secret:dev/WEBHOOK_URL}
```

The secrets will be automatically injected when the configuration is loaded:

```typescript
import { loadProjectConfig } from './lib/agent-discovery/config-parser';

// Secrets are automatically injected
const config = await loadProjectConfig('/path/to/project');
// config.agents[0].env.API_KEY will contain the actual secret value
```

### Secret Reference Syntax

- Simple key: `${secret:API_KEY}`
- Namespaced key: `${secret:prod/API_KEY}`
- Environment-specific: `${secret:dev/DATABASE_URL}`, `${secret:staging/API_KEY}`

### Manual Secret Injection

```typescript
import { getDefaultSecretManager } from './lib/secrets';

const manager = await getDefaultSecretManager();

// Inject into string
const text = 'API_KEY=${secret:MY_KEY}';
const result = await manager.injectSecrets(text);
// result: 'API_KEY=actual-secret-value'

// Inject into object
const config = {
  database: {
    password: '${secret:DB_PASSWORD}',
  },
};
const injected = await manager.injectSecretsIntoObject(config);
// injected.database.password contains the actual secret
```

### Validation

```typescript
import { getDefaultSecretManager } from './lib/secrets';

const manager = await getDefaultSecretManager();

// Validate configuration
const errors = await manager.validateSecrets('${secret:MISSING_KEY}');
if (errors.length > 0) {
  console.error('Missing secrets:', errors);
}
```

## Secret Providers

### 1. macOS Keychain Provider

**Priority**: 3 (Highest)
**Available on**: macOS only

Stores secrets in the macOS Keychain using the `security` command.

**Service Name Format**: `com.jellos.secret.<namespace>`
**Account Name**: The secret key

**Example**:
```bash
# Store a secret
security add-generic-password -s com.jellos.secret.prod -a API_KEY -w "my-secret-value"

# Retrieve a secret
security find-generic-password -s com.jellos.secret.prod -a API_KEY -w
```

### 2. 1Password CLI Provider

**Priority**: 2
**Available on**: All platforms (requires `op` CLI)

Integrates with 1Password using the `op` CLI tool.

**Vault Format**: `Jellos-<namespace>`
**Reference Format**: `op://Jellos-<namespace>/<key>/password`

**Setup**:
```bash
# Install 1Password CLI
brew install --cask 1password-cli

# Sign in
op signin

# Store a secret
op item create --category=password --vault=Jellos-prod --title=API_KEY password="my-secret-value"
```

### 3. Environment Variable Provider

**Priority**: 1 (Lowest - Fallback)
**Available on**: All platforms

Uses environment variables as a fallback provider.

**Format**: `JELLOS_SECRET_<NAMESPACE>_<KEY>`

**Example**:
```bash
export JELLOS_SECRET_PROD_API_KEY="my-secret-value"
export JELLOS_SECRET_DEV_DATABASE_URL="postgresql://localhost/db"
```

## Configuration

### Secret Manager Configuration

```typescript
import { createSecretManager, SecretProviderType } from './lib/secrets';

const manager = await createSecretManager({
  providers: [
    { type: SecretProviderType.KEYCHAIN, priority: 3, enabled: true },
    { type: SecretProviderType.ONE_PASSWORD, priority: 2, enabled: true },
    { type: SecretProviderType.ENV, priority: 1, enabled: true },
  ],
  defaultEnvironment: 'dev', // or 'staging', 'prod', 'test'
  enableLogging: true,
  throwOnMissing: false, // Set to true to throw errors on missing secrets
  cacheTimeout: 300, // Cache timeout in seconds (0 = no cache)
});
```

### Environment Namespaces

Pre-defined namespaces:
- `dev` - Development environment
- `staging` - Staging environment
- `prod` - Production environment
- `test` - Test environment

You can also use custom namespaces in the `${secret:namespace/KEY}` syntax.

## Access Logging

All secret access attempts are logged for security auditing:

```typescript
const manager = await getDefaultSecretManager();

await manager.getSecret('API_KEY', 'prod');

// Get access logs
const logs = manager.getAccessLogs();
console.log(logs);
// [
//   {
//     key: 'API_KEY',
//     namespace: 'prod',
//     provider: 'keychain',
//     accessedAt: Date,
//     success: true,
//   }
// ]

// Clear logs
manager.clearAccessLogs();
```

## Caching

Enable caching to reduce provider calls:

```typescript
const manager = await createSecretManager({
  cacheTimeout: 300, // 5 minutes
});

// First call hits the provider
await manager.getSecret('KEY', 'prod');

// Second call uses cache
await manager.getSecret('KEY', 'prod');

// Clear cache manually
manager.clearCache();
```

## Security Best Practices

1. **Never commit secrets to version control**: Always use secret management
2. **Use appropriate namespaces**: Separate dev/staging/prod secrets
3. **Enable logging**: Monitor secret access for security auditing
4. **Use highest priority provider**: Prefer Keychain/1Password over environment variables
5. **Rotate secrets regularly**: Update secrets in the provider
6. **Validate before deployment**: Use `validateSecrets()` to catch missing secrets early

## API Reference

### SecretManager

#### Methods

- `initialize()`: Initialize the secret manager and discover available providers
- `getSecret(key, namespace?)`: Get a secret value
- `injectSecrets(text)`: Replace secret references in text
- `injectSecretsIntoObject(obj)`: Replace secret references in object (deep)
- `validateSecrets(text)`: Validate all secret references in text
- `validateSecretsInObject(obj)`: Validate secret references in object
- `getAccessLogs()`: Get all access logs
- `clearAccessLogs()`: Clear access logs
- `clearCache()`: Clear secret cache
- `getProviders()`: Get list of available providers

### Parser Functions

- `findSecretReferences(text)`: Find all `${secret:KEY}` references
- `hasSecretReferences(text)`: Check if text contains secret references
- `parseSecretReference(ref)`: Parse a secret reference string
- `validateSecretReference(ref)`: Validate secret reference format
- `extractUniqueSecretKeys(text)`: Extract unique secret keys from text

### Config Integration

- `injectSecretsIntoConfig(config)`: Inject secrets into JellosConfig
- `injectSecretsIntoAgentConfig(agentConfig)`: Inject secrets into agent config
- `validateConfigSecrets(config)`: Validate all secrets in config
- `configHasSecrets(config)`: Check if config contains secrets

## Testing

Run the test suite:

```bash
npm test src/lib/secrets
```

The test suite includes:
- Parser tests (25 tests)
- Secret manager tests (19 tests)
- Provider tests (13 tests)

## File Structure

```
src/lib/secrets/
├── index.ts                    # Main exports
├── types.ts                    # TypeScript types
├── parser.ts                   # Secret reference parser
├── secret-manager.ts           # Main secret manager
├── config-integration.ts       # Config integration utilities
├── providers/
│   ├── keychain.provider.ts    # macOS Keychain provider
│   ├── 1password.provider.ts   # 1Password CLI provider
│   └── env.provider.ts         # Environment variable provider
└── __tests__/
    ├── parser.test.ts
    ├── secret-manager.test.ts
    └── providers.test.ts
```

## Example: Complete Workflow

```typescript
// 1. Store secrets in Keychain (one-time setup)
// Run in terminal:
// security add-generic-password -s com.jellos.secret.prod -a GITHUB_TOKEN -w "ghp_xxx"

// 2. Create .jellos.yml
const config = `
agents:
  - id: github-bot
    name: GitHub Bot
    command: github-bot
    env:
      GITHUB_TOKEN: \${secret:prod/GITHUB_TOKEN}
      WEBHOOK_SECRET: \${secret:prod/WEBHOOK_SECRET}
`;

// 3. Load and use configuration
import { loadProjectConfig } from './lib/agent-discovery/config-parser';

const jellosConfig = await loadProjectConfig('/path/to/project');

// Secrets are automatically injected
console.log(jellosConfig.agents[0].env.GITHUB_TOKEN); // Actual token value

// 4. Monitor access
import { getDefaultSecretManager } from './lib/secrets';

const manager = await getDefaultSecretManager();
const logs = manager.getAccessLogs();
console.log('Secret accesses:', logs);
```

## Environment Variable Injection Pipeline

The Secret Management System includes a comprehensive environment variable injection pipeline that:

- Loads `.env` files with dotenv-compatible format
- Resolves `${secret:KEY}` references automatically
- Injects secrets into `process.env` at runtime
- Masks secrets in console output, logs, and error messages
- Validates required environment variables
- Detects secrets using pattern matching

See [ENV_LOADER.md](./ENV_LOADER.md) for complete documentation.

### Quick Start

```typescript
import { loadEnvironmentVariables, setupSecretMasking } from './lib/secrets';

// Load environment variables with secrets
await loadEnvironmentVariables({
  envFilePath: '.env',
  enableMasking: true,
});

// Setup console masking
setupSecretMasking();

// Now safe to use process.env - secrets will be masked in output
console.log('Config:', process.env);
```

### .env File Format

```bash
# Regular variables
NODE_ENV=production
PORT=3000

# Secret references (resolved from Keychain/1Password)
GITHUB_TOKEN=${secret:prod/GITHUB_TOKEN}
DATABASE_URL=${secret:prod/DATABASE_URL}
API_KEY=${secret:prod/API_KEY}
```

For complete documentation, see [ENV_LOADER.md](./ENV_LOADER.md).

## Troubleshooting

### macOS Keychain not working

- Ensure you're on macOS
- Check that `security` command is available: `which security`
- Verify secrets exist: `security find-generic-password -s com.jellos.secret.dev -a MY_KEY -w`

### 1Password CLI not working

- Install 1Password CLI: `brew install --cask 1password-cli`
- Sign in: `op signin`
- Verify access: `op account list`

### Environment variables not working

- Check variable name format: `JELLOS_SECRET_<NAMESPACE>_<KEY>`
- Verify variable is set: `echo $JELLOS_SECRET_DEV_MY_KEY`
- Ensure namespace and key match (case-sensitive after normalization)

### Secrets not being injected

- Check secret reference syntax: `${secret:KEY}` or `${secret:namespace/KEY}`
- Validate secrets: `await manager.validateSecrets(text)`
- Check provider availability: `manager.getProviders()`
- Enable logging to see which provider is being used

## License

Part of the Jellos project.
