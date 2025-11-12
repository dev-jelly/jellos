/**
 * External Issue Link Repository - Data access layer for external issue links
 */

import { prisma } from '../lib/db';
import type {
  ExternalIssueLink,
  CreateExternalIssueLinkInput,
  ExternalIssueProvider,
} from '../types/issue';

export class ExternalIssueLinkRepository {
  /**
   * Create a new external issue link
   */
  async create(data: CreateExternalIssueLinkInput): Promise<ExternalIssueLink> {
    return prisma.externalIssueLink.create({
      data,
    }) as Promise<ExternalIssueLink>;
  }

  /**
   * Find external issue link by ID
   */
  async findById(id: string): Promise<ExternalIssueLink | null> {
    return prisma.externalIssueLink.findUnique({
      where: { id },
    }) as Promise<ExternalIssueLink | null>;
  }

  /**
   * Find external links for an issue
   */
  async findByIssueId(issueId: string): Promise<ExternalIssueLink[]> {
    return prisma.externalIssueLink.findMany({
      where: { issueId },
      orderBy: { createdAt: 'desc' },
    }) as Promise<ExternalIssueLink[]>;
  }

  /**
   * Find external link by issue and provider
   */
  async findByIssueAndProvider(
    issueId: string,
    provider: ExternalIssueProvider
  ): Promise<ExternalIssueLink | null> {
    return prisma.externalIssueLink.findUnique({
      where: {
        issueId_provider: {
          issueId,
          provider,
        },
      },
    }) as Promise<ExternalIssueLink | null>;
  }

  /**
   * Find external links by external ID (e.g., Linear ID)
   */
  async findByExternalId(externalId: string): Promise<ExternalIssueLink[]> {
    return prisma.externalIssueLink.findMany({
      where: { externalId },
    }) as Promise<ExternalIssueLink[]>;
  }

  /**
   * Find all links with sync enabled
   */
  async findSyncEnabled(): Promise<ExternalIssueLink[]> {
    return prisma.externalIssueLink.findMany({
      where: { syncEnabled: true },
      include: {
        issue: {
          include: {
            project: true,
          },
        },
      },
    }) as Promise<ExternalIssueLink[]>;
  }

  /**
   * Update sync enabled status
   */
  async updateSyncEnabled(
    id: string,
    syncEnabled: boolean
  ): Promise<ExternalIssueLink> {
    return prisma.externalIssueLink.update({
      where: { id },
      data: { syncEnabled },
    }) as Promise<ExternalIssueLink>;
  }

  /**
   * Delete an external issue link
   */
  async delete(id: string): Promise<void> {
    await prisma.externalIssueLink.delete({
      where: { id },
    });
  }

  /**
   * Delete all external links for an issue
   */
  async deleteByIssueId(issueId: string): Promise<number> {
    const result = await prisma.externalIssueLink.deleteMany({
      where: { issueId },
    });
    return result.count;
  }

  /**
   * Check if external link exists
   */
  async exists(issueId: string, provider: ExternalIssueProvider): Promise<boolean> {
    const count = await prisma.externalIssueLink.count({
      where: {
        issueId,
        provider,
      },
    });
    return count > 0;
  }

  /**
   * Count external links by provider
   */
  async countByProvider(provider: ExternalIssueProvider): Promise<number> {
    return prisma.externalIssueLink.count({
      where: { provider },
    });
  }
}

// Export singleton instance
export const externalIssueLinkRepository = new ExternalIssueLinkRepository();
