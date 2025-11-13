/**
 * URL Template Engine - Web Client Version
 *
 * Mustache-lite style template engine for building URLs with parameter substitution.
 * Supports variable substitution, URL validation, and XSS prevention.
 */

/**
 * Options for URL template building
 */
export interface BuildLinkOptions {
  validate?: boolean;
  encodeValues?: boolean;
  missingVariablePlaceholder?: string;
  throwOnMissing?: boolean;
}

/**
 * Result of URL template building
 */
export interface BuildLinkResult {
  url: string;
  isValid: boolean;
  missingVariables: string[];
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
 */
function encodeParameterValue(value: string): string {
  return encodeURIComponent(value);
}

/**
 * Validates a URL string
 */
function isValidURL(url: string): boolean {
  try {
    const urlObj = new URL(url);

    // Must be http or https
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
 * @param template - Template string with {variable} placeholders
 * @param params - Object containing variable values
 * @param options - Configuration options
 * @returns Result object containing the built URL and metadata
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
