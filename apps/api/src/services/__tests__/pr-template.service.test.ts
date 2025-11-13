/**
 * PR Template Service Tests
 * Comprehensive tests for PR template rendering, XSS prevention, and configuration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PRTemplateService, getPRTemplateService, resetPRTemplateService } from '../pr-template.service';
import type {
  PRTemplateContext,
  PRTemplateConfig,
  PRIssueData,
  PRExecutionData,
  PRChangesData,
  PRMetadata,
} from '../../types/pr-template';
import type { Issue, ExternalIssueLink } from '../../types/issue';
import type { AgentExecution } from '../../lib/db';
import { IssueStatus, IssuePriority, ExternalIssueProvider } from '../../types/issue';
import { AgentExecutionStatus } from '../../types/agent-execution';

describe('PRTemplateService', () => {
  let service: PRTemplateService;

  beforeEach(() => {
    resetPRTemplateService();
    service = new PRTemplateService();
  });

  afterEach(() => {
    resetPRTemplateService();
  });

  describe('Template Rendering', () => {
    it('should render basic PR template with issue data', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'test-issue-1',
          title: 'Implement user authentication',
          description: 'Add JWT-based authentication system',
          priority: 'HIGH',
          externalLinks: [],
        },
        metadata: {
          branch: 'feat/auth',
          baseBranch: 'main',
          timestamp: new Date('2024-01-15T10:00:00Z'),
        },
      };

      const result = await service.render(context);

      expect(result.title).toContain('Implement user authentication');
      expect(result.body).toContain('Add JWT-based authentication system');
      expect(result.body).toContain('HIGH');
      expect(result.labels).toContain('feat');
      expect(result.labels).toContain('priority:high');
    });

    it('should include external issue links', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'test-issue-2',
          title: 'Fix login bug',
          description: null,
          priority: 'URGENT',
          externalLinks: [
            {
              provider: 'LINEAR',
              externalId: 'PROJ-123',
              url: 'https://linear.app/project/issue/PROJ-123',
            },
            {
              provider: 'GITHUB',
              externalId: '#456',
              url: 'https://github.com/owner/repo/issues/456',
            },
          ],
        },
        metadata: {
          branch: 'fix/login',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);

      expect(result.body).toContain('LINEAR: PROJ-123');
      expect(result.body).toContain('https://linear.app/project/issue/PROJ-123');
      expect(result.body).toContain('GITHUB: #456');
      expect(result.body).toContain('https://github.com/owner/repo/issues/456');
    });

    it('should include execution summary with git metadata', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'test-issue-3',
          title: 'Refactor database queries',
          description: 'Optimize performance',
          priority: 'MEDIUM',
          externalLinks: [],
        },
        execution: {
          id: 'exec-1',
          status: 'COMPLETED',
          startedAt: new Date('2024-01-15T10:00:00Z'),
          completedAt: new Date('2024-01-15T10:05:30Z'),
          exitCode: 0,
          gitCommitHash: 'abc123def456',
          gitCommitMsg: 'refactor: optimize database queries',
          gitBranch: 'refactor/db-queries',
          filesChanged: 5,
          linesAdded: 120,
          linesDeleted: 80,
          duration: 330000, // 5.5 minutes
        },
        metadata: {
          branch: 'refactor/db-queries',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);

      expect(result.body).toContain('COMPLETED');
      expect(result.body).toContain('abc123def456');
      expect(result.body).toContain('refactor/db-queries');
      expect(result.body).toContain('5');
      expect(result.body).toContain('+120');
      expect(result.body).toContain('-80');
      expect(result.body).toContain('5m 30s');
    });

    it('should include changed files list', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'test-issue-4',
          title: 'Update API endpoints',
          description: null,
          priority: 'LOW',
          externalLinks: [],
        },
        changes: {
          files: [
            'src/api/routes/users.ts',
            'src/api/controllers/auth.controller.ts',
            'src/types/user.ts',
          ],
          summary: 'Updated authentication endpoints and user types',
        },
        metadata: {
          branch: 'feat/api-update',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);

      expect(result.body).toContain('src/api/routes/users.ts');
      expect(result.body).toContain('src/api/controllers/auth.controller.ts');
      expect(result.body).toContain('src/types/user.ts');
      expect(result.body).toContain('Updated authentication endpoints and user types');
    });

    it('should limit number of files listed', async () => {
      const files = Array.from({ length: 100 }, (_, i) => `file-${i}.ts`);

      const context: PRTemplateContext = {
        issue: {
          id: 'test-issue-5',
          title: 'Large refactor',
          description: null,
          priority: 'MEDIUM',
          externalLinks: [],
        },
        changes: {
          files,
          summary: 'Large scale refactoring',
        },
        metadata: {
          branch: 'refactor/large',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const configuredService = new PRTemplateService({ maxFilesListed: 10 });
      const result = await configuredService.render(context);

      // Should only include first 10 files
      expect(result.body).toContain('file-0.ts');
      expect(result.body).toContain('file-9.ts');
      expect(result.body).not.toContain('file-10.ts');
      expect(result.body).not.toContain('file-99.ts');
    });
  });

  describe('XSS Prevention', () => {
    it('should escape HTML in issue title', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'xss-test-1',
          title: '<script>alert("XSS")</script>',
          description: null,
          priority: 'HIGH',
          externalLinks: [],
        },
        metadata: {
          branch: 'test',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);

      // Should escape the script tag
      expect(result.body).not.toContain('<script>');
      expect(result.body).toContain('&lt;script&gt;');
    });

    it('should escape HTML in issue description', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'xss-test-2',
          title: 'Safe title',
          description: '<img src=x onerror="alert(1)">',
          priority: 'MEDIUM',
          externalLinks: [],
        },
        metadata: {
          branch: 'test',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);

      // Should escape the img tag
      expect(result.body).not.toContain('<img src=');
      expect(result.body).toContain('&lt;img');
    });

    it('should escape HTML in file paths', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'xss-test-3',
          title: 'Safe title',
          description: null,
          priority: 'LOW',
          externalLinks: [],
        },
        changes: {
          files: ['<script>evil.js</script>', 'safe/path.ts'],
          summary: 'Updates',
        },
        metadata: {
          branch: 'test',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);

      // Should escape script tags in file paths
      expect(result.body).not.toContain('<script>evil.js</script>');
      expect(result.body).toContain('&lt;script&gt;');
    });
  });

  describe('Configuration', () => {
    it('should respect includeIssueLinks config', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'config-test-1',
          title: 'Test issue',
          description: null,
          priority: 'MEDIUM',
          externalLinks: [
            {
              provider: 'LINEAR',
              externalId: 'TEST-1',
              url: 'https://linear.app/test/TEST-1',
            },
          ],
        },
        metadata: {
          branch: 'test',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const configuredService = new PRTemplateService({ includeIssueLinks: false });
      const result = await configuredService.render(context);

      // Should not include external links section
      expect(result.body).not.toContain('LINEAR');
      expect(result.body).not.toContain('TEST-1');
    });

    it('should respect includeExecutionSummary config', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'config-test-2',
          title: 'Test issue',
          description: null,
          priority: 'MEDIUM',
          externalLinks: [],
        },
        execution: {
          id: 'exec-1',
          status: 'COMPLETED',
          gitBranch: 'test',
          filesChanged: 5,
        },
        metadata: {
          branch: 'test',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const configuredService = new PRTemplateService({
        includeExecutionSummary: false,
      });
      const result = await configuredService.render(context);

      // Should not include execution summary
      expect(result.body).not.toContain('Agent Execution Summary');
      expect(result.body).not.toContain('COMPLETED');
    });

    it('should respect includeChangedFiles config', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'config-test-3',
          title: 'Test issue',
          description: null,
          priority: 'MEDIUM',
          externalLinks: [],
        },
        changes: {
          files: ['file1.ts', 'file2.ts'],
          summary: 'Changes summary',
        },
        metadata: {
          branch: 'test',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const configuredService = new PRTemplateService({ includeChangedFiles: false });
      const result = await configuredService.render(context);

      // Should not include changed files
      expect(result.body).not.toContain('file1.ts');
      expect(result.body).not.toContain('file2.ts');
    });

    it('should respect includeDiffStats config', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'config-test-4',
          title: 'Test issue',
          description: null,
          priority: 'MEDIUM',
          externalLinks: [],
        },
        execution: {
          id: 'exec-1',
          status: 'COMPLETED',
          gitBranch: 'test',
          filesChanged: 5,
          linesAdded: 100,
          linesDeleted: 50,
        },
        metadata: {
          branch: 'test',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const configuredService = new PRTemplateService({ includeDiffStats: false });
      const result = await configuredService.render(context);

      // Should include execution but not diff stats
      expect(result.body).toContain('Agent Execution Summary');
      expect(result.body).not.toContain('Files Changed');
      expect(result.body).not.toContain('+100');
      expect(result.body).not.toContain('-50');
    });
  });

  describe('Title Generation', () => {
    it('should generate feat prefix for feature issues', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'title-test-1',
          title: 'Add new feature for user profiles',
          description: null,
          priority: 'MEDIUM',
          externalLinks: [],
        },
        metadata: {
          branch: 'feat/profiles',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);
      expect(result.title).toMatch(/^feat\(/);
    });

    it('should generate fix prefix for bug fixes', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'title-test-2',
          title: 'Fix login bug',
          description: null,
          priority: 'HIGH',
          externalLinks: [],
        },
        metadata: {
          branch: 'fix/login',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);
      expect(result.title).toMatch(/^fix\(/);
    });

    it('should use external issue ID in title', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'internal-123',
          title: 'Implement feature',
          description: null,
          priority: 'MEDIUM',
          externalLinks: [
            {
              provider: 'LINEAR',
              externalId: 'PROJ-456',
              url: 'https://linear.app/proj/PROJ-456',
            },
          ],
        },
        metadata: {
          branch: 'feat/implement',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);
      expect(result.title).toContain('PROJ-456');
      expect(result.title).not.toContain('internal-123');
    });
  });

  describe('Label Generation', () => {
    it('should generate priority labels', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'label-test-1',
          title: 'Test issue',
          description: null,
          priority: 'URGENT',
          externalLinks: [],
        },
        metadata: {
          branch: 'test',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);
      expect(result.labels).toContain('priority:urgent');
    });

    it('should add automated label when execution present', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'label-test-2',
          title: 'Test issue',
          description: null,
          priority: 'MEDIUM',
          externalLinks: [],
        },
        execution: {
          id: 'exec-1',
          status: 'COMPLETED',
          gitBranch: 'test',
        },
        metadata: {
          branch: 'test',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);
      expect(result.labels).toContain('automated');
    });

    it('should not add automated label when no execution', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'label-test-3',
          title: 'Test issue',
          description: null,
          priority: 'MEDIUM',
          externalLinks: [],
        },
        metadata: {
          branch: 'test',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);
      expect(result.labels).not.toContain('automated');
    });
  });

  describe('Handlebars Helpers', () => {
    it('should format dates correctly', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'helper-test-1',
          title: 'Test issue',
          description: null,
          priority: 'MEDIUM',
          externalLinks: [],
        },
        metadata: {
          branch: 'test',
          baseBranch: 'main',
          timestamp: new Date('2024-03-15T14:30:00Z'),
        },
      };

      const result = await service.render(context);
      expect(result.body).toContain('2024-03-15');
    });

    it('should format duration correctly', async () => {
      const testCases = [
        { ms: 45000, expected: '45s' },
        { ms: 90000, expected: '1m 30s' },
        { ms: 3600000, expected: '1h 0m' },
        { ms: 7380000, expected: '2h 3m' },
      ];

      for (const { ms, expected } of testCases) {
        const context: PRTemplateContext = {
          issue: {
            id: 'helper-test-2',
            title: 'Test issue',
            description: null,
            priority: 'MEDIUM',
            externalLinks: [],
          },
          execution: {
            id: 'exec-1',
            status: 'COMPLETED',
            gitBranch: 'test',
            duration: ms,
          },
          metadata: {
            branch: 'test',
            baseBranch: 'main',
            timestamp: new Date(),
          },
        };

        const result = await service.render(context);
        expect(result.body).toContain(expected);
      }
    });

    it('should uppercase strings correctly', async () => {
      const context: PRTemplateContext = {
        issue: {
          id: 'helper-test-3',
          title: 'Test issue',
          description: null,
          priority: 'high',
          externalLinks: [],
        },
        metadata: {
          branch: 'test',
          baseBranch: 'main',
          timestamp: new Date(),
        },
      };

      const result = await service.render(context);
      expect(result.body).toContain('HIGH');
    });
  });

  describe('Static buildContext helper', () => {
    it('should build context from Issue and AgentExecution', () => {
      const issue: Issue & { externalLinks?: ExternalIssueLink[] } = {
        id: 'issue-1',
        projectId: 'proj-1',
        title: 'Test issue',
        description: 'Test description',
        status: IssueStatus.IN_PROGRESS,
        priority: IssuePriority.HIGH,
        createdAt: new Date(),
        updatedAt: new Date(),
        externalLinks: [
          {
            id: 'link-1',
            issueId: 'issue-1',
            provider: ExternalIssueProvider.LINEAR,
            externalId: 'TEST-123',
            externalUrl: 'https://linear.app/test/TEST-123',
            syncEnabled: false,
            createdAt: new Date(),
          },
        ],
      };

      const execution: AgentExecution = {
        id: 'exec-1',
        agentId: 'agent-1',
        projectId: 'proj-1',
        issueId: 'issue-1',
        worktreePath: '/path/to/worktree',
        status: AgentExecutionStatus.COMPLETED,
        processId: 12345,
        exitCode: 0,
        startedAt: new Date('2024-01-15T10:00:00Z'),
        completedAt: new Date('2024-01-15T10:05:00Z'),
        lastHeartbeat: new Date(),
        context: null,
        errorMessage: null,
        gitDiff: null,
        gitCommitHash: 'abc123',
        gitCommitMsg: 'feat: implement feature',
        gitBranch: 'feat/test',
        filesChanged: 5,
        linesAdded: 100,
        linesDeleted: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const context = PRTemplateService.buildContext(issue, execution);

      expect(context.issue.id).toBe('issue-1');
      expect(context.issue.title).toBe('Test issue');
      expect(context.issue.description).toBe('Test description');
      expect(context.issue.priority).toBe(IssuePriority.HIGH);
      expect(context.issue.externalLinks).toHaveLength(1);
      expect(context.issue.externalLinks[0].provider).toBe('LINEAR');

      expect(context.execution?.id).toBe('exec-1');
      expect(context.execution?.status).toBe(AgentExecutionStatus.COMPLETED);
      expect(context.execution?.gitBranch).toBe('feat/test');
      expect(context.execution?.filesChanged).toBe(5);
      expect(context.execution?.duration).toBe(300000); // 5 minutes

      expect(context.metadata.branch).toBe('feat/test');
    });
  });

  describe('Singleton getInstance', () => {
    it('should return same instance', () => {
      const instance1 = getPRTemplateService();
      const instance2 = getPRTemplateService();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance with config', () => {
      const instance1 = getPRTemplateService();
      const instance2 = getPRTemplateService({ maxFilesListed: 10 });

      expect(instance1).not.toBe(instance2);
    });

    it('should reset singleton', () => {
      const instance1 = getPRTemplateService();
      resetPRTemplateService();
      const instance2 = getPRTemplateService();

      expect(instance1).not.toBe(instance2);
    });
  });
});
