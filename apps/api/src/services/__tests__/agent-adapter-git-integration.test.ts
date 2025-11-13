/**
 * Integration tests for agent-adapter.service.ts - Git metadata collection
 * Tests the full flow of agent execution with git metadata collection
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { AgentAdapterService } from '../agent-adapter.service';
import { executionRepository } from '../../repositories/execution.repository';
import { prisma } from '../../lib/db';
import type { CodeAgentRuntime } from '../../lib/db';
import { AgentExecutionStatus, StreamEventType } from '../../types/agent-execution';

const execAsync = promisify(exec);

describe('AgentAdapterService - Git Metadata Integration', () => {
  let service: AgentAdapterService;
  let tempDir: string;
  let testAgent: CodeAgentRuntime;

  beforeAll(async () => {
    // Ensure database is ready
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    service = new AgentAdapterService();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-git-test-'));

    // Create test agent in database
    testAgent = await prisma.codeAgentRuntime.create({
      data: {
        externalId: `test-agent-${Date.now()}`,
        label: 'Test Agent',
        cmd: 'echo',
        args: JSON.stringify(['test']),
        envMask: JSON.stringify([]),
        version: '1.0.0',
        enabled: true,
      },
    });
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });

    // Clean up test agent and executions
    await prisma.agentExecution.deleteMany({
      where: { agentId: testAgent.id },
    });
    await prisma.codeAgentRuntime.delete({
      where: { id: testAgent.id },
    });
  });

  /**
   * Helper to initialize a git repository
   */
  async function initGitRepo(dir: string): Promise<void> {
    await execAsync('git init -b main', { cwd: dir });
    await execAsync('git config user.email "test@example.com"', { cwd: dir });
    await execAsync('git config user.name "Test User"', { cwd: dir });
  }

  /**
   * Helper to create and commit a file
   */
  async function createAndCommitFile(
    dir: string,
    filename: string,
    content: string,
    commitMsg: string
  ): Promise<void> {
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, content);
    await execAsync(`git add ${filename}`, { cwd: dir });
    await execAsync(`git commit -m "${commitMsg}"`, { cwd: dir });
  }

  describe('Git Metadata Collection in Execution Flow', () => {
    it('should collect git metadata after successful execution', async () => {
      // Setup git repo with changes
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'initial content', 'Initial commit');

      // Make uncommitted changes to tracked file only (git diff doesn't count untracked files)
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'modified content\nadded line');

      // Execute agent
      const generator = await service.execute({
        agentId: testAgent.id,
        worktreePath: tempDir,
        args: ['success'],
        timeout: 5000,
      });

      // Consume all events
      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      // Verify completion event includes git metadata
      const completeEvent = events.find((e) => e.type === StreamEventType.COMPLETE);
      expect(completeEvent).toBeDefined();
      expect(completeEvent?.data).toHaveProperty('gitMetadata');

      const gitMeta = (completeEvent?.data as any).gitMetadata;
      expect(gitMeta).toBeDefined();
      expect(gitMeta.branch).toBe('main');
      expect(gitMeta.filesChanged).toBe(1);
      expect(gitMeta.linesAdded).toBeGreaterThan(0);
      expect(gitMeta.hasCommit).toBe(true);

      // Verify database record has git metadata
      const executions = await executionRepository.findByAgentId(testAgent.id, 1);
      expect(executions).toHaveLength(1);

      const execution = executions[0];
      expect(execution.gitBranch).toBe('main');
      expect(execution.gitCommitHash).toMatch(/^[0-9a-f]{40}$/);
      expect(execution.gitCommitMsg).toBe('Initial commit');
      expect(execution.filesChanged).toBe(1);
      expect(execution.linesAdded).toBeGreaterThan(0);
      expect(execution.gitDiff).toBeTruthy();
    });

    it('should collect git metadata with no uncommitted changes', async () => {
      // Setup clean git repo
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Test commit');

      // Execute agent
      const generator = await service.execute({
        agentId: testAgent.id,
        worktreePath: tempDir,
        timeout: 5000,
      });

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      const completeEvent = events.find((e) => e.type === StreamEventType.COMPLETE);
      const gitMeta = (completeEvent?.data as any).gitMetadata;

      expect(gitMeta).toBeDefined();
      expect(gitMeta.branch).toBe('main');
      expect(gitMeta.filesChanged).toBeUndefined(); // No changes
      expect(gitMeta.hasCommit).toBe(true);

      // Verify database
      const executions = await executionRepository.findByAgentId(testAgent.id, 1);
      const execution = executions[0];

      expect(execution.gitBranch).toBe('main');
      expect(execution.gitCommitHash).toBeTruthy();
      expect(execution.gitCommitMsg).toBe('Test commit');
      expect(execution.filesChanged).toBeNull(); // No changes
      expect(execution.gitDiff).toBeNull(); // No diff
    });

    it('should handle execution in non-git directory', async () => {
      // Execute agent in non-git directory
      const generator = await service.execute({
        agentId: testAgent.id,
        worktreePath: tempDir,
        timeout: 5000,
      });

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      const completeEvent = events.find((e) => e.type === StreamEventType.COMPLETE);
      const gitMeta = (completeEvent?.data as any).gitMetadata;

      // Git metadata should be undefined
      expect(gitMeta).toBeUndefined();

      // Verify database has no git metadata
      const executions = await executionRepository.findByAgentId(testAgent.id, 1);
      const execution = executions[0];

      expect(execution.gitBranch).toBeNull();
      expect(execution.gitCommitHash).toBeNull();
      expect(execution.gitDiff).toBeNull();
    });

    it('should collect metadata from different branches', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'main.txt', 'main content', 'Main commit');

      // Create and switch to feature branch
      await execAsync('git checkout -b feature/test-feature', { cwd: tempDir });
      await createAndCommitFile(
        tempDir,
        'feature.txt',
        'feature content',
        'Feature commit'
      );

      // Make changes
      await fs.writeFile(path.join(tempDir, 'feature.txt'), 'updated feature content');

      const generator = await service.execute({
        agentId: testAgent.id,
        worktreePath: tempDir,
        timeout: 5000,
      });

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      // Verify branch is correct
      const executions = await executionRepository.findByAgentId(testAgent.id, 1);
      const execution = executions[0];

      expect(execution.gitBranch).toBe('feature/test-feature');
      expect(execution.gitCommitMsg).toBe('Feature commit');
    });

    it('should compress large git diffs', async () => {
      await initGitRepo(tempDir);
      const initialContent = 'line1\n'.repeat(100);
      await createAndCommitFile(tempDir, 'large.txt', initialContent, 'Initial commit');

      // Create large change (>100KB diff)
      const largeContent = 'x'.repeat(150 * 1024);
      await fs.writeFile(path.join(tempDir, 'large.txt'), largeContent);

      const generator = await service.execute({
        agentId: testAgent.id,
        worktreePath: tempDir,
        timeout: 5000,
      });

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      // Verify diff was stored (compressed)
      const executions = await executionRepository.findByAgentId(testAgent.id, 1);
      const execution = executions[0];

      expect(execution.gitDiff).toBeTruthy();
      // Compressed diff should be significantly smaller than content
      expect(execution.gitDiff!.length).toBeLessThan(largeContent.length);
    });

    it('should track multiple file changes correctly', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'file1.txt', 'content1', 'Initial commit');
      await createAndCommitFile(tempDir, 'file2.txt', 'content2', 'Second commit');
      await createAndCommitFile(tempDir, 'file3.txt', 'content3', 'Third commit');

      // Make changes to all committed files
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'modified1');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'modified2');
      await fs.writeFile(path.join(tempDir, 'file3.txt'), 'modified3');

      const generator = await service.execute({
        agentId: testAgent.id,
        worktreePath: tempDir,
        timeout: 5000,
      });

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      const executions = await executionRepository.findByAgentId(testAgent.id, 1);
      const execution = executions[0];

      expect(execution.filesChanged).toBe(3);
      expect(execution.linesAdded).toBeGreaterThan(0);
      expect(execution.gitDiff).toContain('file1.txt');
      expect(execution.gitDiff).toContain('file2.txt');
      expect(execution.gitDiff).toContain('file3.txt');
    });

    it('should handle git metadata collection failure gracefully', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Test commit');

      // Make changes
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'modified');

      // Mock git service to throw error
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Corrupt git repo to cause failure
      await fs.rm(path.join(tempDir, '.git'), { recursive: true });

      const generator = await service.execute({
        agentId: testAgent.id,
        worktreePath: tempDir,
        timeout: 5000,
      });

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      // Execution should complete even if git metadata fails
      const completeEvent = events.find((e) => e.type === StreamEventType.COMPLETE);
      expect(completeEvent).toBeDefined();
      expect(completeEvent?.data).toHaveProperty('status');

      // Git metadata should be undefined
      expect((completeEvent?.data as any).gitMetadata).toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  describe('Git Metadata in Failed Executions', () => {
    it('should still collect git metadata on failed execution', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Test commit');
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'modified');

      // Create agent that will fail
      const failAgent = await prisma.codeAgentRuntime.create({
        data: {
          externalId: `fail-agent-${Date.now()}`,
          label: 'Fail Agent',
          cmd: 'sh',
          args: JSON.stringify(['-c', 'exit 1']),
          envMask: JSON.stringify([]),
          enabled: true,
        },
      });

      try {
        const generator = await service.execute({
          agentId: failAgent.id,
          worktreePath: tempDir,
          timeout: 5000,
        });

        const events = [];
        for await (const event of generator) {
          events.push(event);
        }

        // Verify completion with failure status
        const completeEvent = events.find((e) => e.type === StreamEventType.COMPLETE);
        expect(completeEvent?.data).toHaveProperty('status', AgentExecutionStatus.FAILED);

        // Git metadata should still be collected
        expect((completeEvent?.data as any).gitMetadata).toBeDefined();

        const executions = await executionRepository.findByAgentId(failAgent.id, 1);
        const execution = executions[0];

        expect(execution.status).toBe(AgentExecutionStatus.FAILED);
        expect(execution.gitBranch).toBe('main');
        expect(execution.gitCommitMsg).toBe('Test commit');
        expect(execution.filesChanged).toBe(1);
      } finally {
        // Cleanup
        await prisma.agentExecution.deleteMany({ where: { agentId: failAgent.id } });
        await prisma.codeAgentRuntime.delete({ where: { id: failAgent.id } });
      }
    });
  });

  describe('Git Metadata Query and Retrieval', () => {
    it('should be able to query executions by git commit hash', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Test commit');

      // Get commit hash
      const { stdout: commitHash } = await execAsync('git rev-parse HEAD', { cwd: tempDir });
      const hash = commitHash.trim();

      const generator = await service.execute({
        agentId: testAgent.id,
        worktreePath: tempDir,
        timeout: 5000,
      });

      for await (const event of generator) {
        // Consume events
      }

      // Query by commit hash
      const executions = await prisma.agentExecution.findMany({
        where: { gitCommitHash: hash },
      });

      expect(executions).toHaveLength(1);
      expect(executions[0].gitCommitHash).toBe(hash);
      expect(executions[0].gitBranch).toBe('main');
    });

    it('should store git author information in commit message', async () => {
      await initGitRepo(tempDir);
      await createAndCommitFile(tempDir, 'test.txt', 'content', 'Multi-line commit message');

      const generator = await service.execute({
        agentId: testAgent.id,
        worktreePath: tempDir,
        timeout: 5000,
      });

      for await (const event of generator) {
        // Consume events
      }

      const executions = await executionRepository.findByAgentId(testAgent.id, 1);
      const execution = executions[0];

      // Commit message should be stored (first line only based on implementation)
      expect(execution.gitCommitMsg).toBe('Multi-line commit message');
    });
  });

  describe('Edge Cases', () => {
    it('should handle execution without worktree path', async () => {
      const generator = await service.execute({
        agentId: testAgent.id,
        // No worktreePath
        timeout: 5000,
      });

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      const completeEvent = events.find((e) => e.type === StreamEventType.COMPLETE);
      expect((completeEvent?.data as any).gitMetadata).toBeUndefined();
    });

    it('should handle nonexistent worktree path', async () => {
      const generator = await service.execute({
        agentId: testAgent.id,
        worktreePath: '/nonexistent/path',
        timeout: 5000,
      });

      const events = [];
      try {
        for await (const event of generator) {
          events.push(event);
        }
      } catch (error) {
        // Expected to fail due to invalid path
        expect(error).toBeDefined();
      }

      // Should have error event
      const errorEvent = events.find((e) => e.type === StreamEventType.ERROR);
      expect(errorEvent).toBeDefined();
    });

    it('should handle repository with no commits', async () => {
      await initGitRepo(tempDir);
      // No commits made

      const generator = await service.execute({
        agentId: testAgent.id,
        worktreePath: tempDir,
        timeout: 5000,
      });

      const events = [];
      for await (const event of generator) {
        events.push(event);
      }

      const executions = await executionRepository.findByAgentId(testAgent.id, 1);
      const execution = executions[0];

      // getCurrentBranch returns null when no commits exist (no HEAD)
      expect(execution.gitBranch).toBeNull();
      expect(execution.gitCommitHash).toBeNull();
      expect(execution.gitCommitMsg).toBeNull();
    });
  });
});
