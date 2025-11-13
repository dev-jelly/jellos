import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PERMISSION_PROFILES,
  getPermissionProfileFromEnv,
  getPermissionConfig,
  validatePermissionConfig,
  buildCompletePermissionArgs,
  COMMON_READ_PATHS,
  getProductionRecommendations,
  type PermissionProfile,
} from '../permission-profiles';

describe('Permission Profiles', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Profile Definitions', () => {
    it('should have all required profiles defined', () => {
      expect(PERMISSION_PROFILES).toHaveProperty('development');
      expect(PERMISSION_PROFILES).toHaveProperty('staging');
      expect(PERMISSION_PROFILES).toHaveProperty('production');
      expect(PERMISSION_PROFILES).toHaveProperty('test');
    });

    it('should have development profile disabled by default', () => {
      expect(PERMISSION_PROFILES.development.enabled).toBe(false);
    });

    it('should have production profile enabled', () => {
      expect(PERMISSION_PROFILES.production.enabled).toBe(true);
    });

    it('should have staging profile enabled', () => {
      expect(PERMISSION_PROFILES.staging.enabled).toBe(true);
    });

    it('should have test profile enabled', () => {
      expect(PERMISSION_PROFILES.test.enabled).toBe(true);
    });

    it('should allow child processes in all profiles', () => {
      Object.values(PERMISSION_PROFILES).forEach((profile) => {
        expect(profile.allowChildProcess).toBe(true);
      });
    });

    it('should not allow worker threads by default', () => {
      Object.values(PERMISSION_PROFILES).forEach((profile) => {
        expect(profile.allowWorker).toBe(false);
      });
    });
  });

  describe('getPermissionProfileFromEnv', () => {
    it('should return development profile by default', () => {
      delete process.env.NODE_ENV;
      expect(getPermissionProfileFromEnv()).toBe('development');
    });

    it('should return production profile when NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';
      expect(getPermissionProfileFromEnv()).toBe('production');
    });

    it('should return staging profile when NODE_ENV=staging', () => {
      process.env.NODE_ENV = 'staging';
      expect(getPermissionProfileFromEnv()).toBe('staging');
    });

    it('should return test profile when NODE_ENV=test', () => {
      process.env.NODE_ENV = 'test';
      expect(getPermissionProfileFromEnv()).toBe('test');
    });

    it('should be case insensitive', () => {
      process.env.NODE_ENV = 'PRODUCTION';
      expect(getPermissionProfileFromEnv()).toBe('production');
    });
  });

  describe('getPermissionConfig', () => {
    it('should return development profile by default', () => {
      delete process.env.NODE_ENV;
      delete process.env.NODE_PERMISSIONS;

      const config = getPermissionConfig();
      expect(config.enabled).toBe(false);
      expect(config.allowChildProcess).toBe(true);
    });

    it('should respect explicit NODE_PERMISSIONS=true', () => {
      process.env.NODE_PERMISSIONS = 'true';
      process.env.NODE_ENV = 'development';

      const config = getPermissionConfig();
      expect(config.enabled).toBe(true);
    });

    it('should respect explicit NODE_PERMISSIONS=false in production', () => {
      process.env.NODE_PERMISSIONS = 'false';
      process.env.NODE_ENV = 'production';

      const config = getPermissionConfig();
      expect(config.enabled).toBe(false);
    });

    it('should parse PROJECT_ROOTS from environment', () => {
      process.env.NODE_PERMISSIONS = 'true';
      process.env.PROJECT_ROOTS = '/path/one,/path/two,/path/three';

      const config = getPermissionConfig();
      expect(config.projectRoots).toEqual(['/path/one', '/path/two', '/path/three']);
    });

    it('should trim whitespace from PROJECT_ROOTS', () => {
      process.env.NODE_PERMISSIONS = 'true';
      process.env.PROJECT_ROOTS = ' /path/one , /path/two , /path/three ';

      const config = getPermissionConfig();
      expect(config.projectRoots).toEqual(['/path/one', '/path/two', '/path/three']);
    });

    it('should respect ALLOW_CHILD_PROCESS=false', () => {
      process.env.NODE_PERMISSIONS = 'true';
      process.env.ALLOW_CHILD_PROCESS = 'false';

      const config = getPermissionConfig();
      expect(config.allowChildProcess).toBe(false);
    });

    it('should respect ALLOW_WORKER=true', () => {
      process.env.NODE_PERMISSIONS = 'true';
      process.env.ALLOW_WORKER = 'true';

      const config = getPermissionConfig();
      expect(config.allowWorker).toBe(true);
    });

    it('should use production profile when NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.NODE_PERMISSIONS;

      const config = getPermissionConfig();
      expect(config.enabled).toBe(true);
      expect(config.projectRoots.length).toBeGreaterThan(0);
    });
  });

  describe('validatePermissionConfig', () => {
    it('should not throw for disabled config', () => {
      const config = {
        enabled: false,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(() => validatePermissionConfig(config)).not.toThrow();
    });

    it('should not throw for valid enabled config', () => {
      const config = {
        enabled: true,
        projectRoots: [process.cwd()],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(() => validatePermissionConfig(config)).not.toThrow();
    });

    it('should warn for enabled config with no project roots in production', () => {
      process.env.NODE_ENV = 'production';
      const config = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      // Should not throw, just warn
      expect(() => validatePermissionConfig(config)).not.toThrow();
    });
  });

  describe('buildCompletePermissionArgs', () => {
    it('should return empty array when disabled', () => {
      const config = {
        enabled: false,
        projectRoots: ['/test'],
        allowChildProcess: true,
        allowWorker: true,
      };

      expect(buildCompletePermissionArgs(config)).toEqual([]);
    });

    it('should include --permission flag when enabled', () => {
      const config = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: false,
        allowWorker: false,
      };

      const args = buildCompletePermissionArgs(config);
      expect(args).toContain('--permission');
    });

    it('should include --allow-child-process when enabled', () => {
      const config = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      const args = buildCompletePermissionArgs(config);
      expect(args).toContain('--allow-child-process');
    });

    it('should include --allow-worker when enabled', () => {
      const config = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: false,
        allowWorker: true,
      };

      const args = buildCompletePermissionArgs(config);
      expect(args).toContain('--allow-worker');
    });

    it('should include project roots for read access', () => {
      const config = {
        enabled: true,
        projectRoots: ['/app/dist', '/var/lib/jellos'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const args = buildCompletePermissionArgs(config);
      expect(args.some((arg) => arg.includes('--allow-fs-read=/app/dist'))).toBe(true);
      expect(args.some((arg) => arg.includes('--allow-fs-read=/var/lib/jellos'))).toBe(true);
    });

    it('should include project roots for write access', () => {
      const config = {
        enabled: true,
        projectRoots: ['/app/dist', '/var/lib/jellos'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const args = buildCompletePermissionArgs(config);
      expect(args.some((arg) => arg.includes('--allow-fs-write=/app/dist'))).toBe(true);
      expect(args.some((arg) => arg.includes('--allow-fs-write=/var/lib/jellos'))).toBe(true);
    });

    it('should include common read paths', () => {
      const config = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      const args = buildCompletePermissionArgs(config);

      // Should have --allow-fs-read flags for common paths
      const readArgs = args.filter((arg) => arg.startsWith('--allow-fs-read='));
      expect(readArgs.length).toBeGreaterThan(0);

      // Check for system binary paths
      expect(args.some((arg) => arg.includes('/usr/bin'))).toBe(true);
    });

    it('should not duplicate permission flags', () => {
      const config = {
        enabled: true,
        projectRoots: ['/app/dist'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const args = buildCompletePermissionArgs(config);

      // Count --permission flags (should only be 1)
      const permissionFlags = args.filter((arg) => arg === '--permission');
      expect(permissionFlags.length).toBe(1);
    });
  });

  describe('COMMON_READ_PATHS', () => {
    it('should include system binary paths', () => {
      expect(COMMON_READ_PATHS).toContain('/usr/bin');
      expect(COMMON_READ_PATHS).toContain('/usr/local/bin');
    });

    it('should include Node.js executable path', () => {
      expect(COMMON_READ_PATHS).toContain(process.execPath);
    });

    it('should not include null or undefined values', () => {
      expect(COMMON_READ_PATHS.every((path) => path !== null && path !== undefined)).toBe(true);
    });
  });

  describe('getProductionRecommendations', () => {
    it('should return non-empty array of recommendations', () => {
      const recommendations = getProductionRecommendations();
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it('should include NODE_ENV=production recommendation', () => {
      const recommendations = getProductionRecommendations();
      const text = recommendations.join('\n');
      expect(text).toContain('NODE_ENV=production');
    });

    it('should include NODE_PERMISSIONS=true recommendation', () => {
      const recommendations = getProductionRecommendations();
      const text = recommendations.join('\n');
      expect(text).toContain('NODE_PERMISSIONS=true');
    });

    it('should include example start command', () => {
      const recommendations = getProductionRecommendations();
      const text = recommendations.join('\n');
      expect(text).toContain('node');
      expect(text).toContain('--permission');
    });
  });

  describe('Environment Variable Priority', () => {
    it('should prioritize explicit NODE_PERMISSIONS over profile', () => {
      process.env.NODE_ENV = 'production'; // Would enable permissions
      process.env.NODE_PERMISSIONS = 'false'; // Should override

      const config = getPermissionConfig();
      expect(config.enabled).toBe(false);
    });

    it('should prioritize explicit PROJECT_ROOTS over profile defaults', () => {
      process.env.NODE_ENV = 'production';
      process.env.NODE_PERMISSIONS = 'true';
      process.env.PROJECT_ROOTS = '/custom/path';

      const config = getPermissionConfig();
      expect(config.projectRoots).toEqual(['/custom/path']);
    });
  });

  describe('Profile Integrity', () => {
    it('production profile should have secure defaults', () => {
      const prod = PERMISSION_PROFILES.production;

      expect(prod.enabled).toBe(true); // Security enabled
      expect(prod.allowChildProcess).toBe(true); // Required for functionality
      expect(prod.allowWorker).toBe(false); // Not needed, keep disabled
      expect(prod.projectRoots.length).toBeGreaterThan(0); // Has configured paths
    });

    it('development profile should prioritize developer experience', () => {
      const dev = PERMISSION_PROFILES.development;

      expect(dev.enabled).toBe(false); // Disabled for ease of development
      expect(dev.allowChildProcess).toBe(true); // Functionality maintained
    });

    it('test profile should enable security for testing', () => {
      const test = PERMISSION_PROFILES.test;

      expect(test.enabled).toBe(true); // Test security behavior
      expect(test.allowChildProcess).toBe(true); // Required for spawning tests
      expect(test.projectRoots.length).toBeGreaterThan(0); // Has test paths
    });
  });
});
