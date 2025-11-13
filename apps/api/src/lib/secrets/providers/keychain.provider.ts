/**
 * macOS Keychain Secret Provider
 * Uses the `security` command to interact with macOS Keychain
 *
 * Requirements:
 * - macOS operating system
 * - `security` command-line tool (installed by default on macOS)
 *
 * Usage:
 * ```typescript
 * const provider = createKeychainProvider();
 * const health = await provider.getHealthStatus();
 *
 * if (health.available) {
 *   await provider.setSecret('API_KEY', 'secret-value', 'dev');
 *   const value = await provider.getSecret('API_KEY', 'dev');
 * }
 * ```
 */

import { safeSpawn, isCommandAvailable, getCommandVersion } from '../../process/safe-spawn';
import type { ISecretProvider, ProviderHealthCheck } from '../types';
import { SecretProviderType, ProviderHealthStatus } from '../types';

/**
 * Service name prefix for Jellos secrets in Keychain
 */
const KEYCHAIN_SERVICE_PREFIX = 'com.jellos.secret';

/**
 * macOS Keychain provider implementation
 */
export class KeychainProvider implements ISecretProvider {
  type = SecretProviderType.KEYCHAIN;
  name = 'macOS Keychain';

  /**
   * Check if macOS Keychain is available
   * Only available on macOS
   */
  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return false;
    }

    try {
      // Check if `security` command is available
      const available = await isCommandAvailable('security');
      return available;
    } catch {
      return false;
    }
  }

  /**
   * Get comprehensive health status of Keychain provider
   */
  async getHealthStatus(): Promise<ProviderHealthCheck> {
    const startTime = Date.now();
    const result: ProviderHealthCheck = {
      status: ProviderHealthStatus.UNAVAILABLE,
      available: false,
      cliInstalled: false,
      lastChecked: new Date(),
    };

    // Check platform
    if (process.platform !== 'darwin') {
      result.error = 'Keychain is only available on macOS';
      result.helpText = 'This provider requires macOS operating system. Consider using 1Password or environment variables on other platforms.';
      return result;
    }

    // Check if security command is installed
    try {
      result.cliInstalled = await isCommandAvailable('security');
    } catch (error) {
      result.error = 'Failed to check for security command';
      result.helpText = 'The security command should be installed by default on macOS. If missing, try reinstalling Xcode Command Line Tools.';
      return result;
    }

    if (!result.cliInstalled) {
      result.error = 'security command not found';
      result.helpText = 'Install Xcode Command Line Tools: xcode-select --install';
      return result;
    }

    // Get version
    try {
      const versionOutput = await getCommandVersion('security', ['-h']);
      if (versionOutput) {
        // Extract version from help output if available
        const versionMatch = versionOutput.match(/security (\d+\.\d+)/);
        result.version = versionMatch ? versionMatch[1] : 'installed';
      }
    } catch {
      // Version not critical, continue
      result.version = 'unknown';
    }

    // Test actual functionality by trying to list keychains
    try {
      const testResult = await safeSpawn(
        'security',
        ['list-keychains'],
        { timeout: 3000 }
      );

      if (testResult.exitCode === 0) {
        result.available = true;
        result.status = ProviderHealthStatus.HEALTHY;
        result.latency = Date.now() - startTime;
      } else {
        result.status = ProviderHealthStatus.DEGRADED;
        result.error = 'Keychain access test failed';
        result.helpText = 'Keychain may be locked or inaccessible. Try unlocking your keychain in Keychain Access.app';
      }
    } catch (error) {
      result.status = ProviderHealthStatus.DEGRADED;
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.helpText = 'Keychain is installed but not responding. Try restarting your system or checking Keychain Access.app';
    }

    return result;
  }

  /**
   * Get secret from Keychain
   * Uses: security find-generic-password -s service -a account -w
   *
   * @throws Error if Keychain is not available or locked
   */
  async getSecret(key: string, namespace: string): Promise<string | null> {
    // Check availability first
    if (!(await this.isAvailable())) {
      throw new Error(
        'Keychain is not available. This feature requires macOS with the security command installed.'
      );
    }

    try {
      const serviceName = this.buildServiceName(namespace);
      const accountName = key;

      // -w flag prints only the password to stdout
      const result = await safeSpawn(
        'security',
        [
          'find-generic-password',
          '-s', serviceName,
          '-a', accountName,
          '-w', // Print password only
        ],
        {
          timeout: 5000,
        }
      );

      if (result.exitCode === 0 && result.stdout) {
        return result.stdout.trim();
      }

      // Exit code 44 means item not found
      if (result.exitCode === 44) {
        return null;
      }

      // Other error codes might indicate locked keychain or permission issues
      if (result.stderr.includes('locked')) {
        throw new Error(
          `Keychain is locked. Please unlock your keychain in Keychain Access.app or run: security unlock-keychain`
        );
      }

      return null;
    } catch (error) {
      if (error instanceof Error && error.message.includes('locked')) {
        throw error; // Re-throw locked keychain errors
      }
      // Secret not found or other non-critical error
      return null;
    }
  }

  /**
   * Store secret in Keychain
   * Uses: security add-generic-password -s service -a account -w password
   *
   * @throws Error if Keychain is not available, locked, or operation fails
   */
  async setSecret(key: string, value: string, namespace: string): Promise<void> {
    // Check availability first
    if (!(await this.isAvailable())) {
      throw new Error(
        'Keychain is not available. This feature requires macOS with the security command installed.'
      );
    }

    const serviceName = this.buildServiceName(namespace);
    const accountName = key;

    try {
      // Try to delete existing entry first (to avoid duplicates)
      await this.deleteSecret(key, namespace);
    } catch {
      // Ignore error if secret doesn't exist
    }

    // Add new entry
    try {
      const result = await safeSpawn(
        'security',
        [
          'add-generic-password',
          '-s', serviceName,
          '-a', accountName,
          '-w', value,
          '-U', // Update if exists
        ],
        {
          timeout: 5000,
        }
      );

      if (result.exitCode !== 0) {
        // Check for specific error conditions
        if (result.stderr.includes('locked')) {
          throw new Error(
            'Keychain is locked. Please unlock your keychain in Keychain Access.app or run: security unlock-keychain'
          );
        }

        if (result.stderr.includes('permission') || result.stderr.includes('access denied')) {
          throw new Error(
            'Permission denied to access Keychain. Check Keychain Access.app permissions.'
          );
        }

        throw new Error(`Failed to store secret in Keychain: ${result.stderr || 'Unknown error'}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to store secret in Keychain: ${error}`);
    }
  }

  /**
   * List all secrets in a namespace
   * Returns array of account names (keys)
   */
  async listSecrets(namespace: string): Promise<string[]> {
    const serviceName = this.buildServiceName(namespace);

    try {
      // Find all items with the service name
      const result = await safeSpawn(
        'security',
        [
          'dump-keychain',
        ],
        {
          timeout: 10000,
        }
      );

      if (result.exitCode !== 0) {
        return [];
      }

      // Parse output to find matching service names
      const lines = result.stdout.split('\n');
      const accounts: string[] = [];
      let inMatchingEntry = false;

      for (const line of lines) {
        // Check if this entry matches our service
        if (line.includes(`"svce"<blob>="${serviceName}"`)) {
          inMatchingEntry = true;
        }

        // Extract account name if we're in a matching entry
        if (inMatchingEntry && line.includes('"acct"<blob>=')) {
          const match = line.match(/"acct"<blob>="([^"]+)"/);
          if (match) {
            accounts.push(match[1]);
            inMatchingEntry = false;
          }
        }
      }

      return accounts;
    } catch {
      return [];
    }
  }

  /**
   * Delete secret from Keychain
   */
  async deleteSecret(key: string, namespace: string): Promise<void> {
    const serviceName = this.buildServiceName(namespace);
    const accountName = key;

    await safeSpawn(
      'security',
      [
        'delete-generic-password',
        '-s', serviceName,
        '-a', accountName,
      ],
      {
        timeout: 5000,
      }
    );
  }

  /**
   * Build service name from namespace
   * Format: com.jellos.secret.<namespace>
   */
  private buildServiceName(namespace: string): string {
    return `${KEYCHAIN_SERVICE_PREFIX}.${namespace}`;
  }
}

/**
 * Create a new Keychain provider instance
 */
export function createKeychainProvider(): ISecretProvider {
  return new KeychainProvider();
}
