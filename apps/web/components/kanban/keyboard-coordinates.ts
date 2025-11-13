import { KeyboardCoordinateGetter } from '@dnd-kit/core';

/**
 * Custom keyboard coordinate getter for Kanban board
 *
 * Provides intelligent keyboard navigation for moving cards between columns
 * and within columns. Supports:
 * - Arrow up/down: Move within column
 * - Arrow left/right: Move between columns
 * - Home/End: Jump to first/last item
 *
 * This implements WCAG 2.1 keyboard accessibility guidelines for drag and drop.
 */

const MOVE_DISTANCE = 100; // Distance to move per arrow key press

/**
 * Custom keyboard coordinate getter for Kanban board navigation
 */
export const kanbanKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  args
) => {
  const { currentCoordinates, context } = args;
  // Use any to avoid complex type assertions with dnd-kit internal types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const droppableContainers = (context as any).droppableContainers as Array<{
    id: string;
    rect: {
      current: {
        top: number;
        left: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      } | null;
    };
  }>;

  // Helper to find current column containing the coordinate
  const findCurrentColumn = (x: number, y: number) => {
    for (const container of droppableContainers) {
      const rect = container.rect.current;
      if (!rect) continue;
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return container;
      }
    }
    return null;
  };

  // Helper to get adjacent column
  const getAdjacentColumn = (current: typeof droppableContainers[0] | null, direction: 'left' | 'right') => {
    if (!current?.rect.current) return null;

    const sorted = [...droppableContainers]
      .filter((c) => c.rect.current)
      .sort((a, b) => a.rect.current!.left - b.rect.current!.left);

    const currentIndex = sorted.findIndex((c) => c.id === current.id);
    if (currentIndex === -1) return null;

    return direction === 'left'
      ? (currentIndex > 0 ? sorted[currentIndex - 1] : null)
      : (currentIndex < sorted.length - 1 ? sorted[currentIndex + 1] : null);
  };

  // Get current position
  let { x, y } = currentCoordinates;

  switch (event.code) {
    case 'ArrowUp':
      y -= MOVE_DISTANCE;
      break;

    case 'ArrowDown':
      y += MOVE_DISTANCE;
      break;

    case 'ArrowLeft': {
      const current = findCurrentColumn(x, y);
      const prev = getAdjacentColumn(current, 'left');
      if (prev?.rect.current) {
        x = prev.rect.current.left + prev.rect.current.width / 2;
        y = Math.max(prev.rect.current.top + 100, Math.min(y, prev.rect.current.bottom - 100));
      }
      break;
    }

    case 'ArrowRight': {
      const current = findCurrentColumn(x, y);
      const next = getAdjacentColumn(current, 'right');
      if (next?.rect.current) {
        x = next.rect.current.left + next.rect.current.width / 2;
        y = Math.max(next.rect.current.top + 100, Math.min(y, next.rect.current.bottom - 100));
      }
      break;
    }

    case 'Home': {
      const current = findCurrentColumn(x, y);
      if (current?.rect.current) {
        y = current.rect.current.top + 100;
      }
      break;
    }

    case 'End': {
      const current = findCurrentColumn(x, y);
      if (current?.rect.current) {
        y = current.rect.current.bottom - 100;
      }
      break;
    }

    default:
      return undefined;
  }

  return { x, y };
};
