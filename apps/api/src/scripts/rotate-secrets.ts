#!/usr/bin/env node
/**
 * Secret Rotation Automation Script
 * Task 15.6: Automate secret rotation across providers
 *
 * Usage:
 *   pnpm tsx src/scripts/rotate-secrets.ts --provider=keychain --secret=GITHUB_TOKEN
 *   pnpm tsx src/scripts/rotate-secrets.ts --all --dry-run
 */

import { SecretManager } from '../lib/secrets/secret-manager';
import { KeychainProvider } from '../lib/secrets/providers/keychain';
import { OnePasswordProvider } from '../lib/secrets/providers/onepassword';

interface RotationOptions {
  provider: 'keychain' | '1password' | 'all';
  secret?: string;
  dryRun: boolean;
  backup: boolean;
  notify: boolean;
}

interface RotationResult {
  secret: string;
  provider: string;
  oldVersion: string;
  newVersion: string;
  rotatedAt: string;
  backupPath?: string;
  success: boolean;
  error?: string;
}

/**
 * Secret Rotation Manager
 */
class SecretRotationManager {
  private secretManager: SecretManager;
  private keychainProvider: KeychainProvider;
  private onePasswordProvider: OnePasswordProvider;

  constructor() {
    this.secretManager = new SecretManager();
    this.keychainProvider = new KeychainProvider();
    this.onePasswordProvider = new OnePasswordProvider();
  }

