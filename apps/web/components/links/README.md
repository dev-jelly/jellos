# External Links Component

## Overview

The `ExternalLinks` component displays external tool links (GitHub, Linear, Jenkins, etc.) for issues, PRs, and worktrees with clipboard copy and keyboard shortcut functionality.

## Features

### 1. Clipboard Copy
- Each link has a dedicated copy button
- Click the clipboard icon to copy the URL
- Visual feedback: icon changes to checkmark for 2 seconds
- Toast notification on success/failure
- Graceful error handling if clipboard API is unavailable

### 2. Keyboard Shortcuts
- **Cmd+Shift+O** (macOS) or **Ctrl+Shift+O** (Windows/Linux) to open links
- Opens the currently hovered link, or the first link if none is hovered
- Visual indication: focused link shows a blue ring
- Toast notification confirms which link was opened
- Prevents conflict with browser defaults by using preventDefault()

### 3. Visual Feedback
- **Hover state**: Link highlights and shows focus ring
- **Copy success**: Green checkmark icon + toast notification
- **Copy error**: Red error toast notification
- **Link opened**: Info toast showing which link was opened

## Usage

```tsx
import { ExternalLinks } from '@/components/links/external-links';

// For an issue
<ExternalLinks
  projectId="project-123"
  entityType="issue"
  entityData={{
    number: "42",
    linearId: "PROJ-123",
    branch: "feature/new-feature"
  }}
/>

// For a PR
<ExternalLinks
  projectId="project-123"
  entityType="pr"
  entityData={{
    number: "42",
    branch: "feature/new-feature"
  }}
/>

// For a worktree
<ExternalLinks
  projectId="project-123"
  entityType="worktree"
  entityData={{
    branch: "feature/new-feature",
    path: "src/components"
  }}
/>
```

## Keyboard Shortcuts

| Shortcut | Action | Notes |
|----------|--------|-------|
| Cmd+Shift+O (Mac) | Open focused link | Opens hovered link or first link |
| Ctrl+Shift+O (Win/Linux) | Open focused link | Opens hovered link or first link |

## Error Handling

### Clipboard Errors
- Catches `navigator.clipboard.writeText()` failures
- Shows user-friendly error toast
- Logs error to console for debugging
- Doesn't break component if clipboard is unavailable

### Browser Compatibility
- Uses modern Clipboard API (`navigator.clipboard`)
- Falls back gracefully on older browsers
- Toast notifications work across all modern browsers

## Configuration

Links are configured via `.jellos.yml` file in the project root and loaded through the API endpoint `/api/projects/:id/links`.

Example configuration:
```yaml
links:
  github:
    baseUrl: https://github.com/owner/repo
    issueTemplate: "{{baseUrl}}/issues/{{number}}"
    prTemplate: "{{baseUrl}}/pull/{{number}}"

  linear:
    baseUrl: https://linear.app/workspace
    issueTemplate: "{{baseUrl}}/issue/{{id}}"
```

## Testing

### Manual Testing Checklist
- [ ] Click copy button - URL copied to clipboard
- [ ] Click copy button - Toast notification appears
- [ ] Hover over link - Focus ring appears
- [ ] Press Cmd+Shift+O while hovering - Link opens
- [ ] Press Cmd+Shift+O without hovering - First link opens
- [ ] Copy fails (simulate) - Error toast appears
- [ ] Multiple links - All copy buttons work independently
- [ ] Multiple links - Keyboard shortcut opens correct link

### Browser Testing
- Chrome/Edge (Chromium)
- Firefox
- Safari
- Mobile browsers (touch events)

## Accessibility

- Copy buttons have `aria-label` attributes
- Keyboard shortcut doesn't interfere with screen readers
- Visual focus indicators for keyboard navigation
- Toast messages are announced to screen readers (via role="alert" if needed)

## Implementation Notes

### State Management
- `copiedUrl`: Tracks which URL was just copied (for icon change)
- `focusedLinkIndex`: Tracks which link is currently hovered (for keyboard shortcut)
- `toast`: Manages toast notification state and content

### Event Handlers
- `copyToClipboard`: Async clipboard write with error handling
- `handleKeyDown`: Global keyboard listener (only active when links exist)
- `handleLinkMouseEnter/Leave`: Updates focused link index

### Performance
- Keyboard listener only attached when links exist
- Automatic cleanup on component unmount
- Toast auto-dismisses after 2 seconds
