import { prisma, type Project } from '../lib/db';

export class ProjectRepository {
  async findAll(skip = 0, take = 20): Promise<Project[]> {
    return prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async count(): Promise<number> {
    return prisma.project.count();
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
  ): Promise<Project | null> {
    try {
      return await prisma.project.update({
        where: { id },
        data,
      });
    } catch (error) {
      // Return null if project not found
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.project.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      // Return false if project not found
      return false;
    }
  }
}

// Export singleton instance
export const projectRepository = new ProjectRepository();
