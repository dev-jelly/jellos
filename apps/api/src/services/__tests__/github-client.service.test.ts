/**
 * GitHub Client Service Tests
 *
 * NOTE: This test file requires a testing framework to be installed.
 * Recommended setup:
 *   npm install --save-dev vitest @vitest/ui
 *   or
 *   npm install --save-dev jest @types/jest ts-jest
 *
 * Run with: npm test or vitest run
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitHubClientService, GitHubApiError } from '../github-client.service';
import { Octokit } from '@octokit/rest';
import { CircuitBreakerState } from '../../utils/retry';

// Mock Octokit
vi.mock('@octokit/rest');

describe('GitHubClientService', () => {
  let githubClient: GitHubClientService;
  let mockOctokit: any;

  beforeEach(() => {
    // Reset environment variables
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_OWNER = 'test-owner';
    process.env.GITHUB_REPO = 'test-repo';

    // Create mock Octokit instance
    mockOctokit = {
      pulls: {
        list: vi.fn(),
        get: vi.fn(),
      },
      repos: {
        getBranch: vi.fn(),
      },
      rateLimit: {
        get: vi.fn(),
      },
    };

    // Mock Octokit constructor
    (Octokit as any).mockImplementation(() => mockOctokit);

    // Create client instance
    githubClient = new GitHubClientService();
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_OWNER;
    delete process.env.GITHUB_REPO;
  });

  describe('Initialization', () => {
    it('should initialize with environment variables', () => {
      expect(githubClient.isConfigured()).toBe(true);
    });

    it('should initialize with custom config', () => {
      const customClient = new GitHubClientService({
        token: 'custom-token',
        owner: 'custom-owner',
        repo: 'custom-repo',
      });

      expect(customClient.isConfigured()).toBe(true);
    });

    it('should warn when initialized without token', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      delete process.env.GITHUB_TOKEN;

      new GitHubClientService();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('GitHub client initialized without token')
      );

      consoleSpy.mockRestore();
    });

    it('should throw GitHubApiError on initialization failure', () => {
      (Octokit as any).mockImplementation(() => {
        throw new Error('Initialization failed');
      });

      expect(() => new GitHubClientService()).toThrow(GitHubApiError);
    });
  });

  describe('Configuration', () => {
    it('should check if configured correctly', () => {
      expect(githubClient.isConfigured()).toBe(true);
    });

    it('should return false when not configured', () => {
      const unconfiguredClient = new GitHubClientService({
        token: '',
        owner: '',
        repo: '',
      });

      expect(unconfiguredClient.isConfigured()).toBe(false);
    });

    it('should update configuration', () => {
      githubClient.updateConfig({
        owner: 'new-owner',
        repo: 'new-repo',
      });

      // Config should be updated (verify through behavior)
      expect(githubClient.isConfigured()).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should fetch rate limit information', async () => {
      const mockRateLimit = {
        data: {
          rate: {
            limit: 5000,
            remaining: 4999,
            reset: Math.floor(Date.now() / 1000) + 3600,
            used: 1,
          },
        },
      };

      mockOctokit.rateLimit.get.mockResolvedValue(mockRateLimit);

      const rateLimit = await githubClient.getRateLimit();

      expect(rateLimit).toBeDefined();
      expect(rateLimit?.limit).toBe(5000);
      expect(rateLimit?.remaining).toBe(4999);
      expect(rateLimit?.used).toBe(1);
    });

    it('should detect when near rate limit', async () => {
      const mockRateLimit = {
        data: {
          rate: {
            limit: 5000,
            remaining: 100, // Less than 10%
            reset: Math.floor(Date.now() / 1000) + 3600,
            used: 4900,
          },
        },
      };

      mockOctokit.rateLimit.get.mockResolvedValue(mockRateLimit);

      await githubClient.getRateLimit();

      expect(githubClient.isNearRateLimit()).toBe(true);
    });

    it('should return cached rate limit info', async () => {
      const mockRateLimit = {
        data: {
          rate: {
            limit: 5000,
            remaining: 4999,
            reset: Math.floor(Date.now() / 1000) + 3600,
            used: 1,
          },
        },
      };

      mockOctokit.rateLimit.get.mockResolvedValue(mockRateLimit);

      await githubClient.getRateLimit();
      const cachedInfo = githubClient.getLastRateLimitInfo();

      expect(cachedInfo).toBeDefined();
      expect(cachedInfo?.limit).toBe(5000);
    });
  });

  describe('PR Operations', () => {
    describe('searchPRsByIssue', () => {
      it('should find PRs matching issue number in title', async () => {
        const mockPRs = [
          {
            number: 123,
            title: 'Fix issue #456',
            state: 'open',
            head: { ref: 'feature-branch', sha: 'abc123' },
            base: { ref: 'main' },
            html_url: 'https://github.com/test/repo/pull/123',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
            user: { login: 'testuser' },
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });

        const result = await githubClient.searchPRsByIssue('456');

        expect(result.exists).toBe(true);
        expect(result.count).toBe(1);
        expect(result.prs[0].number).toBe(123);
      });

      it('should find PRs matching issue number in branch name', async () => {
        const mockPRs = [
          {
            number: 124,
            title: 'Some feature',
            state: 'open',
            head: { ref: 'issue-456-fix', sha: 'def456' },
            base: { ref: 'main' },
            html_url: 'https://github.com/test/repo/pull/124',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
            user: { login: 'testuser' },
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });

        const result = await githubClient.searchPRsByIssue('456');

        expect(result.exists).toBe(true);
        expect(result.count).toBe(1);
      });

      it('should return empty result when no PRs match', async () => {
        mockOctokit.pulls.list.mockResolvedValue({ data: [] });

        const result = await githubClient.searchPRsByIssue('999');

        expect(result.exists).toBe(false);
        expect(result.count).toBe(0);
        expect(result.prs).toHaveLength(0);
      });

      it('should retry on transient errors', async () => {
        mockOctokit.pulls.list
          .mockRejectedValueOnce(new Error('ETIMEDOUT'))
          .mockResolvedValueOnce({ data: [] });

        const result = await githubClient.searchPRsByIssue('456');

        expect(mockOctokit.pulls.list).toHaveBeenCalledTimes(2);
        expect(result.exists).toBe(false);
      });
    });

    describe('searchPRsByBranch', () => {
      it('should find PRs by branch name', async () => {
        const mockPRs = [
          {
            number: 125,
            title: 'Feature branch PR',
            state: 'open',
            head: { ref: 'feature-branch', sha: 'xyz789' },
            base: { ref: 'main' },
            html_url: 'https://github.com/test/repo/pull/125',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
            user: { login: 'testuser' },
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });

        const result = await githubClient.searchPRsByBranch('feature-branch');

        expect(result.exists).toBe(true);
        expect(result.count).toBe(1);
        expect(result.prs[0].head.ref).toBe('feature-branch');
      });
    });

    describe('getPR', () => {
      it('should get a specific PR by number', async () => {
        const mockPR = {
          number: 126,
          title: 'Test PR',
          state: 'open',
          head: { ref: 'test-branch', sha: 'abc123' },
          base: { ref: 'main' },
          html_url: 'https://github.com/test/repo/pull/126',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          user: { login: 'testuser' },
        };

        mockOctokit.pulls.get.mockResolvedValue({ data: mockPR });

        const result = await githubClient.getPR(126);

        expect(result).toBeDefined();
        expect(result?.number).toBe(126);
        expect(result?.title).toBe('Test PR');
      });

      it('should return null on error', async () => {
        mockOctokit.pulls.get.mockRejectedValue(new Error('Not found'));

        const result = await githubClient.getPR(999);

        expect(result).toBeNull();
      });
    });

    describe('branchExists', () => {
      it('should return true when branch exists', async () => {
        mockOctokit.repos.getBranch.mockResolvedValue({
          data: { name: 'feature-branch' },
        });

        const result = await githubClient.branchExists('feature-branch');

        expect(result).toBe(true);
      });

      it('should return false when branch does not exist', async () => {
        mockOctokit.repos.getBranch.mockRejectedValue({
          status: 404,
          message: 'Not found',
        });

        const result = await githubClient.branchExists('nonexistent-branch');

        expect(result).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should wrap errors with GitHubApiError', async () => {
      mockOctokit.pulls.list.mockRejectedValue({
        status: 403,
        message: 'Rate limit exceeded',
        response: {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
          },
        },
      });

      await expect(githubClient.searchPRsByIssue('456')).rejects.toThrow(
        GitHubApiError
      );
    });

    it('should not retry on non-retryable errors', async () => {
      mockOctokit.pulls.get.mockRejectedValue({
        status: 404,
        message: 'Not found',
      });

      await githubClient.getPR(999);

      // Should only be called once (no retries for 404)
      expect(mockOctokit.pulls.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('Circuit Breaker', () => {
    it('should have circuit breaker in CLOSED state initially', () => {
      expect(githubClient.getCircuitBreakerState()).toBe(
        CircuitBreakerState.CLOSED
      );
    });

    it('should open circuit after consecutive failures', async () => {
      // Configure with low failure threshold for testing
      const testClient = new GitHubClientService({
        token: 'test-token',
        owner: 'test-owner',
        repo: 'test-repo',
        circuitBreakerOptions: {
          failureThreshold: 2,
          resetTimeoutMs: 1000,
        },
      });

      mockOctokit.pulls.list.mockRejectedValue(new Error('Server error'));

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        try {
          await testClient.searchPRsByIssue('456');
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should be open after threshold
      expect(testClient.getCircuitBreakerState()).toBe(
        CircuitBreakerState.OPEN
      );
    });

    it('should allow manual circuit breaker reset', () => {
      githubClient.resetCircuitBreaker();

      expect(githubClient.getCircuitBreakerState()).toBe(
        CircuitBreakerState.CLOSED
      );
    });
  });

  describe('GitHubApiError', () => {
    it('should create error with status code and operation', () => {
      const error = new GitHubApiError('Test error', {
        statusCode: 403,
        operation: 'searchPRs',
        recoverable: false,
      });

      expect(error.message).toBe('Test error');
      expect(error.context?.statusCode).toBe(403);
      expect(error.context?.operation).toBe('searchPRs');
      expect(error.recoverable).toBe(false);
    });

    it('should include rate limit information', () => {
      const resetDate = new Date();
      const error = new GitHubApiError('Rate limit exceeded', {
        statusCode: 403,
        rateLimitRemaining: 0,
        rateLimitReset: resetDate,
      });

      expect(error.context?.rateLimitRemaining).toBe(0);
      expect(error.context?.rateLimitReset).toBe(resetDate);
    });
  });
});
