# Agent Discovery & Config Parser

This module handles agent discovery and configuration parsing for the Jellos platform.

## Links Section Configuration

The `.jellos.yml` file supports a `links` section for configuring external tool URL templates.

### Supported Providers

- **github**: GitHub repository links
- **linear**: Linear issue tracker links
- **jenkins**: Jenkins CI/CD links
- **githubActions**: GitHub Actions workflow links
- **deployment**: Deployment environment links

### Configuration Structure

```yaml
links:
  github:
    baseUrl: "https://github.com/org/repo"
    prTemplate: "{baseUrl}/pull/{number}"
    commitTemplate: "{baseUrl}/commit/{sha}"
    fileTemplate: "{baseUrl}/blob/{branch}/{path}"
    blameTemplate: "{baseUrl}/blame/{branch}/{path}"
    diffTemplate: "{baseUrl}/compare/{base}...{head}"

  linear:
    baseUrl: "https://linear.app/workspace"
    issueTemplate: "{baseUrl}/issue/{id}"
    workspaceUrl: "https://linear.app/workspace"

  jenkins:
    baseUrl: "https://jenkins.example.com"
    pipelineTemplate: "{baseUrl}/job/{jobName}/{buildNumber}"
    jobTemplate: "{baseUrl}/job/{jobName}"

  githubActions:
    baseUrl: "https://github.com/org/repo"
    pipelineTemplate: "{baseUrl}/actions/runs/{runId}"
    jobTemplate: "{baseUrl}/actions/workflows/{workflowId}"

  deployment:
    deploymentTemplate: "https://preview-{branch}.example.com"
```

### Template Variables

Templates support variable substitution using `{variableName}` syntax:

- **GitHub**: `{baseUrl}`, `{number}`, `{sha}`, `{branch}`, `{path}`, `{base}`, `{head}`
- **Linear**: `{baseUrl}`, `{id}`
- **Jenkins**: `{baseUrl}`, `{jobName}`, `{buildNumber}`
- **GitHub Actions**: `{baseUrl}`, `{runId}`, `{workflowId}`
- **Deployment**: `{branch}`, custom variables

### Validation Rules

1. **baseUrl is required** for all providers except `deployment`
2. All template fields must be strings if provided
3. Templates can contain any URL-safe characters
4. Invalid configurations will be removed and logged as warnings

### Usage Example

```typescript
import { parseConfigFile, getLinksConfig } from './config-parser';

// Parse configuration file
const config = await parseConfigFile('/path/to/.jellos.yml');

// Get validated links configuration
const links = getLinksConfig(config);

if (links?.github) {
  // Use GitHub links
  const prUrl = links.github.prTemplate.replace('{baseUrl}', links.github.baseUrl)
                                        .replace('{number}', '123');
  console.log(prUrl); // https://github.com/org/repo/pull/123
}
```

### Error Handling

The parser handles several error cases gracefully:

1. **Missing file**: Returns empty config
2. **Invalid YAML**: Throws descriptive error
3. **Invalid links section**: Removes invalid section and logs warning
4. **Missing required fields**: Validates and logs errors

### API Functions

#### `parseConfigFile(filePath: string): Promise<JellosConfig>`

Parses a `.jellos.yml` file and returns validated configuration.

#### `validateLinkTemplate(template: any, provider: string): boolean`

Validates a single link template structure.

#### `validateLinksConfig(config: JellosConfig): { valid: boolean; errors: string[] }`

Validates entire links configuration and returns validation result.

#### `getLinksConfig(config: JellosConfig): LinksConfig | null`

Extracts and validates links configuration, returns null if invalid.

### Testing

See `__tests__/config-parser.test.ts` for comprehensive test coverage including:

- Valid template parsing
- Invalid template rejection
- YAML parsing error handling
- Edge cases and special characters
- Provider-specific validation

### Hot Reload Support

The configuration parser supports hot reload by re-parsing the config file on demand. To implement hot reload in your service:

```typescript
import { watch } from 'fs/promises';
import { parseConfigFile } from './config-parser';

let currentConfig: JellosConfig;

// Watch for changes
const watcher = watch('.jellos.yml');
for await (const event of watcher) {
  if (event.eventType === 'change') {
    currentConfig = await parseConfigFile('.jellos.yml');
    console.log('Configuration reloaded');
  }
}
```

## Type Definitions

See `../../types/agent.ts` for complete type definitions:

- `JellosConfig`: Complete configuration structure
- `LinksConfig`: Links section structure
- `LinkTemplate`: Individual provider template structure
