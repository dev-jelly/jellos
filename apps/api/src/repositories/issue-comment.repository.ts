/**
 * Issue Comment Repository - Data access layer for issue comments
 */

import { prisma } from '../lib/db';
import type {
  IssueComment,
  CreateIssueCommentInput,
} from '../types/issue';

export class IssueCommentRepository {
  /**
   * Create a new comment
   */
  async create(data: CreateIssueCommentInput): Promise<IssueComment> {
    return prisma.issueComment.create({
      data,
    }) as Promise<IssueComment>;
  }

  /**
   * Find comment by ID
   */
  async findById(id: string): Promise<IssueComment | null> {
    return prisma.issueComment.findUnique({
      where: { id },
    }) as Promise<IssueComment | null>;
  }

  /**
   * Find all comments for an issue
   */
  async findByIssueId(issueId: string): Promise<IssueComment[]> {
    return prisma.issueComment.findMany({
      where: { issueId },
      orderBy: { createdAt: 'desc' },
    }) as Promise<IssueComment[]>;
  }

  /**
   * Find comments by author
   */
  async findByAuthor(author: string): Promise<IssueComment[]> {
    return prisma.issueComment.findMany({
      where: { author },
      orderBy: { createdAt: 'desc' },
    }) as Promise<IssueComment[]>;
  }

  /**
   * Update comment content
   */
  async update(id: string, content: string): Promise<IssueComment> {
    return prisma.issueComment.update({
      where: { id },
      data: { content },
    }) as Promise<IssueComment>;
  }

  /**
   * Delete a comment
   */
  async delete(id: string): Promise<void> {
    await prisma.issueComment.delete({
      where: { id },
    });
  }

  /**
   * Delete all comments for an issue
   */
  async deleteByIssueId(issueId: string): Promise<number> {
    const result = await prisma.issueComment.deleteMany({
      where: { issueId },
    });
    return result.count;
  }

  /**
   * Count comments for an issue
   */
  async countByIssueId(issueId: string): Promise<number> {
    return prisma.issueComment.count({
      where: { issueId },
    });
  }

  /**
   * Check if comment exists
   */
  async exists(id: string): Promise<boolean> {
    const count = await prisma.issueComment.count({
      where: { id },
    });
    return count > 0;
  }
}

// Export singleton instance
export const issueCommentRepository = new IssueCommentRepository();
