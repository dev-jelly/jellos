/**
 * PR Duplicate Check Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PRDuplicateCheckService, PRDuplicateCheckError } from '../pr-duplicate-check.service';
import { issuePRMappingRepository } from '../../repositories/issue-pr-mapping.repository';
import { getGitHubClient } from '../github-client.service';
import { prisma } from '../../lib/db';

// Mock GitHub client
vi.mock('../github-client.service', () => ({
  getGitHubClient: vi.fn(),
}));

describe('PRDuplicateCheckService', () => {
  let service: PRDuplicateCheckService;
  let testProjectId: string;
  let testIssueId: string;
  let mockGitHubClient: any;

  beforeEach(async () => {
    service = new PRDuplicateCheckService();

    // Create test project
    const project = await prisma.project.create({
      data: {
        name: 'Test Project',
        localPath: '/test/path',
        defaultBranch: 'main',
      },
    });
    testProjectId = project.id;

    // Create test issue
    const issue = await prisma.issue.create({
      data: {
        projectId: testProjectId,
        title: 'Test Issue',
        status: 'TODO',
      },
    });
    testIssueId = issue.id;

    // Mock GitHub client
    mockGitHubClient = {
      isConfigured: vi.fn().mockReturnValue(true),
      searchPRsByBranch: vi.fn().mockResolvedValue({
        exists: false,
        prs: [],
        count: 0,
      }),
      searchPRsByIssue: vi.fn().mockResolvedValue({
        exists: false,
        prs: [],
        count: 0,
      }),
    };

    (getGitHubClient as any).mockReturnValue(mockGitHubClient);
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.issuePRMapping.deleteMany({});
    await prisma.issue.deleteMany({});
    await prisma.project.deleteMany({});
    vi.clearAllMocks();
  });

  describe('checkForDuplicates', () => {
    it('should return no duplicates when none exist', async () => {
      const result = await service.checkForDuplicates({
        issueId: testIssueId,
        projectId: testProjectId,
        branchName: 'feature/new',
        checkGitHub: false,
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.existingMappings).toHaveLength(0);
    });

    it('should detect duplicate when issue has open PR', async () => {
      // Create existing mapping
      await issuePRMappingRepository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/existing',
        state: 'open',
      });

      const result = await service.checkForDuplicates({
        issueId: testIssueId,
        projectId: testProjectId,
        branchName: 'feature/new',
        checkGitHub: false,
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.existingMappings).toHaveLength(1);
      expect(result.reason).toContain('already has');
    });

    it('should not detect duplicate when issue has only closed PRs', async () => {
      // Create closed mapping
      await issuePRMappingRepository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/closed',
        state: 'closed',
      });

      const result = await service.checkForDuplicates({
        issueId: testIssueId,
        projectId: testProjectId,
        branchName: 'feature/new',
        checkGitHub: false,
      });

      expect(result.isDuplicate).toBe(false);
    });

    it('should detect duplicate when branch has open PR', async () => {
      // Create another issue
      const issue2 = await prisma.issue.create({
        data: {
          projectId: testProjectId,
          title: 'Test Issue 2',
          status: 'TODO',
        },
      });

      // Create mapping for different issue but same branch
      await issuePRMappingRepository.create({
        issueId: issue2.id,
        projectId: testProjectId,
        prNumber: 456,
        prUrl: 'https://github.com/test/repo/pull/456',
        branchName: 'feature/shared',
        state: 'open',
      });

      const result = await service.checkForDuplicates({
        issueId: testIssueId,
        projectId: testProjectId,
        branchName: 'feature/shared',
        checkGitHub: false,
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toContain('already has');
      expect(result.reason).toContain('feature/shared');
    });

    it('should check GitHub when enabled', async () => {
      mockGitHubClient.searchPRsByBranch.mockResolvedValue({
        exists: true,
        prs: [
          {
            number: 999,
            title: 'Test PR',
            state: 'open',
            head: { ref: 'feature/test', sha: 'abc123' },
          },
        ],
        count: 1,
      });

      const result = await service.checkForDuplicates({
        issueId: testIssueId,
        projectId: testProjectId,
        branchName: 'feature/test',
        checkGitHub: true,
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toContain('GitHub');
      expect(mockGitHubClient.searchPRsByBranch).toHaveBeenCalledWith(
        'feature/test',
        { state: 'open' }
      );
    });

    it('should skip GitHub check when not configured', async () => {
      mockGitHubClient.isConfigured.mockReturnValue(false);

      const result = await service.checkForDuplicates({
        issueId: testIssueId,
        projectId: testProjectId,
        branchName: 'feature/test',
        checkGitHub: true,
      });

      expect(result.isDuplicate).toBe(false);
      expect(mockGitHubClient.searchPRsByBranch).not.toHaveBeenCalled();
    });

    it('should handle GitHub API errors gracefully', async () => {
      mockGitHubClient.searchPRsByBranch.mockRejectedValue(
        new Error('GitHub API error')
      );

      const result = await service.checkForDuplicates({
        issueId: testIssueId,
        projectId: testProjectId,
        branchName: 'feature/test',
        checkGitHub: true,
      });

      // Should not fail, just return no duplicates
      expect(result.isDuplicate).toBe(false);
    });

    it('should check GitHub by issue number', async () => {
      mockGitHubClient.searchPRsByIssue.mockResolvedValue({
        exists: true,
        prs: [
          {
            number: 888,
            title: 'Fix #123',
            state: 'open',
            head: { ref: 'feature/fix', sha: 'def456' },
          },
        ],
        count: 1,
      });

      const result = await service.checkForDuplicates({
        issueId: '123',
        projectId: testProjectId,
        branchName: 'feature/test',
        checkGitHub: true,
      });

      expect(result.isDuplicate).toBe(true);
      expect(mockGitHubClient.searchPRsByIssue).toHaveBeenCalledWith(
        '123',
        { state: 'open' }
      );
    });
  });

  describe('validateNoDuplicates', () => {
    it('should not throw when no duplicates exist', async () => {
      await expect(
        service.validateNoDuplicates({
          issueId: testIssueId,
          projectId: testProjectId,
          branchName: 'feature/new',
          checkGitHub: false,
        })
      ).resolves.not.toThrow();
    });

    it('should throw PRDuplicateCheckError when duplicate exists', async () => {
      // Create existing mapping
      await issuePRMappingRepository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/existing',
        state: 'open',
      });

      await expect(
        service.validateNoDuplicates({
          issueId: testIssueId,
          projectId: testProjectId,
          branchName: 'feature/new',
          checkGitHub: false,
        })
      ).rejects.toThrow(PRDuplicateCheckError);
    });

    it('should include existing mappings in error', async () => {
      // Create existing mapping
      const mapping = await issuePRMappingRepository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/existing',
        state: 'open',
      });

      try {
        await service.validateNoDuplicates({
          issueId: testIssueId,
          projectId: testProjectId,
          branchName: 'feature/new',
          checkGitHub: false,
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(PRDuplicateCheckError);
        const prError = error as PRDuplicateCheckError;
        expect(prError.existingMappings).toHaveLength(1);
        expect(prError.existingMappings[0].id).toBe(mapping.id);
      }
    });
  });

  describe('hasOpenPR', () => {
    it('should return true when issue has open PR', async () => {
      await issuePRMappingRepository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/test',
        state: 'open',
      });

      const hasOpen = await service.hasOpenPR(testIssueId);
      expect(hasOpen).toBe(true);
    });

    it('should return false when issue has no open PR', async () => {
      const hasOpen = await service.hasOpenPR(testIssueId);
      expect(hasOpen).toBe(false);
    });
  });

  describe('hasOpenPRForBranch', () => {
    it('should return true when branch has open PR', async () => {
      await issuePRMappingRepository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/test',
        state: 'open',
      });

      const hasOpen = await service.hasOpenPRForBranch(
        testProjectId,
        'feature/test'
      );
      expect(hasOpen).toBe(true);
    });

    it('should return false when branch has no open PR', async () => {
      const hasOpen = await service.hasOpenPRForBranch(
        testProjectId,
        'feature/nonexistent'
      );
      expect(hasOpen).toBe(false);
    });
  });

  describe('getOpenPRsForIssue', () => {
    it('should return open PRs for issue', async () => {
      const mapping = await issuePRMappingRepository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/test',
        state: 'open',
      });

      const openPRs = await service.getOpenPRsForIssue(testIssueId);

      expect(openPRs).toHaveLength(1);
      expect(openPRs[0].id).toBe(mapping.id);
    });

    it('should not return closed PRs', async () => {
      await issuePRMappingRepository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/test',
        state: 'closed',
      });

      const openPRs = await service.getOpenPRsForIssue(testIssueId);

      expect(openPRs).toHaveLength(0);
    });
  });

  describe('getOpenPRsForBranch', () => {
    it('should return open PRs for branch', async () => {
      const mapping = await issuePRMappingRepository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/test',
        state: 'open',
      });

      const openPRs = await service.getOpenPRsForBranch(
        testProjectId,
        'feature/test'
      );

      expect(openPRs).toHaveLength(1);
      expect(openPRs[0].id).toBe(mapping.id);
    });
  });
});
