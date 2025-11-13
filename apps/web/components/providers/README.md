# DnD Provider

A reusable drag-and-drop context provider built on top of `@dnd-kit/core` with built-in accessibility features and sensible defaults.

## Features

- **Multi-input Support**: Mouse, touch, and keyboard sensors configured
- **Activation Constraint**: 5px movement threshold to prevent accidental drags
- **Accessibility**: WCAG 2.1 compliant with full keyboard navigation support
- **Type-safe**: Full TypeScript support with proper types
- **Flexible**: Supports all DndContext event handlers

## Installation

The required packages are already installed:

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

## Usage

### Basic Example

```tsx
import { DndProvider } from '@/components/providers';
import { useDraggable, useDroppable } from '@dnd-kit/core';

function App() {
  const handleDragEnd = (event) => {
    const { active, over } = event;
    // Handle drag completion
  };

  return (
    <DndProvider onDragEnd={handleDragEnd}>
      {/* Your draggable/droppable components */}
    </DndProvider>
  );
}
```

### With All Event Handlers

```tsx
<DndProvider
  onDragStart={(event) => console.log('Drag started', event)}
  onDragMove={(event) => console.log('Dragging', event)}
  onDragOver={(event) => console.log('Over droppable', event)}
  onDragEnd={(event) => console.log('Drag ended', event)}
  onDragCancel={() => console.log('Drag cancelled')}
>
  {children}
</DndProvider>
```

## Accessibility Features

### Keyboard Navigation

- **Tab**: Navigate between draggable items
- **Space/Enter**: Activate drag mode
- **Arrow Keys**: Move the dragged item
- **Space/Enter**: Drop the item
- **Escape**: Cancel the drag operation

### ARIA Attributes

The provider works seamlessly with ARIA attributes on draggable/droppable components:

```tsx
<div
  role="button"
  tabIndex={0}
  aria-roledescription="draggable item"
  {...listeners}
  {...attributes}
>
  Draggable content
</div>
```

## Configuration

### Activation Constraint

The provider is configured with a 5px activation distance by default. This prevents accidental drags when clicking on items.

```typescript
const ACTIVATION_CONSTRAINT = {
  distance: 5,
};
```

### Sensors

Three sensors are configured:

1. **MouseSensor**: For desktop mouse interactions
2. **TouchSensor**: For mobile touch interactions
3. **KeyboardSensor**: For keyboard-only navigation (accessibility)

## Demo

Visit `/dnd-demo` to see a working example with:
- Two droppable containers
- Three draggable items
- Full keyboard support
- Visual feedback for drag states

## Testing

Tests are located in `__tests__/dnd-provider.test.tsx` and cover:
- Component rendering
- Context provision to draggable/droppable components
- Event handler configuration
- Multiple children support
- Sensor initialization

Run tests with:

```bash
pnpm test
```

## API Reference

### DndProvider Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Child components that may contain draggable/droppable elements |
| `onDragStart` | `(event: DragStartEvent) => void` | Called when drag starts |
| `onDragMove` | `(event: DragMoveEvent) => void` | Called during drag movement |
| `onDragOver` | `(event: DragOverEvent) => void` | Called when dragging over a droppable |
| `onDragEnd` | `(event: DragEndEvent) => void` | Called when drag ends (drop) |
| `onDragCancel` | `() => void` | Called when drag is cancelled |

## Best Practices

1. **Use semantic HTML**: Ensure draggable items use appropriate ARIA roles
2. **Provide visual feedback**: Show clear visual states for dragging, hovering, and dropping
3. **Handle edge cases**: Always check if `over` exists in `onDragEnd` before processing
4. **Optimize performance**: Use `useMemo` for complex calculations in drag handlers
5. **Test keyboard navigation**: Verify all drag operations work with keyboard only

## Related Documentation

- [@dnd-kit/core documentation](https://docs.dndkit.com/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Next.js App Router](https://nextjs.org/docs/app)
