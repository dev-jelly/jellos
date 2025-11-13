/**
 * Examples for URL Template Engine
 *
 * This file demonstrates common usage patterns for the URL template engine.
 */

import { buildLink, buildLinkSimple, extractVariables, validateParams } from './url-template';

// Example 1: Basic GitHub Issue URL
export function githubIssueExample() {
  const result = buildLink('https://github.com/{owner}/{repo}/issues/{number}', {
    owner: 'facebook',
    repo: 'react',
    number: '25686',
  });

  console.log('GitHub Issue URL:', result.url);
  // Output: https://github.com/facebook/react/issues/25686
  console.log('Is Valid:', result.isValid);
  // Output: true
}

// Example 2: Linear Issue URL
export function linearIssueExample() {
  const url = buildLinkSimple('https://linear.app/{workspace}/issue/{issueKey}', {
    workspace: 'acme',
    issueKey: 'ENG-123',
  });

  console.log('Linear Issue URL:', url);
  // Output: https://linear.app/acme/issue/ENG-123
}

// Example 3: CI/CD Pipeline URL with proper encoding
export function ciPipelineExample() {
  const result = buildLink(
    'https://github.com/{owner}/{repo}/actions/runs/{runId}',
    {
      owner: 'vercel',
      repo: 'next.js',
      runId: '12345',
    }
  );

  console.log('CI/CD URL:', result.url);
  // Output: https://github.com/vercel/next.js/actions/runs/12345
}

// Example 4: Handling missing variables
export function missingVariablesExample() {
  const result = buildLink(
    'https://example.com/{foo}/{bar}/{baz}',
    {
      foo: 'test',
      bar: 'value',
      // baz is missing
    }
  );

  console.log('URL with missing variable:', result.url);
  // Output: https://example.com/test/value/
  console.log('Missing variables:', result.missingVariables);
  // Output: ['baz']
}

// Example 5: XSS prevention with special characters
export function xssPreventionExample() {
  const result = buildLink(
    'https://example.com/search?q={query}',
    {
      query: '<script>alert("xss")</script>',
    }
  );

  console.log('XSS-safe URL:', result.url);
  // Output: https://example.com/search?q=%3Cscript%3Ealert(%22xss%22)%3C%2Fscript%3E
  console.log('Special characters encoded safely!');
}

// Example 6: Complex search query with encoding
export function complexSearchExample() {
  const result = buildLink(
    'https://example.com/search?q={query}&filter={filter}',
    {
      query: 'React Hooks & Effects',
      filter: 'type:issue state:open',
    }
  );

  console.log('Search URL:', result.url);
  // Output: https://example.com/search?q=React%20Hooks%20%26%20Effects&filter=type%3Aissue%20state%3Aopen
}

// Example 7: Extract variables from template
export function extractVariablesExample() {
  const template = 'https://github.com/{owner}/{repo}/pull/{prNumber}';
  const vars = extractVariables(template);

  console.log('Template:', template);
  console.log('Required variables:', vars);
  // Output: ['owner', 'repo', 'prNumber']
}

// Example 8: Validate parameters before building
export function validateParamsExample() {
  const template = 'https://github.com/{owner}/{repo}/issues/{number}';
  const params = {
    owner: 'facebook',
    // Missing: repo, number
  };

  const validation = validateParams(template, params);

  if (!validation.valid) {
    console.log('Missing required parameters:', validation.missing);
    // Output: ['repo', 'number']
    return null;
  }

  return buildLinkSimple(template, params);
}

// Example 9: Using strict mode for validation
export function strictModeExample() {
  try {
    // This will throw because 'repo' is missing
    const url = buildLinkSimple(
      'https://github.com/{owner}/{repo}',
      { owner: 'facebook' },
      true // strict mode
    );
    console.log('URL:', url);
  } catch (error) {
    console.error('Validation failed:', error.message);
    // Output: Validation failed: Missing required variable: repo
  }
}

// Example 10: Deployment URL with environment
export function deploymentUrlExample() {
  const result = buildLink(
    'https://vercel.com/{team}/{project}/{environment}/deployments/{deploymentId}',
    {
      team: 'my-team',
      project: 'my-app',
      environment: 'production',
      deploymentId: 'dpl_abc123',
    }
  );

  console.log('Deployment URL:', result.url);
  // Output: https://vercel.com/my-team/my-app/production/deployments/dpl_abc123
  console.log('Substituted:', result.substitutedVariables);
  // Output: ['team', 'project', 'environment', 'deploymentId']
}

// Example 11: Using custom placeholder for missing vars
export function customPlaceholderExample() {
  const result = buildLink(
    'https://example.com/{foo}/{bar}',
    { foo: 'test' },
    { missingVariablePlaceholder: 'NOT_SET' }
  );

  console.log('URL with custom placeholder:', result.url);
  // Output: https://example.com/test/NOT_SET
}

// Example 12: Real-world .jellos.yml link configuration
export function jellosConfigExample() {
  const config = {
    links: {
      github: {
        issue: 'https://github.com/{owner}/{repo}/issues/{issueNumber}',
        pr: 'https://github.com/{owner}/{repo}/pull/{prNumber}',
        actions: 'https://github.com/{owner}/{repo}/actions/runs/{runId}',
      },
      linear: {
        issue: 'https://linear.app/{workspace}/issue/{issueKey}',
      },
      vercel: {
        deployment: 'https://vercel.com/{team}/{project}/deployments/{deploymentId}',
      },
    },
  };

  // Build a GitHub issue link
  const githubIssue = buildLinkSimple(
    config.links.github.issue,
    {
      owner: 'vercel',
      repo: 'next.js',
      issueNumber: '12345',
    }
  );

  // Build a Linear issue link
  const linearIssue = buildLinkSimple(
    config.links.linear.issue,
    {
      workspace: 'acme',
      issueKey: 'ENG-456',
    }
  );

  console.log('GitHub Issue:', githubIssue);
  // Output: https://github.com/vercel/next.js/issues/12345

  console.log('Linear Issue:', linearIssue);
  // Output: https://linear.app/acme/issue/ENG-456
}

// Run all examples
if (require.main === module) {
  console.log('=== URL Template Engine Examples ===\n');

  console.log('1. GitHub Issue URL:');
  githubIssueExample();
  console.log('\n');

  console.log('2. Linear Issue URL:');
  linearIssueExample();
  console.log('\n');

  console.log('3. CI/CD Pipeline URL:');
  ciPipelineExample();
  console.log('\n');

  console.log('4. Missing Variables:');
  missingVariablesExample();
  console.log('\n');

  console.log('5. XSS Prevention:');
  xssPreventionExample();
  console.log('\n');

  console.log('6. Complex Search:');
  complexSearchExample();
  console.log('\n');

  console.log('7. Extract Variables:');
  extractVariablesExample();
  console.log('\n');

  console.log('8. Validate Parameters:');
  validateParamsExample();
  console.log('\n');

  console.log('9. Strict Mode:');
  strictModeExample();
  console.log('\n');

  console.log('10. Deployment URL:');
  deploymentUrlExample();
  console.log('\n');

  console.log('11. Custom Placeholder:');
  customPlaceholderExample();
  console.log('\n');

  console.log('12. Jellos Config:');
  jellosConfigExample();
}
