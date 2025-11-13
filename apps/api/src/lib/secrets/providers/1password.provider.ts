/**
 * 1Password CLI Secret Provider
 * Uses the `op` command to interact with 1Password
 *
 * Requirements:
 * - 1Password CLI v2+ installed (https://1password.com/downloads/command-line/)
 * - User must be signed in (`op signin`)
 *
 * Installation:
 * ```bash
 * # macOS
 * brew install 1password-cli
 *
 * # Linux
 * curl -sS https://downloads.1password.com/linux/keys/1password.asc | gpg --dearmor > /usr/share/keyrings/1password-archive-keyring.gpg
 * echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main' | tee /etc/apt/sources.list.d/1password.list
 * apt update && apt install 1password-cli
 * ```
 *
 * Usage:
 * ```typescript
 * const provider = createOnePasswordProvider();
 * const health = await provider.getHealthStatus();
 *
 * if (health.available && health.authenticated) {
 *   await provider.setSecret('API_KEY', 'secret-value', 'dev');
 *   const value = await provider.getSecret('API_KEY', 'dev');
 * }
 * ```
 */

import { safeSpawn, isCommandAvailable, getCommandVersion } from '../../process/safe-spawn';
import type { ISecretProvider, ProviderHealthCheck } from '../types';
import { SecretProviderType, ProviderHealthStatus } from '../types';

/**
 * Vault name prefix for Jellos secrets in 1Password
 */
const OP_VAULT_PREFIX = 'Jellos';

/**
 * 1Password CLI provider implementation
 */
export class OnePasswordProvider implements ISecretProvider {
  type = SecretProviderType.ONE_PASSWORD;
  name = '1Password CLI';

  /**
   * Check if 1Password CLI is available and signed in
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check if `op` command is available
      const cliInstalled = await isCommandAvailable('op');
      if (!cliInstalled) {
        return false;
      }

      // Check if signed in by trying to access account info
      const accountResult = await safeSpawn('op', ['account', 'list'], { timeout: 3000 });
      return accountResult.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Get comprehensive health status of 1Password provider
   */
  async getHealthStatus(): Promise<ProviderHealthCheck> {
    const startTime = Date.now();
    const result: ProviderHealthCheck = {
      status: ProviderHealthStatus.UNAVAILABLE,
      available: false,
      cliInstalled: false,
      authenticated: false,
      lastChecked: new Date(),
    };

    // Check if op command is installed
    try {
      result.cliInstalled = await isCommandAvailable('op');
    } catch (error) {
      result.error = 'Failed to check for op command';
      result.helpText = 'Install 1Password CLI from: https://1password.com/downloads/command-line/';
      return result;
    }

    if (!result.cliInstalled) {
      result.error = 'op command not found';
      result.helpText = 'Install 1Password CLI: brew install 1password-cli (macOS) or visit https://1password.com/downloads/command-line/';
      return result;
    }

    // Get version
    try {
      const versionOutput = await getCommandVersion('op', ['--version']);
      if (versionOutput) {
        result.version = versionOutput.trim();
      }
    } catch {
      result.version = 'unknown';
    }

    // Check if signed in
    try {
      const accountResult = await safeSpawn('op', ['account', 'list'], { timeout: 3000 });

      if (accountResult.exitCode === 0) {
        result.authenticated = true;
        result.available = true;
        result.status = ProviderHealthStatus.HEALTHY;
        result.latency = Date.now() - startTime;
      } else {
        result.status = ProviderHealthStatus.DEGRADED;
        result.error = 'Not signed in to 1Password';
        result.helpText = 'Sign in to 1Password: op signin';
      }
    } catch (error) {
      result.status = ProviderHealthStatus.DEGRADED;
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.helpText = '1Password CLI is installed but not responding. Try: op signin';
    }

    return result;
  }

  /**
   * Get secret from 1Password
   * Uses: op read "op://vault/item/field"
   *
   * @throws Error if 1Password CLI is not available or not authenticated
   */
  async getSecret(key: string, namespace: string): Promise<string | null> {
    // Check availability first
    if (!(await this.isAvailable())) {
      throw new Error(
        '1Password CLI is not available or not signed in. Install 1Password CLI and run: op signin'
      );
    }

    try {
      const reference = this.buildOpReference(key, namespace);

      const result = await safeSpawn(
        'op',
        ['read', reference],
        {
          timeout: 10000,
        }
      );

      if (result.exitCode === 0 && result.stdout) {
        return result.stdout.trim();
      }

      // Check for specific error messages
      if (result.stderr.includes('not found') || result.stderr.includes("isn't in")) {
        return null; // Item doesn't exist
      }

      if (result.stderr.includes('signed in') || result.stderr.includes('authentication')) {
        throw new Error(
          'Not signed in to 1Password. Run: op signin'
        );
      }

      if (result.stderr.includes('vault') && result.stderr.includes('not found')) {
        throw new Error(
          `Vault "${this.buildVaultName(namespace)}" not found in 1Password. Create it or check the namespace.`
        );
      }

      return null;
    } catch (error) {
      if (error instanceof Error &&
          (error.message.includes('signed in') || error.message.includes('vault'))) {
        throw error; // Re-throw authentication and vault errors
      }
      // Secret not found or other non-critical error
      return null;
    }
  }

