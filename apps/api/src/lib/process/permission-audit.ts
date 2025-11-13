/**
 * Permission Audit Utilities
 *
 * Tools for inspecting, validating, and reporting on permission configurations.
 * Helps ensure permission models are correctly configured and identify issues.
 *
 * Task 15.5: Permission whitelist validation system
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ServerPermissionConfig } from './server-permissions';
import {
  validateConfiguredPaths,
  type ValidationResult,
} from './permission-validator';
import { getPermissionLogger, type ViolationStatistics } from './permission-logger';

/**
 * Permission audit report
 */
export interface PermissionAuditReport {
  timestamp: Date;
  configuration: ServerPermissionConfig;
  validation: ValidationResult;
  violations: ViolationStatistics;
  recommendations: string[];
  healthCheck: {
    configurationValid: boolean;
    noRecentViolations: boolean;
    pathsAccessible: boolean;
    securityPosture: 'secure' | 'moderate' | 'insecure';
  };
}

/**
 * Audit permission configuration and generate comprehensive report
 *
 * @param config - Permission configuration to audit
 * @returns Detailed audit report
 */
export function auditPermissionConfiguration(
  config: ServerPermissionConfig
): PermissionAuditReport {
  // Validate configured paths
  const validation = validateConfiguredPaths(config);

  // Get violation statistics
  const violations = getPermissionLogger().getStatistics();

  // Generate recommendations
  const recommendations = generateRecommendations(config, validation, violations);

  // Determine health status
  const healthCheck = {
    configurationValid: validation.valid,
    noRecentViolations: violations.totalViolations === 0,
    pathsAccessible: validation.errors.length === 0,
    securityPosture: determineSecurityPosture(config, validation),
  };

  return {
    timestamp: new Date(),
    configuration: config,
    validation,
    violations,
    recommendations,
    healthCheck,
  };
}

/**
 * Determine overall security posture
 */
function determineSecurityPosture(
  config: ServerPermissionConfig,
  validation: ValidationResult
): 'secure' | 'moderate' | 'insecure' {
  // Insecure if permission model is disabled
  if (!config.enabled) {
    return 'insecure';
  }

  // Insecure if configuration is invalid
  if (!validation.valid) {
    return 'insecure';
  }

  // Moderate if there are warnings
  if (validation.warnings.length > 0) {
    return 'moderate';
  }

  // Secure if enabled and configured correctly
  return 'secure';
}

/**
 * Generate recommendations based on audit findings
 */
function generateRecommendations(
  config: ServerPermissionConfig,
  validation: ValidationResult,
  violations: ViolationStatistics
): string[] {
  const recommendations: string[] = [];

  // Recommend enabling permission model in production
  if (!config.enabled && process.env.NODE_ENV === 'production') {
    recommendations.push(
      'CRITICAL: Enable permission model in production (NODE_PERMISSIONS=true)'
    );
  }

  // Recommend fixing configuration errors
  if (validation.errors.length > 0) {
    recommendations.push(
      `Fix ${validation.errors.length} configuration error(s) before deployment`
    );
  }

  // Recommend addressing violations
  if (violations.totalViolations > 0) {
    recommendations.push(
      `Investigate ${violations.totalViolations} permission violation(s) - possible attack or misconfiguration`
    );

    // Specific recommendations based on violation types
    const operations = Object.keys(violations.byOperation);
    if (operations.includes('write')) {
      recommendations.push(
        'Write violations detected - review PROJECT_ROOTS configuration'
      );
    }
    if (operations.includes('spawn')) {
      recommendations.push(
        'Process spawn violations detected - consider enabling ALLOW_CHILD_PROCESS'
      );
    }
  }

  // Recommend configuring project roots
  if (config.enabled && config.projectRoots.length === 0) {
    recommendations.push('Configure PROJECT_ROOTS environment variable');
  }

  // Recommend restricting child process in production
  if (
    config.allowChildProcess &&
    process.env.NODE_ENV === 'production'
  ) {
    recommendations.push(
      'INFO: Child process execution is enabled - ensure this is required for your use case'
    );
  }

  return recommendations;
}

