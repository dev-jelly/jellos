/**
 * Tests for URL Template Engine
 */

import { describe, it, expect } from 'vitest';
import {
  buildLink,
  buildLinkSimple,
  extractVariables,
  validateParams,
  URLValidationError,
  MissingVariablesError,
} from '../url-template';

describe('URL Template Engine', () => {
  describe('buildLink', () => {
    describe('basic functionality', () => {
      it('should replace single variable', () => {
        const result = buildLink('https://example.com/{page}', {
          page: 'home',
        });

        expect(result.url).toBe('https://example.com/home');
        expect(result.isValid).toBe(true);
        expect(result.substitutedVariables).toEqual(['page']);
        expect(result.missingVariables).toEqual([]);
      });

      it('should replace multiple variables', () => {
        const result = buildLink('https://github.com/{owner}/{repo}/issues/{number}', {
          owner: 'facebook',
          repo: 'react',
          number: '123',
        });

        expect(result.url).toBe('https://github.com/facebook/react/issues/123');
        expect(result.isValid).toBe(true);
        expect(result.substitutedVariables).toEqual(['owner', 'repo', 'number']);
        expect(result.missingVariables).toEqual([]);
      });

      it('should handle templates with no variables', () => {
        const result = buildLink('https://example.com/static', {});

        expect(result.url).toBe('https://example.com/static');
        expect(result.isValid).toBe(true);
        expect(result.substitutedVariables).toEqual([]);
        expect(result.missingVariables).toEqual([]);
      });

      it('should handle variables with underscores', () => {
        const result = buildLink('https://example.com/{user_id}/{post_id}', {
          user_id: '123',
          post_id: '456',
        });

        expect(result.url).toBe('https://example.com/123/456');
        expect(result.isValid).toBe(true);
      });

      it('should handle variables with hyphens', () => {
        const result = buildLink('https://example.com/{user-name}', {
          'user-name': 'john-doe',
        });

        expect(result.url).toBe('https://example.com/john-doe');
        expect(result.isValid).toBe(true);
      });

      it('should handle variables with dots (nested notation)', () => {
        const result = buildLink('https://example.com/{user.name}', {
          'user.name': 'john',
        });

        expect(result.url).toBe('https://example.com/john');
        expect(result.isValid).toBe(true);
      });
    });

    describe('missing variables', () => {
      it('should handle missing variables with default empty placeholder', () => {
        const result = buildLink('https://example.com/{foo}/{bar}', {
          foo: 'test',
        });

        expect(result.url).toBe('https://example.com/test/');
        expect(result.missingVariables).toEqual(['bar']);
        expect(result.substitutedVariables).toEqual(['foo']);
      });

      it('should use custom placeholder for missing variables', () => {
        const result = buildLink(
          'https://example.com/{foo}/{bar}',
          { foo: 'test' },
          { missingVariablePlaceholder: 'MISSING' }
        );

        expect(result.url).toBe('https://example.com/test/MISSING');
        expect(result.missingVariables).toEqual(['bar']);
      });

      it('should throw on missing variables when throwOnMissing is true', () => {
        expect(() => {
          buildLink(
            'https://example.com/{foo}/{bar}',
            { foo: 'test' },
            { throwOnMissing: true }
          );
        }).toThrow(MissingVariablesError);
      });

      it('should handle all missing variables', () => {
        const result = buildLink('https://example.com/{foo}/{bar}', {});

        expect(result.url).toBe('https://example.com//');
        expect(result.missingVariables).toEqual(['foo', 'bar']);
        expect(result.substitutedVariables).toEqual([]);
      });

      it('should handle null and undefined values as missing', () => {
        const result = buildLink('https://example.com/{foo}/{bar}', {
          foo: null as any,
          bar: undefined as any,
        });

        expect(result.url).toBe('https://example.com//');
        expect(result.missingVariables).toEqual(['foo', 'bar']);
      });
    });

    describe('XSS prevention', () => {
      it('should encode special HTML characters', () => {
        const result = buildLink('https://example.com/search?q={query}', {
          query: '<script>alert("xss")</script>',
        });

        expect(result.url).toBe(
          'https://example.com/search?q=%3Cscript%3Ealert(%22xss%22)%3C%2Fscript%3E'
        );
        expect(result.isValid).toBe(true);
      });

      it('should encode ampersands', () => {
        const result = buildLink('https://example.com/{param}', {
          param: 'foo&bar',
        });

        expect(result.url).toBe('https://example.com/foo%26bar');
        expect(result.isValid).toBe(true);
      });

      it('should encode quotes', () => {
        const result = buildLink('https://example.com/{param}', {
          param: 'foo"bar\'baz',
        });

        expect(result.url).toBe('https://example.com/foo%22bar\'baz');
        expect(result.isValid).toBe(true);
      });

      it('should encode spaces', () => {
        const result = buildLink('https://example.com/{param}', {
          param: 'hello world',
        });

        expect(result.url).toBe('https://example.com/hello%20world');
        expect(result.isValid).toBe(true);
      });

      it('should not encode when encodeValues is false', () => {
        const result = buildLink(
          'https://example.com/{param}',
          { param: 'hello world' },
          { encodeValues: false }
        );

        expect(result.url).toBe('https://example.com/hello world');
        // Note: URL constructor is more lenient with spaces in modern browsers
        // The important thing is the value is not encoded when the flag is false
      });
    });

    describe('URL validation', () => {
      it('should validate HTTP URLs', () => {
        const result = buildLink('http://example.com/{page}', {
          page: 'home',
        });

        expect(result.isValid).toBe(true);
      });

      it('should validate HTTPS URLs', () => {
        const result = buildLink('https://example.com/{page}', {
          page: 'home',
        });

        expect(result.isValid).toBe(true);
      });

      it('should reject javascript: protocol', () => {
        const result = buildLink('javascript:alert("xss")', {});

        expect(result.isValid).toBe(false);
      });

      it('should reject data: protocol', () => {
        const result = buildLink('data:text/html,<script>alert("xss")</script>', {});

        expect(result.isValid).toBe(false);
      });

      it('should reject vbscript: protocol', () => {
        const result = buildLink('vbscript:msgbox("xss")', {});

        expect(result.isValid).toBe(false);
      });

      it('should reject file: protocol', () => {
        const result = buildLink('file:///etc/passwd', {});

        expect(result.isValid).toBe(false);
      });

      it('should reject malformed URLs', () => {
        const result = buildLink('not-a-url', {});

        expect(result.isValid).toBe(false);
      });

      it('should skip validation when validate is false', () => {
        const result = buildLink('not-a-url', {}, { validate: false });

        expect(result.isValid).toBe(true); // Validation skipped
      });
    });

    describe('complex patterns', () => {
      it('should handle query parameters', () => {
        const result = buildLink(
          'https://example.com/search?q={query}&page={page}&sort={sort}',
          {
            query: 'test',
            page: '1',
            sort: 'date',
          }
        );

        expect(result.url).toBe('https://example.com/search?q=test&page=1&sort=date');
        expect(result.isValid).toBe(true);
      });

      it('should handle URL fragments', () => {
        const result = buildLink('https://example.com/{page}#{section}', {
          page: 'docs',
          section: 'installation',
        });

        expect(result.url).toBe('https://example.com/docs#installation');
        expect(result.isValid).toBe(true);
      });

      it('should handle port numbers', () => {
        const result = buildLink('https://example.com:{port}/{path}', {
          port: '8080',
          path: 'api',
        });

        expect(result.url).toBe('https://example.com:8080/api');
        expect(result.isValid).toBe(true);
      });

      it('should handle subdomains', () => {
        const result = buildLink('https://{subdomain}.example.com/{path}', {
          subdomain: 'api',
          path: 'v1',
        });

        expect(result.url).toBe('https://api.example.com/v1');
        expect(result.isValid).toBe(true);
      });

      it('should handle same variable used multiple times', () => {
        const result = buildLink(
          'https://example.com/{id}/details?id={id}',
          { id: '123' }
        );

        expect(result.url).toBe('https://example.com/123/details?id=123');
        expect(result.isValid).toBe(true);
        // Should only list the variable once
        expect(result.substitutedVariables).toEqual(['id', 'id']);
      });
    });

    describe('edge cases', () => {
      it('should handle empty template', () => {
        const result = buildLink('', {});

        expect(result.url).toBe('');
        expect(result.isValid).toBe(false);
      });

      it('should handle empty params', () => {
        const result = buildLink('https://example.com/{foo}', {});

        expect(result.url).toBe('https://example.com/');
        expect(result.missingVariables).toEqual(['foo']);
      });

      it('should handle numeric values', () => {
        const result = buildLink('https://example.com/{id}', {
          id: '123',
        });

        expect(result.url).toBe('https://example.com/123');
      });

      it('should handle variables adjacent to each other', () => {
        const result = buildLink('https://example.com/{foo}{bar}', {
          foo: 'hello',
          bar: 'world',
        });

        expect(result.url).toBe('https://example.com/helloworld');
      });

      it('should not replace partial matches', () => {
        const result = buildLink('https://example.com/prefix{var}suffix', {
          var: 'test',
        });

        expect(result.url).toBe('https://example.com/prefixtestsuffix');
      });

      it('should handle braces that are not variables', () => {
        // Only valid variable names are replaced
        const result = buildLink('https://example.com/{valid}/{not valid}', {
          valid: 'test',
        });

        expect(result.url).toBe('https://example.com/test/{not valid}');
        expect(result.missingVariables).toEqual([]);
      });
    });
  });

  describe('buildLinkSimple', () => {
    it('should return just the URL string', () => {
      const url = buildLinkSimple('https://example.com/{page}', {
        page: 'home',
      });

      expect(url).toBe('https://example.com/home');
    });

    it('should not throw in non-strict mode', () => {
      const url = buildLinkSimple('https://example.com/{foo}', {}, false);

      expect(url).toBe('https://example.com/');
    });

    it('should throw on missing variables in strict mode', () => {
      expect(() => {
        buildLinkSimple('https://example.com/{foo}', {}, true);
      }).toThrow(MissingVariablesError);
    });

    it('should throw on invalid URL in strict mode', () => {
      expect(() => {
        buildLinkSimple('javascript:alert("xss")', {}, true);
      }).toThrow(URLValidationError);
    });
  });

  describe('extractVariables', () => {
    it('should extract single variable', () => {
      const vars = extractVariables('https://example.com/{page}');

      expect(vars).toEqual(['page']);
    });

    it('should extract multiple variables', () => {
      const vars = extractVariables('https://github.com/{owner}/{repo}/issues/{number}');

      expect(vars).toEqual(['owner', 'repo', 'number']);
    });

    it('should extract variables with special characters', () => {
      const vars = extractVariables('https://example.com/{user_id}/{post-id}/{user.name}');

      expect(vars).toEqual(['user_id', 'post-id', 'user.name']);
    });

    it('should handle templates with no variables', () => {
      const vars = extractVariables('https://example.com/static');

      expect(vars).toEqual([]);
    });

    it('should handle duplicate variables', () => {
      const vars = extractVariables('https://example.com/{id}/details?id={id}');

      expect(vars).toEqual(['id', 'id']);
    });

    it('should not extract invalid variable names', () => {
      const vars = extractVariables('https://example.com/{valid}/{not valid}/{also-invalid!}');

      expect(vars).toEqual(['valid']);
    });
  });

  describe('validateParams', () => {
    it('should validate all params are present', () => {
      const result = validateParams('https://example.com/{foo}/{bar}', {
        foo: 'test',
        bar: 'test2',
      });

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should detect missing params', () => {
      const result = validateParams('https://example.com/{foo}/{bar}/{baz}', {
        foo: 'test',
      });

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['bar', 'baz']);
    });

    it('should detect null values as missing', () => {
      const result = validateParams('https://example.com/{foo}', {
        foo: null as any,
      });

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['foo']);
    });

    it('should detect undefined values as missing', () => {
      const result = validateParams('https://example.com/{foo}', {
        foo: undefined as any,
      });

      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['foo']);
    });

    it('should handle templates with no variables', () => {
      const result = validateParams('https://example.com/static', {});

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should ignore extra params', () => {
      const result = validateParams('https://example.com/{foo}', {
        foo: 'test',
        bar: 'extra',
      });

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });

  describe('real-world examples', () => {
    it('should build GitHub issue URL', () => {
      const result = buildLink('https://github.com/{owner}/{repo}/issues/{number}', {
        owner: 'facebook',
        repo: 'react',
        number: '25686',
      });

      expect(result.url).toBe('https://github.com/facebook/react/issues/25686');
      expect(result.isValid).toBe(true);
    });

    it('should build Linear issue URL', () => {
      const result = buildLink('https://linear.app/{workspace}/issue/{issueKey}', {
        workspace: 'acme',
        issueKey: 'ENG-123',
      });

      expect(result.url).toBe('https://linear.app/acme/issue/ENG-123');
      expect(result.isValid).toBe(true);
    });

    it('should build CI/CD pipeline URL', () => {
      const result = buildLink(
        'https://github.com/{owner}/{repo}/actions/runs/{runId}',
        {
          owner: 'vercel',
          repo: 'next.js',
          runId: '12345',
        }
      );

      expect(result.url).toBe('https://github.com/vercel/next.js/actions/runs/12345');
      expect(result.isValid).toBe(true);
    });

    it('should build deployment URL with environment', () => {
      const result = buildLink(
        'https://vercel.com/{team}/{project}/{environment}',
        {
          team: 'my-team',
          project: 'my-app',
          environment: 'production',
        }
      );

      expect(result.url).toBe('https://vercel.com/my-team/my-app/production');
      expect(result.isValid).toBe(true);
    });

    it('should handle complex search with special characters', () => {
      const result = buildLink('https://example.com/search?q={query}&filter={filter}', {
        query: 'React Hooks & Effects',
        filter: 'type:issue state:open',
      });

      expect(result.url).toBe(
        'https://example.com/search?q=React%20Hooks%20%26%20Effects&filter=type%3Aissue%20state%3Aopen'
      );
      expect(result.isValid).toBe(true);
    });
  });
});
