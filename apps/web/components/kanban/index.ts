/**
 * Kanban Board Components
 *
 * Export all Kanban-related components and utilities
 * Includes WCAG 2.1 compliant accessibility features
 */

export { KanbanBoard } from './kanban-board';
export { KanbanColumn } from './kanban-column';
export { DraggableIssueCard } from './draggable-issue-card';
export {
  KanbanStatus,
  KANBAN_COLUMNS,
  getColumnConfig,
  filterIssuesByStatus,
  type KanbanColumnConfig,
  type KanbanColumnProps,
} from './types';
export { ScreenReaderAnnouncer, useAnnouncer } from './screen-reader-announcer';
export { KeyboardShortcutsHelp } from './keyboard-shortcuts-help';
export { kanbanKeyboardCoordinates } from './keyboard-coordinates';
export {
  useKanbanTranslations,
  detectLocale,
  getStatusLabel,
  type Locale,
} from './i18n';
