/**
 * Kanban Types and Utilities Tests
 *
 * Tests for type definitions and utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  KanbanStatus,
  KANBAN_COLUMNS,
  getColumnConfig,
  filterIssuesByStatus,
} from '../types';
import { EnrichedIssue } from '@/lib/api/issues';

// Mock data
const mockIssues: EnrichedIssue[] = [
  {
    id: '1',
    projectId: 'project-1',
    title: 'Todo Issue',
    status: 'TODO',
    priority: 'HIGH',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    projectId: 'project-1',
    title: 'In Progress Issue',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
  {
    id: '3',
    projectId: 'project-1',
    title: 'Review Issue',
    status: 'IN_REVIEW',
    priority: 'LOW',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
  },
  {
    id: '4',
    projectId: 'project-1',
    title: 'Deployed Issue',
    status: 'DEPLOYED',
    priority: 'HIGH',
    createdAt: '2024-01-04T00:00:00Z',
    updatedAt: '2024-01-04T00:00:00Z',
  },
];

describe('KanbanStatus enum', () => {
  it('has correct TODO status', () => {
    expect(KanbanStatus.TODO).toBe('TODO');
  });

  it('has correct IN_PROGRESS status', () => {
    expect(KanbanStatus.IN_PROGRESS).toBe('IN_PROGRESS');
  });

  it('has correct IN_REVIEW status', () => {
    expect(KanbanStatus.IN_REVIEW).toBe('IN_REVIEW');
  });

  it('has correct DEPLOYED status', () => {
    expect(KanbanStatus.DEPLOYED).toBe('DEPLOYED');
  });
});

describe('KANBAN_COLUMNS configuration', () => {
  it('has configuration for all statuses', () => {
    expect(KANBAN_COLUMNS[KanbanStatus.TODO]).toBeDefined();
    expect(KANBAN_COLUMNS[KanbanStatus.IN_PROGRESS]).toBeDefined();
    expect(KANBAN_COLUMNS[KanbanStatus.IN_REVIEW]).toBeDefined();
    expect(KANBAN_COLUMNS[KanbanStatus.DEPLOYED]).toBeDefined();
  });

  describe('TODO column config', () => {
    const config = KANBAN_COLUMNS[KanbanStatus.TODO];

    it('has correct id', () => {
      expect(config.id).toBe(KanbanStatus.TODO);
    });

    it('has correct title', () => {
      expect(config.title).toBe('To Do');
    });

    it('has color properties', () => {
      expect(config.color).toBeDefined();
      expect(config.bgColor).toBeDefined();
      expect(config.textColor).toBeDefined();
    });

    it('has gray color scheme', () => {
      expect(config.color).toBe('#6B7280');
      expect(config.bgColor).toBe('bg-gray-50');
      expect(config.textColor).toBe('text-gray-700');
    });
  });

  describe('IN_PROGRESS column config', () => {
    const config = KANBAN_COLUMNS[KanbanStatus.IN_PROGRESS];

    it('has correct id', () => {
      expect(config.id).toBe(KanbanStatus.IN_PROGRESS);
    });

    it('has correct title', () => {
      expect(config.title).toBe('In Progress');
    });

    it('has blue color scheme', () => {
      expect(config.color).toBe('#3B82F6');
      expect(config.bgColor).toBe('bg-blue-50');
      expect(config.textColor).toBe('text-blue-700');
    });
  });

  describe('IN_REVIEW column config', () => {
    const config = KANBAN_COLUMNS[KanbanStatus.IN_REVIEW];

    it('has correct id', () => {
      expect(config.id).toBe(KanbanStatus.IN_REVIEW);
    });

    it('has correct title', () => {
      expect(config.title).toBe('In Review');
    });

    it('has yellow color scheme', () => {
      expect(config.color).toBe('#F59E0B');
      expect(config.bgColor).toBe('bg-yellow-50');
      expect(config.textColor).toBe('text-yellow-700');
    });
  });

  describe('DEPLOYED column config', () => {
    const config = KANBAN_COLUMNS[KanbanStatus.DEPLOYED];

    it('has correct id', () => {
      expect(config.id).toBe(KanbanStatus.DEPLOYED);
    });

    it('has correct title', () => {
      expect(config.title).toBe('Deployed');
    });

    it('has green color scheme', () => {
      expect(config.color).toBe('#10B981');
      expect(config.bgColor).toBe('bg-green-50');
      expect(config.textColor).toBe('text-green-700');
    });
  });
});

describe('getColumnConfig', () => {
  it('returns correct config for TODO status', () => {
    const config = getColumnConfig(KanbanStatus.TODO);
    expect(config).toEqual(KANBAN_COLUMNS[KanbanStatus.TODO]);
  });

  it('returns correct config for IN_PROGRESS status', () => {
    const config = getColumnConfig(KanbanStatus.IN_PROGRESS);
    expect(config).toEqual(KANBAN_COLUMNS[KanbanStatus.IN_PROGRESS]);
  });

  it('returns correct config for IN_REVIEW status', () => {
    const config = getColumnConfig(KanbanStatus.IN_REVIEW);
    expect(config).toEqual(KANBAN_COLUMNS[KanbanStatus.IN_REVIEW]);
  });

  it('returns correct config for DEPLOYED status', () => {
    const config = getColumnConfig(KanbanStatus.DEPLOYED);
    expect(config).toEqual(KANBAN_COLUMNS[KanbanStatus.DEPLOYED]);
  });
});

describe('filterIssuesByStatus', () => {
  it('filters TODO issues correctly', () => {
    const filtered = filterIssuesByStatus(mockIssues, KanbanStatus.TODO);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('Todo Issue');
    expect(filtered[0].status).toBe('TODO');
  });

  it('filters IN_PROGRESS issues correctly', () => {
    const filtered = filterIssuesByStatus(mockIssues, KanbanStatus.IN_PROGRESS);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('In Progress Issue');
    expect(filtered[0].status).toBe('IN_PROGRESS');
  });

  it('filters IN_REVIEW issues correctly', () => {
    const filtered = filterIssuesByStatus(mockIssues, KanbanStatus.IN_REVIEW);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('Review Issue');
    expect(filtered[0].status).toBe('IN_REVIEW');
  });

  it('filters DEPLOYED issues correctly', () => {
    const filtered = filterIssuesByStatus(mockIssues, KanbanStatus.DEPLOYED);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('Deployed Issue');
    expect(filtered[0].status).toBe('DEPLOYED');
  });

  it('returns empty array when no issues match status', () => {
    const emptyIssues: EnrichedIssue[] = [];
    const filtered = filterIssuesByStatus(emptyIssues, KanbanStatus.TODO);
    expect(filtered).toHaveLength(0);
  });

  it('handles empty issue array', () => {
    const filtered = filterIssuesByStatus([], KanbanStatus.TODO);
    expect(filtered).toEqual([]);
  });

  it('does not mutate original array', () => {
    const original = [...mockIssues];
    filterIssuesByStatus(mockIssues, KanbanStatus.TODO);
    expect(mockIssues).toEqual(original);
  });
});
