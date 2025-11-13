#!/usr/bin/env tsx
/**
 * Manual Permission Model Test Script
 *
 * This script demonstrates and tests Node.js Permission Model functionality.
 * Run with different configurations to see how permissions work.
 *
 * Usage:
 *   # Without permissions (should succeed)
 *   tsx src/lib/process/__tests__/manual-permission-test.ts
 *
 *   # With permissions enabled (will show restrictions)
 *   NODE_PERMISSIONS=true tsx src/lib/process/__tests__/manual-permission-test.ts
 *
 *   # With specific project roots
 *   NODE_PERMISSIONS=true PROJECT_ROOTS=/tmp tsx src/lib/process/__tests__/manual-permission-test.ts
 */

import {
  getPermissionConfig,
  displayPermissionConfig,
  validatePermissionConfig,
  buildCompletePermissionArgs,
} from '../permission-profiles';
import { safeSpawn, PermissionDeniedError } from '../safe-spawn';
import * as fs from 'fs';
import * as path from 'path';

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Node.js Permission Model Manual Test');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Display current configuration
  const config = getPermissionConfig();
  validatePermissionConfig(config);
  displayPermissionConfig(config);

  const isActive = typeof (process as any).permission !== 'undefined';
  console.log(`Permission Model Active: ${isActive ? '✅ YES' : '❌ NO'}\n`);

  if (config.enabled && !isActive) {
    console.log('⚠️  Note: Permission model is configured but not active.');
    console.log('   Node.js must be started with --permission flag.\n');
  }

  // Generate permission arguments
  const args = buildCompletePermissionArgs(config);
  if (args.length > 0) {
    console.log('📝 Generated Permission Arguments:');
    console.log('   ' + args.join(' \\\n   ') + '\n');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Running Access Tests');
  console.log('═══════════════════════════════════════════════════════════\n');

  let passCount = 0;
  let failCount = 0;

  // Test 1: Read current directory
  console.log('Test 1: Read package.json (should succeed)');
  try {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'package.json'),
      'utf-8'
    );
    const pkg = JSON.parse(content);
    console.log(`   ✅ SUCCESS: Read package.json (${pkg.name})`);
    passCount++;
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
    failCount++;
  }

  // Test 2: Spawn child process
  console.log('\nTest 2: Spawn child process (node --version)');
  try {
    const result = await safeSpawn('node', ['--version'], { timeout: 2000 });
    console.log(`   ✅ SUCCESS: ${result.stdout}`);
    passCount++;
  } catch (error: any) {
    if (error instanceof PermissionDeniedError) {
      console.log(`   ❌ PERMISSION DENIED: ${error.message}`);
    } else {
      console.log(`   ❌ FAILED: ${error.message}`);
    }
    failCount++;
  }

  // Test 3: Write to temp directory
  console.log('\nTest 3: Write to /tmp (should succeed if /tmp is allowed)');
  const tmpFile = '/tmp/jellos-permission-test.txt';
  try {
    fs.writeFileSync(tmpFile, 'test data');
    console.log(`   ✅ SUCCESS: Wrote to ${tmpFile}`);
    fs.unlinkSync(tmpFile);
    passCount++;
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
    failCount++;
  }

  // Test 4: Try to access restricted path
  console.log('\nTest 4: Read /etc/passwd (may fail with permissions)');
  try {
    const content = fs.readFileSync('/etc/passwd', 'utf-8');
    console.log(`   ✅ SUCCESS: Read /etc/passwd (${content.split('\n').length} lines)`);
    passCount++;
  } catch (error: any) {
    if (error.code === 'ERR_ACCESS_DENIED') {
      console.log(`   🔒 BLOCKED: Permission model denied access (expected)`);
    } else {
      console.log(`   ⚠️  FAILED: ${error.message} (not permission-related)`);
    }
    failCount++;
  }

  // Test 5: List directory
  console.log('\nTest 5: List current directory');
  try {
    const result = await safeSpawn('ls', ['-la'], {
      timeout: 2000,
      cwd: process.cwd(),
    });
    const lineCount = result.stdout.split('\n').length;
    console.log(`   ✅ SUCCESS: Listed ${lineCount} entries`);
    passCount++;
  } catch (error: any) {
    if (error instanceof PermissionDeniedError) {
      console.log(`   ❌ PERMISSION DENIED: ${error.message}`);
    } else {
      console.log(`   ❌ FAILED: ${error.message}`);
    }
    failCount++;
  }

  // Test 6: Execute echo command
  console.log('\nTest 6: Execute echo command');
  try {
    const result = await safeSpawn('echo', ['Hello from Jellos'], { timeout: 1000 });
    console.log(`   ✅ SUCCESS: ${result.stdout}`);
    passCount++;
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
    failCount++;
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Test Summary');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`   Total Tests: ${passCount + failCount}`);
  console.log(`   ✅ Passed: ${passCount}`);
  console.log(`   ❌ Failed: ${failCount}`);

  if (config.enabled && !isActive) {
    console.log('\n💡 Tip: To test with permission model active, restart Node.js:');
    console.log('   node --permission --allow-child-process \\');
    console.log('     --allow-fs-read=$(pwd) \\');
    console.log('     --allow-fs-write=/tmp \\');
    console.log('     -r tsx/cjs src/lib/process/__tests__/manual-permission-test.ts');
  }

  if (!config.enabled) {
    console.log('\n💡 Tip: To enable permission model:');
    console.log('   NODE_PERMISSIONS=true tsx src/lib/process/__tests__/manual-permission-test.ts');
  }

  console.log('');

  // Exit with appropriate code
  process.exit(failCount > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('Test script failed:', error);
  process.exit(1);
});
