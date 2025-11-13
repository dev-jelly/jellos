/**
 * Permission Violation Logging System
 *
 * Tracks and reports permission violations for security auditing and debugging.
 * Helps identify unauthorized access attempts and permission configuration issues.
 *
 * Task 15.5: Permission whitelist validation system
 */

import { PermissionViolationError } from './permission-validator';

// Re-export for convenience
export { PermissionViolationError };

/**
 * Permission violation log entry
 */
export interface PermissionViolation {
  timestamp: Date;
  operation: string;
  path: string;
  reason: string;
  stackTrace?: string;
  processInfo: {
    pid: number;
    nodeVersion: string;
    platform: string;
  };
}

/**
 * Permission logger configuration
 */
export interface PermissionLoggerConfig {
  /** Enable logging */
  enabled: boolean;
  /** Log to console */
  logToConsole: boolean;
  /** Include stack traces */
  includeStackTrace: boolean;
  /** Maximum violations to keep in memory */
  maxViolations: number;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: PermissionLoggerConfig = {
  enabled: true,
  logToConsole: true,
  includeStackTrace: true,
  maxViolations: 1000,
};

/**
 * Permission violation logger
 */
export class PermissionLogger {
  private violations: PermissionViolation[] = [];
  private config: PermissionLoggerConfig;

  constructor(config: Partial<PermissionLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Log a permission violation
   */
  logViolation(error: PermissionViolationError): void {
    if (!this.config.enabled) {
      return;
    }

    const violation: PermissionViolation = {
      timestamp: new Date(),
      operation: error.operation,
      path: error.path,
      reason: error.reason,
      stackTrace: this.config.includeStackTrace ? error.stack : undefined,
      processInfo: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
      },
    };

    // Add to in-memory log
    this.violations.push(violation);

    // Trim if exceeds max
    if (this.violations.length > this.config.maxViolations) {
      this.violations.shift();
    }

    // Log to console if enabled
    if (this.config.logToConsole) {
      this.logToConsole(violation);
    }
  }

  /**
   * Log violation to console
   */
  private logToConsole(violation: PermissionViolation): void {
    console.error('\n🚫 Permission Violation Detected:');
    console.error(`   Time:      ${violation.timestamp.toISOString()}`);
    console.error(`   Operation: ${violation.operation}`);
    console.error(`   Path:      ${violation.path}`);
    console.error(`   Reason:    ${violation.reason}`);
    console.error(`   PID:       ${violation.processInfo.pid}`);

    if (violation.stackTrace && this.config.includeStackTrace) {
      console.error('\n   Stack Trace:');
      const lines = violation.stackTrace.split('\n');
      for (const line of lines.slice(0, 5)) {
        console.error(`   ${line}`);
      }
    }

    console.error('');
  }

  /**
   * Get all violations
   */
  getViolations(): ReadonlyArray<PermissionViolation> {
    return [...this.violations];
  }

  /**
   * Get recent violations
   */
  getRecentViolations(count: number): ReadonlyArray<PermissionViolation> {
    return this.violations.slice(-count);
  }

  /**
   * Get violations for a specific operation
   */
  getViolationsByOperation(operation: string): ReadonlyArray<PermissionViolation> {
    return this.violations.filter((v) => v.operation === operation);
  }

  /**
   * Get violations for a specific path pattern
   */
  getViolationsByPath(pathPattern: RegExp): ReadonlyArray<PermissionViolation> {
    return this.violations.filter((v) => pathPattern.test(v.path));
  }

  /**
   * Clear all violations
   */
  clear(): void {
    this.violations = [];
  }

  /**
   * Get violation statistics
   */
  getStatistics(): ViolationStatistics {
    const operationCounts = new Map<string, number>();
    const pathCounts = new Map<string, number>();
    const reasonCounts = new Map<string, number>();

    for (const violation of this.violations) {
      // Count by operation
      operationCounts.set(
        violation.operation,
        (operationCounts.get(violation.operation) || 0) + 1
      );

      // Count by path
      pathCounts.set(violation.path, (pathCounts.get(violation.path) || 0) + 1);

      // Count by reason
      reasonCounts.set(violation.reason, (reasonCounts.get(violation.reason) || 0) + 1);
    }

    return {
      totalViolations: this.violations.length,
      byOperation: Object.fromEntries(operationCounts),
      byPath: Object.fromEntries(pathCounts),
      byReason: Object.fromEntries(reasonCounts),
      oldestViolation: this.violations[0]?.timestamp,
      newestViolation: this.violations[this.violations.length - 1]?.timestamp,
    };
  }

  /**
   * Export violations as JSON
   */
  exportToJson(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        violations: this.violations,
        statistics: this.getStatistics(),
      },
      null,
      2
    );
  }
}

/**
 * Violation statistics
 */
export interface ViolationStatistics {
  totalViolations: number;
  byOperation: Record<string, number>;
  byPath: Record<string, number>;
  byReason: Record<string, number>;
  oldestViolation?: Date;
  newestViolation?: Date;
}

/**
 * Global permission logger instance
 */
let globalLogger: PermissionLogger | null = null;

/**
 * Initialize global permission logger
 */
export function initializePermissionLogger(
  config?: Partial<PermissionLoggerConfig>
): PermissionLogger {
  globalLogger = new PermissionLogger(config);
  return globalLogger;
}

/**
 * Get global permission logger
 */
export function getPermissionLogger(): PermissionLogger {
  if (!globalLogger) {
    globalLogger = new PermissionLogger();
  }
  return globalLogger;
}

/**
 * Log a permission violation to the global logger
 */
export function logPermissionViolation(error: PermissionViolationError): void {
  getPermissionLogger().logViolation(error);
}
