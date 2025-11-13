# GitHub API Client Service

Comprehensive GitHub API client with built-in retry logic, circuit breaker, and rate limit handling.

## Features

- **Octokit REST API Integration**: Full-featured GitHub REST API client
- **Exponential Backoff Retry**: Automatic retry with exponential backoff and jitter
- **Circuit Breaker**: Fault tolerance with circuit breaker pattern
- **Rate Limit Handling**: Automatic rate limit detection and handling
- **Error Classification**: Smart error categorization (retryable vs non-retryable)
- **TypeScript Support**: Full type safety with TypeScript

## Installation

The client is already installed as part of the `@jellos/api` package. Dependencies:

```json
{
  "@octokit/rest": "^21.0.2"
}
```

## Configuration

### Environment Variables

```bash
# Required
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx  # Personal Access Token or GitHub App token
GITHUB_OWNER=your-username-or-org      # Default repository owner
GITHUB_REPO=your-repository-name       # Default repository name
```

### Programmatic Configuration

```typescript
import { GitHubClientService } from './services/github-client.service';

const client = new GitHubClientService({
  token: 'your-token',
  owner: 'your-owner',
  repo: 'your-repo',
  timeout: 30000, // 30 seconds (default)
  maxRetries: 3, // Max retry attempts (default)
  retryOptions: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    jitterMs: 500,
  },
  circuitBreakerOptions: {
    failureThreshold: 5,
    resetTimeoutMs: 60000, // 1 minute
  },
});
```

## Usage Examples

### Basic Operations

```typescript
import { getGitHubClient } from './services/github-client.service';

const client = getGitHubClient();

// Check if configured
if (client.isConfigured()) {
  console.log('GitHub client is ready');
}
```

### Search for Pull Requests

```typescript
// Search by issue number (in title or branch name)
const result = await client.searchPRsByIssue('123');
console.log(`Found ${result.count} PRs for issue #123`);
result.prs.forEach(pr => {
  console.log(`PR #${pr.number}: ${pr.title}`);
});

// Search by branch name
const branchPRs = await client.searchPRsByBranch('feature-branch');
if (branchPRs.exists) {
  console.log('PRs found for branch:', branchPRs.prs);
}
```

### Get Specific PR

```typescript
const pr = await client.getPR(456);
if (pr) {
  console.log(`PR #${pr.number}: ${pr.title}`);
  console.log(`State: ${pr.state}`);
  console.log(`Author: ${pr.user.login}`);
  console.log(`URL: ${pr.html_url}`);
}
```

### Check Branch Existence

```typescript
const exists = await client.branchExists('feature-branch');
console.log(`Branch exists: ${exists}`);
```

### Rate Limit Management

```typescript
// Get current rate limit
const rateLimit = await client.getRateLimit();
if (rateLimit) {
  console.log(`Remaining: ${rateLimit.remaining}/${rateLimit.limit}`);
  console.log(`Resets at: ${rateLimit.reset}`);
}

// Get cached rate limit info
const cached = client.getLastRateLimitInfo();

// Check if near rate limit
if (client.isNearRateLimit()) {
  console.warn('Approaching rate limit!');
}
```

### Circuit Breaker Status

```typescript
// Check circuit breaker state
const state = client.getCircuitBreakerState();
console.log(`Circuit breaker: ${state}`); // CLOSED, OPEN, or HALF_OPEN

// Reset circuit breaker manually
client.resetCircuitBreaker();
```

### Multi-Repository Operations

```typescript
// Override owner/repo for specific operations
const prs = await client.searchPRsByIssue('123', {
  owner: 'different-owner',
  repo: 'different-repo',
});

const pr = await client.getPR(456, {
  owner: 'another-owner',
  repo: 'another-repo',
});
```

## Error Handling

The client uses custom `GitHubApiError` for all GitHub API errors:

```typescript
import { GitHubApiError } from './services/github-client.service';

