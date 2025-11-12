'use client';

import { useState, useEffect } from 'react';
import { EnrichedIssue, fetchProjectIssues } from '@/lib/api/issues';
import { IssueCard } from './issue-card';

interface IssueListProps {
  projectId: string;
  onIssueClick?: (issue: EnrichedIssue) => void;
}

export function IssueList({ projectId, onIssueClick }: IssueListProps) {
  const [issues, setIssues] = useState<EnrichedIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<{
    cached: boolean;
    stale: boolean;
  } | null>(null);

  useEffect(() => {
    async function loadIssues() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetchProjectIssues(projectId, {
          includeLinearData: true,
          strategy: 'prefer_internal',
        });

        setIssues(response.data);
        if (response.cache) {
          setCacheInfo(response.cache);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load issues');
      } finally {
        setLoading(false);
      }
    }

    loadIssues();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading issues...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading issues</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="text-center p-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No issues</h3>
        <p className="mt-1 text-sm text-gray-500">
          Get started by creating a new issue
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Cache info banner */}
      {cacheInfo && cacheInfo.cached && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" />
            </svg>
            <span className="text-blue-700">
              {cacheInfo.stale
                ? 'Showing cached data (updating in background)'
                : 'Data loaded from cache'}
            </span>
          </div>
        </div>
      )}

      {/* Issues grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            onClick={() => onIssueClick?.(issue)}
          />
        ))}
      </div>

      {/* Count */}
      <div className="mt-4 text-sm text-gray-500 text-center">
        Showing {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
      </div>
    </div>
  );
}
