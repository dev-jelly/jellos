import { prisma, type Issue } from '../lib/db';

export class IssueRepository {
  async findByProject(projectId: string): Promise<Issue[]> {
    return prisma.issue.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        externalLinks: true,
        worktrees: {
          where: { status: 'ACTIVE' },
        },
      },
    });
  }

  async findById(id: string): Promise<Issue | null> {
    return prisma.issue.findUnique({
      where: { id },
      include: {
        project: true,
        externalLinks: true,
        worktrees: true,
        comments: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async create(data: {
    projectId: string;
    title: string;
    description?: string;
    status?: string;
    priority?: string;
  }): Promise<Issue> {
    return prisma.issue.create({
      data,
    });
  }

  async update(
    id: string,
    data: Partial<Pick<Issue, 'title' | 'description' | 'status' | 'priority'>>
  ): Promise<Issue> {
    return prisma.issue.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.issue.delete({
      where: { id },
    });
  }
}

// Export singleton instance
export const issueRepository = new IssueRepository();
