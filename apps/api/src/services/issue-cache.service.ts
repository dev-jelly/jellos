/**
 * Issue Cache Service
 * Implements SWR (stale-while-revalidate) caching for enriched issues
 * Task 14.6: Enhanced with fallback strategy for Redis unavailability
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
  enableInMemoryFallback: boolean; // Fallback to in-memory cache when Redis unavailable
  inMemoryMaxSize: number; // Max items in memory cache
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
 * Issue cache service with SWR pattern and fallback strategy
 */
export class IssueCacheService {
  private redis: Redis | null = null;
  private config: IssueCacheConfig;
  private revalidationQueue: Set<string>;
  private inMemoryCache: Map<string, CachedIssue>; // Fallback cache
  private degradedMode: boolean = false; // Flag when Redis is unavailable

  constructor(config?: Partial<IssueCacheConfig>) {
    this.config = {
      ttl: 300, // 5 minutes default
      staleTtl: 60, // 1 minute before considered stale
      enableBackgroundRevalidation: true,
      enableInMemoryFallback: true,
      inMemoryMaxSize: 100, // Default: 100 items
      ...config,
    };
    this.revalidationQueue = new Set();
    this.inMemoryCache = new Map();
    this.initializeRedis();
  }

  /**
   * Initialize Redis client
   */
  private initializeRedis(): void {
    try {
      this.redis = getRedisClient();
      this.degradedMode = false;
    } catch (error) {
      console.warn('Redis not available for issue caching, using in-memory fallback:', error);
      this.redis = null;
      this.degradedMode = true;
    }
  }

  /**
   * Check if Redis is available
   */
  public isAvailable(): boolean {
    return this.redis !== null;
  }

  /**
   * Check if running in degraded mode (fallback cache)
   */
  public isDegradedMode(): boolean {
    return this.degradedMode;
  }

  /**
   * Get cached enriched issue with SWR pattern
   * Task 14.6: Enhanced with fallback to in-memory cache
   */
  public async getEnrichedIssue(
    issueId: string,
    revalidateFn?: () => Promise<EnrichedIssue>
  ): Promise<{
    data: EnrichedIssue | null;
    cached: boolean;
    stale: boolean;
    revalidating: boolean;
    degraded?: boolean;
  }> {
    const key = CacheKeys.issue(issueId);

    // Try Redis first
    if (this.isAvailable()) {
      try {
        const cached = await this.getCachedData<CachedIssue>(key);

        if (cached) {
          const now = Date.now();
          const isStale = now >= cached.staleAt;
          const isRevalidating = this.revalidationQueue.has(issueId);

          // Trigger background revalidation if needed
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
      } catch (error) {
        console.error('Redis error, falling back to in-memory cache:', error);
        this.degradedMode = true;
      }
    }

    // Fallback to in-memory cache
    if (this.config.enableInMemoryFallback) {
      const cached = this.inMemoryCache.get(key);

      if (cached) {
        const now = Date.now();
        const isStale = now >= cached.staleAt;

        return {
          data: cached.data,
          cached: true,
          stale: isStale,
          revalidating: false,
          degraded: true, // Indicate we're using fallback
        };
      }
    }

    // No cache hit
    return { data: null, cached: false, stale: false, revalidating: false };
  }

  /**
   * Set cached enriched issue
   * Task 14.6: Enhanced to also update in-memory fallback
   */
  public async setEnrichedIssue(
    issueId: string,
    data: EnrichedIssue
  ): Promise<void> {
    const now = Date.now();
    const cached: CachedIssue = {
      data,
      cachedAt: now,
      expiresAt: now + this.config.ttl * 1000,
      staleAt: now + this.config.staleTtl * 1000,
    };

    const key = CacheKeys.issue(issueId);

    // Try to set in Redis
    if (this.isAvailable()) {
      try {
        await this.setCachedData(key, cached, this.config.ttl);
      } catch (error) {
        console.error('Redis error during setEnrichedIssue:', error);
        this.degradedMode = true;
      }
    }

    // Always update in-memory cache if fallback is enabled
    if (this.config.enableInMemoryFallback) {
      this.setInMemoryCache(key, cached);
    }
  }

  /**
   * Set data in in-memory cache with LRU eviction
   */
  private setInMemoryCache(key: string, data: CachedIssue): void {
    // Enforce max size (simple LRU: remove oldest entry)
    if (this.inMemoryCache.size >= this.config.inMemoryMaxSize) {
      const firstKey = this.inMemoryCache.keys().next().value;
      if (firstKey) {
        this.inMemoryCache.delete(firstKey);
      }
    }

    this.inMemoryCache.set(key, data);
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
