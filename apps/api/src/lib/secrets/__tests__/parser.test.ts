/**
 * Tests for secret reference parser
 */

import { describe, it, expect } from 'vitest';
import {
  parseSecretReference,
  findSecretReferences,
  hasSecretReferences,
  validateSecretReference,
  extractUniqueSecretKeys,
  replaceSecretReferences,
  replaceSecretReferencesInObject,
  objectHasSecretReferences,
} from '../parser';

describe('parseSecretReference', () => {
  it('should parse simple key reference', () => {
    const result = parseSecretReference('API_KEY');
    expect(result).toEqual({ key: 'API_KEY' });
  });

  it('should parse namespaced reference', () => {
    const result = parseSecretReference('prod/API_KEY');
    expect(result).toEqual({ namespace: 'prod', key: 'API_KEY' });
  });

  it('should throw on invalid format', () => {
    expect(() => parseSecretReference('prod/staging/API_KEY')).toThrow();
  });
});

describe('findSecretReferences', () => {
  it('should find single secret reference', () => {
    const text = 'API_KEY=${secret:MY_KEY}';
    const refs = findSecretReferences(text);

    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      raw: '${secret:MY_KEY}',
      key: 'MY_KEY',
    });
  });

  it('should find namespaced secret reference', () => {
    const text = 'API_KEY=${secret:prod/MY_KEY}';
    const refs = findSecretReferences(text);

    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      raw: '${secret:prod/MY_KEY}',
      namespace: 'prod',
      key: 'MY_KEY',
    });
  });

  it('should find multiple secret references', () => {
    const text = 'KEY1=${secret:KEY1} KEY2=${secret:prod/KEY2}';
    const refs = findSecretReferences(text);

    expect(refs).toHaveLength(2);
    expect(refs[0].key).toBe('KEY1');
    expect(refs[1].key).toBe('KEY2');
    expect(refs[1].namespace).toBe('prod');
  });

  it('should return empty array when no secrets found', () => {
    const text = 'No secrets here';
    const refs = findSecretReferences(text);

    expect(refs).toHaveLength(0);
  });

  it('should handle malformed references gracefully', () => {
    const text = '${secret:}'; // Empty key
    const refs = findSecretReferences(text);

    // Should skip invalid references
    expect(refs).toHaveLength(0);
  });
});

describe('hasSecretReferences', () => {
  it('should return true when secrets present', () => {
    expect(hasSecretReferences('${secret:KEY}')).toBe(true);
  });

  it('should return false when no secrets', () => {
    expect(hasSecretReferences('No secrets')).toBe(false);
  });
});

describe('validateSecretReference', () => {
  it('should validate correct references', () => {
    expect(validateSecretReference('KEY')).toBe(true);
    expect(validateSecretReference('prod/KEY')).toBe(true);
  });

  it('should reject invalid references', () => {
    expect(validateSecretReference('a/b/c')).toBe(false);
  });
});

describe('extractUniqueSecretKeys', () => {
  it('should extract unique keys', () => {
    const text = '${secret:KEY1} ${secret:KEY1} ${secret:KEY2}';
    const keys = extractUniqueSecretKeys(text);

    expect(keys).toHaveLength(2);
    expect(keys).toContainEqual({ key: 'KEY1' });
    expect(keys).toContainEqual({ key: 'KEY2' });
  });

  it('should handle namespaced keys', () => {
    const text = '${secret:prod/KEY1} ${secret:dev/KEY1}';
    const keys = extractUniqueSecretKeys(text);

    expect(keys).toHaveLength(2);
    expect(keys).toContainEqual({ key: 'KEY1', namespace: 'prod' });
    expect(keys).toContainEqual({ key: 'KEY1', namespace: 'dev' });
  });
});

describe('replaceSecretReferences', () => {
  it('should replace secret references with resolved values', async () => {
    const text = 'KEY=${secret:MY_KEY}';
    const resolver = async () => 'secret-value';

    const result = await replaceSecretReferences(text, resolver);
    expect(result).toBe('KEY=secret-value');
  });

  it('should replace multiple references', async () => {
    const text = 'K1=${secret:KEY1} K2=${secret:KEY2}';
    const resolver = async (ref: any) => `val-${ref.key}`;

    const result = await replaceSecretReferences(text, resolver);
    expect(result).toBe('K1=val-KEY1 K2=val-KEY2');
  });

  it('should handle namespaced references', async () => {
    const text = '${secret:prod/KEY}';
    const resolver = async (ref: any) => `${ref.namespace}-${ref.key}`;

    const result = await replaceSecretReferences(text, resolver);
    expect(result).toBe('prod-KEY');
  });
});

describe('replaceSecretReferencesInObject', () => {
  it('should replace secrets in flat object', async () => {
    const obj = {
      key1: '${secret:KEY1}',
      key2: 'no secret',
    };
    const resolver = async () => 'secret-value';

    const result = await replaceSecretReferencesInObject(obj, resolver);

    expect(result.key1).toBe('secret-value');
    expect(result.key2).toBe('no secret');
  });

  it('should replace secrets in nested object', async () => {
    const obj = {
      level1: {
        level2: {
          secret: '${secret:NESTED_KEY}',
        },
      },
    };
    const resolver = async () => 'deep-secret';

    const result = await replaceSecretReferencesInObject(obj, resolver);

    expect(result.level1.level2.secret).toBe('deep-secret');
  });

  it('should handle arrays', async () => {
    const obj = {
      secrets: ['${secret:KEY1}', '${secret:KEY2}'],
    };
    const resolver = async (ref: any) => `val-${ref.key}`;

    const result = await replaceSecretReferencesInObject(obj, resolver);

    expect(result.secrets).toEqual(['val-KEY1', 'val-KEY2']);
  });

  it('should preserve non-string values', async () => {
    const obj = {
      string: '${secret:KEY}',
      number: 42,
      boolean: true,
      null: null,
      undefined: undefined,
    };
    const resolver = async () => 'secret';

    const result = await replaceSecretReferencesInObject(obj, resolver);

    expect(result.string).toBe('secret');
    expect(result.number).toBe(42);
    expect(result.boolean).toBe(true);
    expect(result.null).toBe(null);
    expect(result.undefined).toBe(undefined);
  });
});

describe('objectHasSecretReferences', () => {
  it('should detect secrets in flat object', () => {
    const obj = { key: '${secret:KEY}' };
    expect(objectHasSecretReferences(obj)).toBe(true);
  });

  it('should detect secrets in nested object', () => {
    const obj = {
      level1: {
        level2: { key: '${secret:KEY}' },
      },
    };
    expect(objectHasSecretReferences(obj)).toBe(true);
  });

  it('should return false when no secrets', () => {
    const obj = { key: 'value' };
    expect(objectHasSecretReferences(obj)).toBe(false);
  });

  it('should handle arrays', () => {
    const obj = { items: ['${secret:KEY}'] };
    expect(objectHasSecretReferences(obj)).toBe(true);
  });
});
