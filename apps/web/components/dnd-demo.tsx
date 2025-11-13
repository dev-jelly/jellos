'use client';

import { useState } from 'react';
import { DndProvider } from './providers';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { DragEndEvent } from '@dnd-kit/core';

/**
 * Draggable Item Component
 */
function DraggableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing rounded-lg border-2 border-blue-500 bg-blue-50 p-4 hover:bg-blue-100 transition-colors"
      role="button"
      tabIndex={0}
      aria-roledescription="draggable item"
    >
      {children}
    </div>
  );
}

/**
 * Droppable Container Component
 */
function DroppableContainer({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] rounded-lg border-2 border-dashed p-4 transition-colors ${
        isOver ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50'
      }`}
      role="region"
      aria-label={`Drop zone ${id}`}
    >
      {children}
    </div>
  );
}

/**
 * DnD Demo Component
 *
 * Demonstrates basic drag and drop functionality with:
 * - Draggable items
 * - Droppable containers
 * - State management for item positions
 * - Accessibility features (keyboard support, ARIA labels)
 */
export function DndDemo() {
  const [items, setItems] = useState({
    container1: ['item-1', 'item-2'],
    container2: ['item-3'],
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find which container the item is coming from
    const fromContainer = Object.keys(items).find((key) =>
      items[key as keyof typeof items].includes(activeId)
    ) as keyof typeof items | undefined;

    // Determine target container
    const toContainer = overId.startsWith('container')
      ? (overId as keyof typeof items)
      : (Object.keys(items).find((key) =>
          items[key as keyof typeof items].includes(overId)
        ) as keyof typeof items);

    if (!fromContainer || !toContainer) return;

    // Update state
    setItems((prev) => {
      const newItems = { ...prev };

      // Remove from source container
      newItems[fromContainer] = newItems[fromContainer].filter((id) => id !== activeId);

      // Add to target container (if not already there)
      if (!newItems[toContainer].includes(activeId)) {
        newItems[toContainer] = [...newItems[toContainer], activeId];
      }

      return newItems;
    });
  };

  return (
    <DndProvider onDragEnd={handleDragEnd}>
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">DnD Demo</h1>
        <p className="text-gray-600 mb-8">
          Drag items between containers. Keyboard users: Tab to items, Space/Enter to grab,
          Arrow keys to move, Space/Enter to drop.
        </p>

        <div className="grid grid-cols-2 gap-8">
          <div>
            <h2 className="text-lg font-semibold mb-2">Container 1</h2>
            <DroppableContainer id="container1">
              <div className="space-y-4">
                {items.container1.map((id) => (
                  <DraggableItem key={id} id={id}>
                    <div className="font-medium">Item {id.split('-')[1]}</div>
                    <div className="text-sm text-gray-600">Drag me!</div>
                  </DraggableItem>
                ))}
                {items.container1.length === 0 && (
                  <div className="text-gray-400 text-center py-8">Drop items here</div>
                )}
              </div>
            </DroppableContainer>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Container 2</h2>
            <DroppableContainer id="container2">
              <div className="space-y-4">
                {items.container2.map((id) => (
                  <DraggableItem key={id} id={id}>
                    <div className="font-medium">Item {id.split('-')[1]}</div>
                    <div className="text-sm text-gray-600">Drag me!</div>
                  </DraggableItem>
                ))}
                {items.container2.length === 0 && (
                  <div className="text-gray-400 text-center py-8">Drop items here</div>
                )}
              </div>
            </DroppableContainer>
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
