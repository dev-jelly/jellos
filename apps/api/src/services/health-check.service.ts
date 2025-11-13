/**
 * Health Check Service
 * Aggregates health status from all system components
 *
 * Provides:
 * - Liveness checks (/healthz): Basic app health
 * - Readiness checks (/readyz): Full dependency health
 * - Individual component health checks with timeouts
 * - Detailed and summary health reporting
 */

import { prisma } from '../lib/db';
import { isRedisAvailable } from '../lib/cache/redis-client';
import { GitHubClientService } from './github-client.service';
import { LinearClientService } from './linear-client.service';
import { GitService } from './git.service';
import { safeSpawn } from '../lib/process/safe-spawn';

/**
 * Health status levels
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

/**
 * Individual component health result
 */
export interface ComponentHealth {
  status: HealthStatus;
  responseTime: number; // milliseconds
  message?: string;
  details?: Record<string, any>;
  error?: string;
}

/**
 * Overall health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  components: {
    database?: ComponentHealth;
    cache?: ComponentHealth;
    git?: ComponentHealth;
    github?: ComponentHealth;
    linear?: ComponentHealth;
    agent?: ComponentHealth;
  };
  checks: {
    passed: number;
    failed: number;
    total: number;
  };
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  timeout: number; // Default timeout for each component check (ms)
  includeDetails: boolean; // Include detailed information in responses
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: HealthCheckConfig = {
  timeout: 3000, // 3 seconds
  includeDetails: false,
};

/**
 * Health check service for system monitoring
 */
export class HealthCheckService {
  private config: HealthCheckConfig;
  private githubClient: GitHubClientService;
  private linearClient: LinearClientService;
  private gitService: GitService;

  constructor(config: Partial<HealthCheckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.githubClient = new GitHubClientService();
    this.linearClient = new LinearClientService();
    this.gitService = new GitService();
  }

  /**
   * Perform a liveness check (basic health)
   * Only checks if the application itself is running
   */
  public async checkLiveness(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();

    // For liveness, we just need to respond that we're alive
    return {
      status: HealthStatus.HEALTHY,
      timestamp,
      uptime,
      components: {},
      checks: {
        passed: 1,
        failed: 0,
        total: 1,
      },
    };
  }

  /**
   * Perform a readiness check (full dependency health)
   * Checks all critical dependencies
   */
  public async checkReadiness(verbose: boolean = false): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();

    // Run all component checks in parallel
    const [database, cache, git, github, linear] = await Promise.all([
      this.checkDatabase(),
      this.checkCache(),
      this.checkGit(),
      this.checkGitHub(),
      this.checkLinear(),
    ]);

    const components: HealthCheckResult['components'] = {
      database,
      cache,
      git,
      github,
      linear,
    };

    // Calculate overall status
    const checks = this.calculateChecks(components);
    const overallStatus = this.determineOverallStatus(components);

    // Filter details if not verbose
    if (!verbose && !this.config.includeDetails) {
      Object.values(components).forEach((component) => {
        if (component) {
          delete component.details;
        }
      });
    }

