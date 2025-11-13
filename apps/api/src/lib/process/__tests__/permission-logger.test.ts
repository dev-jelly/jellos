/**
 * Tests for permission logger
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PermissionLogger,
  initializePermissionLogger,
  getPermissionLogger,
  logPermissionViolation,
} from '../permission-logger';
import { PermissionViolationError } from '../permission-validator';

describe('Permission Logger', () => {
  let logger: PermissionLogger;

  beforeEach(() => {
    logger = new PermissionLogger({
      enabled: true,
      logToConsole: false, // Disable console for tests
      includeStackTrace: true,
      maxViolations: 10,
    });
  });

  describe('logViolation', () => {
    it('should log a violation', () => {
      const error = new PermissionViolationError(
        'read',
        '/etc/passwd',
        'Not in whitelist'
      );

      logger.logViolation(error);

      const violations = logger.getViolations();
      expect(violations.length).toBe(1);
      expect(violations[0].operation).toBe('read');
      expect(violations[0].path).toBe('/etc/passwd');
      expect(violations[0].reason).toBe('Not in whitelist');
    });

    it('should include process information', () => {
      const error = new PermissionViolationError('write', '/tmp/file', 'Test');

      logger.logViolation(error);

      const violations = logger.getViolations();
      expect(violations[0].processInfo.pid).toBe(process.pid);
      expect(violations[0].processInfo.nodeVersion).toBe(process.version);
      expect(violations[0].processInfo.platform).toBe(process.platform);
    });

    it('should respect max violations limit', () => {
      const smallLogger = new PermissionLogger({
        enabled: true,
        logToConsole: false,
        maxViolations: 3,
      });

      for (let i = 0; i < 5; i++) {
        const error = new PermissionViolationError('read', `/path/${i}`, 'Test');
        smallLogger.logViolation(error);
      }

      const violations = smallLogger.getViolations();
      expect(violations.length).toBe(3);
      // Should keep the most recent ones
      expect(violations[0].path).toBe('/path/2');
      expect(violations[2].path).toBe('/path/4');
    });

    it('should not log when disabled', () => {
      const disabledLogger = new PermissionLogger({
        enabled: false,
        logToConsole: false,
      });

      const error = new PermissionViolationError('read', '/path', 'Test');
      disabledLogger.logViolation(error);

      expect(disabledLogger.getViolations().length).toBe(0);
    });
  });

  describe('getRecentViolations', () => {
    it('should return recent violations', () => {
      for (let i = 0; i < 5; i++) {
        const error = new PermissionViolationError('read', `/path/${i}`, 'Test');
        logger.logViolation(error);
      }

      const recent = logger.getRecentViolations(3);
      expect(recent.length).toBe(3);
      expect(recent[0].path).toBe('/path/2');
      expect(recent[2].path).toBe('/path/4');
    });
  });

  describe('getViolationsByOperation', () => {
    it('should filter violations by operation', () => {
      logger.logViolation(new PermissionViolationError('read', '/a', 'Test'));
      logger.logViolation(new PermissionViolationError('write', '/b', 'Test'));
      logger.logViolation(new PermissionViolationError('read', '/c', 'Test'));
      logger.logViolation(new PermissionViolationError('spawn', '/d', 'Test'));

      const readViolations = logger.getViolationsByOperation('read');
      expect(readViolations.length).toBe(2);
      expect(readViolations[0].path).toBe('/a');
      expect(readViolations[1].path).toBe('/c');
    });
  });

  describe('getViolationsByPath', () => {
    it('should filter violations by path pattern', () => {
      logger.logViolation(new PermissionViolationError('read', '/etc/passwd', 'Test'));
      logger.logViolation(new PermissionViolationError('read', '/etc/shadow', 'Test'));
      logger.logViolation(new PermissionViolationError('read', '/tmp/file', 'Test'));

      const etcViolations = logger.getViolationsByPath(/^\/etc\//);
      expect(etcViolations.length).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all violations', () => {
      logger.logViolation(new PermissionViolationError('read', '/a', 'Test'));
      logger.logViolation(new PermissionViolationError('read', '/b', 'Test'));

      expect(logger.getViolations().length).toBe(2);

      logger.clear();

      expect(logger.getViolations().length).toBe(0);
    });
  });

  describe('getStatistics', () => {
    it('should generate statistics', () => {
      logger.logViolation(new PermissionViolationError('read', '/a', 'Reason 1'));
      logger.logViolation(new PermissionViolationError('write', '/b', 'Reason 2'));
      logger.logViolation(new PermissionViolationError('read', '/c', 'Reason 1'));
      logger.logViolation(new PermissionViolationError('spawn', '/d', 'Reason 3'));

      const stats = logger.getStatistics();

      expect(stats.totalViolations).toBe(4);
      expect(stats.byOperation.read).toBe(2);
      expect(stats.byOperation.write).toBe(1);
      expect(stats.byOperation.spawn).toBe(1);
      expect(stats.byReason['Reason 1']).toBe(2);
    });

    it('should include timestamp information', () => {
      logger.logViolation(new PermissionViolationError('read', '/a', 'Test'));

      const stats = logger.getStatistics();

      expect(stats.oldestViolation).toBeInstanceOf(Date);
      expect(stats.newestViolation).toBeInstanceOf(Date);
    });
  });

  describe('exportToJson', () => {
    it('should export violations as JSON', () => {
      logger.logViolation(new PermissionViolationError('read', '/a', 'Test'));

      const json = logger.exportToJson();
      const parsed = JSON.parse(json);

      expect(parsed.violations).toHaveLength(1);
      expect(parsed.statistics).toBeDefined();
      expect(parsed.exportedAt).toBeDefined();
    });
  });

  describe('global logger', () => {
    it('should initialize global logger', () => {
      const globalLogger = initializePermissionLogger({
        enabled: true,
        logToConsole: false,
      });

      expect(globalLogger).toBeInstanceOf(PermissionLogger);
    });

    it('should get global logger', () => {
      const logger1 = getPermissionLogger();
      const logger2 = getPermissionLogger();

      expect(logger1).toBe(logger2); // Same instance
    });

    it('should log to global logger', () => {
      initializePermissionLogger({
        enabled: true,
        logToConsole: false,
      });

      const error = new PermissionViolationError('read', '/test', 'Test');
      logPermissionViolation(error);

      const violations = getPermissionLogger().getViolations();
      expect(violations.length).toBeGreaterThan(0);
    });
  });
});
