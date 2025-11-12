'use client';

import type { Project } from '@/lib/api';
import { WindowVirtualizer } from 'virtua';
import { ProjectTreeItem } from './project-tree-item';

interface ProjectListProps {
  projects: Project[];
}

/**
 * Client component for project list with virtual scrolling and tree view
 * Uses Virtua's WindowVirtualizer for efficient rendering of large project lists
 */
export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-500">
        <p>No projects yet</p>
        <p className="mt-2 text-xs">Create a project to get started</p>
      </div>
    );
  }

  return (
    <nav className="h-full">
      <WindowVirtualizer>
        {projects.map((project) => (
          <ProjectTreeItem key={project.id} project={project} />
        ))}
      </WindowVirtualizer>
    </nav>
  );
}
