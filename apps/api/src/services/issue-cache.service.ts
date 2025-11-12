/**
 * Issue Cache Service
 * Implements SWR (stale-while-revalidate) caching for enriched issues
 */

import { getRedisClient } from '../lib/cache';
import type { EnrichedIssue } from './issue-merge.service';
import type { Redis } from 'ioredis';

/**
 * Cache configuration
 */
export interface IssueCacheConfig {
  ttl: number; // Time to live in seconds
  staleTtl: number; // Time before data is considered stale in seconds
  enableBackgroundRevalidation: boolean;
}

/**
 * Cached issue data with metadata
 */
interface CachedIssue {
  data: EnrichedIssue;
  cachedAt: number;
  expiresAt: number;
  staleAt: number;
}

/**
 * Cache key builders
 */
const CacheKeys = {
  issue: (issueId: string) => `issue:${issueId}`,
  projectIssues: (projectId: string) => `project:${projectId}:issues`,
  issueList: (issueIds: string[]) => `issues:${issueIds.sort().join(',')}`,
  enrichmentStatus: (issueId: string) => `issue:${issueId}:status`,
};

/**
 * Issue cache service with SWR pattern
 */
export class IssueCacheService {
  private redis: Redis | null = null;
  private config: IssueCacheConfig;
  private revalidationQueue: Set<string>;

  constructor(config?: Partial<IssueCacheConfig>) {
    this.config = {
      ttl: 300, // 5 minutes default
      staleTtl: 60, // 1 minute before considered stale
      enableBackgroundRevalidation: true,
      ...config,
    };
    this.revalidationQueue = new Set();
    this.initializeRedis();
  }

  /**
   * Initialize Redis client
   */
  private initializeRedis(): void {
    try {
      this.redis = getRedisClient();
    } catch (error) {
      console.warn('Redis not available for issue caching:', error);
      this.redis = null;
    }
  }

  /**
   * Check if Redis is available
   */
  public isAvailable(): boolean {
    return this.redis !== null;
  }

  /**
   * Get cached enriched issue with SWR pattern
   */
  public async getEnrichedIssue(
    issueId: string,
    revalidateFn?: () => Promise<EnrichedIssue>
  ): Promise<{
    data: EnrichedIssue | null;
    cached: boolean;
    stale: boolean;
    revalidating: boolean;
  }> {
    if (!this.isAvailable()) {
      return { data: null, cached: false, stale: false, revalidating: false };
    }

    const key = CacheKeys.issue(issueId);
    const cached = await this.getCachedData<CachedIssue>(key);

    if (!cached) {
      return { data: null, cached: false, stale: false, revalidating: false };
    }

    const now = Date.now();
    const isStale = now >= cached.staleAt;
    const isRevalidating = this.revalidationQueue.has(issueId);

    // If data is stale and revalidation is enabled, trigger background refresh
    if (
      isStale &&
      !isRevalidating &&
      this.config.enableBackgroundRevalidation &&
      revalidateFn
    ) {
      this.triggerBackgroundRevalidation(issueId, revalidateFn);
    }

    return {
      data: cached.data,
      cached: true,
      stale: isStale,
      revalidating: isRevalidating,
    };
  }

  /**
   * Set cached enriched issue
   */
  public async setEnrichedIssue(
    issueId: string,
    data: EnrichedIssue
  ): Promise<void> {
    if (!this.isAvailable()) return;

    const now = Date.now();
    const cached: CachedIssue = {
      data,
      cachedAt: now,
      expiresAt: now + this.config.ttl * 1000,
      staleAt: now + this.config.staleTtl * 1000,
    };

    const key = CacheKeys.issue(issueId);
    await this.setCachedData(key, cached, this.config.ttl);
  }

  /**
   * Get cached project issues
   */
  public async getProjectIssues(
    projectId: string
  ): Promise<{
    data: EnrichedIssue[] | null;
    cached: boolean;
    stale: boolean;
  }> {
    if (!this.isAvailable()) {
      return { data: null, cached: false, stale: false };
    }

    const key = CacheKeys.projectIssues(projectId);
    const cached = await this.getCachedData<CachedIssue>(key);

    if (!cached) {
      return { data: null, cached: false, stale: false };
    }

    const now = Date.now();
    const isStale = now >= cached.staleAt;

    return {
      data: cached.data as any,
      cached: true,
      stale: isStale,
    };
  }

  /**
   * Set cached project issues
   */
  public async setProjectIssues(
    projectId: string,
    data: EnrichedIssue[]
  ): Promise<void> {
    if (!this.isAvailable()) return;

    const now = Date.now();
    const cached: CachedIssue = {
      data: data as any,
      cachedAt: now,
      expiresAt: now + this.config.ttl * 1000,
      staleAt: now + this.config.staleTtl * 1000,
    };

    const key = CacheKeys.projectIssues(projectId);
    await this.setCachedData(key, cached, this.config.ttl);
  }

