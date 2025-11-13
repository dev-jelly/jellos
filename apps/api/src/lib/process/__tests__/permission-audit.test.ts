/**
 * Tests for permission audit utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  auditPermissionConfiguration,
  preflightValidation,
  generateDriftReport,
  type PermissionAuditReport,
} from '../permission-audit';
import { initializePermissionLogger } from '../permission-logger';
import { PermissionViolationError } from '../permission-validator';
import type { ServerPermissionConfig } from '../server-permissions';

describe('Permission Audit', () => {
  beforeEach(() => {
    // Reset logger before each test
    initializePermissionLogger({
      enabled: true,
      logToConsole: false,
      maxViolations: 100,
    });
  });

  describe('auditPermissionConfiguration', () => {
    it('should generate audit report for disabled config', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production'; // Production should trigger recommendations

      const config: ServerPermissionConfig = {
        enabled: false,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      const report = auditPermissionConfiguration(config);

      expect(report.configuration).toEqual(config);
      expect(report.healthCheck.securityPosture).toBe('insecure');
      expect(report.recommendations.length).toBeGreaterThan(0);

      process.env.NODE_ENV = originalEnv;
    });

    it('should identify secure configuration', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [process.cwd()], // Use actual existing path
        allowChildProcess: true,
        allowWorker: false,
      };

      const report = auditPermissionConfiguration(config);

      expect(report.healthCheck.configurationValid).toBe(true);
      expect(report.healthCheck.pathsAccessible).toBe(true);
    });

    it('should detect configuration errors', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/nonexistent/path/12345'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const report = auditPermissionConfiguration(config);

      expect(report.validation.valid).toBe(false);
      expect(report.validation.errors.length).toBeGreaterThan(0);
      expect(report.healthCheck.configurationValid).toBe(false);
      expect(report.healthCheck.securityPosture).toBe('insecure');
    });

    it('should include violation statistics', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [process.cwd()],
        allowChildProcess: true,
        allowWorker: false,
      };

      const report = auditPermissionConfiguration(config);

      expect(report.violations).toBeDefined();
      expect(report.violations.totalViolations).toBeDefined();
    });

    it('should generate recommendations based on findings', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      const report = auditPermissionConfiguration(config);

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(
        report.recommendations.some((r) => r.includes('PROJECT_ROOTS'))
      ).toBe(true);
    });
  });

  describe('preflightValidation', () => {
    it('should pass for valid configuration', () => {
      const config: ServerPermissionConfig = {
        enabled: false, // Disabled is ok for development
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      const result = preflightValidation(config);
      expect(result).toBe(true);
    });

    it('should fail for invalid paths', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/nonexistent/path/xyz'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const result = preflightValidation(config);
      expect(result).toBe(false);
    });

    it('should validate production requirements', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const config: ServerPermissionConfig = {
        enabled: false, // Should fail in production
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      const result = preflightValidation(config);
      expect(result).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });

    it('should require project roots in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [], // Should fail - no roots
        allowChildProcess: true,
        allowWorker: false,
      };

      const result = preflightValidation(config);
      expect(result).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('generateDriftReport', () => {
    it('should detect no drift for identical configs', () => {
      const config: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const report = generateDriftReport(config, config);

      expect(report.hasDrift).toBe(false);
      expect(report.driftCount).toBe(0);
      expect(report.drift.length).toBe(0);
    });

    it('should detect enabled status drift', () => {
      const expected: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      const actual: ServerPermissionConfig = {
        enabled: false,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      const report = generateDriftReport(expected, actual);

      expect(report.hasDrift).toBe(true);
      expect(report.drift.length).toBeGreaterThan(0);
      expect(report.drift[0].field).toBe('enabled');
      expect(report.drift[0].severity).toBe('critical');
    });

    it('should detect child process permission drift', () => {
      const expected: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: true,
        allowWorker: false,
      };

      const actual: ServerPermissionConfig = {
        enabled: true,
        projectRoots: [],
        allowChildProcess: false,
        allowWorker: false,
      };

      const report = generateDriftReport(expected, actual);

      expect(report.hasDrift).toBe(true);
      const childProcessDrift = report.drift.find(
        (d) => d.field === 'allowChildProcess'
      );
      expect(childProcessDrift).toBeDefined();
      expect(childProcessDrift?.severity).toBe('high');
    });

    it('should detect missing project roots', () => {
      const expected: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project1', '/app/project2'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const actual: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project1'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const report = generateDriftReport(expected, actual);

      expect(report.hasDrift).toBe(true);
      const rootsDrift = report.drift.find((d) => d.field === 'projectRoots');
      expect(rootsDrift).toBeDefined();
      expect(rootsDrift?.details).toContain('Missing roots');
    });

    it('should detect extra project roots', () => {
      const expected: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project1'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const actual: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project1', '/app/project2'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const report = generateDriftReport(expected, actual);

      expect(report.hasDrift).toBe(true);
      const rootsDrift = report.drift.find((d) => d.field === 'projectRoots');
      expect(rootsDrift).toBeDefined();
      expect(rootsDrift?.details).toContain('Extra roots');
    });

    it('should assign appropriate severity levels', () => {
      const expected: ServerPermissionConfig = {
        enabled: true,
        projectRoots: ['/app/project'],
        allowChildProcess: true,
        allowWorker: false,
      };

      const actual: ServerPermissionConfig = {
        enabled: false,
        projectRoots: [],
        allowChildProcess: false,
        allowWorker: true,
      };

      const report = generateDriftReport(expected, actual);

      const enabledDrift = report.drift.find((d) => d.field === 'enabled');
      expect(enabledDrift?.severity).toBe('critical');

      const childProcessDrift = report.drift.find(
        (d) => d.field === 'allowChildProcess'
      );
      expect(childProcessDrift?.severity).toBe('high');

      const workerDrift = report.drift.find((d) => d.field === 'allowWorker');
      expect(workerDrift?.severity).toBe('medium');
    });
  });
});
