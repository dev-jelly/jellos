/**
 * Tests for DiffViewModeToggle component
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { DiffViewModeToggle, DiffViewModeToggleCompact } from '../diff-view-mode-toggle';

describe('DiffViewModeToggle', () => {
  it('renders split and unified buttons', () => {
    const mockOnChange = jest.fn();
    render(
      <DiffViewModeToggle viewMode="split" onViewModeChange={mockOnChange} />
    );

    expect(screen.getByText('Split')).toBeInTheDocument();
    expect(screen.getByText('Unified')).toBeInTheDocument();
  });

  it('highlights active mode', () => {
    const mockOnChange = jest.fn();
    const { rerender } = render(
      <DiffViewModeToggle viewMode="split" onViewModeChange={mockOnChange} />
    );

    const splitButton = screen.getByText('Split').closest('button');
    expect(splitButton).toHaveClass('bg-blue-600');

    rerender(
      <DiffViewModeToggle viewMode="unified" onViewModeChange={mockOnChange} />
    );

    const unifiedButton = screen.getByText('Unified').closest('button');
    expect(unifiedButton).toHaveClass('bg-blue-600');
  });

  it('calls onViewModeChange when buttons are clicked', () => {
    const mockOnChange = jest.fn();
    render(
      <DiffViewModeToggle viewMode="split" onViewModeChange={mockOnChange} />
    );

    const unifiedButton = screen.getByText('Unified').closest('button');
    fireEvent.click(unifiedButton!);

    expect(mockOnChange).toHaveBeenCalledWith('unified');
  });

  it('shows keyboard hint when enabled', () => {
    const mockOnChange = jest.fn();
    render(
      <DiffViewModeToggle
        viewMode="split"
        onViewModeChange={mockOnChange}
        showKeyboardHint
      />
    );

    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('hides keyboard hint by default', () => {
    const mockOnChange = jest.fn();
    render(
      <DiffViewModeToggle viewMode="split" onViewModeChange={mockOnChange} />
    );

    expect(screen.queryByText('M')).not.toBeInTheDocument();
  });
});

describe('DiffViewModeToggleCompact', () => {
  it('renders current mode', () => {
    const mockOnChange = jest.fn();
    const { rerender } = render(
      <DiffViewModeToggleCompact
        viewMode="split"
        onViewModeChange={mockOnChange}
      />
    );

    expect(screen.getByText('Split')).toBeInTheDocument();

    rerender(
      <DiffViewModeToggleCompact
        viewMode="unified"
        onViewModeChange={mockOnChange}
      />
    );

    expect(screen.getByText('Unified')).toBeInTheDocument();
  });

  it('toggles mode when clicked', () => {
    const mockOnChange = jest.fn();
    render(
      <DiffViewModeToggleCompact
        viewMode="split"
        onViewModeChange={mockOnChange}
      />
    );

    const button = screen.getByText('Split').closest('button');
    fireEvent.click(button!);

    expect(mockOnChange).toHaveBeenCalledWith('unified');
  });
});
