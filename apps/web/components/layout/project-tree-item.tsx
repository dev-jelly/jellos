'use client';

import type { Project } from '@/lib/api';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
import { AgentBadges } from '../agents/agent-badges';
import {
  isProjectExpanded,
  setProjectExpanded,
} from '@/lib/local-storage';

interface ProjectTreeItemProps {
  project: Project;
}

/**
 * Tree item component for a single project
 * Supports expand/collapse for nested views with state persistence
 */
export function ProjectTreeItem({ project }: ProjectTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(() =>
    isProjectExpanded(project.id)
  );

  // Persist expand/collapse state when it changes
  useEffect(() => {
    setProjectExpanded(project.id, isExpanded);
  }, [project.id, isExpanded]);

  return (
    <div>
      <div className="flex items-center gap-1 px-3 py-2 hover:bg-gray-100 transition-colors">
        {/* Expand/Collapse Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-shrink-0 p-0.5 hover:bg-gray-200 rounded transition-colors"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {/* Project Link */}
        <Link
          href={`/projects/${project.id}`}
          className="flex-1 min-w-0 block"
        >
          <div className="font-medium text-gray-900 text-sm truncate">
            {project.name}
          </div>
          {!isExpanded && (
            <div className="text-xs text-gray-500 truncate">
              {project.localPath}
            </div>
          )}
        </Link>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="ml-6 border-l border-gray-200">
          <div className="pl-4 py-2 text-xs space-y-1">
            <div className="text-gray-600">
              <span className="font-medium">Path:</span>{' '}
              <span className="text-gray-500">{project.localPath}</span>
            </div>
            <div className="text-gray-600">
              <span className="font-medium">Branch:</span>{' '}
              <span className="text-gray-500">{project.defaultBranch}</span>
            </div>
            <div className="text-gray-600">
              <span className="font-medium">Created:</span>{' '}
              <span className="text-gray-500">
                {new Date(project.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Agent Badges */}
          {project.agents && project.agents.length > 0 && (
            <div className="pl-4 py-2 border-t border-gray-100">
              <AgentBadges agents={project.agents} projectId={project.id} />
            </div>
          )}

          {/* Placeholder for future nested items (issues, worktrees) */}
          <div className="pl-4 py-1 text-xs text-gray-400">
            {/* Issues, Worktrees will be added here */}
          </div>
        </div>
      )}
    </div>
  );
}
