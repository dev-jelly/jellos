#!/usr/bin/env node
/**
 * Permission Pre-flight Validation Script
 *
 * Run before application start to validate permission configuration.
 * Ensures all required permissions are correctly configured and accessible.
 *
 * Usage:
 *   npm run validate:permissions
 *   node dist/scripts/validate-permissions.js
 *
 * Task 15.5: Permission whitelist validation system
 */

import {
  getPermissionConfig,
  validatePermissionConfig,
} from '../lib/process/permission-profiles';
import {
  preflightValidation,
  auditPermissionConfiguration,
  displayAuditReport,
} from '../lib/process/permission-audit';

/**
 * Main validation function
 */
async function main(): Promise<void> {
  console.log('\n' + '═'.repeat(80));
  console.log('🔒 JELLOS PERMISSION VALIDATION');
  console.log('═'.repeat(80));
  console.log('');

  // Get current configuration
  const config = getPermissionConfig();

  console.log('📋 Configuration Source:');
  if (process.env.NODE_PERMISSIONS !== undefined) {
    console.log('   Using explicit environment variables');
  } else {
    console.log(`   Using profile: ${process.env.NODE_ENV || 'development'}`);
  }
  console.log('');

  // Validate configuration
  validatePermissionConfig(config);

  // Run pre-flight validation
  const preflightPassed = preflightValidation(config);

  if (!preflightPassed) {
    console.error('❌ Pre-flight validation failed');
    console.error('   Application may not start correctly with current configuration');
    process.exit(1);
  }

  // Generate and display audit report
  const report = auditPermissionConfiguration(config);
  displayAuditReport(report);

  // Exit with appropriate code
  if (report.healthCheck.securityPosture === 'insecure') {
    console.error('❌ Insecure configuration detected');
    process.exit(1);
  } else if (report.healthCheck.securityPosture === 'moderate') {
    console.warn('⚠️  Configuration has warnings but is functional');
    process.exit(0);
  } else {
    console.log('✅ All validation checks passed');
    process.exit(0);
  }
}

// Run validation
main().catch((error) => {
  console.error('\n❌ Validation script failed:');
  console.error(error);
  process.exit(1);
});