  /**
   * Invalidate cache for a single issue
   */
  public async invalidateIssue(issueId: string): Promise<void> {
    if (!this.isAvailable()) return;

    const key = CacheKeys.issue(issueId);
    await this.redis!.del(key);
  }

  /**
   * Invalidate cache for all issues in a project
   */
  public async invalidateProjectIssues(projectId: string): Promise<void> {
    if (!this.isAvailable()) return;

    const key = CacheKeys.projectIssues(projectId);
    await this.redis!.del(key);
  }

  /**
   * Invalidate all issue caches
   */
  public async invalidateAll(): Promise<void> {
    if (!this.isAvailable()) return;

    const pattern = 'issue:*';
    const keys = await this.redis!.keys(pattern);

    if (keys.length > 0) {
      await this.redis!.del(...keys);
    }
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<{
    totalKeys: number;
    issueKeys: number;
    projectKeys: number;
  }> {
    if (!this.isAvailable()) {
      return { totalKeys: 0, issueKeys: 0, projectKeys: 0 };
    }

    const [issueKeys, projectKeys] = await Promise.all([
      this.redis!.keys('issue:*'),
      this.redis!.keys('project:*:issues'),
    ]);

    return {
      totalKeys: issueKeys.length + projectKeys.length,
      issueKeys: issueKeys.length,
      projectKeys: projectKeys.length,
    };
  }

  /**
   * Trigger background revalidation for an issue
   */
  private async triggerBackgroundRevalidation(
    issueId: string,
    revalidateFn: () => Promise<EnrichedIssue>
  ): Promise<void> {
    // Prevent duplicate revalidation requests
    if (this.revalidationQueue.has(issueId)) {
      return;
    }

    this.revalidationQueue.add(issueId);

    // Run revalidation in background (don't await)
    revalidateFn()
      .then(async (freshData) => {
        await this.setEnrichedIssue(issueId, freshData);
      })
      .catch((error) => {
        console.error(`Background revalidation failed for issue ${issueId}:`, error);
      })
      .finally(() => {
        this.revalidationQueue.delete(issueId);
      });
  }

  /**
   * Get cached data with generic type
   */
  private async getCachedData<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null;

    try {
      const data = await this.redis!.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Failed to get cached data for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cached data with TTL
   */
  private async setCachedData(
    key: string,
    data: any,
    ttl: number
  ): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.redis!.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      console.error(`Failed to set cached data for key ${key}:`, error);
    }
  }

  /**
   * Batch get multiple issues from cache
   */
  public async getBatchIssues(
    issueIds: string[]
  ): Promise<Map<string, EnrichedIssue | null>> {
    const results = new Map<string, EnrichedIssue | null>();

    if (!this.isAvailable()) {
      issueIds.forEach((id) => results.set(id, null));
      return results;
    }

    const keys = issueIds.map((id) => CacheKeys.issue(id));
    const cached = await this.redis!.mget(...keys);

    issueIds.forEach((id, index) => {
      const data = cached[index];
      if (data) {
        try {
          const parsed: CachedIssue = JSON.parse(data);
          results.set(id, parsed.data);
        } catch {
          results.set(id, null);
        }
      } else {
        results.set(id, null);
      }
    });

    return results;
  }

  /**
   * Batch set multiple issues to cache
   */
  public async setBatchIssues(
    issues: Map<string, EnrichedIssue>
  ): Promise<void> {
    if (!this.isAvailable()) return;

    const pipeline = this.redis!.pipeline();
    const now = Date.now();

    issues.forEach((data, issueId) => {
      const cached: CachedIssue = {
        data,
        cachedAt: now,
        expiresAt: now + this.config.ttl * 1000,
        staleAt: now + this.config.staleTtl * 1000,
      };

      const key = CacheKeys.issue(issueId);
      pipeline.setex(key, this.config.ttl, JSON.stringify(cached));
    });

    await pipeline.exec();
  }

  /**
   * Warm cache by preloading issues
   */
  public async warmCache(
    issues: EnrichedIssue[]
  ): Promise<{ success: number; failed: number }> {
    if (!this.isAvailable()) {
      return { success: 0, failed: issues.length };
    }

    const issueMap = new Map<string, EnrichedIssue>();
    issues.forEach((issue) => issueMap.set(issue.id, issue));

    try {
      await this.setBatchIssues(issueMap);
      return { success: issues.length, failed: 0 };
    } catch (error) {
      console.error('Failed to warm cache:', error);
      return { success: 0, failed: issues.length };
    }
  }
}

// Export singleton instance
let issueCacheInstance: IssueCacheService | null = null;

export function getIssueCacheService(
  config?: Partial<IssueCacheConfig>
): IssueCacheService {
  if (!issueCacheInstance || config) {
    issueCacheInstance = new IssueCacheService(config);
  }
  return issueCacheInstance;
}

export function resetIssueCacheService(): void {
  issueCacheInstance = null;
}