  /**
   * Rotate a single secret
   */
  async rotateSecret(
    secretName: string,
    provider: 'keychain' | '1password',
    options: Omit<RotationOptions, 'provider' | 'secret'>
  ): Promise<RotationResult> {
    const result: RotationResult = {
      secret: secretName,
      provider,
      oldVersion: '',
      newVersion: '',
      rotatedAt: new Date().toISOString(),
      success: false,
    };

    try {
      // Step 1: Read current secret
      const currentValue = await this.secretManager.getSecret(secretName);
      if (!currentValue) {
        throw new Error(`Secret ${secretName} not found`);
      }

      result.oldVersion = this.hashSecret(currentValue);

      if (options.dryRun) {
        console.log(`[DRY RUN] Would rotate secret: ${secretName}`);
        result.success = true;
        return result;
      }

      // Step 2: Backup current secret if requested
      if (options.backup) {
        const backupName = `${secretName}_backup_${Date.now()}`;
        const providerInstance = this.getProvider(provider);
        await providerInstance.set(backupName, currentValue);
        result.backupPath = backupName;
        console.log(`✓ Backed up ${secretName} to ${backupName}`);
      }

      // Step 3: Generate new secret value
      const newValue = await this.generateNewSecret(secretName, currentValue);
      result.newVersion = this.hashSecret(newValue);

      // Step 4: Write new secret
      const providerInstance = this.getProvider(provider);
      await providerInstance.set(secretName, newValue);
      console.log(`✓ Rotated secret: ${secretName}`);

      // Step 5: Verify new secret was written
      const verifyValue = await providerInstance.get(secretName);
      if (verifyValue !== newValue) {
        throw new Error('Secret verification failed after rotation');
      }

      result.success = true;

      // Step 6: Notify if requested
      if (options.notify) {
        await this.notifyRotation(result);
      }

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`✗ Failed to rotate ${secretName}:`, result.error);
      return result;
    }
  }

  /**
   * Rotate all secrets in a provider
   */
  async rotateAllSecrets(
    provider: 'keychain' | '1password',
    options: Omit<RotationOptions, 'provider' | 'secret'>
  ): Promise<RotationResult[]> {
    const providerInstance = this.getProvider(provider);
    const allSecrets = await providerInstance.list?.() || [];

    console.log(`Found ${allSecrets.length} secrets in ${provider}`);

    const results: RotationResult[] = [];

    for (const secretName of allSecrets) {
      const result = await this.rotateSecret(secretName, provider, options);
      results.push(result);

      // Add delay between rotations to avoid rate limiting
      await this.delay(1000);
    }

    return results;
  }

  /**
   * Rotate secrets across all providers
   */
  async rotateAcrossProviders(
    options: Omit<RotationOptions, 'provider' | 'secret'>
  ): Promise<RotationResult[]> {
    const results: RotationResult[] = [];

    // Rotate Keychain secrets
    const keychainResults = await this.rotateAllSecrets('keychain', options);
    results.push(...keychainResults);

    // Rotate 1Password secrets
    const onePasswordResults = await this.rotateAllSecrets('1password', options);
    results.push(...onePasswordResults);

    return results;
  }

  /**
   * Generate new secret value
   * Override this method for custom secret generation logic
   */
  private async generateNewSecret(secretName: string, currentValue: string): Promise<string> {
    // For API tokens, you would typically call the provider's API to regenerate
    // For now, we append a timestamp to demonstrate rotation
    // In production, implement proper token regeneration based on the service

    if (secretName.includes('GITHUB')) {
      // GitHub token rotation would use GitHub API
      throw new Error('GitHub token rotation requires API integration');
    } else if (secretName.includes('LINEAR')) {
      // Linear token rotation would use Linear API
      throw new Error('Linear token rotation requires API integration');
    } else {
      // Generic secrets: generate random value
      return this.generateRandomSecret(64);
    }
  }

  /**
   * Generate random secret
   */
  private generateRandomSecret(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
    let secret = '';
    const randomBytes = crypto.getRandomValues(new Uint8Array(length));

    for (let i = 0; i < length; i++) {
      secret += charset[randomBytes[i] % charset.length];
    }

    return secret;
  }

  /**
   * Hash secret for version tracking (do not log full secrets!)
   */
  private hashSecret(value: string): string {
    // Simple hash for version tracking (not cryptographic)
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  /**
   * Get provider instance
   */
  private getProvider(provider: 'keychain' | '1password') {
    return provider === 'keychain' ? this.keychainProvider : this.onePasswordProvider;
  }

  /**
   * Send rotation notification
   */
  private async notifyRotation(result: RotationResult): Promise<void> {
    // In production, integrate with notification services:
    // - Slack webhook
    // - Email via SendGrid
    // - PagerDuty
    // - Custom webhooks

    console.log('📧 Notification sent:', {
      secret: result.secret,
      provider: result.provider,
      rotatedAt: result.rotatedAt,
      success: result.success,
    });
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Print rotation report
   */
  printReport(results: RotationResult[]): void {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log('\n=== Secret Rotation Report ===');
    console.log(`Total: ${results.length}`);
    console.log(`✓ Successful: ${successful.length}`);
    console.log(`✗ Failed: ${failed.length}`);

    if (failed.length > 0) {
      console.log('\nFailed Rotations:');
      failed.forEach((r) => {
        console.log(`  - ${r.secret} (${r.provider}): ${r.error}`);
      });
    }

    console.log('\n==============================\n');
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): RotationOptions {
  const args = process.argv.slice(2);
  const options: RotationOptions = {
    provider: 'all',
    dryRun: false,
    backup: true,
    notify: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--provider=')) {
      options.provider = arg.split('=')[1] as any;
    } else if (arg.startsWith('--secret=')) {
      options.secret = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-backup') {
      options.backup = false;
    } else if (arg === '--notify') {
      options.notify = true;
    } else if (arg === '--all') {
      options.provider = 'all';
    }
  }

  return options;
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();
  const manager = new SecretRotationManager();

  console.log('🔄 Secret Rotation Script');
  console.log('Provider:', options.provider);
  console.log('Dry Run:', options.dryRun);
  console.log('Backup:', options.backup);
  console.log('Notify:', options.notify);
  console.log('');

  let results: RotationResult[];

  if (options.secret) {
    // Rotate single secret
    if (options.provider === 'all') {
      throw new Error('Must specify --provider when rotating a single secret');
    }

    const result = await manager.rotateSecret(options.secret, options.provider as any, options);
    results = [result];
  } else if (options.provider === 'all') {
    // Rotate all secrets across all providers
    results = await manager.rotateAcrossProviders(options);
  } else {
    // Rotate all secrets in specific provider
    results = await manager.rotateAllSecrets(options.provider as any, options);
  }

  manager.printReport(results);

  const failed = results.filter((r) => !r.success);
  process.exit(failed.length > 0 ? 1 : 0);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { SecretRotationManager, type RotationOptions, type RotationResult };
