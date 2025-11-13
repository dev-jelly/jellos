# Diff View Mode Toggle

## Overview

The diff view mode toggle allows users to switch between two view modes for diff visualization:

1. **Split View (Side-by-Side)**: Shows deletions on the left and additions on the right in parallel columns
2. **Unified View (Single Column)**: Shows changes inline with additions and deletions stacked vertically

## Features

### 1. View Mode Toggle Component

Two variants are available:

#### Standard Toggle (`DiffViewModeToggle`)
- Full-featured button group with icons and labels
- Optional label ("View:")
- Optional keyboard shortcut hint (⌘M / Ctrl+M)
- Clear visual indication of active mode

#### Compact Toggle (`DiffViewModeToggleCompact`)
- Space-saving single button design
- Shows current mode
- Includes tooltip with keyboard shortcut

### 2. Custom Hook (`useDiffViewMode`)

Provides state management with:
- **Persistent Storage**: Saves preference to localStorage
- **Keyboard Shortcut**: Cmd+M (Mac) or Ctrl+M (Windows/Linux) to toggle
- **Helper Properties**: `isSplit`, `isUnified` boolean flags
- **Toggle Function**: Single function to switch between modes

### 3. Responsive Hook (`useResponsiveDiffViewMode`)

Mobile-optimized variant that:
- Defaults to unified view on mobile devices (< 768px)
- Automatically switches to split view on larger screens
- Respects user preferences when stored

## Usage

### Basic Implementation

```tsx
import { VirtualDiffViewerHighlighted } from '@/components/diff/virtual-diff-viewer-highlighted';
import { DiffViewModeToggle } from '@/components/diff/diff-view-mode-toggle';
import { useDiffViewMode } from '@/lib/hooks/use-diff-view-mode';

function MyDiffViewer() {
  const { viewMode, setViewMode } = useDiffViewMode();

  return (
    <div>
      <DiffViewModeToggle
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showKeyboardHint
      />

      <VirtualDiffViewerHighlighted
        files={diffFiles}
        viewMode={viewMode}
        enableHighlighting
      />
    </div>
  );
}
```

### Compact Toggle

```tsx
import { DiffViewModeToggleCompact } from '@/components/diff/diff-view-mode-toggle';

function MyCompactHeader() {
  const { viewMode, setViewMode } = useDiffViewMode();

  return (
    <DiffViewModeToggleCompact
      viewMode={viewMode}
      onViewModeChange={setViewMode}
    />
  );
}
```

### Responsive Mode

```tsx
import { useResponsiveDiffViewMode } from '@/lib/hooks/use-diff-view-mode';

function MyResponsiveDiffViewer() {
  // Automatically uses unified on mobile
  const { viewMode, setViewMode } = useResponsiveDiffViewMode();

  return (
    <VirtualDiffViewerHighlighted
      files={diffFiles}
      viewMode={viewMode}
    />
  );
}
```

### Custom Storage Key

```tsx
const { viewMode, setViewMode } = useDiffViewMode({
  storageKey: 'my-custom-diff-mode',
  defaultMode: 'split'
});
```

## API Reference

### `useDiffViewMode(options?)`

**Options:**
- `defaultMode?: 'split' | 'unified'` - Initial mode (default: 'split')
- `storageKey?: string` - localStorage key (default: 'diff-view-mode')

**Returns:**
- `viewMode: 'split' | 'unified'` - Current view mode
- `setViewMode: (mode) => void` - Set view mode
- `toggleViewMode: () => void` - Toggle between modes
- `isSplit: boolean` - True if split mode is active
- `isUnified: boolean` - True if unified mode is active

### `DiffViewModeToggle`

**Props:**
- `viewMode: 'split' | 'unified'` - Current mode (required)
- `onViewModeChange: (mode) => void` - Change handler (required)
- `className?: string` - Additional CSS classes
- `showLabel?: boolean` - Show "View:" label (default: true)
- `showKeyboardHint?: boolean` - Show keyboard shortcut (default: false)

### `DiffViewModeToggleCompact`

**Props:**
- `viewMode: 'split' | 'unified'` - Current mode (required)
- `onViewModeChange: (mode) => void` - Change handler (required)
- `className?: string` - Additional CSS classes

