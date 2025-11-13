'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EnrichedIssue } from '@/lib/api/issues';
import { IssueCard } from '../issues/issue-card';
import { useKanbanTranslations, detectLocale, getStatusLabel } from './i18n';
import { useState } from 'react';

interface DraggableIssueCardProps {
  issue: EnrichedIssue;
  onClick?: () => void;
}

/**
 * DragHandle Component
 * Provides a visual handle for dragging the card
 */
function DragHandle() {
  return (
    <div
      className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      aria-hidden="true"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="text-gray-400"
        fill="currentColor"
      >
        <circle cx="4" cy="4" r="1.5" />
        <circle cx="4" cy="8" r="1.5" />
        <circle cx="4" cy="12" r="1.5" />
        <circle cx="8" cy="4" r="1.5" />
        <circle cx="8" cy="8" r="1.5" />
        <circle cx="8" cy="12" r="1.5" />
      </svg>
    </div>
  );
}

/**
 * DraggableIssueCard Component
 *
 * Wraps the IssueCard component with drag-and-drop functionality using @dnd-kit.
 * Provides:
 * - Drag handle for better UX
 * - Transform animations
 * - Visual feedback during drag (opacity, scale, overlay)
 * - WCAG 2.1 compliant keyboard accessibility
 * - Comprehensive screen reader support with ARIA attributes
 * - Touch support for mobile devices
 * - Visible focus indicators
 *
 * Uses useSortable hook from @dnd-kit/sortable for both dragging and sorting
 * within columns.
 *
 * Keyboard accessibility:
 * - Tab/Shift+Tab: Navigate between cards
 * - Space: Pick up/drop card
 * - Arrow keys: Move card between columns
 * - Escape: Cancel drag
 * - Enter: Open card details
 *
 * @example
 * ```tsx
 * <DraggableIssueCard
 *   issue={issue}
 *   onClick={() => handleIssueClick(issue)}
 * />
 * ```
 */
export function DraggableIssueCard({ issue, onClick }: DraggableIssueCardProps) {
  const [locale] = useState(() => detectLocale());
  const t = useKanbanTranslations(locale);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    setActivatorNodeRef,
  } = useSortable({
    id: issue.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    scale: isDragging ? 1.05 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  // Generate detailed aria-describedby content with localization
  const statusLabel = getStatusLabel(issue.status || 'TODO', locale);
  const priorityLabel = issue.priority?.toLowerCase() || (locale === 'ko' ? '우선순위 없음' : 'no priority');
  const descriptionId = `issue-desc-${issue.id}`;
  const instructionsId = `issue-instructions-${issue.id}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative
        transition-all duration-200
        focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2
        rounded-lg
        ${isDragging ? 'shadow-2xl ring-2 ring-blue-500 bg-blue-50/50' : ''}
        ${isOver ? 'ring-2 ring-green-400' : ''}
      `}
      role="article"
      aria-roledescription="draggable issue card"
      aria-label={issue.title}
      aria-describedby={`${descriptionId} ${instructionsId}`}
    >
      {/* Hidden description for screen readers */}
      <div id={descriptionId} className="sr-only">
        {issue.linear?.identifier ?
          (locale === 'ko' ? `이슈 ${issue.linear.identifier}. ` : `Issue ${issue.linear.identifier}. `)
          : ''}
        {locale === 'ko' ? '상태' : 'Status'}: {statusLabel}. {locale === 'ko' ? '우선순위' : 'Priority'}: {priorityLabel}.
        {issue.linear?.assignee ?
          (locale === 'ko' ? ` ${issue.linear.assignee.name}에게 할당됨.` : ` Assigned to ${issue.linear.assignee.name}.`)
          : (locale === 'ko' ? ' 미할당.' : ' Unassigned.')}
      </div>

      {/* Hidden instructions for screen readers */}
      <div id={instructionsId} className="sr-only">
        {t.cardInstructions}
      </div>

      {/* Drag Handle */}
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="absolute inset-0 cursor-grab active:cursor-grabbing z-10 focus:outline-none"
        role="button"
        tabIndex={0}
        aria-label={`Move ${issue.title}`}
        title="Press Space to pick up, Arrow keys to move, Space to drop"
        onKeyDown={(e) => {
          // Allow Enter key to open card details instead of dragging
          if (e.key === 'Enter' && onClick && !isDragging) {
            e.preventDefault();
            e.stopPropagation();
            onClick();
          }
        }}
      >
        <DragHandle />
      </div>

      {/* Issue Card */}
      <div className="relative z-0">
        <IssueCard issue={issue} onClick={onClick} />
      </div>

      {/* Visual focus indicator */}
      {isDragging && (
        <div
          className="absolute inset-0 pointer-events-none border-2 border-blue-500 rounded-lg"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
