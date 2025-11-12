/**
 * Agent health check service
 */

import { safeSpawn, getCommandVersion } from '../process/safe-spawn';
import type { AgentMetadata } from '../../types/agent';
import { getKnownAgent } from './known-agents';

/**
 * Health status for an agent
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  version?: string;
  responseTime: number; // in milliseconds
  lastChecked: Date;
  error?: string;
}

/**
 * Extract version from output using pattern
 */
function extractVersion(output: string, pattern?: RegExp): string | undefined {
  if (!pattern) {
    return output.split('\n')[0].trim();
  }

  const match = output.match(pattern);
  return match ? match[1] : undefined;
}

/**
 * Perform health check on an agent
 */
export async function performHealthCheck(
  agent: AgentMetadata
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const lastChecked = new Date();

  try {
    // Get known agent definition for version checking
    const knownAgent = getKnownAgent(agent.externalId);
    const versionArgs = knownAgent?.versionArgs || ['--version'];

    // Try to get version
    const result = await safeSpawn(agent.cmd, versionArgs, {
      timeout: 5000,
      env: agent.envMask.reduce(
        (acc, key) => {
          if (process.env[key]) {
            acc[key] = process.env[key]!;
          }
          return acc;
        },
        {} as Record<string, string>
      ),
    });

    const responseTime = Date.now() - startTime;
    const output = result.stdout || result.stderr;

    // Extract version if available
    const version = extractVersion(output, knownAgent?.versionPattern);

    // Determine health status based on exit code and response time
    let status: HealthStatus;
    if (result.exitCode === 0) {
      status = responseTime < 3000 ? HealthStatus.HEALTHY : HealthStatus.DEGRADED;
    } else {
      status = HealthStatus.UNHEALTHY;
    }

    return {
      status,
      version,
      responseTime,
      lastChecked,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      status: HealthStatus.UNHEALTHY,
      responseTime,
      lastChecked,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Perform health checks on multiple agents in parallel
 */
export async function performBatchHealthCheck(
  agents: AgentMetadata[]
): Promise<Map<string, HealthCheckResult>> {
  const results = await Promise.allSettled(
    agents.map(async (agent) => ({
      agentId: agent.externalId,
      result: await performHealthCheck(agent),
    }))
  );

  const healthMap = new Map<string, HealthCheckResult>();

  for (const promiseResult of results) {
    if (promiseResult.status === 'fulfilled') {
      const { agentId, result } = promiseResult.value;
      healthMap.set(agentId, result);
    } else {
      // Handle rejected promise (shouldn't happen as performHealthCheck catches errors)
      console.error('Health check promise rejected:', promiseResult.reason);
    }
  }

  return healthMap;
}

/**
 * Quick health check (just checks if command is available)
 */
export async function quickHealthCheck(
  agent: AgentMetadata
): Promise<boolean> {
  try {
    const checkCommand = process.platform === 'win32' ? 'where' : 'which';
    const mainCommand = agent.cmd.split(' ')[0]; // Handle compound commands

    await safeSpawn(checkCommand, [mainCommand], { timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}