### `VirtualDiffViewerHighlighted`

**New Prop:**
- `viewMode?: 'split' | 'unified'` - View mode (default: 'unified')

## Keyboard Shortcuts

- **⌘M** (Mac) or **Ctrl+M** (Windows/Linux): Toggle between split and unified views
- The keyboard shortcut is automatically enabled when using `useDiffViewMode` hook
- Shortcut hint can be displayed in the toggle component with `showKeyboardHint` prop

## Visual Behavior

### Split View (Side-by-Side)
- Two-column layout with 1px gap between columns
- Deletions shown in left column with red background
- Additions shown in right column with green background
- Context lines shown in both columns with neutral background
- Each side has its own line numbers (old on left, new on right)

### Unified View (Single Column)
- Single column showing all changes sequentially
- Deletions: Red background with '-' prefix
- Additions: Green background with '+' prefix
- Context: Neutral background with space prefix
- Dual line numbers (old and new) shown together

### Visual Indicator
- A header bar shows the current mode ("Split View (Side-by-Side)" or "Unified View")
- Active toggle button is highlighted with blue background
- Smooth CSS transitions between mode changes

## localStorage Persistence

User preferences are automatically persisted:
- **Key**: `diff-view-mode` (customizable)
- **Value**: `'split'` or `'unified'`
- **Scope**: Per-domain
- **Fallback**: Uses default mode if localStorage is unavailable

## Accessibility

- Toggle buttons include `aria-label` attributes
- Tooltips provide mode descriptions
- Keyboard navigation fully supported
- Focus states clearly visible
- Semantic HTML structure

## Browser Compatibility

- Modern browsers with localStorage support
- Falls back gracefully if localStorage is unavailable
- Keyboard shortcuts work in all major browsers
- Tested in Chrome, Firefox, Safari, Edge

## Performance Considerations

- View mode state is lightweight and doesn't affect rendering performance
- Mode transitions are smooth with CSS transitions (no layout shift)
- localStorage operations are optimized to prevent blocking
- Virtual scrolling performance is maintained in both modes

## Testing

Test files are available at:
- `components/diff/__tests__/diff-view-mode-toggle.test.tsx` - Component tests
- `lib/hooks/__tests__/use-diff-view-mode.test.ts` - Hook tests

Run tests:
```bash
npm test diff-view-mode
```

## Demo

Visit `/diff-demo` to see the view mode toggle in action with sample diff data.

## Examples

### Full-Featured Implementation

```tsx
import { VirtualDiffViewerHighlighted } from '@/components/diff/virtual-diff-viewer-highlighted';
import { DiffViewModeToggle } from '@/components/diff/diff-view-mode-toggle';
import { useDiffViewMode } from '@/lib/hooks/use-diff-view-mode';

export function FullDiffViewer({ files }: { files: FileDiff[] }) {
  const { viewMode, setViewMode, toggleViewMode } = useDiffViewMode();
  const [enableHighlighting, setEnableHighlighting] = useState(true);

  return (
    <div className="flex h-screen flex-col">
      {/* Header with controls */}
      <div className="flex items-center justify-between border-b p-4">
        <h1>Code Review</h1>

        <div className="flex gap-3">
          <DiffViewModeToggle
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            showKeyboardHint
          />

          <button onClick={() => setEnableHighlighting(!enableHighlighting)}>
            {enableHighlighting ? 'Highlighting: ON' : 'Highlighting: OFF'}
          </button>
        </div>
      </div>

      {/* Diff viewer */}
      <div className="flex-1 overflow-hidden">
        <VirtualDiffViewerHighlighted
          files={files}
          viewMode={viewMode}
          enableHighlighting={enableHighlighting}
        />
      </div>

      {/* Footer with stats */}
      <div className="border-t p-2 text-sm">
        Mode: {viewMode === 'split' ? 'Split' : 'Unified'} |
        Files: {files.length} |
        Press ⌘M to toggle view
      </div>
    </div>
  );
}
```

## Future Enhancements

Potential improvements for future iterations:
1. **Three-column view** for renamed files
2. **Word-level diffing** within lines
3. **Collapsed/expanded sections** for large diffs
4. **Custom color schemes** for diff highlighting
5. **Export view mode** preference via API