    return {
      status: overallStatus,
      timestamp,
      uptime,
      components,
      checks,
    };
  }

  /**
   * Check database connectivity and health
   */
  private async checkDatabase(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // Use Promise.race to enforce timeout
      await this.withTimeout(
        prisma.$queryRaw`SELECT 1 as health_check`,
        this.config.timeout,
        'Database check timeout'
      );

      const responseTime = Date.now() - startTime;

      return {
        status: responseTime < 1000 ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
        responseTime,
        message: 'Database connection successful',
        details: this.config.includeDetails
          ? {
              type: 'postgresql',
              connectionPool: 'active',
            }
          : undefined,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: HealthStatus.UNHEALTHY,
        responseTime,
        message: 'Database connection failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Redis cache availability
   */
  private async checkCache(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const available = await this.withTimeout(
        isRedisAvailable(),
        this.config.timeout,
        'Redis check timeout'
      );

      const responseTime = Date.now() - startTime;

      if (!available) {
        return {
          status: HealthStatus.DEGRADED,
          responseTime,
          message: 'Redis not available (non-critical)',
          details: this.config.includeDetails
            ? {
                optional: true,
                fallback: 'in-memory cache',
              }
            : undefined,
        };
      }

      return {
        status: HealthStatus.HEALTHY,
        responseTime,
        message: 'Redis cache available',
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: HealthStatus.DEGRADED,
        responseTime,
        message: 'Redis check failed (non-critical)',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Git availability
   */
  private async checkGit(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const result = await this.withTimeout(
        safeSpawn('git', ['--version'], { timeout: this.config.timeout }),
        this.config.timeout,
        'Git check timeout'
      );

      const responseTime = Date.now() - startTime;

      if (result.exitCode !== 0) {
        return {
          status: HealthStatus.UNHEALTHY,
          responseTime,
          message: 'Git command failed',
          error: result.stderr || 'Unknown error',
        };
      }

      const version = result.stdout.trim();

      return {
        status: HealthStatus.HEALTHY,
        responseTime,
        message: 'Git available',
        details: this.config.includeDetails
          ? {
              version,
            }
          : undefined,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: HealthStatus.UNHEALTHY,
        responseTime,
        message: 'Git not available',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check GitHub API connectivity
   */
  private async checkGitHub(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      if (!this.githubClient.isConfigured()) {
        return {
          status: HealthStatus.DEGRADED,
          responseTime: 0,
          message: 'GitHub not configured (optional)',
          details: this.config.includeDetails
            ? {
                configured: false,
                optional: true,
              }
            : undefined,
        };
      }

      // Check circuit breaker state
      const circuitState = this.githubClient.getCircuitBreakerState();
      if (circuitState === 'OPEN') {
        return {
          status: HealthStatus.DEGRADED,
          responseTime: 0,
          message: 'GitHub API circuit breaker is OPEN',
          details: this.config.includeDetails
            ? {
                circuitBreaker: circuitState,
              }
            : undefined,
        };
      }

      // Check rate limit as a lightweight API health check
      const rateLimit = await this.withTimeout(
        this.githubClient.getRateLimit(),
        this.config.timeout,
        'GitHub API timeout'
      );

      const responseTime = Date.now() - startTime;

      if (!rateLimit) {
        return {
          status: HealthStatus.DEGRADED,
          responseTime,
          message: 'GitHub API rate limit check failed',
          details: this.config.includeDetails
            ? {
                circuitBreaker: circuitState,
              }
            : undefined,
        };
      }

      // Consider degraded if less than 100 requests remaining
      const status =
        rateLimit.remaining < 100 ? HealthStatus.DEGRADED : HealthStatus.HEALTHY;

      return {
        status,
        responseTime,
        message:
          status === HealthStatus.DEGRADED
            ? 'GitHub API rate limit low'
            : 'GitHub API available',
        details: this.config.includeDetails
          ? {
              rateLimit: {
                remaining: rateLimit.remaining,
                limit: rateLimit.limit,
                reset: rateLimit.reset,
              },
              circuitBreaker: circuitState,
            }
          : undefined,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: HealthStatus.DEGRADED,
        responseTime,
        message: 'GitHub API check failed (non-critical)',
        error: error instanceof Error ? error.message : 'Unknown error',
        details: this.config.includeDetails
          ? {
              circuitBreaker: this.githubClient.getCircuitBreakerState(),
            }
          : undefined,
      };
    }
  }

  /**
   * Check Linear API connectivity
   */
  private async checkLinear(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      if (!this.linearClient.isAvailable()) {
        return {
          status: HealthStatus.DEGRADED,
          responseTime: 0,
          message: 'Linear not configured (optional)',
          details: this.config.includeDetails
            ? {
                configured: false,
                optional: true,
              }
            : undefined,
        };
      }

      // Check circuit breaker state
      const circuitState = this.linearClient.getCircuitBreakerState();
      if (circuitState === 'OPEN') {
        return {
          status: HealthStatus.DEGRADED,
          responseTime: 0,
          message: 'Linear API circuit breaker is OPEN',
          details: this.config.includeDetails
            ? {
                circuitBreaker: circuitState,
              }
            : undefined,
        };
      }

      // Test connection with a lightweight query
      const viewer = await this.withTimeout(
        this.linearClient.getViewer(),
        this.config.timeout,
        'Linear API timeout'
      );

      const responseTime = Date.now() - startTime;

      return {
        status: HealthStatus.HEALTHY,
        responseTime,
        message: 'Linear API available',
        details: this.config.includeDetails && viewer
          ? {
              user: viewer.name,
              circuitBreaker: circuitState,
            }
          : undefined,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: HealthStatus.DEGRADED,
        responseTime,
        message: 'Linear API check failed (non-critical)',
        error: error instanceof Error ? error.message : 'Unknown error',
        details: this.config.includeDetails
          ? {
              circuitBreaker: this.linearClient.getCircuitBreakerState(),
            }
          : undefined,
      };
    }
  }

  /**
   * Calculate check statistics
   */
  private calculateChecks(
    components: HealthCheckResult['components']
  ): HealthCheckResult['checks'] {
    const componentArray = Object.values(components).filter(
      (c): c is ComponentHealth => c !== undefined
    );

    const total = componentArray.length;
    const failed = componentArray.filter((c) => c.status === HealthStatus.UNHEALTHY)
      .length;
    const passed = total - failed;

    return { passed, failed, total };
  }

  /**
   * Determine overall health status from component statuses
   */
  private determineOverallStatus(
    components: HealthCheckResult['components']
  ): HealthStatus {
    const componentArray = Object.values(components).filter(
      (c): c is ComponentHealth => c !== undefined
    );

    // If any critical component is unhealthy, overall is unhealthy
    // Critical components: database, git
    if (components.database?.status === HealthStatus.UNHEALTHY) {
      return HealthStatus.UNHEALTHY;
    }

    if (components.git?.status === HealthStatus.UNHEALTHY) {
      return HealthStatus.UNHEALTHY;
    }

    // If any component is degraded, overall is degraded
    const hasDegraded = componentArray.some((c) => c.status === HealthStatus.DEGRADED);
    if (hasDegraded) {
      return HealthStatus.DEGRADED;
    }

    // All components healthy
    return HealthStatus.HEALTHY;
  }

  /**
   * Helper to enforce timeout on promises
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      ),
    ]);
  }
}
