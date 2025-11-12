import { Sidebar } from '@/components/layout/sidebar';
import { CommandPalette } from '@/components/command-palette/command-palette';
import { fetchProjects, type Project } from '@/lib/api';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch projects for command palette
  let projects: Project[] = [];
  try {
    const response = await fetchProjects();
    projects = response.data;
  } catch (error) {
    console.error('Error fetching projects for command palette:', error);
  }

  return (
    <div className="flex h-screen">
      {/* Left Navigation Bar */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Command Palette (global) */}
      <CommandPalette projects={projects} />
    </div>
  );
}
