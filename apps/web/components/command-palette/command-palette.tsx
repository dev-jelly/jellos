'use client';

import type { Project } from '@/lib/api';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { ClockIcon } from '@heroicons/react/24/outline';

interface CommandPaletteProps {
  projects: Project[];
}

/**
 * Simple fuzzy search implementation
 * Returns a score between 0 and 1 (higher is better)
 */
function fuzzySearch(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Exact match gets highest score
  if (textLower === queryLower) return 1;
  if (textLower.includes(queryLower)) return 0.9;

  // Character-by-character fuzzy matching
  let queryIndex = 0;
  let textIndex = 0;
  let matches = 0;
  let consecutiveMatches = 0;
  let maxConsecutive = 0;

  while (queryIndex < queryLower.length && textIndex < textLower.length) {
    if (queryLower[queryIndex] === textLower[textIndex]) {
      matches++;
      consecutiveMatches++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
      queryIndex++;
    } else {
      consecutiveMatches = 0;
    }
    textIndex++;
  }

  // All characters must match
  if (queryIndex !== queryLower.length) return 0;

  // Score based on match ratio and consecutive matches
  const matchRatio = matches / queryLower.length;
  const consecutiveBonus = maxConsecutive / queryLower.length;
  return matchRatio * 0.6 + consecutiveBonus * 0.4;
}

/**
 * Score and filter projects based on query
 */
function searchProjects(
  projects: Project[],
  query: string
): Array<Project & { score: number }> {
  if (!query.trim()) return projects.map((p) => ({ ...p, score: 0 }));

  return projects
    .map((project) => {
      // Search in both name and path
      const nameScore = fuzzySearch(query, project.name);
      const pathScore = fuzzySearch(query, project.localPath);
      const score = Math.max(nameScore, pathScore * 0.8); // Prefer name matches

      return { ...project, score };
    })
    .filter((p) => p.score > 0.1) // Filter out very poor matches
    .sort((a, b) => b.score - a.score);
}

/**
 * Local storage keys for recent projects
 */
const RECENT_PROJECTS_KEY = 'jellos:recentProjects';
const MAX_RECENT = 5;

/**
 * Get recent project IDs from local storage
 */
function getRecentProjects(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Add a project to recent projects
 */
function addToRecentProjects(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentProjects();
    const filtered = recent.filter((id) => id !== projectId);
    const updated = [projectId, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Command Palette component with keyboard shortcuts
 */
export function CommandPalette({ projects }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Load recent projects on mount
  useEffect(() => {
    setRecentProjectIds(getRecentProjects());
  }, []);

  // Get filtered and sorted projects
  const searchResults = searchProjects(projects, query);
  const recentProjects = recentProjectIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => p !== undefined);

  const displayedProjects = query.trim()
    ? searchResults
    : recentProjects.length > 0
      ? recentProjects
      : projects;

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, displayedProjects.length]);

  // Handle project selection
  const handleSelectProject = useCallback(
    (project: Project) => {
      addToRecentProjects(project.id);
      setRecentProjectIds(getRecentProjects());
      setIsOpen(false);
      setQuery('');
      router.push(`/projects/${project.id}`);
    },
    [router]
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open palette with Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }

      // Close with ESC
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setQuery('');
      }

      // Navigate with arrow keys
      if (isOpen && displayedProjects.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < displayedProjects.length - 1 ? prev + 1 : 0
          );
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : displayedProjects.length - 1
          );
        }

        // Select with Enter
        if (e.key === 'Enter' && displayedProjects[selectedIndex]) {
          e.preventDefault();
          handleSelectProject(displayedProjects[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, displayedProjects, selectedIndex, handleSelectProject]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={() => {
          setIsOpen(false);
          setQuery('');
        }}
      />

      {/* Palette */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects..."
              className="flex-1 outline-none text-gray-900 placeholder-gray-400"
            />
            <kbd className="hidden sm:inline-block px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {displayedProjects.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                No projects found
              </div>
            ) : (
              <div className="py-2">
                {/* Section Header */}
                {!query.trim() && recentProjects.length > 0 && (
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <ClockIcon className="w-3 h-3" />
                    Recent Projects
                  </div>
                )}

                {displayedProjects.map((project, index) => (
                  <button
                    key={project.id}
                    onClick={() => handleSelectProject(project)}
                    className={`w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                      index === selectedIndex ? 'bg-gray-100' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-900">
                      {project.name}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {project.localPath}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">
                  ↑↓
                </kbd>
                <span>Navigate</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">
                  ↵
                </kbd>
                <span>Select</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">
                  ESC
                </kbd>
                <span>Close</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
