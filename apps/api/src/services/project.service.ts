import { type Project } from '../lib/db';
import { eventBus } from '../lib/event-bus';
import { ProjectRepository } from '../repositories/project.repository';

// Business logic errors
export class ProjectAlreadyExistsError extends Error {
  constructor(localPath: string) {
    super(`Project with path '${localPath}' already exists`);
    this.name = 'ProjectAlreadyExistsError';
  }
}

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Project with id '${id}' not found`);
    this.name = 'ProjectNotFoundError';
  }
}

/**
 * Project service layer - handles business logic and validation
 */
export class ProjectService {
  private repository: ProjectRepository;

  constructor() {
    this.repository = new ProjectRepository();
  }

  /**
   * Create a new project with business validation
   */
  async createProject(data: {
    name: string;
    localPath: string;
    defaultBranch?: string;
  }): Promise<Project> {
    // Business rule: Check if project with same path already exists
    const existingProject = await this.repository.findByPath(data.localPath);
    if (existingProject) {
      throw new ProjectAlreadyExistsError(data.localPath);
    }

    // Create the project
    const project = await this.repository.create(data);

    // Emit ProjectCreated event
    eventBus.emitEvent('project.created', { projectId: project.id });

    return project;
  }

  /**
   * List projects with pagination
   */
  async listProjects(
    page: number,
    limit: number
  ): Promise<{ data: Project[]; total: number }> {
    const skip = (page - 1) * limit;

    const [projects, total] = await Promise.all([
      this.repository.findAll(skip, limit),
      this.repository.count(),
    ]);

    return { data: projects, total };
  }

  /**
   * Get project by ID
   */
  async getProjectById(id: string): Promise<Project> {
    const project = await this.repository.findById(id);

    if (!project) {
      throw new ProjectNotFoundError(id);
    }

    return project;
  }

  /**
   * Update project with business validation
   */
  async updateProject(
    id: string,
    data: Partial<Pick<Project, 'name' | 'defaultBranch'>>
  ): Promise<Project> {
    // Verify project exists before updating
    await this.getProjectById(id);

    const updated = await this.repository.update(id, data);

    if (!updated) {
      throw new ProjectNotFoundError(id);
    }

    // Emit ProjectUpdated event
    eventBus.emitEvent('project.updated', { projectId: id, changes: data });

    return updated;
  }

  /**
   * Delete project with business validation
   */
  async deleteProject(id: string): Promise<void> {
    // Verify project exists before deleting
    await this.getProjectById(id);

    const deleted = await this.repository.delete(id);

    if (!deleted) {
      throw new ProjectNotFoundError(id);
    }

    // Emit ProjectDeleted event
    eventBus.emitEvent('project.deleted', { projectId: id });
  }

  /**
   * Check if project exists by path
   */
  async projectExistsByPath(localPath: string): Promise<boolean> {
    const project = await this.repository.findByPath(localPath);
    return project !== null;
  }
}

// Export singleton instance
export const projectService = new ProjectService();