/**
 * Display audit report to console
 */
export function displayAuditReport(report: PermissionAuditReport): void {
  console.log('\n' + '═'.repeat(80));
  console.log('🔍 PERMISSION AUDIT REPORT');
  console.log('═'.repeat(80));
  console.log(`Generated: ${report.timestamp.toISOString()}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');

  // Configuration status
  console.log('📋 Configuration:');
  console.log(
    `   Permission Model: ${report.configuration.enabled ? '✅ ENABLED' : '❌ DISABLED'}`
  );
  console.log(`   Project Roots: ${report.configuration.projectRoots.length}`);
  console.log(
    `   Child Process: ${report.configuration.allowChildProcess ? '✅' : '❌'}`
  );
  console.log(`   Worker Threads: ${report.configuration.allowWorker ? '✅' : '❌'}`);
  console.log('');

  // Validation results
  console.log('✓ Validation:');
  console.log(`   Status: ${report.validation.valid ? '✅ VALID' : '❌ INVALID'}`);
  if (report.validation.errors.length > 0) {
    console.log(`   Errors: ${report.validation.errors.length}`);
    for (const error of report.validation.errors) {
      console.log(`     • ${error}`);
    }
  }
  if (report.validation.warnings.length > 0) {
    console.log(`   Warnings: ${report.validation.warnings.length}`);
    for (const warning of report.validation.warnings) {
      console.log(`     • ${warning}`);
    }
  }
  console.log('');

  // Violations
  console.log('🚫 Violations:');
  console.log(`   Total: ${report.violations.totalViolations}`);
  if (report.violations.totalViolations > 0) {
    console.log('   By Operation:');
    for (const [op, count] of Object.entries(report.violations.byOperation)) {
      console.log(`     • ${op}: ${count}`);
    }
  }
  console.log('');

  // Health check
  console.log('🏥 Health Check:');
  console.log(
    `   Configuration Valid: ${report.healthCheck.configurationValid ? '✅' : '❌'}`
  );
  console.log(
    `   No Recent Violations: ${report.healthCheck.noRecentViolations ? '✅' : '⚠️'}`
  );
  console.log(
    `   Paths Accessible: ${report.healthCheck.pathsAccessible ? '✅' : '❌'}`
  );

  const postureIcon =
    report.healthCheck.securityPosture === 'secure'
      ? '✅'
      : report.healthCheck.securityPosture === 'moderate'
        ? '⚠️'
        : '❌';
  console.log(
    `   Security Posture: ${postureIcon} ${report.healthCheck.securityPosture.toUpperCase()}`
  );
  console.log('');

  // Recommendations
  if (report.recommendations.length > 0) {
    console.log('💡 Recommendations:');
    for (const rec of report.recommendations) {
      const icon = rec.startsWith('CRITICAL') ? '🔴' : rec.startsWith('INFO') ? 'ℹ️' : '⚠️';
      console.log(`   ${icon} ${rec}`);
    }
    console.log('');
  }

  console.log('═'.repeat(80));
  console.log('');
}

/**
 * Pre-flight validation script
 * Run before application start to ensure permissions are correctly configured
 *
 * @param config - Permission configuration
 * @returns True if validation passes, false otherwise
 */
export function preflightValidation(config: ServerPermissionConfig): boolean {
  console.log('\n🚀 Pre-flight Permission Validation');
  console.log('─'.repeat(80));

  // Check Node.js version supports permission model
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 20) {
    console.error('❌ Node.js 20+ required for permission model');
    console.error(`   Current version: ${process.version}`);
    return false;
  }
  console.log(`✅ Node.js version: ${process.version}`);

  // Validate configuration
  const validation = validateConfiguredPaths(config);

  if (validation.errors.length > 0) {
    console.error('\n❌ Configuration Errors:');
    for (const error of validation.errors) {
      console.error(`   • ${error}`);
    }
    console.error('\n💡 Fix errors before proceeding');
    return false;
  }
  console.log('✅ Configuration valid');

  if (validation.warnings.length > 0) {
    console.warn('\n⚠️  Configuration Warnings:');
    for (const warning of validation.warnings) {
      console.warn(`   • ${warning}`);
    }
  }

  // Environment-specific checks
  if (process.env.NODE_ENV === 'production') {
    if (!config.enabled) {
      console.error('\n❌ Permission model MUST be enabled in production');
      console.error('   Set NODE_PERMISSIONS=true');
      return false;
    }

    if (config.projectRoots.length === 0) {
      console.error('\n❌ No PROJECT_ROOTS configured for production');
      console.error('   Set PROJECT_ROOTS=/path/to/app,/path/to/data');
      return false;
    }

    console.log('✅ Production security checks passed');
  }

  console.log('\n✅ Pre-flight validation complete');
  console.log('─'.repeat(80) + '\n');

  return true;
}

/**
 * Export audit report to file
 *
 * @param report - Audit report to export
 * @param outputPath - Path to write report
 */
export function exportAuditReport(
  report: PermissionAuditReport,
  outputPath: string
): void {
  const json = JSON.stringify(report, null, 2);
  fs.writeFileSync(outputPath, json, 'utf-8');
  console.log(`📝 Audit report exported to: ${outputPath}`);
}

/**
 * Generate permission drift report
 * Compares expected vs actual permission configuration
 *
 * @param expected - Expected configuration
 * @param actual - Actual configuration
 */
export function generateDriftReport(
  expected: ServerPermissionConfig,
  actual: ServerPermissionConfig
): PermissionDriftReport {
  const drift: PermissionDrift[] = [];

  // Check enabled status
  if (expected.enabled !== actual.enabled) {
    drift.push({
      field: 'enabled',
      expected: expected.enabled,
      actual: actual.enabled,
      severity: 'critical',
    });
  }

  // Check child process permission
  if (expected.allowChildProcess !== actual.allowChildProcess) {
    drift.push({
      field: 'allowChildProcess',
      expected: expected.allowChildProcess,
      actual: actual.allowChildProcess,
      severity: 'high',
    });
  }

  // Check worker permission
  if (expected.allowWorker !== actual.allowWorker) {
    drift.push({
      field: 'allowWorker',
      expected: expected.allowWorker,
      actual: actual.allowWorker,
      severity: 'medium',
    });
  }

  // Check project roots
  const expectedRoots = new Set(expected.projectRoots);
  const actualRoots = new Set(actual.projectRoots);

  const missingRoots = Array.from(expectedRoots).filter((r) => !actualRoots.has(r));
  const extraRoots = Array.from(actualRoots).filter((r) => !expectedRoots.has(r));

  if (missingRoots.length > 0) {
    drift.push({
      field: 'projectRoots',
      expected: expected.projectRoots,
      actual: actual.projectRoots,
      severity: 'high',
      details: `Missing roots: ${missingRoots.join(', ')}`,
    });
  }

  if (extraRoots.length > 0) {
    drift.push({
      field: 'projectRoots',
      expected: expected.projectRoots,
      actual: actual.projectRoots,
      severity: 'medium',
      details: `Extra roots: ${extraRoots.join(', ')}`,
    });
  }

  return {
    timestamp: new Date(),
    hasDrift: drift.length > 0,
    driftCount: drift.length,
    drift,
  };
}

/**
 * Permission drift item
 */
export interface PermissionDrift {
  field: string;
  expected: unknown;
  actual: unknown;
  severity: 'critical' | 'high' | 'medium' | 'low';
  details?: string;
}

/**
 * Permission drift report
 */
export interface PermissionDriftReport {
  timestamp: Date;
  hasDrift: boolean;
  driftCount: number;
  drift: PermissionDrift[];
}
