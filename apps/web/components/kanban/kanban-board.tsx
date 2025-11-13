'use client';

import { useState, useEffect } from 'react';
import { DragOverlay, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { EnrichedIssue } from '@/lib/api/issues';
import { DndProvider } from '../providers';
import { KanbanColumn } from './kanban-column';
import { IssueCard } from '../issues/issue-card';
import { KanbanStatus, KANBAN_COLUMNS } from './types';
import { ScreenReaderAnnouncer, useAnnouncer } from './screen-reader-announcer';
import { KeyboardShortcutsHelp } from './keyboard-shortcuts-help';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useKanbanTranslations, detectLocale } from './i18n';

interface KanbanBoardProps {
  issues: EnrichedIssue[];
  onIssueClick?: (issue: EnrichedIssue) => void;
  onIssueMove?: (issueId: string, newStatus: KanbanStatus) => void | Promise<void>;
}

/**
 * KanbanBoard Component
 *
 * Main Kanban board that orchestrates drag-and-drop functionality.
 * Features:
 * - DragOverlay for smooth drag preview
 * - Multiple columns with status-based filtering
 * - Drag handlers (onDragStart, onDragEnd)
 * - Support for both mouse, touch, and keyboard interactions
 * - WCAG 2.1 compliant accessibility
 * - Screen reader announcements
 * - Keyboard shortcuts help (press '?')
 * - Full keyboard navigation support
 *
 * @example
 * ```tsx
 * <KanbanBoard
 *   issues={issues}
 *   onIssueClick={handleIssueClick}
 *   onIssueMove={handleIssueMove}
 * />
 * ```
 */
export function KanbanBoard({ issues, onIssueClick, onIssueMove }: KanbanBoardProps) {
  const [activeIssue, setActiveIssue] = useState<EnrichedIssue | null>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [locale] = useState(() => detectLocale());
  const t = useKanbanTranslations(locale);
  const { announcement, politeness, announce } = useAnnouncer();

  // Keyboard shortcut for help modal (?)
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Show help when '?' is pressed (Shift + /)
      if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setShowKeyboardHelp(true);
        announce(t.keyboardShortcutsOpened, 'polite');
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [announce, t]);

  /**
   * Handle drag start event
   * Store the currently dragging issue for DragOverlay and announce to screen readers
   */
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const issue = issues.find((i) => i.id === active.id);
    if (issue) {
      setActiveIssue(issue);
      const currentColumn = KANBAN_COLUMNS[issue.status as KanbanStatus];
      const columnTitle = locale === 'ko' ? t.status[issue.status as KanbanStatus] : currentColumn.title;
      announce(t.pickedUpCard(issue.title, columnTitle), 'assertive');
    }
  };

  /**
   * Handle drag end event
   * Update issue status and clear active issue, announce to screen readers
   */
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    // Clear active issue
    setActiveIssue(null);

    if (!over) {
      announce(t.droppedInOriginal, 'polite');
      return;
    }

    const issueId = active.id as string;
    const newStatus = over.id as KanbanStatus;

    // Find the issue
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;

    // If status hasn't changed, do nothing
    if (issue.status === newStatus) {
      announce(t.droppedInSame(issue.title), 'polite');
      return;
    }

    const newColumn = KANBAN_COLUMNS[newStatus];
    const oldColumn = KANBAN_COLUMNS[issue.status as KanbanStatus];

    // Get localized column titles
    const newColumnTitle = locale === 'ko' ? t.status[newStatus] : newColumn.title;
    const oldColumnTitle = locale === 'ko' ? t.status[issue.status as KanbanStatus] : oldColumn.title;

    // Announce the move
    announce(t.movedCard(issue.title, oldColumnTitle, newColumnTitle), 'assertive');

    // Call the move handler
    if (onIssueMove) {
      try {
        await onIssueMove(issueId, newStatus);
        announce(t.updateSuccess(issue.title, newColumnTitle), 'polite');
      } catch {
        announce(t.updateFailed(issue.title), 'assertive');
      }
    }
  };

  /**
   * Handle drag cancel event
   * Clear active issue when drag is cancelled and announce to screen readers
   */
  const handleDragCancel = () => {
    if (activeIssue) {
      announce(t.dragCancelled(activeIssue.title), 'polite');
    }
    setActiveIssue(null);
  };

  return (
    <>
      <DndProvider
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* Accessibility: Instructions for screen readers */}
        <div className="sr-only" role="region" aria-label="Kanban board instructions">
          <p>{t.boardInstructions}</p>
        </div>

        <div className="relative">
          {/* Help button - visible to all users */}
          <div className="absolute top-0 right-0 z-20">
            <button
              onClick={() => setShowKeyboardHelp(true)}
              className="p-2 rounded-md bg-white border border-gray-300 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              aria-label="Show keyboard shortcuts help"
              title="Keyboard shortcuts (?)"
            >
              <QuestionMarkCircleIcon className="w-5 h-5 text-gray-600" aria-hidden="true" />
            </button>
          </div>

          {/* Main board */}
          <div
            className="flex gap-4 h-full overflow-x-auto pb-4"
            role="application"
            aria-label="Kanban board with drag and drop functionality"
          >
            {/* Render columns */}
            {Object.values(KanbanStatus).map((status) => (
              <div key={status} className="flex-shrink-0 w-80">
                <KanbanColumn
                  status={status}
                  issues={issues}
                  config={KANBAN_COLUMNS[status]}
                  onIssueClick={onIssueClick}
                />
              </div>
            ))}
          </div>
        </div>

        {/* DragOverlay for smooth drag preview */}
        <DragOverlay
          dropAnimation={{
            duration: 200,
            easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
          }}
        >
          {activeIssue ? (
            <div className="cursor-grabbing transform rotate-3 shadow-2xl">
              <IssueCard issue={activeIssue} />
            </div>
          ) : null}
        </DragOverlay>
      </DndProvider>

      {/* Screen reader announcements */}
      <ScreenReaderAnnouncer announcement={announcement} politeness={politeness} />

      {/* Keyboard shortcuts help modal */}
      <KeyboardShortcutsHelp
        isOpen={showKeyboardHelp}
        locale={locale}
        onClose={() => {
          setShowKeyboardHelp(false);
          announce(t.keyboardShortcutsClosed, 'polite');
        }}
      />
    </>
  );
}
