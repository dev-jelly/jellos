/**
 * Tests for permission validator
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validatePathAccess,
  validatePathAccessOrThrow,
  validateConfiguredPaths,
  validateChildProcessAllowed,
  validateWorkerAllowed,
  PermissionViolationError,
  formatPermissionError,
  isPathWithinRoot,
  sanitizePath,
} from '../permission-validator';
import type { ServerPermissionConfig } from '../server-permissions';

describe('Permission Validator', () => {
  describe('validatePathAccess', () => {
    it('should allow all paths when permission model is disabled', () => {
      const config: ServerPermissionConfig = {
        enabled: false,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(validatePathAccess('/any/path', 'read', config)).toBe(true);
      expect(validatePathAccess('/any/path', 'write', config)).toBe(true);
    });

    it('should allow paths within project roots for read access', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project'],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(validatePathAccess('/app/project/file.txt', 'read', config)).toBe(true);
      expect(validatePathAccess('/app/project/subdir/file.txt', 'read', config)).toBe(
        true
      );
    });

    it('should allow paths within project roots for write access', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project'],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(validatePathAccess('/app/project/file.txt', 'write', config)).toBe(true);
    });

    it('should deny paths outside project roots', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project'],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(validatePathAccess('/etc/passwd', 'read', config)).toBe(false);
      expect(validatePathAccess('/tmp/file.txt', 'write', config)).toBe(false);
    });

    it('should handle multiple project roots', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project1', '/app/project2', '/var/data'],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(validatePathAccess('/app/project1/file.txt', 'read', config)).toBe(true);
      expect(validatePathAccess('/app/project2/file.txt', 'read', config)).toBe(true);
      expect(validatePathAccess('/var/data/file.txt', 'read', config)).toBe(true);
      expect(validatePathAccess('/other/path', 'read', config)).toBe(false);
    });
  });

  describe('validatePathAccessOrThrow', () => {
    it('should not throw when access is allowed', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project'],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(() =>
        validatePathAccessOrThrow('/app/project/file.txt', 'read', config)
      ).not.toThrow();
    });

    it('should throw PermissionViolationError when access is denied', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project'],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(() =>
        validatePathAccessOrThrow('/etc/passwd', 'read', config)
      ).toThrow(PermissionViolationError);
    });

    it('should include correct error details', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project'],
        allowChildProcess: true,
        allowWorker: false,
      };

      try {
        validatePathAccessOrThrow('/etc/passwd', 'write', config);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PermissionViolationError);
        const permError = error as PermissionViolationError;
        expect(permError.operation).toBe('write');
        expect(permError.path).toBe('/etc/passwd');
      }
    });
  });

  describe('validateConfiguredPaths', () => {
    it('should warn when permission model is disabled', () => {
      const config: ServerPermissionConfig = {
        enabled: false,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      const result = validateConfiguredPaths(config);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should validate that project roots exist', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/nonexistent/path'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const result = validateConfiguredPaths(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('does not exist');
    });

    it('should warn when no project roots in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      const result = validateConfiguredPaths(config);
      expect(result.warnings.length).toBeGreaterThan(0);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('validateChildProcessAllowed', () => {
    it('should not throw when child processes are allowed', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(() => validateChildProcessAllowed(config)).not.toThrow();
    });

    it('should throw when child processes are not allowed', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: false,
        allowWorker: false,
      };

      expect(() => validateChildProcessAllowed(config)).toThrow(
        PermissionViolationError
      );
    });

    it('should not throw when permission model is disabled', () => {
      const config: ServerPermissionConfig = {
        enabled: false,
        projectRoots: [],
        allowChildProcess: false,
        allowWorker: false,
      };

      expect(() => validateChildProcessAllowed(config)).not.toThrow();
    });
  });

  describe('validateWorkerAllowed', () => {
    it('should not throw when workers are allowed', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: true,
      };

      expect(() => validateWorkerAllowed(config)).not.toThrow();
    });

    it('should throw when workers are not allowed', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(() => validateWorkerAllowed(config)).toThrow(PermissionViolationError);
    });
  });

  describe('formatPermissionError', () => {
    it('should format read/write errors with guidance', () => {
      const error = new PermissionViolationError(
        'write',
        '/app/data/file.txt',
        'Path not in whitelist'
      );

      const formatted = formatPermissionError(error);
      expect(formatted).toContain('Permission Denied');
      expect(formatted).toContain('write');
      expect(formatted).toContain('/app/data/file.txt');
      expect(formatted).toContain('PROJECT_ROOTS');
    });

    it('should format spawn errors with guidance', () => {
      const error = new PermissionViolationError(
        'spawn',
        'child_process',
        'Not allowed'
      );

      const formatted = formatPermissionError(error);
      expect(formatted).toContain('ALLOW_CHILD_PROCESS');
    });

    it('should format worker errors with guidance', () => {
      const error = new PermissionViolationError(
        'worker',
        'worker_threads',
        'Not allowed'
      );

      const formatted = formatPermissionError(error);
      expect(formatted).toContain('ALLOW_WORKER');
    });
  });

  describe('isPathWithinRoot', () => {
    it('should return true for paths within root', () => {
      expect(isPathWithinRoot('/app/project/file.txt', '/app/project')).toBe(true);
      expect(isPathWithinRoot('/app/project/sub/file.txt', '/app/project')).toBe(
        true
      );
    });

    it('should return false for paths outside root', () => {
      expect(isPathWithinRoot('/etc/passwd', '/app/project')).toBe(false);
      expect(isPathWithinRoot('/app/other/file.txt', '/app/project')).toBe(false);
    });

    it('should handle relative paths correctly', () => {
      const cwd = process.cwd();
      expect(isPathWithinRoot('./file.txt', cwd)).toBe(true);
      expect(isPathWithinRoot('../../../etc/passwd', cwd)).toBe(false);
    });
  });

  describe('sanitizePath', () => {
    it('should resolve and validate safe paths', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [process.cwd()],
        allowChildProcess: true,
        allowWorker: false,
      };

      const sanitized = sanitizePath('./file.txt', process.cwd(), config);
      expect(sanitized).toContain(process.cwd());
    });

    it('should reject path traversal attempts', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project'],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(() =>
        sanitizePath('../../../etc/passwd', '/app/project/subdir', config)
      ).toThrow(PermissionViolationError);
    });

    it('should reject paths outside whitelist', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project'],
        allowChildProcess: true,
        allowWorker: false,
      };

      expect(() => sanitizePath('/etc/passwd', '/app/project', config)).toThrow(
        PermissionViolationError
      );
    });
  });
});
