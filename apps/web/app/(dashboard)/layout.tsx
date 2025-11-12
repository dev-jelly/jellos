import { Sidebar } from '@/components/layout/sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      {/* Left Navigation Bar */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
