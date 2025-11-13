/**
 * Issue-PR Mapping Repository Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IssuePRMappingRepository } from '../issue-pr-mapping.repository';
import { prisma } from '../../lib/db';
import type { CreateIssuePRMappingInput } from '../../types/issue-pr-mapping';

describe('IssuePRMappingRepository', () => {
  let repository: IssuePRMappingRepository;
  let testProjectId: string;
  let testIssueId: string;

  beforeEach(async () => {
    repository = new IssuePRMappingRepository();

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
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.issuePRMapping.deleteMany({});
    await prisma.issue.deleteMany({});
    await prisma.project.deleteMany({});
  });

  describe('create', () => {
    it('should create a new PR mapping', async () => {
      const input: CreateIssuePRMappingInput = {
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/test',
      };

      const mapping = await repository.create(input);

      expect(mapping.id).toBeDefined();
      expect(mapping.issueId).toBe(testIssueId);
      expect(mapping.projectId).toBe(testProjectId);
      expect(mapping.prNumber).toBe(123);
      expect(mapping.prUrl).toBe(input.prUrl);
      expect(mapping.branchName).toBe('feature/test');
      expect(mapping.state).toBe('open');
    });

    it('should create mapping with custom state', async () => {
      const input: CreateIssuePRMappingInput = {
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 456,
        prUrl: 'https://github.com/test/repo/pull/456',
        branchName: 'feature/closed',
        state: 'closed',
      };

      const mapping = await repository.create(input);

      expect(mapping.state).toBe('closed');
    });

    it('should prevent duplicate issue-PR mappings', async () => {
      const input: CreateIssuePRMappingInput = {
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 789,
        prUrl: 'https://github.com/test/repo/pull/789',
        branchName: 'feature/duplicate',
      };

      await repository.create(input);

      // Attempt to create duplicate
      await expect(repository.create(input)).rejects.toThrow();
    });

    it('should prevent multiple open PRs on same branch', async () => {
      const input1: CreateIssuePRMappingInput = {
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 100,
        prUrl: 'https://github.com/test/repo/pull/100',
        branchName: 'feature/shared',
        state: 'open',
      };

      await repository.create(input1);

      // Create second issue
      const issue2 = await prisma.issue.create({
        data: {
          projectId: testProjectId,
          title: 'Test Issue 2',
          status: 'TODO',
        },
      });

      const input2: CreateIssuePRMappingInput = {
        issueId: issue2.id,
        projectId: testProjectId,
        prNumber: 101,
        prUrl: 'https://github.com/test/repo/pull/101',
        branchName: 'feature/shared',
        state: 'open',
      };

      // Should fail due to unique constraint on (projectId, branchName, state)
      await expect(repository.create(input2)).rejects.toThrow();
    });

    it('should allow multiple closed PRs on same branch', async () => {
      const input1: CreateIssuePRMappingInput = {
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 200,
        prUrl: 'https://github.com/test/repo/pull/200',
        branchName: 'feature/closed-branch',
        state: 'closed',
      };

      const mapping1 = await repository.create(input1);

      // Create second issue
      const issue2 = await prisma.issue.create({
        data: {
          projectId: testProjectId,
          title: 'Test Issue 2',
          status: 'TODO',
        },
      });

      const input2: CreateIssuePRMappingInput = {
        issueId: issue2.id,
        projectId: testProjectId,
        prNumber: 201,
        prUrl: 'https://github.com/test/repo/pull/201',
        branchName: 'feature/closed-branch',
        state: 'closed',
      };

      // Should succeed since both are closed
      const mapping2 = await repository.create(input2);

      expect(mapping1.branchName).toBe(mapping2.branchName);
      expect(mapping1.state).toBe('closed');
      expect(mapping2.state).toBe('closed');
    });
  });

  describe('findById', () => {
    it('should find mapping by ID', async () => {
      const created = await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/test',
      });

      const found = await repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByIssuePR', () => {
    it('should find mapping by issue ID and PR number', async () => {
      await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/test',
      });

      const found = await repository.findByIssuePR(testIssueId, 123);

      expect(found).toBeDefined();
      expect(found?.prNumber).toBe(123);
    });
  });

  describe('findOpenByIssueId', () => {
    it('should find only open PR mappings for issue', async () => {
      // Create open PR
      await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 1,
        prUrl: 'https://github.com/test/repo/pull/1',
        branchName: 'feature/open',
        state: 'open',
      });

      // Create closed PR
      await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 2,
        prUrl: 'https://github.com/test/repo/pull/2',
        branchName: 'feature/closed',
        state: 'closed',
      });

      const openMappings = await repository.findOpenByIssueId(testIssueId);

      expect(openMappings).toHaveLength(1);
      expect(openMappings[0].state).toBe('open');
    });

    it('should return empty array when no open PRs', async () => {
      await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 1,
        prUrl: 'https://github.com/test/repo/pull/1',
        branchName: 'feature/closed',
        state: 'closed',
      });

      const openMappings = await repository.findOpenByIssueId(testIssueId);

      expect(openMappings).toHaveLength(0);
    });
  });

  describe('findOpenByBranch', () => {
    it('should find open PR mappings for branch', async () => {
      await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 1,
        prUrl: 'https://github.com/test/repo/pull/1',
        branchName: 'feature/test',
        state: 'open',
      });

      const openMappings = await repository.findOpenByBranch(
        testProjectId,
        'feature/test'
      );

      expect(openMappings).toHaveLength(1);
      expect(openMappings[0].branchName).toBe('feature/test');
    });
  });

  describe('hasOpenPR', () => {
    it('should return true when issue has open PR', async () => {
      await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 1,
        prUrl: 'https://github.com/test/repo/pull/1',
        branchName: 'feature/test',
        state: 'open',
      });

      const hasOpen = await repository.hasOpenPR(testIssueId);

      expect(hasOpen).toBe(true);
    });

    it('should return false when issue has no open PR', async () => {
      await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 1,
        prUrl: 'https://github.com/test/repo/pull/1',
        branchName: 'feature/test',
        state: 'closed',
      });

      const hasOpen = await repository.hasOpenPR(testIssueId);

      expect(hasOpen).toBe(false);
    });
  });

  describe('hasOpenPRForBranch', () => {
    it('should return true when branch has open PR', async () => {
      await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 1,
        prUrl: 'https://github.com/test/repo/pull/1',
        branchName: 'feature/test',
        state: 'open',
      });

      const hasOpen = await repository.hasOpenPRForBranch(
        testProjectId,
        'feature/test'
      );

      expect(hasOpen).toBe(true);
    });

    it('should return false when branch has no open PR', async () => {
      const hasOpen = await repository.hasOpenPRForBranch(
        testProjectId,
        'feature/nonexistent'
      );

      expect(hasOpen).toBe(false);
    });
  });

  describe('update', () => {
    it('should update mapping state', async () => {
      const created = await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 1,
        prUrl: 'https://github.com/test/repo/pull/1',
        branchName: 'feature/test',
        state: 'open',
      });

      const updated = await repository.update(created.id, {
        state: 'merged',
        closedAt: new Date(),
      });

      expect(updated.state).toBe('merged');
      expect(updated.closedAt).toBeDefined();
    });
  });

  describe('updateStateByPR', () => {
    it('should update state by PR number', async () => {
      await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 123,
        prUrl: 'https://github.com/test/repo/pull/123',
        branchName: 'feature/test',
        state: 'open',
      });

      const updated = await repository.updateStateByPR(
        testIssueId,
        123,
        'closed',
        new Date()
      );

      expect(updated.state).toBe('closed');
      expect(updated.closedAt).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete mapping by ID', async () => {
      const created = await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 1,
        prUrl: 'https://github.com/test/repo/pull/1',
        branchName: 'feature/test',
      });

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });
  });

  describe('deleteByIssueId', () => {
    it('should delete all mappings for issue', async () => {
      await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 1,
        prUrl: 'https://github.com/test/repo/pull/1',
        branchName: 'feature/test1',
      });

      await repository.create({
        issueId: testIssueId,
        projectId: testProjectId,
        prNumber: 2,
        prUrl: 'https://github.com/test/repo/pull/2',
        branchName: 'feature/test2',
      });

      const deleteCount = await repository.deleteByIssueId(testIssueId);

      expect(deleteCount).toBe(2);

      const remaining = await repository.findByIssueId(testIssueId);
      expect(remaining).toHaveLength(0);
    });
  });
});
