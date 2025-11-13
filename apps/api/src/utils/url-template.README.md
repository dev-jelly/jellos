# URL Template Engine

A lightweight, Mustache-lite style template engine for building URLs with parameter substitution. Features variable replacement, URL validation, and XSS prevention.

## Features

- **Simple variable substitution** - Use `{variableName}` syntax
- **XSS prevention** - Automatic encoding of special characters
- **URL validation** - Validates protocol and URL structure
- **Flexible error handling** - Graceful handling of missing variables
- **TypeScript support** - Full type definitions included
- **Zero dependencies** - Uses only Node.js built-in URL APIs

## Installation

This module is part of the `@jellos/api` package and can be imported directly:

```typescript
import { buildLink, buildLinkSimple } from '@/utils/url-template';
```

## Quick Start

```typescript
import { buildLink } from '@/utils/url-template';

// Basic usage
const result = buildLink('https://github.com/{owner}/{repo}/issues/{number}', {
  owner: 'facebook',
  repo: 'react',
  number: '123',
});

console.log(result.url);
// Output: https://github.com/facebook/react/issues/123
```

## API Reference

### `buildLink(template, params, options?)`

Builds a URL from a template by substituting variables.

**Parameters:**
- `template` (string) - Template string with `{variable}` placeholders
- `params` (Record<string, string>) - Object containing variable values
- `options` (BuildLinkOptions, optional) - Configuration options

**Returns:** `BuildLinkResult`
- `url` (string) - The final URL string
- `isValid` (boolean) - Whether the URL is valid
- `missingVariables` (string[]) - List of missing variables
- `substitutedVariables` (string[]) - List of substituted variables

**Options:**
```typescript
interface BuildLinkOptions {
  validate?: boolean;                    // Validate final URL (default: true)
  encodeValues?: boolean;                // Encode parameter values (default: true)
  missingVariablePlaceholder?: string;   // Placeholder for missing vars (default: '')
  throwOnMissing?: boolean;              // Throw on missing variables (default: false)
}
```

### `buildLinkSimple(template, params, strict?)`

Convenience function that returns just the URL string.

**Parameters:**
- `template` (string) - Template string
- `params` (Record<string, string>) - Parameters
- `strict` (boolean, optional) - If true, throws on validation failure or missing vars

**Returns:** `string` - The built URL

**Throws:**
- `MissingVariablesError` - If strict mode and variables are missing
- `URLValidationError` - If strict mode and URL is invalid

### `extractVariables(template)`

Extracts all variable names from a template.

**Parameters:**
- `template` (string) - Template string to analyze

**Returns:** `string[]` - Array of variable names

**Example:**
```typescript
extractVariables('https://github.com/{owner}/{repo}');
// Returns: ['owner', 'repo']
```

### `validateParams(template, params)`

Validates that all required variables are present in params.

**Parameters:**
- `template` (string) - Template string
- `params` (Record<string, string>) - Parameters to validate

**Returns:** `{ valid: boolean; missing: string[] }`

**Example:**
```typescript
const result = validateParams(
  'https://github.com/{owner}/{repo}',
  { owner: 'facebook' }
);
// Returns: { valid: false, missing: ['repo'] }
```

## Usage Examples

### Basic Variable Substitution

```typescript
const result = buildLink('https://example.com/{page}', {
  page: 'home',
});
// Result: https://example.com/home
```

### Multiple Variables

```typescript
const url = buildLinkSimple(
  'https://linear.app/{workspace}/issue/{issueKey}',
  {
    workspace: 'acme',
    issueKey: 'ENG-123',
  }
);
// Output: https://linear.app/acme/issue/ENG-123
```

### Handling Missing Variables

```typescript
const result = buildLink('https://example.com/{foo}/{bar}', {
  foo: 'test',
  // bar is missing
});

console.log(result.url);
// Output: https://example.com/test/

console.log(result.missingVariables);
// Output: ['bar']
```

### Custom Placeholder for Missing Variables

```typescript
const result = buildLink(
  'https://example.com/{foo}/{bar}',
  { foo: 'test' },
  { missingVariablePlaceholder: 'MISSING' }
);
// Output: https://example.com/test/MISSING
```

### XSS Prevention

```typescript
const result = buildLink('https://example.com/search?q={query}', {
  query: '<script>alert("xss")</script>',
});

console.log(result.url);
// Output: https://example.com/search?q=%3Cscript%3Ealert(%22xss%22)%3C%2Fscript%3E
```

