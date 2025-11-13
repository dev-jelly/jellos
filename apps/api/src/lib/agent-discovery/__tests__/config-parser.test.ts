/**
 * Tests for config-parser.ts - Links section parsing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  parseConfigFile,
  validateLinkTemplate,
  validateLinksConfig,
  getLinksConfig,
} from '../config-parser';
import type { JellosConfig, LinksConfig, LinkTemplate } from '../../../types/agent';

describe('Links Section Parsing', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jellos-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('validateLinkTemplate', () => {
    it('should validate a valid GitHub link template', () => {
      const template: LinkTemplate = {
        baseUrl: 'https://github.com/org/repo',
        prTemplate: '{baseUrl}/pull/{number}',
        commitTemplate: '{baseUrl}/commit/{sha}',
      };
      expect(validateLinkTemplate(template, 'github')).toBe(true);
    });

    it('should validate a valid Linear link template', () => {
      const template: LinkTemplate = {
        baseUrl: 'https://linear.app/workspace',
        issueTemplate: '{baseUrl}/issue/{id}',
      };
      expect(validateLinkTemplate(template, 'linear')).toBe(true);
    });

    it('should reject template without baseUrl for non-deployment providers', () => {
      const template = {
        prTemplate: '/pull/{number}',
      };
      expect(validateLinkTemplate(template, 'github')).toBe(false);
    });

    it('should reject template with non-string baseUrl', () => {
      const template = {
        baseUrl: 123,
        prTemplate: '{baseUrl}/pull/{number}',
      };
      expect(validateLinkTemplate(template, 'github')).toBe(false);
    });

    it('should reject template with non-string template fields', () => {
      const template = {
        baseUrl: 'https://github.com/org/repo',
        prTemplate: 123,
      };
      expect(validateLinkTemplate(template, 'github')).toBe(false);
    });

    it('should allow deployment template without baseUrl', () => {
      const template: LinkTemplate = {
        baseUrl: '',
        deploymentTemplate: 'https://preview-{branch}.example.com',
      };
      expect(validateLinkTemplate(template, 'deployment')).toBe(true);
    });

    it('should reject null or undefined template', () => {
      expect(validateLinkTemplate(null, 'github')).toBe(false);
      expect(validateLinkTemplate(undefined, 'github')).toBe(false);
    });

    it('should reject non-object template', () => {
      expect(validateLinkTemplate('string', 'github')).toBe(false);
      expect(validateLinkTemplate(123, 'github')).toBe(false);
    });
  });

  describe('validateLinksConfig', () => {
    it('should validate a complete valid links config', () => {
      const config: JellosConfig = {
        links: {
          github: {
            baseUrl: 'https://github.com/org/repo',
            prTemplate: '{baseUrl}/pull/{number}',
            commitTemplate: '{baseUrl}/commit/{sha}',
            fileTemplate: '{baseUrl}/blob/{branch}/{path}',
          },
          linear: {
            baseUrl: 'https://linear.app/workspace',
            issueTemplate: '{baseUrl}/issue/{id}',
          },
        },
      };
      const result = validateLinksConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return valid for config without links section', () => {
      const config: JellosConfig = {};
      const result = validateLinksConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject links config that is not an object', () => {
      const config: any = {
        links: 'not an object',
      };
      const result = validateLinksConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('links must be an object');
    });

    it('should detect invalid provider templates', () => {
      const config: JellosConfig = {
        links: {
          github: {
            baseUrl: 'https://github.com/org/repo',
          },
          linear: {
            // Missing baseUrl
            issueTemplate: '/issue/{id}',
          } as any,
        },
      };
      const result = validateLinksConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid link template for provider: linear');
    });

    it('should allow partial provider configuration', () => {
      const config: JellosConfig = {
        links: {
          github: {
            baseUrl: 'https://github.com/org/repo',
            prTemplate: '{baseUrl}/pull/{number}',
          },
          // Linear not provided
        },
      };
      const result = validateLinksConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('getLinksConfig', () => {
    it('should return links config for valid configuration', () => {
      const linksConfig: LinksConfig = {
        github: {
          baseUrl: 'https://github.com/org/repo',
          prTemplate: '{baseUrl}/pull/{number}',
        },
      };
      const config: JellosConfig = { links: linksConfig };
      const result = getLinksConfig(config);
      expect(result).toEqual(linksConfig);
    });

    it('should return null for config without links', () => {
      const config: JellosConfig = {};
      const result = getLinksConfig(config);
      expect(result).toBeNull();
    });

    it('should return null and warn for invalid links config', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config: any = {
        links: {
          github: {
            // Missing baseUrl
            prTemplate: '/pull/{number}',
          },
        },
      };
      const result = getLinksConfig(config);
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('parseConfigFile - Links Integration', () => {
    it('should parse valid config with links section', async () => {
      const configContent = `
agents:
  - id: claude
    name: Claude Code
    command: claude

links:
  github:
    baseUrl: https://github.com/org/repo
    prTemplate: "{baseUrl}/pull/{number}"
    commitTemplate: "{baseUrl}/commit/{sha}"
  linear:
    baseUrl: https://linear.app/workspace
    issueTemplate: "{baseUrl}/issue/{id}"
`;
      const configPath = path.join(tempDir, '.jellos.yml');
      await fs.writeFile(configPath, configContent);

      const config = await parseConfigFile(configPath);

      expect(config.links).toBeDefined();
      expect(config.links?.github).toBeDefined();
      expect(config.links?.github?.baseUrl).toBe('https://github.com/org/repo');
      expect(config.links?.linear).toBeDefined();
      expect(config.links?.linear?.issueTemplate).toBe('{baseUrl}/issue/{id}');
    });

    it('should parse config without links section', async () => {
      const configContent = `
agents:
  - id: claude
    name: Claude Code
    command: claude
`;
      const configPath = path.join(tempDir, '.jellos.yml');
      await fs.writeFile(configPath, configContent);

      const config = await parseConfigFile(configPath);

      expect(config.links).toBeUndefined();
      expect(config.agents).toBeDefined();
    });

    it('should remove invalid links section and warn', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const configContent = `
links:
  github:
    prTemplate: "/pull/{number}"
`;
      const configPath = path.join(tempDir, '.jellos.yml');
      await fs.writeFile(configPath, configContent);

      const config = await parseConfigFile(configPath);

      expect(config.links).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle YAML parsing errors gracefully', async () => {
      const invalidYaml = `
links:
  github:
    baseUrl: https://github.com/org/repo
    prTemplate: {invalid yaml
`;
      const configPath = path.join(tempDir, '.jellos.yml');
      await fs.writeFile(configPath, invalidYaml);

      await expect(parseConfigFile(configPath)).rejects.toThrow('Invalid YAML syntax');
    });

    it('should return empty config for non-existent file', async () => {
      const configPath = path.join(tempDir, 'non-existent.yml');
      const config = await parseConfigFile(configPath);
      expect(config).toEqual({});
    });

    it('should parse all supported link providers', async () => {
      const configContent = `
links:
  github:
    baseUrl: https://github.com/org/repo
    prTemplate: "{baseUrl}/pull/{number}"
  linear:
    baseUrl: https://linear.app/workspace
    issueTemplate: "{baseUrl}/issue/{id}"
  jenkins:
    baseUrl: https://jenkins.example.com
    pipelineTemplate: "{baseUrl}/job/{jobName}/{buildNumber}"
  githubActions:
    baseUrl: https://github.com/org/repo
    pipelineTemplate: "{baseUrl}/actions/runs/{runId}"
  deployment:
    deploymentTemplate: "https://preview-{branch}.example.com"
`;
      const configPath = path.join(tempDir, '.jellos.yml');
      await fs.writeFile(configPath, configContent);

      const config = await parseConfigFile(configPath);

      expect(config.links?.github).toBeDefined();
      expect(config.links?.linear).toBeDefined();
      expect(config.links?.jenkins).toBeDefined();
      expect(config.links?.githubActions).toBeDefined();
      expect(config.links?.deployment).toBeDefined();
    });

    it('should preserve other config sections when links are invalid', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const configContent = `
agents:
  - id: claude
    name: Claude Code
    command: claude

links:
  github:
    prTemplate: "/invalid/without/baseurl"

worktree:
  post-create:
    - echo "setup complete"
`;
      const configPath = path.join(tempDir, '.jellos.yml');
      await fs.writeFile(configPath, configContent);

      const config = await parseConfigFile(configPath);

      expect(config.agents).toBeDefined();
      expect(config.agents?.length).toBe(1);
      expect(config.worktree).toBeDefined();
      expect(config.links).toBeUndefined(); // Invalid links removed
      consoleSpy.mockRestore();
    });
  });

  describe('Links Section - Edge Cases', () => {
    it('should handle empty links object', async () => {
      const configContent = `
links: {}
`;
      const configPath = path.join(tempDir, '.jellos.yml');
      await fs.writeFile(configPath, configContent);

      const config = await parseConfigFile(configPath);
      expect(config.links).toEqual({});
    });

    it('should handle template strings with special characters', async () => {
      const configContent = `
links:
  github:
    baseUrl: "https://github.com/org/repo"
    fileTemplate: "{baseUrl}/blob/{branch}/{path}?line={line}#L{line}"
    diffTemplate: "{baseUrl}/compare/{base}...{head}?expand=1"
`;
      const configPath = path.join(tempDir, '.jellos.yml');
      await fs.writeFile(configPath, configContent);

      const config = await parseConfigFile(configPath);
      expect(config.links?.github?.fileTemplate).toContain('?line=');
      expect(config.links?.github?.diffTemplate).toContain('?expand=1');
    });

    it('should handle quoted YAML strings with braces', async () => {
      const configContent = `
links:
  github:
    baseUrl: "https://github.com/org/repo"
    prTemplate: "{baseUrl}/pull/{number}"
`;
      const configPath = path.join(tempDir, '.jellos.yml');
      await fs.writeFile(configPath, configContent);

      const config = await parseConfigFile(configPath);
      expect(config.links?.github?.prTemplate).toBe('{baseUrl}/pull/{number}');
    });
  });
});
