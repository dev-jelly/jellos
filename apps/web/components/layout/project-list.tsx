'use client';

import type { Project } from '@/lib/api';
import Link from 'next/link';

interface ProjectListProps {
  projects: Project[];
}

/**
 * Client component for project list - will be enhanced with virtual scrolling in Subtask 4.2
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
    <nav className="p-2">
      <div className="space-y-1">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="block px-3 py-2 rounded-md text-sm hover:bg-gray-100 transition-colors"
          >
            <div className="font-medium text-gray-900">{project.name}</div>
            <div className="text-xs text-gray-500 truncate">
              {project.localPath}
            </div>
          </Link>
        ))}
      </div>
    </nav>
  );
}
