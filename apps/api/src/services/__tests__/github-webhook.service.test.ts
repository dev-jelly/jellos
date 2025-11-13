/**
 * GitHub Webhook Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as crypto from 'crypto';
import {
  GitHubWebhookService,
  WebhookVerificationError,
  type GitHubPRWebhookPayload,
} from '../github-webhook.service';
import { IssueStatus } from '../../types/issue';

describe('GitHubWebhookService', () => {
  let service: GitHubWebhookService;
  const testSecret = 'test-webhook-secret';

  beforeEach(() => {
    service = new GitHubWebhookService(testSecret);
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const hmac = crypto.createHmac('sha256', testSecret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      expect(service.verifySignature(payload, signature)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const invalidSignature = 'sha256=invalid';

      expect(service.verifySignature(payload, invalidSignature)).toBe(false);
    });

    it('should throw error for missing signature', () => {
      const payload = JSON.stringify({ test: 'data' });

      expect(() => service.verifySignature(payload, undefined)).toThrow(
        WebhookVerificationError
      );
    });

    it('should throw error for invalid signature format', () => {
      const payload = JSON.stringify({ test: 'data' });
      const invalidFormat = 'invalid-format';

      expect(() => service.verifySignature(payload, invalidFormat)).toThrow(
        WebhookVerificationError
      );
    });

    it('should accept any signature when no secret is configured', () => {
      const serviceNoSecret = new GitHubWebhookService('');
      const payload = JSON.stringify({ test: 'data' });

      // Should return true even with no signature
      expect(serviceNoSecret.verifySignature(payload, undefined)).toBe(true);
    });

    it('should verify signature with Buffer payload', () => {
      const payload = Buffer.from(JSON.stringify({ test: 'data' }));
      const hmac = crypto.createHmac('sha256', testSecret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      expect(service.verifySignature(payload, signature)).toBe(true);
    });
  });

  describe('isValidEventType', () => {
    it('should accept pull_request events', () => {
      expect(service.isValidEventType('pull_request')).toBe(true);
    });

    it('should accept pull_request_review events', () => {
      expect(service.isValidEventType('pull_request_review')).toBe(true);
    });

    it('should reject other event types', () => {
      expect(service.isValidEventType('issues')).toBe(false);
      expect(service.isValidEventType('push')).toBe(false);
      expect(service.isValidEventType('create')).toBe(false);
    });
  });

  describe('processPullRequestEvent', () => {
    const createMockPayload = (
      action: string,
      state: 'open' | 'closed',
      merged: boolean
    ): GitHubPRWebhookPayload => ({
      action: action as any,
      number: 123,
      pull_request: {
        id: 456,
        number: 123,
        state,
        title: 'Test PR',
        body: 'Test PR body',
        html_url: 'https://github.com/test/repo/pull/123',
        head: {
          ref: 'feature/test-branch',
          sha: 'abc123',
        },
        base: {
          ref: 'main',
        },
        merged,
        merged_at: merged ? '2024-01-01T12:00:00Z' : null,
        closed_at: state === 'closed' ? '2024-01-01T12:00:00Z' : null,
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T11:00:00Z',
        user: {
          login: 'testuser',
        },
      },
      repository: {
        name: 'test-repo',
        full_name: 'test/repo',
        owner: {
          login: 'test',
        },
      },
      sender: {
        login: 'testuser',
      },
    });

    it('should process opened PR', async () => {
      const payload = createMockPayload('opened', 'open', false);
      const result = await service.processPullRequestEvent(payload);

      expect(result.success).toBe(true);
      expect(result.event).toBe('pull_request');
      expect(result.action).toBe('opened');
      expect(result.prNumber).toBe(123);
    });

    it('should process closed PR (not merged)', async () => {
      const payload = createMockPayload('closed', 'closed', false);
      const result = await service.processPullRequestEvent(payload);

      expect(result.success).toBe(true);
      expect(result.action).toBe('closed');
    });

    it('should process merged PR', async () => {
      const payload = createMockPayload('closed', 'closed', true);
      const result = await service.processPullRequestEvent(payload);

      expect(result.success).toBe(true);
      expect(result.action).toBe('closed');
    });

    it('should skip processing for non-state-changing actions', async () => {
      const payload = createMockPayload('edited', 'open', false);
      const result = await service.processPullRequestEvent(payload);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(false);
      expect(result.message).toContain('does not require state update');
    });

    it('should handle no mappings found', async () => {
      const payload = createMockPayload('opened', 'open', false);
      const result = await service.processPullRequestEvent(payload);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(false);
      expect(result.message).toContain('No issue-PR mappings found');
    });
  });

  describe('determinePRState', () => {
    it('should determine open state for opened action', () => {
      const result = (service as any).determinePRState('opened', 'open', false);
      expect(result).toBe('open');
    });

    it('should determine open state for reopened action', () => {
      const result = (service as any).determinePRState('reopened', 'open', false);
      expect(result).toBe('open');
    });

    it('should determine merged state for closed + merged', () => {
      const result = (service as any).determinePRState('closed', 'closed', true);
      expect(result).toBe('merged');
    });

    it('should determine closed state for closed without merge', () => {
      const result = (service as any).determinePRState('closed', 'closed', false);
      expect(result).toBe('closed');
    });

    it('should return null for non-state-changing actions', () => {
      expect((service as any).determinePRState('edited', 'open', false)).toBe(null);
      expect((service as any).determinePRState('synchronize', 'open', false)).toBe(null);
      expect((service as any).determinePRState('labeled', 'open', false)).toBe(null);
    });
  });

  describe('determineIssueStateTransition', () => {
    it('should transition to IN_REVIEW for open PR', () => {
      const result = (service as any).determineIssueStateTransition('open', false);
      expect(result).toBe(IssueStatus.IN_REVIEW);
    });

    it('should transition to MERGED for merged PR', () => {
      const result = (service as any).determineIssueStateTransition('merged', true);
      expect(result).toBe(IssueStatus.MERGED);
    });

    it('should transition to REJECTED for closed without merge', () => {
      const result = (service as any).determineIssueStateTransition('closed', false);
      expect(result).toBe(IssueStatus.REJECTED);
    });

    it('should transition to MERGED for closed with merge', () => {
      const result = (service as any).determineIssueStateTransition('closed', true);
      expect(result).toBe(IssueStatus.MERGED);
    });
  });

  describe('Signature generation helper', () => {
    it('should generate valid signature for testing', () => {
      const payload = JSON.stringify({ test: 'data' });
      const hmac = crypto.createHmac('sha256', testSecret);
      hmac.update(payload);
      const expectedSignature = `sha256=${hmac.digest('hex')}`;

      expect(service.verifySignature(payload, expectedSignature)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty payload', () => {
      const payload = '';
      const hmac = crypto.createHmac('sha256', testSecret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      expect(service.verifySignature(payload, signature)).toBe(true);
    });

    it('should handle large payloads', () => {
      const largePayload = JSON.stringify({
        data: 'x'.repeat(100000),
      });
      const hmac = crypto.createHmac('sha256', testSecret);
      hmac.update(largePayload);
      const signature = `sha256=${hmac.digest('hex')}`;

      expect(service.verifySignature(largePayload, signature)).toBe(true);
    });

    it('should handle special characters in payload', () => {
      const payload = JSON.stringify({
        title: 'PR with "quotes" and \\backslashes\\ and émojis 🚀',
      });
      const hmac = crypto.createHmac('sha256', testSecret);
      hmac.update(payload);
      const signature = `sha256=${hmac.digest('hex')}`;

      expect(service.verifySignature(payload, signature)).toBe(true);
    });
  });
});
