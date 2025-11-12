/**
 * Health check caching layer with Redis TTL
 */

import type { HealthCheckResult } from '../agent-discovery/health-check';
import { getRedisClient, isRedisAvailable } from './redis-client';

const CACHE_KEY_PREFIX = 'health_check:';
const DEFAULT_TTL = 600; // 10 minutes in seconds

/**
 * Generate cache key for an agent
 */
function getCacheKey(projectId: string | null, agentId: string): string {
  return `${CACHE_KEY_PREFIX}${projectId || 'global'}:${agentId}`;
}

/**
 * Get cached health check result
 */
export async function getCachedHealthCheck(
  projectId: string | null,
  agentId: string
): Promise<HealthCheckResult | null> {
  try {
    if (!(await isRedisAvailable())) {
      return null;
    }

    const client = getRedisClient();
    const key = getCacheKey(projectId, agentId);
    const cached = await client.get(key);

    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached) as HealthCheckResult;

    // Restore Date object (JSON.parse converts to string)
    parsed.lastChecked = new Date(parsed.lastChecked);

    return parsed;
  } catch (error) {
    console.error('Error getting cached health check:', error);
    return null;
  }
}

/**
 * Set cached health check result with TTL
 */
export async function setCachedHealthCheck(
  projectId: string | null,
  agentId: string,
  result: HealthCheckResult,
  ttl: number = DEFAULT_TTL
): Promise<boolean> {
  try {
    if (!(await isRedisAvailable())) {
      return false;
    }

    const client = getRedisClient();
    const key = getCacheKey(projectId, agentId);
    const value = JSON.stringify(result);

    await client.setex(key, ttl, value);
    return true;
  } catch (error) {
    console.error('Error setting cached health check:', error);
    return false;
  }
}

/**
 * Invalidate cached health check for an agent
 */
export async function invalidateHealthCheck(
  projectId: string | null,
  agentId: string
): Promise<boolean> {
  try {
    if (!(await isRedisAvailable())) {
      return false;
    }

    const client = getRedisClient();
    const key = getCacheKey(projectId, agentId);
    await client.del(key);
    return true;
  } catch (error) {
    console.error('Error invalidating health check:', error);
    return false;
  }
}

/**
 * Invalidate all health checks for a project
 */
export async function invalidateProjectHealthChecks(
  projectId: string
): Promise<boolean> {
  try {
    if (!(await isRedisAvailable())) {
      return false;
    }

    const client = getRedisClient();
    const pattern = `${CACHE_KEY_PREFIX}${projectId}:*`;

    // Use SCAN instead of KEYS for production safety
    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');

    return true;
  } catch (error) {
    console.error('Error invalidating project health checks:', error);
    return false;
  }
}

/**
 * Get TTL for cached health check
 */
export async function getHealthCheckTTL(
  projectId: string | null,
  agentId: string
): Promise<number | null> {
  try {
    if (!(await isRedisAvailable())) {
      return null;
    }

    const client = getRedisClient();
    const key = getCacheKey(projectId, agentId);
    const ttl = await client.ttl(key);

    // TTL returns -2 if key doesn't exist, -1 if no expiration
    return ttl > 0 ? ttl : null;
  } catch (error) {
    console.error('Error getting health check TTL:', error);
    return null;
  }
}

/**
 * Get all cached health checks for a project
 */
export async function getProjectHealthChecks(
  projectId: string
): Promise<Map<string, HealthCheckResult>> {
  const results = new Map<string, HealthCheckResult>();

  try {
    if (!(await isRedisAvailable())) {
      return results;
    }

    const client = getRedisClient();
    const pattern = `${CACHE_KEY_PREFIX}${projectId}:*`;

    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const values = await client.mget(...keys);

        keys.forEach((key, index) => {
          const value = values[index];
          if (value) {
            try {
              const agentId = key.split(':').pop()!;
              const parsed = JSON.parse(value) as HealthCheckResult;
              parsed.lastChecked = new Date(parsed.lastChecked);
              results.set(agentId, parsed);
            } catch {
              // Skip invalid entries
            }
          }
        });
      }
    } while (cursor !== '0');

    return results;
  } catch (error) {
    console.error('Error getting project health checks:', error);
    return results;
  }
}
