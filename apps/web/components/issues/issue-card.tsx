'use client';

import { EnrichedIssue } from '@/lib/api/issues';
import { ExternalLinks } from '@/components/links/external-links';

interface IssueCardProps {
  issue: EnrichedIssue;
  onClick?: () => void;
}

const statusColors: Record<string, string> = {
  TODO: 'bg-gray-100 text-gray-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  IN_REVIEW: 'bg-yellow-100 text-yellow-800',
  MERGED: 'bg-green-100 text-green-800',
  DEPLOYED: 'bg-purple-100 text-purple-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELED: 'bg-gray-100 text-gray-600',
};

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-600',
  HIGH: 'bg-orange-100 text-orange-600',
  URGENT: 'bg-red-100 text-red-600',
};

export function IssueCard({ issue, onClick }: IssueCardProps) {
  const hasLinear = Boolean(issue.linear);

  return (
    <div
      onClick={onClick}
      className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer bg-white"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{issue.title}</h3>
          {issue.linear && (
            <a
              href={issue.linear.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              <span>{issue.linear.identifier}</span>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
              </svg>
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${
              statusColors[issue.status] || 'bg-gray-100 text-gray-800'
            }`}
          >
            {issue.status.replace(/_/g, ' ')}
          </span>
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${
              priorityColors[issue.priority] || 'bg-gray-100 text-gray-600'
            }`}
          >
            {issue.priority}
          </span>
        </div>
      </div>

      {/* Description */}
      {issue.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {issue.description}
        </p>
      )}

      {/* Linear Data */}
      {hasLinear && (
        <div className="border-t pt-3 mt-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">L</span>
            </div>
            <span className="text-sm font-medium text-gray-700">Linear</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            {issue.linear?.state && (
              <div>
                <span className="text-gray-500">State:</span>
                <span className="ml-1 font-medium">{issue.linear.state.name}</span>
              </div>
            )}
            {issue.linear?.assignee && (
              <div>
                <span className="text-gray-500">Assignee:</span>
                <span className="ml-1 font-medium">{issue.linear.assignee.name}</span>
              </div>
            )}
            {issue.linear?.project && (
              <div>
                <span className="text-gray-500">Project:</span>
                <span className="ml-1 font-medium">{issue.linear.project.name}</span>
              </div>
            )}
            {issue.linear?.labels && issue.linear.labels.length > 0 && (
              <div className="col-span-2">
                <span className="text-gray-500">Labels:</span>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {issue.linear.labels.map((label) => (
                    <span
                      key={label.id}
                      className="px-2 py-0.5 text-xs rounded"
                      style={{
                        backgroundColor: `${label.color}20`,
                        color: label.color,
                      }}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enrichment Status */}
      {issue.enrichmentStatus && (
        <div className="mt-2 text-xs text-gray-500">
          {issue.enrichmentStatus.hasLinearLink && (
            <span>
              {issue.enrichmentStatus.linearSyncEnabled ? '🔄 Sync enabled' : '🔗 Linked'}
            </span>
          )}
        </div>
      )}

      {/* External Links */}
      <div className="mt-3 pt-3 border-t">
        <ExternalLinks
          projectId={issue.projectId}
          entityType="issue"
          entityData={{
            number: issue.id,
            linearId: issue.linear?.identifier || '',
          }}
        />
      </div>
    </div>
  );
}
