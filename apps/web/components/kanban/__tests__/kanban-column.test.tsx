/**
 * KanbanColumn Component Tests
 *
 * Tests for KanbanColumn component including:
 * - Rendering with different statuses
 * - Empty state handling
 * - Issue filtering
 * - Droppable functionality
 * - Issue count display
 * - Accessibility features
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { KanbanColumn } from '../kanban-column';
import { KanbanStatus, KANBAN_COLUMNS } from '../types';
import { EnrichedIssue } from '@/lib/api/issues';

// Mock data
const mockIssues: EnrichedIssue[] = [
  {
    id: '1',
    projectId: 'project-1',
    title: 'Todo Issue 1',
    description: 'This is a todo issue',
    status: 'TODO',
    priority: 'HIGH',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    projectId: 'project-1',
    title: 'Todo Issue 2',
    description: 'Another todo issue',
    status: 'TODO',
    priority: 'MEDIUM',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
  {
    id: '3',
    projectId: 'project-1',
    title: 'In Progress Issue',
    description: 'This is in progress',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
  },
];

// Helper to render with DndContext
function renderWithDnd(ui: React.ReactElement) {
  return render(<DndContext>{ui}</DndContext>);
}

describe('KanbanColumn', () => {
  const mockOnIssueClick = vi.fn();

  beforeEach(() => {
    mockOnIssueClick.mockClear();
  });

  describe('Rendering', () => {
    it('renders column header with correct title', () => {
      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.TODO}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.TODO]}
          onIssueClick={mockOnIssueClick}
        />
      );

      expect(screen.getByText('To Do')).toBeInTheDocument();
    });

    it('displays correct issue count in header badge', () => {
      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.TODO}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.TODO]}
          onIssueClick={mockOnIssueClick}
        />
      );

      const badge = screen.getByLabelText('2 issues');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('2');
    });

    it('renders column with correct ARIA labels', () => {
      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.TODO}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.TODO]}
          onIssueClick={mockOnIssueClick}
        />
      );

      expect(screen.getByRole('region', { name: 'To Do column' })).toBeInTheDocument();
    });
  });

  describe('Issue Filtering', () => {
    it('only displays issues matching the column status', () => {
      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.TODO}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.TODO]}
          onIssueClick={mockOnIssueClick}
        />
      );

      // Should show 2 TODO issues
      expect(screen.getByText('Todo Issue 1')).toBeInTheDocument();
      expect(screen.getByText('Todo Issue 2')).toBeInTheDocument();
      // Should not show IN_PROGRESS issue
      expect(screen.queryByText('In Progress Issue')).not.toBeInTheDocument();
    });

    it('filters issues correctly for IN_PROGRESS column', () => {
      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.IN_PROGRESS}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.IN_PROGRESS]}
          onIssueClick={mockOnIssueClick}
        />
      );

      // Should show 1 IN_PROGRESS issue
      expect(screen.getByText('In Progress Issue')).toBeInTheDocument();
      // Should not show TODO issues
      expect(screen.queryByText('Todo Issue 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Todo Issue 2')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('displays empty state when no issues match column status', () => {
      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.DEPLOYED}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.DEPLOYED]}
          onIssueClick={mockOnIssueClick}
        />
      );

      expect(screen.getByText('No issues in deployed')).toBeInTheDocument();
      expect(screen.getByText('Drag issues here to update their status')).toBeInTheDocument();
    });

    it('displays empty state with correct ARIA label', () => {
      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.DEPLOYED}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.DEPLOYED]}
          onIssueClick={mockOnIssueClick}
        />
      );

      expect(
        screen.getByRole('status', { name: 'No issues in this column' })
      ).toBeInTheDocument();
    });

    it('shows zero in count badge when column is empty', () => {
      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.DEPLOYED}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.DEPLOYED]}
          onIssueClick={mockOnIssueClick}
        />
      );

      const badge = screen.getByLabelText('0 issues');
      expect(badge).toHaveTextContent('0');
    });
  });

  describe('Issue Display', () => {
    it('renders all issues with correct information', () => {
      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.TODO}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.TODO]}
          onIssueClick={mockOnIssueClick}
        />
      );

      // Check titles are rendered
      expect(screen.getByText('Todo Issue 1')).toBeInTheDocument();
      expect(screen.getByText('Todo Issue 2')).toBeInTheDocument();

      // Check descriptions are rendered
      expect(screen.getByText('This is a todo issue')).toBeInTheDocument();
      expect(screen.getByText('Another todo issue')).toBeInTheDocument();
    });

    it('displays issues with Linear integration data', () => {
      const issuesWithLinear: EnrichedIssue[] = [
        {
          ...mockIssues[0],
          linear: {
            identifier: 'ENG-123',
            url: 'https://linear.app/issue/123',
            state: { id: 's1', name: 'Todo', type: 'unstarted' },
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
      ];

      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.TODO}
          issues={issuesWithLinear}
          config={KANBAN_COLUMNS[KanbanStatus.TODO]}
          onIssueClick={mockOnIssueClick}
        />
      );

      expect(screen.getByText('ENG-123')).toBeInTheDocument();
    });
  });

  describe('Column Styling', () => {
    it('applies correct color classes for TODO column', () => {
      const { container } = renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.TODO}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.TODO]}
          onIssueClick={mockOnIssueClick}
        />
      );

      const header = container.querySelector('.bg-gray-50');
      expect(header).toBeInTheDocument();
    });

    it('applies correct color classes for IN_PROGRESS column', () => {
      const { container } = renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.IN_PROGRESS}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.IN_PROGRESS]}
          onIssueClick={mockOnIssueClick}
        />
      );

      const header = container.querySelector('.bg-blue-50');
      expect(header).toBeInTheDocument();
    });

    it('applies correct color classes for IN_REVIEW column', () => {
      const { container } = renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.IN_REVIEW}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.IN_REVIEW]}
          onIssueClick={mockOnIssueClick}
        />
      );

      const header = container.querySelector('.bg-yellow-50');
      expect(header).toBeInTheDocument();
    });

    it('applies correct color classes for DEPLOYED column', () => {
      const { container } = renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.DEPLOYED}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.DEPLOYED]}
          onIssueClick={mockOnIssueClick}
        />
      );

      const header = container.querySelector('.bg-green-50');
      expect(header).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for screen readers', () => {
      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.TODO}
          issues={mockIssues}
          config={KANBAN_COLUMNS[KanbanStatus.TODO]}
          onIssueClick={mockOnIssueClick}
        />
      );

      expect(screen.getByRole('region', { name: 'To Do column' })).toBeInTheDocument();
      expect(screen.getByLabelText('2 issues')).toBeInTheDocument();
    });

    it('provides proper role for empty state', () => {
      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.DEPLOYED}
          issues={[]}
          config={KANBAN_COLUMNS[KanbanStatus.DEPLOYED]}
          onIssueClick={mockOnIssueClick}
        />
      );

      expect(
        screen.getByRole('status', { name: 'No issues in this column' })
      ).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('renders within DndContext without errors', () => {
      expect(() => {
        renderWithDnd(
          <KanbanColumn
            status={KanbanStatus.TODO}
            issues={mockIssues}
            config={KANBAN_COLUMNS[KanbanStatus.TODO]}
            onIssueClick={mockOnIssueClick}
          />
        );
      }).not.toThrow();
    });

    it('handles empty issues array gracefully', () => {
      renderWithDnd(
        <KanbanColumn
          status={KanbanStatus.TODO}
          issues={[]}
          config={KANBAN_COLUMNS[KanbanStatus.TODO]}
          onIssueClick={mockOnIssueClick}
        />
      );

      expect(screen.getByText('No issues in to do')).toBeInTheDocument();
    });
  });
});
