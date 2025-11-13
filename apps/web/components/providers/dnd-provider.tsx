'use client';

import {
  DndContext,
  DndContextProps,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  PointerActivationConstraint,
} from '@dnd-kit/core';
import { ReactNode } from 'react';
import { kanbanKeyboardCoordinates } from '../kanban/keyboard-coordinates';

/**
 * Activation constraint to prevent accidental drags
 * Requires 5px movement before drag starts
 */
const ACTIVATION_CONSTRAINT: PointerActivationConstraint = {
  distance: 5,
};

/**
 * Keyboard sensor configuration for accessibility
 * Supports arrow keys and space/enter for activation
 * Uses custom coordinate getter for intelligent Kanban navigation
 */
const keyboardSensorOptions = {
  coordinateGetter: kanbanKeyboardCoordinates,
};

interface DndProviderProps {
  children: ReactNode;
  onDragStart?: DndContextProps['onDragStart'];
  onDragMove?: DndContextProps['onDragMove'];
  onDragOver?: DndContextProps['onDragOver'];
  onDragEnd?: DndContextProps['onDragEnd'];
  onDragCancel?: DndContextProps['onDragCancel'];
}

/**
 * DnD Provider Component
 *
 * Configures @dnd-kit/core DndContext with:
 * - Mouse sensor with activation constraint
 * - Touch sensor for mobile devices
 * - Keyboard sensor for accessibility (WCAG 2.1 compliant)
 *
 * @example
 * ```tsx
 * <DndProvider onDragEnd={handleDragEnd}>
 *   <YourDraggableContent />
 * </DndProvider>
 * ```
 */
export function DndProvider({
  children,
  onDragStart,
  onDragMove,
  onDragOver,
  onDragEnd,
  onDragCancel,
}: DndProviderProps) {
  // Configure sensors with activation constraints
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: ACTIVATION_CONSTRAINT,
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: ACTIVATION_CONSTRAINT,
  });

  const keyboardSensor = useSensor(KeyboardSensor, keyboardSensorOptions);

  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children}
    </DndContext>
  );
}
