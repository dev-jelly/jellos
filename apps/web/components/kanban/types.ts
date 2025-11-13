/**
 * Kanban component types
 */

import { EnrichedIssue } from '@/lib/api/issues';

/**
 * Kanban column status types
 * Maps to issue status enum values
 */
export enum KanbanStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  DEPLOYED = 'DEPLOYED',
}

/**
 * Column configuration for rendering
 */
export interface KanbanColumnConfig {
  id: KanbanStatus;
  title: string;
  color: string;
  bgColor: string;
  textColor: string;
}

/**
 * Kanban column props
 */
export interface KanbanColumnProps {
  status: KanbanStatus;
  issues: EnrichedIssue[];
  config: KanbanColumnConfig;
  onIssueClick?: (issue: EnrichedIssue) => void;
}

/**
 * Default column configurations
 */
export const KANBAN_COLUMNS: Record<KanbanStatus, KanbanColumnConfig> = {
  [KanbanStatus.TODO]: {
    id: KanbanStatus.TODO,
    title: 'To Do',
    color: '#6B7280',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-700',
  },
  [KanbanStatus.IN_PROGRESS]: {
    id: KanbanStatus.IN_PROGRESS,
    title: 'In Progress',
    color: '#3B82F6',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
  },
  [KanbanStatus.IN_REVIEW]: {
    id: KanbanStatus.IN_REVIEW,
    title: 'In Review',
    color: '#F59E0B',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
  },
  [KanbanStatus.DEPLOYED]: {
    id: KanbanStatus.DEPLOYED,
    title: 'Deployed',
    color: '#10B981',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
  },
};

/**
 * Get column configuration by status
 */
export function getColumnConfig(status: KanbanStatus): KanbanColumnConfig {
  return KANBAN_COLUMNS[status];
}

/**
 * Filter issues by status
 */
export function filterIssuesByStatus(
  issues: EnrichedIssue[],
  status: KanbanStatus
): EnrichedIssue[] {
  return issues.filter((issue) => issue.status === status);
}
