import { prisma, type Project } from '../lib/db';

export class ProjectRepository {
  async findAll(): Promise<Project[]> {
    return prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Project | null> {
    return prisma.project.findUnique({
      where: { id },
      include: {
        issues: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        worktrees: {
          where: { status: 'ACTIVE' },
        },
        agents: {
          where: { enabled: true },
        },
      },
    });
  }

  async findByPath(localPath: string): Promise<Project | null> {
    return prisma.project.findUnique({
      where: { localPath },
    });
  }

  async create(data: {
    name: string;
    localPath: string;
    defaultBranch?: string;
  }): Promise<Project> {
    return prisma.project.create({
      data,
    });
  }

  async update(
    id: string,
    data: Partial<Pick<Project, 'name' | 'defaultBranch'>>
  ): Promise<Project> {
    return prisma.project.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.project.delete({
      where: { id },
    });
  }
}

// Export singleton instance
export const projectRepository = new ProjectRepository();