### Strict Mode Validation

```typescript
try {
  const url = buildLinkSimple(
    'https://github.com/{owner}/{repo}',
    { owner: 'facebook' },
    true // strict mode
  );
} catch (error) {
  console.error('Validation failed:', error.message);
  // Output: Missing required variable: repo
}
```

### Query Parameters and Special Characters

```typescript
const result = buildLink(
  'https://example.com/search?q={query}&filter={filter}',
  {
    query: 'React Hooks & Effects',
    filter: 'type:issue state:open',
  }
);
// Output: https://example.com/search?q=React%20Hooks%20%26%20Effects&filter=type%3Aissue%20state%3Aopen
```

### Variable Validation Before Building

```typescript
const template = 'https://github.com/{owner}/{repo}/issues/{number}';
const params = { owner: 'facebook' };

const validation = validateParams(template, params);

if (!validation.valid) {
  console.log('Missing:', validation.missing);
  // Output: Missing: ['repo', 'number']
} else {
  const url = buildLinkSimple(template, params);
}
```

## Real-World Integration

### .jellos.yml Configuration

```yaml
links:
  github:
    issue: https://github.com/{owner}/{repo}/issues/{issueNumber}
    pr: https://github.com/{owner}/{repo}/pull/{prNumber}
    actions: https://github.com/{owner}/{repo}/actions/runs/{runId}
  linear:
    issue: https://linear.app/{workspace}/issue/{issueKey}
  vercel:
    deployment: https://vercel.com/{team}/{project}/deployments/{deploymentId}
```

### Usage in Application

```typescript
import { buildLinkSimple } from '@/utils/url-template';

// Load configuration
const config = loadJellosConfig();

// Build links dynamically
function getGitHubIssueUrl(owner: string, repo: string, issueNumber: string) {
  return buildLinkSimple(config.links.github.issue, {
    owner,
    repo,
    issueNumber,
  });
}

function getLinearIssueUrl(workspace: string, issueKey: string) {
  return buildLinkSimple(config.links.linear.issue, {
    workspace,
    issueKey,
  });
}

// Use in your application
const githubUrl = getGitHubIssueUrl('vercel', 'next.js', '12345');
// Output: https://github.com/vercel/next.js/issues/12345

const linearUrl = getLinearIssueUrl('acme', 'ENG-456');
// Output: https://linear.app/acme/issue/ENG-456
```

## Variable Naming Rules

Variables must follow these rules:
- Alphanumeric characters (a-z, A-Z, 0-9)
- Underscores (_)
- Hyphens (-)
- Dots (.) for nested notation

**Valid variable names:**
- `{owner}`
- `{repo_name}`
- `{user-id}`
- `{user.name}`

**Invalid variable names:**
- `{not valid}` (contains space)
- `{invalid!}` (contains special character)

## Security

### XSS Prevention

All parameter values are automatically encoded using `encodeURIComponent()` by default, which prevents XSS attacks by encoding special characters like `<`, `>`, `&`, `"`, `'`, etc.

### Protocol Validation

The URL validator rejects dangerous protocols:
- `javascript:`
- `data:`
- `vbscript:`
- `file:`

Only `http:` and `https:` protocols are allowed.

### Input Validation

- All inputs are validated before URL construction
- Missing variables are tracked and reported
- Invalid URLs are detected and flagged

## Error Handling

### Missing Variables

By default, missing variables are replaced with an empty string. You can customize this behavior:

```typescript
// Use custom placeholder
buildLink(template, params, {
  missingVariablePlaceholder: 'MISSING',
});

// Throw on missing variables
buildLink(template, params, {
  throwOnMissing: true,
});
```

### Invalid URLs

By default, invalid URLs are flagged in the result but don't throw. Use strict mode to throw:

```typescript
buildLinkSimple(template, params, true); // throws on invalid URL
```

## Testing

The URL template engine includes comprehensive tests covering:
- Basic functionality (56 tests)
- Variable substitution patterns
- Missing variable handling
- XSS prevention
- URL validation
- Edge cases
- Real-world examples

Run tests:
```bash
pnpm test url-template
```

## Performance

- Zero external dependencies
- Minimal regex operations
- Built-in URL validation
- No complex parsing required

## License

MIT

## See Also

- [url-template.examples.ts](./url-template.examples.ts) - Comprehensive examples
- [__tests__/url-template.test.ts](./__tests__/url-template.test.ts) - Test suite
