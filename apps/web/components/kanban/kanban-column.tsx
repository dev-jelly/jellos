'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { EnrichedIssue } from '@/lib/api/issues';
import { KanbanStatus, KanbanColumnConfig } from './types';
import { DraggableIssueCard } from './draggable-issue-card';

interface KanbanColumnProps {
  status: KanbanStatus;
  issues: EnrichedIssue[];
  config: KanbanColumnConfig;
  onIssueClick?: (issue: EnrichedIssue) => void;
}

/**
 * KanbanColumn Component
 *
 * Renders a droppable Kanban column that:
 * - Uses @dnd-kit's useDroppable for drop zone functionality
 * - Uses SortableContext for sortable items within the column
 * - Displays column header with status and issue count
 * - Shows empty state when no issues present
 * - Provides visual feedback on drag over
 *
 * @example
 * ```tsx
 * <KanbanColumn
 *   status={KanbanStatus.TODO}
 *   issues={todoIssues}
 *   config={KANBAN_COLUMNS[KanbanStatus.TODO]}
 *   onIssueClick={handleIssueClick}
 * />
 * ```
 */
export function KanbanColumn({ status, issues, config, onIssueClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  // Filter issues by this column's status
  const columnIssues = issues.filter((issue) => issue.status === status);
  const issueIds = columnIssues.map((issue) => issue.id);

  const columnId = `column-${status}`;
  const headerId = `column-header-${status}`;
  const dropzoneId = `dropzone-${status}`;

  return (
    <div className="flex flex-col h-full">
      {/* Column Header */}
      <div
        id={headerId}
        className={`sticky top-0 z-10 ${config.bgColor} rounded-t-lg border-b-2`}
      >
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <h3
              className={`font-semibold text-sm uppercase tracking-wide ${config.textColor}`}
              id={columnId}
            >
              {config.title}
            </h3>
            <span
              className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full ${config.bgColor} ${config.textColor} border-2`}
              style={{ borderColor: config.color }}
              aria-label={`${columnIssues.length} ${columnIssues.length === 1 ? 'issue' : 'issues'}`}
              role="status"
            >
              {columnIssues.length}
            </span>
          </div>
        </div>
      </div>

      {/* Droppable Area */}
      <div
        id={dropzoneId}
        ref={setNodeRef}
        className={`flex-1 p-4 min-h-[500px] transition-colors duration-200 ${
          isOver ? `${config.bgColor} ring-2 ring-offset-2` : 'bg-gray-50'
        }`}
        style={
          isOver
            ? ({
                '--tw-ring-color': config.color,
              } as React.CSSProperties)
            : undefined
        }
        role="list"
        aria-labelledby={columnId}
        aria-label={`${config.title} drop zone for issue cards`}
        aria-describedby={`${columnId}-description`}
      >
        {/* Hidden description for screen readers */}
        <div id={`${columnId}-description`} className="sr-only">
          Drop zone for {config.title} status. Contains {columnIssues.length}{' '}
          {columnIssues.length === 1 ? 'issue' : 'issues'}.
          {isOver && ' Ready to drop card here.'}
        </div>

        <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3" role="list" aria-label={`${config.title} issues`}>
            {columnIssues.length > 0 ? (
              columnIssues.map((issue) => (
                <div key={issue.id} role="listitem">
                  <DraggableIssueCard
                    issue={issue}
                    onClick={() => onIssueClick?.(issue)}
                  />
                </div>
              ))
            ) : (
              /* Empty State */
              <div
                className="flex flex-col items-center justify-center py-12 text-center"
                role="status"
                aria-label={`No issues in ${config.title} column`}
              >
                <div
                  className="w-16 h-16 rounded-full mb-3 flex items-center justify-center opacity-20"
                  style={{ backgroundColor: config.color }}
                  aria-hidden="true"
                >
                  <svg
                    className="w-8 h-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: config.color }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                </div>
                <p className={`text-sm font-medium ${config.textColor} opacity-60`}>
                  No issues in {config.title.toLowerCase()}
                </p>
                <p className="text-xs text-gray-500 mt-1 opacity-50">
                  Drag issues here to update their status
                </p>
              </div>
            )}
          </div>
        </SortableContext>
      </div>

      {/* Drop Indicator - Visual feedback when dragging over */}
      {isOver && (
        <div
          className="absolute inset-0 pointer-events-none border-2 border-dashed rounded-lg"
          style={{ borderColor: config.color }}
          aria-hidden="true"
          role="presentation"
        />
      )}
    </div>
  );
}