try {
  const pr = await client.getPR(123);
} catch (error) {
  if (error instanceof GitHubApiError) {
    console.error('GitHub API Error:', error.message);
    console.error('Status Code:', error.context?.statusCode);
    console.error('Operation:', error.context?.operation);
    console.error('Recoverable:', error.recoverable);

    // Check rate limit info if available
    if (error.context?.rateLimitRemaining !== undefined) {
      console.error('Rate Limit Remaining:', error.context.rateLimitRemaining);
      console.error('Rate Limit Reset:', error.context.rateLimitReset);
    }
  }
}
```

## Retry Behavior

The client automatically retries failed requests with exponential backoff:

### Retryable Errors
- Network errors (ETIMEDOUT, ECONNREFUSED, etc.)
- Server errors (5xx status codes)
- Rate limit errors (with automatic backoff)

### Non-Retryable Errors
- Authentication errors (401, 403)
- Not found errors (404)
- Validation errors (422)

### Retry Configuration

```typescript
const client = new GitHubClientService({
  token: 'your-token',
  retryOptions: {
    maxRetries: 3,           // Max attempts
    initialDelayMs: 1000,    // 1 second initial delay
    maxDelayMs: 10000,       // 10 seconds max delay
    jitterMs: 500,           // 0-500ms random jitter
  },
});
```

## Circuit Breaker

Prevents cascading failures by temporarily blocking requests after consecutive failures:

```typescript
const client = new GitHubClientService({
  token: 'your-token',
  circuitBreakerOptions: {
    failureThreshold: 5,      // Open after 5 failures
    resetTimeoutMs: 60000,    // Try again after 1 minute
  },
});
```

### Circuit States

1. **CLOSED**: Normal operation, requests pass through
2. **OPEN**: Too many failures, requests are blocked
3. **HALF_OPEN**: Testing if service recovered, limited requests allowed

## Singleton Pattern

The module exports singleton getter functions for convenience:

```typescript
import { getGitHubClient, resetGitHubClient } from './services/github-client.service';

// Get singleton instance
const client = getGitHubClient();

// Reset singleton (useful for testing or reconfiguration)
resetGitHubClient();

// Create new instance with custom config
const newClient = getGitHubClient({
  token: 'different-token',
});
```

## API Reference

### Class: `GitHubClientService`

#### Constructor

```typescript
constructor(config?: Partial<GitHubConfig>)
```

#### Methods

##### Configuration
- `isConfigured(): boolean` - Check if client is fully configured
- `updateConfig(config: Partial<GitHubConfig>): void` - Update configuration

##### Rate Limiting
- `getRateLimit(): Promise<RateLimitInfo | null>` - Fetch current rate limit
- `getLastRateLimitInfo(): RateLimitInfo | null` - Get cached rate limit
- `isNearRateLimit(): boolean` - Check if approaching rate limit

##### Pull Requests
- `searchPRsByIssue(issueNumber, options?): Promise<PRSearchResult>` - Search PRs by issue number
- `searchPRsByBranch(branchName, options?): Promise<PRSearchResult>` - Search PRs by branch
- `getPR(prNumber, options?): Promise<GitHubPR | null>` - Get specific PR

##### Repository
- `branchExists(branchName, options?): Promise<boolean>` - Check if branch exists

##### Circuit Breaker
- `getCircuitBreakerState(): string` - Get circuit breaker state
- `resetCircuitBreaker(): void` - Reset circuit breaker

## Testing

Comprehensive test suite available at `__tests__/github-client.service.test.ts`.

To run tests (after installing test framework):

```bash
# Install testing framework
npm install --save-dev vitest @vitest/ui

# Add test script to package.json
"test": "vitest run"

# Run tests
npm test
```

## Best Practices

1. **Always check configuration**: Use `isConfigured()` before operations
2. **Monitor rate limits**: Check rate limit regularly in long-running processes
3. **Handle circuit breaker**: Implement fallback logic when circuit is open
4. **Use singleton**: Prefer `getGitHubClient()` for consistent instance
5. **Override repos carefully**: Only override owner/repo when necessary

## Troubleshooting

### "Circuit breaker is OPEN, request blocked"
- Too many consecutive failures occurred
- Wait for `resetTimeoutMs` or call `resetCircuitBreaker()`
- Check GitHub API status and credentials

### "Rate limit exceeded"
- GitHub API rate limits reached
- Check `getRateLimit()` for reset time
- Consider using GitHub App with higher limits

### "GitHub client initialized without token"
- Set `GITHUB_TOKEN` environment variable
- Or provide token in constructor config

## Related Documentation

- [Octokit REST API Docs](https://octokit.github.io/rest.js/)
- [GitHub API Rate Limiting](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