  /**
   * Store secret in 1Password
   * Uses: op item create or op item edit
   *
   * @throws Error if 1Password CLI is not available, not authenticated, or operation fails
   */
  async setSecret(key: string, value: string, namespace: string): Promise<void> {
    // Check availability first
    if (!(await this.isAvailable())) {
      throw new Error(
        '1Password CLI is not available or not signed in. Install 1Password CLI and run: op signin'
      );
    }

    const vaultName = this.buildVaultName(namespace);
    const itemName = key;

    try {
      // Check if item exists
      const existsResult = await safeSpawn(
        'op',
        ['item', 'get', itemName, '--vault', vaultName],
        { timeout: 5000 }
      );

      if (existsResult.exitCode === 0) {
        // Item exists, update it
        const result = await safeSpawn(
          'op',
          [
            'item',
            'edit',
            itemName,
            '--vault', vaultName,
            `password=${value}`,
          ],
          { timeout: 10000 }
        );

        if (result.exitCode !== 0) {
          if (result.stderr.includes('signed in') || result.stderr.includes('authentication')) {
            throw new Error('Not signed in to 1Password. Run: op signin');
          }

          if (result.stderr.includes('permission') || result.stderr.includes('access denied')) {
            throw new Error(`Permission denied to modify item in vault "${vaultName}"`);
          }

          throw new Error(`Failed to update secret in 1Password: ${result.stderr || 'Unknown error'}`);
        }
      } else {
        // Item doesn't exist, create it
        const result = await safeSpawn(
          'op',
          [
            'item',
            'create',
            '--category', 'password',
            '--vault', vaultName,
            '--title', itemName,
            `password=${value}`,
          ],
          { timeout: 10000 }
        );

        if (result.exitCode !== 0) {
          if (result.stderr.includes('signed in') || result.stderr.includes('authentication')) {
            throw new Error('Not signed in to 1Password. Run: op signin');
          }

          if (result.stderr.includes('vault') && result.stderr.includes('not found')) {
            throw new Error(
              `Vault "${vaultName}" not found. Create it in 1Password or check the namespace.`
            );
          }

          if (result.stderr.includes('permission') || result.stderr.includes('access denied')) {
            throw new Error(`Permission denied to create item in vault "${vaultName}"`);
          }

          throw new Error(`Failed to create secret in 1Password: ${result.stderr || 'Unknown error'}`);
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to store secret in 1Password: ${error}`);
    }
  }

  /**
   * List all secrets in a namespace (vault)
   */
  async listSecrets(namespace: string): Promise<string[]> {
    const vaultName = this.buildVaultName(namespace);

    try {
      const result = await safeSpawn(
        'op',
        [
          'item',
          'list',
          '--vault', vaultName,
          '--format', 'json',
        ],
        { timeout: 10000 }
      );

      if (result.exitCode !== 0) {
        return [];
      }

      const items = JSON.parse(result.stdout);
      return items.map((item: any) => item.title);
    } catch {
      return [];
    }
  }

  /**
   * Delete secret from 1Password
   */
  async deleteSecret(key: string, namespace: string): Promise<void> {
    const vaultName = this.buildVaultName(namespace);
    const itemName = key;

    await safeSpawn(
      'op',
      [
        'item',
        'delete',
        itemName,
        '--vault', vaultName,
      ],
      { timeout: 10000 }
    );
  }

  /**
   * Build 1Password reference string
   * Format: op://vault/item/field
   */
  private buildOpReference(key: string, namespace: string): string {
    const vaultName = this.buildVaultName(namespace);
    return `op://${vaultName}/${key}/password`;
  }

  /**
   * Build vault name from namespace
   * Format: Jellos-<namespace>
   */
  private buildVaultName(namespace: string): string {
    return `${OP_VAULT_PREFIX}-${namespace}`;
  }
}

/**
 * Create a new 1Password provider instance
 */
export function createOnePasswordProvider(): ISecretProvider {
  return new OnePasswordProvider();
}
