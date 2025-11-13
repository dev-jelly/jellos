/**
 * URL Template Engine
 *
 * Mustache-lite style template engine for building URLs with parameter substitution.
 * Supports variable substitution, URL validation, and XSS prevention.
 *
 * @example
 * ```ts
 * const url = buildLink('https://github.com/{owner}/{repo}/issues/{number}', {
 *   owner: 'facebook',
 *   repo: 'react',
 *   number: '123'
 * });
 * // Result: 'https://github.com/facebook/react/issues/123'
 * ```
 */

/**
 * Options for URL template building
 */
export interface BuildLinkOptions {
  /**
   * Whether to validate the final URL
   * @default true
   */
  validate?: boolean;

  /**
   * Whether to encode parameter values for URL safety
   * @default true
   */
  encodeValues?: boolean;

  /**
   * Placeholder for missing variables
   * @default ''
   */
  missingVariablePlaceholder?: string;

  /**
   * Whether to throw on missing variables
   * @default false
   */
  throwOnMissing?: boolean;
}

/**
 * Result of URL template building
 */
export interface BuildLinkResult {
  /**
   * The final URL string
   */
  url: string;

  /**
   * Whether the URL is valid
   */
  isValid: boolean;

  /**
   * List of missing variables that were encountered
   */
  missingVariables: string[];

  /**
   * List of variables that were successfully substituted
   */
  substitutedVariables: string[];
}

/**
 * Error thrown when URL validation fails
 */
export class URLValidationError extends Error {
  constructor(message: string, public readonly url: string) {
    super(message);
    this.name = 'URLValidationError';
  }
}

/**
 * Error thrown when required variables are missing
 */
export class MissingVariablesError extends Error {
  constructor(
    message: string,
    public readonly missingVariables: string[]
  ) {
    super(message);
    this.name = 'MissingVariablesError';
  }
}

/**
 * Encodes a parameter value for safe use in URLs
 * Prevents XSS attacks by properly encoding special characters
 *
 * @param value - The value to encode
 * @returns Encoded value safe for URL usage
 */
function encodeParameterValue(value: string): string {
  // Use encodeURIComponent for XSS prevention
  // This will encode special characters like <, >, &, ", ', etc.
  return encodeURIComponent(value);
}

/**
 * Validates a URL string
 *
 * @param url - The URL to validate
 * @returns true if valid, false otherwise
 */
function isValidURL(url: string): boolean {
  try {
    const urlObj = new URL(url);

    // Additional validation: must be http or https
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }

    // Prevent javascript: protocol and other XSS vectors
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
    if (dangerousProtocols.some(proto => url.toLowerCase().startsWith(proto))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Builds a URL from a template string by substituting variables
 *
 * Template variables are specified using {variableName} syntax.
 * Supports nested braces and special characters with proper encoding.
 *
 * @param template - Template string with {variable} placeholders
 * @param params - Object containing variable values
 * @param options - Configuration options
 * @returns Result object containing the built URL and metadata
 *
 * @example
 * ```ts
 * // Basic usage
 * buildLink('https://github.com/{owner}/{repo}', {
 *   owner: 'facebook',
 *   repo: 'react'
 * });
 *
 * // With missing variables
 * buildLink('https://example.com/{foo}/{bar}', { foo: 'test' });
 * // Missing: bar
 *
 * // With XSS prevention
 * buildLink('https://example.com/search?q={query}', {
 *   query: '<script>alert("xss")</script>'
 * });
 * // Result: https://example.com/search?q=%3Cscript%3Ealert(%22xss%22)%3C%2Fscript%3E
 * ```
 */
export function buildLink(
  template: string,
  params: Record<string, string>,
  options: BuildLinkOptions = {}
): BuildLinkResult {
  const {
    validate = true,
    encodeValues = true,
    missingVariablePlaceholder = '',
    throwOnMissing = false,
  } = options;

  const missingVariables: string[] = [];
  const substitutedVariables: string[] = [];

  // Regular expression to match {variable} patterns
  // Supports alphanumeric characters, underscores, hyphens, and dots
  // This allows for nested object notation like {user.name} if needed
  const variablePattern = /\{([a-zA-Z0-9_\-\.]+)\}/g;

  // Replace all variables in the template
  const url = template.replace(variablePattern, (match, variableName: string) => {
    const value = params[variableName];

    if (value === undefined || value === null) {
      missingVariables.push(variableName);

      if (throwOnMissing) {
        throw new MissingVariablesError(
          `Missing required variable: ${variableName}`,
          [variableName]
        );
      }

      return missingVariablePlaceholder;
    }

    substitutedVariables.push(variableName);

    // Convert to string and encode if needed
    const stringValue = String(value);
    return encodeValues ? encodeParameterValue(stringValue) : stringValue;
  });

  // Validate the final URL if requested
  let isValid = true;
  if (validate) {
    isValid = isValidURL(url);
  }

  return {
    url,
    isValid,
    missingVariables,
    substitutedVariables,
  };
}

/**
 * Convenience function that returns just the URL string
 * Throws on validation failure or missing variables if strict mode is enabled
 *
 * @param template - Template string with {variable} placeholders
 * @param params - Object containing variable values
 * @param strict - If true, throws on validation failure or missing vars
 * @returns The built URL string
 */
export function buildLinkSimple(
  template: string,
  params: Record<string, string>,
  strict = false
): string {
  const result = buildLink(template, params, {
    throwOnMissing: strict,
    validate: strict,
  });

  if (strict && !result.isValid) {
    throw new URLValidationError(
      `Invalid URL generated: ${result.url}`,
      result.url
    );
  }

  return result.url;
}

/**
 * Extracts all variable names from a template
 *
 * @param template - Template string to analyze
 * @returns Array of variable names found in the template
 *
 * @example
 * ```ts
 * extractVariables('https://github.com/{owner}/{repo}/issues/{number}');
 * // Returns: ['owner', 'repo', 'number']
 * ```
 */
export function extractVariables(template: string): string[] {
  const variablePattern = /\{([a-zA-Z0-9_\-\.]+)\}/g;
  const variables: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = variablePattern.exec(template)) !== null) {
    variables.push(match[1]);
  }

  return variables;
}

/**
 * Validates that all required variables are present in params
 *
 * @param template - Template string to check
 * @param params - Parameters object to validate
 * @returns Object with validation result and missing variables
 */
export function validateParams(
  template: string,
  params: Record<string, string>
): { valid: boolean; missing: string[] } {
  const required = extractVariables(template);
  const missing = required.filter(
    (varName) => params[varName] === undefined || params[varName] === null
  );

  return {
    valid: missing.length === 0,
    missing,
  };
}
