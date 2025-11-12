'use client';

import type { Project } from '@/lib/api';
import Link from 'next/link';
import { WindowVirtualizer } from 'virtua';

interface ProjectListProps {
  projects: Project[];
}

/**
 * Client component for project list with virtual scrolling
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
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="block px-5 py-3 hover:bg-gray-100 transition-colors border-b border-gray-100"
          >
            <div className="font-medium text-gray-900 text-sm">
              {project.name}
            </div>
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {project.localPath}
            </div>
          </Link>
        ))}
      </WindowVirtualizer>
    </nav>
  );
}
