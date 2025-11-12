import { fetchProjects, type Project } from '@/lib/api';
import { ProjectList } from './project-list';

/**
 * Sidebar server component - fetches project data and passes to client component
 */
export async function Sidebar() {
  // Fetch projects on the server
  let projects: Project[] = [];
  let error: string | null = null;

  try {
    const response = await fetchProjects();
    projects = response.data;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load projects';
    console.error('Error fetching projects:', err);
  }

  return (
    <aside className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Jellos</h2>
        <p className="text-xs text-gray-500 mt-1">Workflow Automation</p>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-hidden">
        {error ? (
          <div className="p-4 text-sm text-red-600">
            <p className="font-medium">Error</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : (
          <ProjectList projects={projects} />
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-500">
          {projects.length} project{projects.length !== 1 ? 's' : ''}
        </div>
      </div>
    </aside>
  );
}
