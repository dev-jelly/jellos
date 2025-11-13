/**
 * useKanban Hook
 * Manages Kanban board state with optimistic updates and API integration
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { EnrichedIssue, fetchProjectIssues, updateIssue } from '@/lib/api/issues';
import { KanbanStatus } from '@/components/kanban/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export interface UseKanbanOptions {
  projectId: string;
  enableRealTimeSync?: boolean; // Task 11.6: Enable SSE real-time sync
  onError?: (error: Error) => void;
  onSuccess?: (issue: EnrichedIssue) => void;
  onRemoteUpdate?: (issue: EnrichedIssue) => void; // Callback for remote updates
}

export interface UseKanbanReturn {
  issues: EnrichedIssue[];
  isLoading: boolean;
  error: Error | null;
  moveIssue: (issueId: string, newStatus: KanbanStatus) => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Custom hook for Kanban board state management
 *
 * Features:
 * - Fetches issues from API
 * - Optimistic UI updates (update local state immediately)
 * - Rollback on API failure
 * - Error handling and callbacks
 *
 * @example
 * ```tsx
 * const { issues, moveIssue, isLoading } = useKanban({
 *   projectId: 'project-123',
 *   onError: (error) => toast.error(error.message),
 *   onSuccess: (issue) => toast.success(`Moved ${issue.title}`),
 * });
 *
 * return <KanbanBoard issues={issues} onIssueMove={moveIssue} />;
 * ```
 */
export function useKanban({
  projectId,
  enableRealTimeSync = false,
  onError,
  onSuccess,
  onRemoteUpdate,
}: UseKanbanOptions): UseKanbanReturn {
  const [issues, setIssues] = useState<EnrichedIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  /**
   * Fetch issues from API
   */
  const fetchIssues = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetchProjectIssues(projectId, {
        includeLinearData: true,
        strategy: 'prefer_internal',
      });
      setIssues(response.data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch issues');
      setError(error);
      if (onError) {
        onError(error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectId, onError]);

  /**
   * Initial fetch
   */
  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  /**
   * Task 11.6: Real-time synchronization via SSE
   * Subscribe to issue updates for the project
   */
  useEffect(() => {
    if (!enableRealTimeSync) {
      return;
    }

    // Create EventSource connection
    const eventSource = new EventSource(
      `${API_BASE_URL}/issues/stream?projectId=${projectId}`
    );
    eventSourceRef.current = eventSource;

    // Handle connection opened
    eventSource.addEventListener('open', () => {
      console.log('[useKanban] SSE connection opened');
    });

    // Handle issue-updated events
    eventSource.addEventListener('issue-updated', (event) => {
      try {
        const payload = JSON.parse(event.data);
        const updatedIssue = payload.data as EnrichedIssue;

        console.log('[useKanban] Received remote update:', updatedIssue);

        // Update local state with remote change
        setIssues((prevIssues) => {
          const existingIndex = prevIssues.findIndex((i) => i.id === updatedIssue.id);

          if (existingIndex >= 0) {
            // Update existing issue
            const newIssues = [...prevIssues];
            newIssues[existingIndex] = updatedIssue;
            return newIssues;
          } else {
            // Add new issue if not found
            return [...prevIssues, updatedIssue];
          }
        });

        // Callback for remote updates
        if (onRemoteUpdate) {
          onRemoteUpdate(updatedIssue);
        }
      } catch (err) {
        console.error('[useKanban] Error parsing SSE event:', err);
      }
    });

    // Handle errors
    eventSource.addEventListener('error', (err) => {
      console.error('[useKanban] SSE error:', err);

      // Close and reconnect after 5 seconds
      eventSource.close();

      setTimeout(() => {
        console.log('[useKanban] Attempting to reconnect SSE...');
        // The effect will re-run and create a new connection
      }, 5000);
    });

    // Cleanup on unmount
    return () => {
      console.log('[useKanban] Closing SSE connection');
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [projectId, enableRealTimeSync, onRemoteUpdate]);

  /**
   * Move issue to new status with optimistic update
   *
   * Flow:
   * 1. Save current state for rollback
   * 2. Update local state immediately (optimistic)
   * 3. Call API
   * 4. On success: call onSuccess callback
   * 5. On failure: rollback to previous state, call onError callback
   */
  const moveIssue = useCallback(
    async (issueId: string, newStatus: KanbanStatus) => {
      // Find the issue to move
      const issueToMove = issues.find((i) => i.id === issueId);
      if (!issueToMove) {
        const error = new Error(`Issue ${issueId} not found`);
        if (onError) {
          onError(error);
        }
        return;
      }

      // Save previous state for rollback
      const previousIssues = [...issues];
      const previousStatus = issueToMove.status;

      try {
        // Optimistic update: Update local state immediately
        setIssues((prevIssues) =>
          prevIssues.map((issue) =>
            issue.id === issueId
              ? { ...issue, status: newStatus, updatedAt: new Date().toISOString() }
              : issue
          )
        );

        // Call API
        const response = await updateIssue(issueId, { status: newStatus });

        // Success callback
        if (onSuccess) {
          onSuccess(response.data);
        }
      } catch (err) {
        // Rollback on error
        setIssues(previousIssues);

        const error = err instanceof Error ? err : new Error('Failed to update issue');

        // Error callback
        if (onError) {
          onError(error);
        }

        // Re-throw for component-level error handling
        throw error;
      }
    },
    [issues, onError, onSuccess]
  );

  return {
    issues,
    isLoading,
    error,
    moveIssue,
    refetch: fetchIssues,
  };
}
