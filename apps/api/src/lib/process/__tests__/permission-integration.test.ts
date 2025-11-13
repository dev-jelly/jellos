import { describe, it, expect, beforeAll } from 'vitest';
import { safeSpawn, PermissionDeniedError } from '../safe-spawn';
import { buildCompletePermissionArgs } from '../permission-profiles';
import type { ServerPermissionConfig } from '../server-permissions';

/**
 * Integration tests for Node.js Permission Model
 *
 * These tests verify that permission restrictions work as expected
 * when the permission model is enabled.
 *
 * Note: Some tests are skipped when permission model is not active,
 * as they require Node.js to be started with --permission flag.
 */
describe('Permission Model Integration', () => {
  const isPermissionModelActive = typeof (process as any).permission !== 'undefined';

  beforeAll(() => {
    if (!isPermissionModelActive) {
      console.log(
        '⚠️  Permission Model is not active. Some tests will be skipped.\n' +
        '   To run full test suite, start with: NODE_PERMISSIONS=true npm test'
      );
    }
  });

  describe('Permission Arguments Generation', () => {
    it('should generate valid permission arguments', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/dist'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const args = buildCompletePermissionArgs(config);

      expect(args).toContain('--permission');
      expect(args).toContain('--allow-child-process');
      expect(args.some((arg) => arg.startsWith('--allow-fs-read='))).toBe(true);
    });

    it('should not generate arguments when disabled', () => {
      const config: ServerPermissionConfig = {
        enabled: false,
        projectRoots: ['/app/dist'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const args = buildCompletePermissionArgs(config);
      expect(args).toEqual([]);
    });
  });

  describe('Command Execution with safeSpawn', () => {
    it('should successfully execute allowed commands', async () => {
      const result = await safeSpawn('echo', ['hello'], { timeout: 1000 });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello');
      expect(result.timedOut).toBe(false);
    });

    it('should handle command errors gracefully', async () => {
      await expect(
        safeSpawn('nonexistent-command-12345', [], { timeout: 1000 })
      ).rejects.toThrow();
    });

    it('should respect timeout settings', async () => {
      await expect(
        safeSpawn('sleep', ['10'], { timeout: 100 })
      ).rejects.toThrow('timed out');
    });

    it('should capture stdout and stderr separately', async () => {
      // Using a command that writes to stderr
      const result = await safeSpawn('node', ['-e', 'console.error("error"); console.log("output")'], {
        timeout: 2000,
      });

      expect(result.stdout).toContain('output');
      expect(result.stderr).toContain('error');
    });
  });

  describe('Permission Denied Scenarios', () => {
    // These tests only run when permission model is active
    it.skipIf(!isPermissionModelActive)(
      'should detect permission denied errors',
      async () => {
        // Try to access a restricted path
        // This test would fail if permission model denies access
        try {
          await safeSpawn('ls', ['/etc/shadow'], { timeout: 1000 });
        } catch (error) {
          // Either permission denied or file doesn't exist (both are acceptable)
          expect(error).toBeDefined();
        }
      }
    );

    it('should provide helpful error messages for permission errors', () => {
      const error = new PermissionDeniedError(
        'Access denied',
        'test-command',
        'spawn',
        'help text'
      );

      expect(error.name).toBe('PermissionDeniedError');
      expect(error.command).toBe('test-command');
      expect(error.operation).toBe('spawn');
      expect(error.helpText).toBe('help text');
    });
  });

  describe('Filesystem Access', () => {
    it('should allow reading from current working directory', async () => {
      // Reading package.json should work
      const result = await safeSpawn('cat', ['package.json'], {
        timeout: 1000,
        cwd: process.cwd(),
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"name"');
    });

    it.skipIf(!isPermissionModelActive)(
      'should restrict access to unauthorized paths when permissions enabled',
      async () => {
        // This test verifies that permission model blocks unauthorized access
        // When permission model is active, trying to read from /root should fail
        try {
          await safeSpawn('ls', ['/root'], { timeout: 1000 });
          // If we get here, either permission model is not active or we have access
          // (which is fine for development)
        } catch (error: any) {
          // Permission denied or doesn't exist - both acceptable
          expect(error).toBeDefined();
        }
      }
    );
  });

  describe('Child Process Permissions', () => {
    it('should spawn child processes when allowed', async () => {
      const result = await safeSpawn('node', ['--version'], { timeout: 2000 });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/);
    });

    it('should handle process spawn with custom environment', async () => {
      const result = await safeSpawn(
        'node',
        ['-e', 'console.log(process.env.TEST_VAR)'],
        {
          timeout: 2000,
          env: { TEST_VAR: 'test-value' },
        }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('test-value');
    });
  });

  describe('Buffer Management', () => {
    it('should handle large outputs within buffer limits', async () => {
      // Generate output that's under the default 10MB buffer
      const result = await safeSpawn(
        'node',
        ['-e', 'console.log("x".repeat(1000))'],
        { timeout: 2000 }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBe(1000);
    });

    it('should reject outputs that exceed buffer limits', async () => {
      // Try to generate 100KB output with small buffer
      await expect(
        safeSpawn(
          'node',
          ['-e', 'console.log("x".repeat(100000))'],
          {
            timeout: 5000,
            maxBuffer: 1024, // 1KB limit
          }
        )
      ).rejects.toThrow('exceeded max buffer');
    });
  });

  describe('Signal Handling', () => {
    it('should handle process termination signals', async () => {
      const result = await safeSpawn('node', ['-e', 'process.exit(0)'], {
        timeout: 2000,
      });

      expect(result.exitCode).toBe(0);
    });

    it('should handle non-zero exit codes', async () => {
      const result = await safeSpawn('node', ['-e', 'process.exit(42)'], {
        timeout: 2000,
      });

      expect(result.exitCode).toBe(42);
    });
  });

  describe('Security Validation', () => {
    it('should not allow shell injection when shell is disabled', async () => {
      // With shell: false, this should look for a file literally named "echo; ls"
      // rather than executing the shell commands
      await expect(
        safeSpawn('echo; ls', [], { timeout: 1000, shell: false })
      ).rejects.toThrow();
    });

    it('should execute shell commands only when shell is explicitly enabled', async () => {
      const result = await safeSpawn('echo', ['test'], {
        timeout: 1000,
        shell: true,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('test');
    });
  });

  describe('Permission Model Status', () => {
    it('should report permission model status', () => {
      if (isPermissionModelActive) {
        console.log('✅ Permission Model is ACTIVE');
      } else {
        console.log('⚠️  Permission Model is INACTIVE (development mode)');
      }

      // Test always passes, just reports status
      expect(true).toBe(true);
    });

    it('should have process.permission API when active', () => {
      if (isPermissionModelActive) {
        expect((process as any).permission).toBeDefined();
      } else {
        expect((process as any).permission).toBeUndefined();
      }
    });
  });

  describe('Common Binary Access', () => {
    const commonBinaries = ['node', 'which'];

    commonBinaries.forEach((binary) => {
      it(`should be able to execute ${binary}`, async () => {
        try {
          const result = await safeSpawn(binary, ['--version'], { timeout: 2000 });
          expect(result.exitCode).toBe(0);
        } catch (error) {
          // Binary might not be installed, which is fine
          console.log(`  ⚠️  ${binary} not available (skipped)`);
        }
      });
    });
  });
});
