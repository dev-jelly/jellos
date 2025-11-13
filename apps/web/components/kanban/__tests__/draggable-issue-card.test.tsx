/**
 * DraggableIssueCard Component Tests
 *
 * Tests for DraggableIssueCard component including:
 * - Rendering with issue data
 * - Drag functionality
 * - Click handling
 * - Accessibility features
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { DraggableIssueCard } from '../draggable-issue-card';
import { EnrichedIssue } from '@/lib/api/issues';

// Mock data
const mockIssue: EnrichedIssue = {
  id: '1',
  projectId: 'project-1',
  title: 'Test Issue',
  description: 'This is a test issue',
  status: 'TODO',
  priority: 'HIGH',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const mockIssueWithLinear: EnrichedIssue = {
  ...mockIssue,
  linear: {
    identifier: 'ENG-123',
    url: 'https://linear.app/issue/123',
    state: { id: 's1', name: 'Todo', type: 'unstarted' },
    updatedAt: '2024-01-01T00:00:00Z',
  },
};

// Helper to render with DndContext and SortableContext
function renderWithDnd(ui: React.ReactElement, issueIds: string[] = ['1']) {
  return render(
    <DndContext>
      <SortableContext items={issueIds}>{ui}</SortableContext>
    </DndContext>
  );
}

describe('DraggableIssueCard', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    mockOnClick.mockClear();
  });

  describe('Rendering', () => {
    it('renders issue card with title', () => {
      renderWithDnd(<DraggableIssueCard issue={mockIssue} onClick={mockOnClick} />);

      expect(screen.getByText('Test Issue')).toBeInTheDocument();
    });

    it('renders issue card with description', () => {
      renderWithDnd(<DraggableIssueCard issue={mockIssue} onClick={mockOnClick} />);

      expect(screen.getByText('This is a test issue')).toBeInTheDocument();
    });

    it('renders issue card with status badge', () => {
      renderWithDnd(<DraggableIssueCard issue={mockIssue} onClick={mockOnClick} />);

      expect(screen.getByText('TODO')).toBeInTheDocument();
    });

    it('renders issue card with priority badge', () => {
      renderWithDnd(<DraggableIssueCard issue={mockIssue} onClick={mockOnClick} />);

      expect(screen.getByText('HIGH')).toBeInTheDocument();
    });

    it('renders Linear identifier when available', () => {
      renderWithDnd(<DraggableIssueCard issue={mockIssueWithLinear} onClick={mockOnClick} />);

      expect(screen.getByText('ENG-123')).toBeInTheDocument();
    });
  });

  describe('Drag Functionality', () => {
    it('renders with draggable attributes', () => {
      const { container } = renderWithDnd(
        <DraggableIssueCard issue={mockIssue} onClick={mockOnClick} />
      );

      const draggable = container.querySelector('[role="button"]');
      expect(draggable).toBeInTheDocument();

      // The wrapper div has the aria-roledescription
      const wrapper = container.querySelector('[aria-roledescription="draggable issue card"]');
      expect(wrapper).toBeInTheDocument();
    });

    it('has correct cursor styling for drag', () => {
      const { container } = renderWithDnd(
        <DraggableIssueCard issue={mockIssue} onClick={mockOnClick} />
      );

      const draggableHandle = container.querySelector('[role="button"]');
      expect(draggableHandle).toHaveClass('cursor-grab');
    });

    it('has tabIndex for keyboard accessibility', () => {
      const { container } = renderWithDnd(
        <DraggableIssueCard issue={mockIssue} onClick={mockOnClick} />
      );

      const draggable = container.querySelector('[role="button"]');
      expect(draggable).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA label for dragging', () => {
      renderWithDnd(<DraggableIssueCard issue={mockIssue} onClick={mockOnClick} />);

      const draggable = screen.getByLabelText('Move Test Issue');
      expect(draggable).toBeInTheDocument();
    });

    it('has proper role for button interaction', () => {
      renderWithDnd(<DraggableIssueCard issue={mockIssue} onClick={mockOnClick} />);

      const draggable = screen.getByRole('button');
      expect(draggable).toBeInTheDocument();
    });

    it('has aria-roledescription for screen readers', () => {
      const { container } = renderWithDnd(
        <DraggableIssueCard issue={mockIssue} onClick={mockOnClick} />
      );

      const draggable = container.querySelector('[aria-roledescription="draggable issue card"]');
      expect(draggable).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('renders within DndContext without errors', () => {
      expect(() => {
        renderWithDnd(<DraggableIssueCard issue={mockIssue} onClick={mockOnClick} />);
      }).not.toThrow();
    });

    it('renders with multiple issues in SortableContext', () => {
      const issue2: EnrichedIssue = {
        ...mockIssue,
        id: '2',
        title: 'Second Issue',
      };

      renderWithDnd(
        <>
          <DraggableIssueCard issue={mockIssue} onClick={mockOnClick} />
          <DraggableIssueCard issue={issue2} onClick={mockOnClick} />
        </>,
        ['1', '2']
      );

      expect(screen.getByText('Test Issue')).toBeInTheDocument();
      expect(screen.getByText('Second Issue')).toBeInTheDocument();
    });

    it('handles missing onClick callback gracefully', () => {
      expect(() => {
        renderWithDnd(<DraggableIssueCard issue={mockIssue} />);
      }).not.toThrow();
    });
  });

  describe('Issue Data Display', () => {
    it('displays issue without description', () => {
      const issueWithoutDesc: EnrichedIssue = {
        ...mockIssue,
        description: undefined,
      };

      renderWithDnd(<DraggableIssueCard issue={issueWithoutDesc} onClick={mockOnClick} />);

      expect(screen.getByText('Test Issue')).toBeInTheDocument();
      expect(screen.queryByText('This is a test issue')).not.toBeInTheDocument();
    });

    it('displays issue with all enrichment data', () => {
      const enrichedIssue: EnrichedIssue = {
        ...mockIssueWithLinear,
        enrichmentStatus: {
          hasLinearLink: true,
          linearSyncEnabled: true,
          linearDataFetched: true,
        },
      };

      renderWithDnd(<DraggableIssueCard issue={enrichedIssue} onClick={mockOnClick} />);

      expect(screen.getByText('Test Issue')).toBeInTheDocument();
      expect(screen.getByText('ENG-123')).toBeInTheDocument();
    });
  });
});
