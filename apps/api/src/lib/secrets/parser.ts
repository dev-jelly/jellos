/**
 * Secret reference parser for ${secret:KEY} syntax
 */

import type { SecretReference } from './types';

/**
 * Regular expression to match secret references
 * Supports:
 * - ${secret:KEY}
 * - ${secret:NAMESPACE/KEY}
 * - ${secret:prod/API_KEY}
 */
const SECRET_PATTERN = /\$\{secret:([^}]+)\}/g;

/**
 * Parse a secret reference string into components
 * Examples:
 * - "API_KEY" -> { key: "API_KEY", namespace: undefined }
 * - "prod/API_KEY" -> { key: "API_KEY", namespace: "prod" }
 */
export function parseSecretReference(reference: string): Omit<SecretReference, 'raw'> {
  const parts = reference.split('/');

  if (parts.length === 1) {
    return { key: parts[0] };
  } else if (parts.length === 2) {
    return { namespace: parts[0], key: parts[1] };
  } else {
    throw new Error(`Invalid secret reference format: ${reference}`);
  }
}

/**
 * Find all secret references in a string
 * Returns array of SecretReference objects
 */
export function findSecretReferences(text: string): SecretReference[] {
  const references: SecretReference[] = [];
  const matches = text.matchAll(SECRET_PATTERN);

  for (const match of matches) {
    const raw = match[0]; // Full match: ${secret:...}
    const reference = match[1]; // Captured group: the part after "secret:"

    try {
      const parsed = parseSecretReference(reference);
      references.push({
        ...parsed,
        raw,
      });
    } catch (error) {
      // Skip invalid references, they will be caught during validation
      console.warn(`Invalid secret reference: ${raw}`, error);
    }
  }

  return references;
}

/**
 * Replace secret references in a string with their values
 * @param text - The text containing secret references
 * @param resolver - Function to resolve secret values
 * @returns Promise resolving to the text with secrets replaced
 */
export async function replaceSecretReferences(
  text: string,
  resolver: (ref: SecretReference) => Promise<string>
): Promise<string> {
  const references = findSecretReferences(text);

  // Create a map of raw reference to resolved value
  const resolutionMap = new Map<string, string>();

  // Resolve all secrets in parallel
  await Promise.all(
    references.map(async (ref) => {
      const value = await resolver(ref);
      resolutionMap.set(ref.raw, value);
    })
  );

  // Replace all references with their resolved values
  let result = text;
  for (const [raw, value] of resolutionMap) {
    result = result.replace(new RegExp(escapeRegExp(raw), 'g'), value);
  }

  return result;
}

/**
 * Replace secret references in an object (deep)
 * Recursively processes all string values in the object
 */
export async function replaceSecretReferencesInObject<T extends Record<string, any>>(
  obj: T,
  resolver: (ref: SecretReference) => Promise<string>
): Promise<T> {
  const result: any = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = await replaceSecretReferences(value, resolver);
    } else if (value !== null && typeof value === 'object') {
      result[key] = await replaceSecretReferencesInObject(value, resolver);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Check if a string contains any secret references
 */
export function hasSecretReferences(text: string): boolean {
  // Reset lastIndex to ensure pattern works correctly in loops
  SECRET_PATTERN.lastIndex = 0;
  return SECRET_PATTERN.test(text);
}

/**
 * Check if an object contains any secret references (deep)
 */
export function objectHasSecretReferences(obj: Record<string, any>): boolean {
  for (const value of Object.values(obj)) {
    if (typeof value === 'string' && hasSecretReferences(value)) {
      return true;
    } else if (value !== null && typeof value === 'object') {
      if (objectHasSecretReferences(value)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate secret reference format
 */
export function validateSecretReference(reference: string): boolean {
  try {
    parseSecretReference(reference);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract unique secret keys from text
 * Useful for pre-fetching or validation
 */
export function extractUniqueSecretKeys(text: string): Array<{ key: string; namespace?: string }> {
  const references = findSecretReferences(text);
  const seen = new Set<string>();
  const unique: Array<{ key: string; namespace?: string }> = [];

  for (const ref of references) {
    const id = ref.namespace ? `${ref.namespace}/${ref.key}` : ref.key;
    if (!seen.has(id)) {
      seen.add(id);
      unique.push({ key: ref.key, namespace: ref.namespace });
    }
  }

  return unique;
}
