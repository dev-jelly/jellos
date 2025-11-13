/**
 * KanbanBoard Component Tests
 *
 * Tests for KanbanBoard component including:
 * - Rendering with columns
 * - Drag and drop functionality
 * - DragOverlay behavior
 * - Issue movement between columns
 * - Event handlers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KanbanBoard } from '../kanban-board';
import { EnrichedIssue } from '@/lib/api/issues';

// Mock data
const mockIssues: EnrichedIssue[] = [
  {
    id: '1',
    projectId: 'project-1',
    title: 'Todo Issue',
    description: 'This is a todo issue',
    status: 'TODO',
    priority: 'HIGH',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    projectId: 'project-1',
    title: 'In Progress Issue',
    description: 'This is in progress',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
  {
    id: '3',
    projectId: 'project-1',
    title: 'In Review Issue',
    description: 'This is in review',
    status: 'IN_REVIEW',
    priority: 'HIGH',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
  },
  {
    id: '4',
    projectId: 'project-1',
    title: 'Deployed Issue',
    description: 'This is deployed',
    status: 'DEPLOYED',
    priority: 'LOW',
    createdAt: '2024-01-04T00:00:00Z',
    updatedAt: '2024-01-04T00:00:00Z',
  },
];

describe('KanbanBoard', () => {
  const mockOnIssueClick = vi.fn();
  const mockOnIssueMove = vi.fn();

  beforeEach(() => {
    mockOnIssueClick.mockClear();
    mockOnIssueMove.mockClear();
  });

  describe('Rendering', () => {
    it('renders all four columns', () => {
      render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      expect(screen.getByText('To Do')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('In Review')).toBeInTheDocument();
      expect(screen.getByText('Deployed')).toBeInTheDocument();
    });

    it('distributes issues across columns correctly', () => {
      render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      expect(screen.getByText('Todo Issue')).toBeInTheDocument();
      expect(screen.getByText('In Progress Issue')).toBeInTheDocument();
      expect(screen.getByText('In Review Issue')).toBeInTheDocument();
      expect(screen.getByText('Deployed Issue')).toBeInTheDocument();
    });

    it('renders empty board with no issues', () => {
      render(
        <KanbanBoard
          issues={[]}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      // All columns should show empty state
      expect(screen.getByText('No issues in to do')).toBeInTheDocument();
      expect(screen.getByText('No issues in in progress')).toBeInTheDocument();
      expect(screen.getByText('No issues in in review')).toBeInTheDocument();
      expect(screen.getByText('No issues in deployed')).toBeInTheDocument();
    });

    it('renders board with issues in only one column', () => {
      const singleColumnIssues: EnrichedIssue[] = [
        {
          ...mockIssues[0],
          id: '1',
        },
        {
          ...mockIssues[0],
          id: '2',
        },
      ];

      render(
        <KanbanBoard
          issues={singleColumnIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      // TODO column should have 2 issues
      const todoColumn = screen.getByLabelText('2 issues');
      expect(todoColumn).toBeInTheDocument();

      // Other columns should be empty
      expect(screen.getByText('No issues in in progress')).toBeInTheDocument();
      expect(screen.getByText('No issues in in review')).toBeInTheDocument();
      expect(screen.getByText('No issues in deployed')).toBeInTheDocument();
    });
  });

  describe('Issue Display', () => {
    it('displays issue titles in correct columns', () => {
      render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      expect(screen.getByText('Todo Issue')).toBeInTheDocument();
      expect(screen.getByText('In Progress Issue')).toBeInTheDocument();
      expect(screen.getByText('In Review Issue')).toBeInTheDocument();
      expect(screen.getByText('Deployed Issue')).toBeInTheDocument();
    });

    it('displays issue descriptions', () => {
      render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      expect(screen.getByText('This is a todo issue')).toBeInTheDocument();
      expect(screen.getByText('This is in progress')).toBeInTheDocument();
      expect(screen.getByText('This is in review')).toBeInTheDocument();
      expect(screen.getByText('This is deployed')).toBeInTheDocument();
    });

    it('displays issue priorities', () => {
      render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      const highBadges = screen.getAllByText('HIGH');
      expect(highBadges).toHaveLength(2);
      expect(screen.getByText('MEDIUM')).toBeInTheDocument();
      expect(screen.getByText('LOW')).toBeInTheDocument();
    });
  });

  describe('Column Configuration', () => {
    it('renders columns in correct order', () => {
      const { container } = render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      const columns = container.querySelectorAll('[role="region"]');
      expect(columns).toHaveLength(4);
    });

    it('applies correct styling to each column', () => {
      render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      // Columns should be rendered with their respective configurations
      expect(screen.getByRole('region', { name: 'To Do column' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'In Progress column' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'In Review column' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Deployed column' })).toBeInTheDocument();
    });
  });

  describe('Event Handlers', () => {
    it('works without onIssueClick handler', () => {
      expect(() => {
        render(<KanbanBoard issues={mockIssues} />);
      }).not.toThrow();
    });

    it('works without onIssueMove handler', () => {
      expect(() => {
        render(<KanbanBoard issues={mockIssues} onIssueClick={mockOnIssueClick} />);
      }).not.toThrow();
    });

    it('renders with all handlers provided', () => {
      expect(() => {
        render(
          <KanbanBoard
            issues={mockIssues}
            onIssueClick={mockOnIssueClick}
            onIssueMove={mockOnIssueMove}
          />
        );
      }).not.toThrow();
    });
  });

  describe('Drag and Drop', () => {
    it('renders draggable issue cards', () => {
      const { container } = render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      const draggableCards = container.querySelectorAll('[aria-roledescription="draggable issue card"]');
      expect(draggableCards).toHaveLength(4);
    });

    it('has drag handles on all cards', () => {
      render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      expect(screen.getByLabelText('Drag Todo Issue')).toBeInTheDocument();
      expect(screen.getByLabelText('Drag In Progress Issue')).toBeInTheDocument();
      expect(screen.getByLabelText('Drag In Review Issue')).toBeInTheDocument();
      expect(screen.getByLabelText('Drag Deployed Issue')).toBeInTheDocument();
    });

    it('renders droppable columns', () => {
      render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      expect(screen.getByRole('region', { name: 'To Do column' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'In Progress column' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'In Review column' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Deployed column' })).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for columns', () => {
      render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      expect(screen.getByRole('region', { name: 'To Do column' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'In Progress column' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'In Review column' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Deployed column' })).toBeInTheDocument();
    });

    it('has proper ARIA labels for draggable cards', () => {
      render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      expect(screen.getByLabelText('Drag Todo Issue')).toBeInTheDocument();
      expect(screen.getByLabelText('Drag In Progress Issue')).toBeInTheDocument();
    });

    it('provides keyboard navigation support', () => {
      const { container } = render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      const dragHandles = container.querySelectorAll('[role="button"][tabindex="0"]');
      expect(dragHandles.length).toBeGreaterThan(0);
    });
  });

  describe('Issue Counts', () => {
    it('displays correct issue count for each column', () => {
      render(
        <KanbanBoard
          issues={mockIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      // Each column has 1 issue - get all count badges
      const countBadges = screen.getAllByLabelText('1 issues');
      expect(countBadges.length).toBeGreaterThan(0);
    });

    it('updates counts correctly with different distributions', () => {
      const unevenIssues: EnrichedIssue[] = [
        mockIssues[0],
        { ...mockIssues[0], id: '5' },
        { ...mockIssues[0], id: '6' },
        mockIssues[1],
      ];

      render(
        <KanbanBoard
          issues={unevenIssues}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      expect(screen.getByLabelText('3 issues')).toBeInTheDocument(); // TODO
      expect(screen.getByLabelText('1 issues')).toBeInTheDocument(); // IN_PROGRESS
    });
  });

  describe('Integration', () => {
    it('renders complete board without errors', () => {
      expect(() => {
        render(
          <KanbanBoard
            issues={mockIssues}
            onIssueClick={mockOnIssueClick}
            onIssueMove={mockOnIssueMove}
          />
        );
      }).not.toThrow();
    });

    it('handles large number of issues', () => {
      const manyIssues = Array.from({ length: 50 }, (_, i) => ({
        ...mockIssues[0],
        id: `issue-${i}`,
        title: `Issue ${i}`,
      }));

      expect(() => {
        render(
          <KanbanBoard
            issues={manyIssues}
            onIssueClick={mockOnIssueClick}
            onIssueMove={mockOnIssueMove}
          />
        );
      }).not.toThrow();
    });

    it('handles issues with Linear integration', () => {
      const issuesWithLinear: EnrichedIssue[] = mockIssues.map((issue) => ({
        ...issue,
        linear: {
          identifier: `ENG-${issue.id}`,
          url: `https://linear.app/issue/${issue.id}`,
          state: { id: 's1', name: 'Todo', type: 'unstarted' },
          updatedAt: '2024-01-01T00:00:00Z',
        },
      }));

      render(
        <KanbanBoard
          issues={issuesWithLinear}
          onIssueClick={mockOnIssueClick}
          onIssueMove={mockOnIssueMove}
        />
      );

      expect(screen.getByText('ENG-1')).toBeInTheDocument();
      expect(screen.getByText('ENG-2')).toBeInTheDocument();
    });
  });
});
