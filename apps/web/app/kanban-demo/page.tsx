'use client';

import { useState } from 'react';
import { KanbanBoard } from '@/components/kanban/kanban-board';
import { useKanban } from '@/lib/hooks/use-kanban';
import { EnrichedIssue } from '@/lib/api/issues';

/**
 * Kanban Demo Page
 *
 * Demonstrates the fully functional Kanban board with:
 * - Real API integration
 * - Optimistic UI updates
 * - Error handling with toast notifications
 * - Loading states
 * - Full keyboard accessibility
 * - Screen reader support
 * - Drag and drop
 *
 * Features Task 11.5: Optimistic UI updates and API integration
 */
export default function KanbanDemoPage() {
  // For demo purposes, we'll use a mock project ID
  // In production, this would come from the URL or context
  const PROJECT_ID = 'demo-project-1';

  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const { issues, isLoading, error, moveIssue } = useKanban({
    projectId: PROJECT_ID,
    enableRealTimeSync: true, // Task 11.6: Enable real-time SSE updates
    onError: (error) => {
      setToast({
        message: `Error: ${error.message}`,
        type: 'error',
      });
      // Auto-dismiss after 5 seconds
      setTimeout(() => setToast(null), 5000);
    },
    onSuccess: (issue) => {
      setToast({
        message: `Successfully moved "${issue.title}" to ${issue.status}`,
        type: 'success',
      });
      // Auto-dismiss after 3 seconds
      setTimeout(() => setToast(null), 3000);
    },
    onRemoteUpdate: (issue) => {
      setToast({
        message: `🔄 Real-time update: "${issue.title}" moved to ${issue.status}`,
        type: 'info',
      });
      // Auto-dismiss after 3 seconds
      setTimeout(() => setToast(null), 3000);
    },
  });

  const handleIssueClick = (issue: EnrichedIssue) => {
    setToast({
      message: `Clicked issue: ${issue.title}`,
      type: 'info',
    });
    setTimeout(() => setToast(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Kanban Board Demo</h1>
        <p className="text-gray-600">
          Task 11.5: Optimistic UI updates with real API integration. Drag issues between columns
          to change their status. Changes are saved automatically.
        </p>
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="font-semibold text-blue-900 mb-2">Features:</h2>
          <ul className="list-disc list-inside text-blue-800 space-y-1">
            <li>✅ Optimistic UI updates (instant visual feedback)</li>
            <li>✅ Automatic rollback on API failure</li>
            <li>✅ Real-time synchronization via SSE (Task 11.6)</li>
            <li>✅ Multi-user collaboration support</li>
            <li>✅ Full keyboard navigation (Tab, Arrow keys, Space, Enter, Escape)</li>
            <li>✅ Screen reader support with live announcements</li>
            <li>✅ Drag and drop with mouse, touch, and keyboard</li>
            <li>✅ Press '?' for keyboard shortcuts help</li>
          </ul>
        </div>
      </div>

      {/* Toast Notifications */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-all ${
            toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : toast.type === 'error'
              ? 'bg-red-50 border border-red-200 text-red-800'
              : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}
          role="alert"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="font-medium">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-gray-500 hover:text-gray-700"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading issues...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-red-900 font-semibold mb-2">Error Loading Issues</h2>
          <p className="text-red-700">{error.message}</p>
          <p className="text-red-600 text-sm mt-2">
            This demo requires a running API server with sample data.
          </p>
        </div>
      )}

      {/* Kanban Board */}
      {!isLoading && !error && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          {issues.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No issues found for this project.</p>
              <p className="text-gray-400 text-sm mt-2">
                Create some issues to see them on the Kanban board.
              </p>
            </div>
          ) : (
            <KanbanBoard
              issues={issues}
              onIssueClick={handleIssueClick}
              onIssueMove={moveIssue}
            />
          )}
        </div>
      )}

      {/* Info Footer */}
      <div className="mt-8 p-4 bg-gray-100 rounded-lg text-sm text-gray-600">
        <p className="font-semibold mb-2">Development Notes:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Task 11.5:</strong> Optimistic UI updates and API integration - Changes are
            saved immediately with automatic rollback on failure
          </li>
          <li>
            <strong>Task 11.6:</strong> Real-time SSE synchronization - Changes from other users
            appear instantly (try opening this page in multiple tabs!)
          </li>
          <li>If the API call fails, the issue will revert to its original position</li>
          <li>All drag operations work with mouse, touch, and keyboard</li>
          <li>Screen readers announce all state changes in real-time</li>
          <li>SSE connection automatically reconnects if disconnected</li>
        </ul>
      </div>
    </div>
  );
}
