/**
 * Diff Components
 * Export all diff-related components
 */

export { VirtualDiffViewer } from './virtual-diff-viewer';
export type { VirtualDiffViewerProps } from './virtual-diff-viewer';
export { VirtualDiffViewerHighlighted } from './virtual-diff-viewer-highlighted';
export type { VirtualDiffViewerHighlightedProps } from './virtual-diff-viewer-highlighted';
export { DiffLineHighlighted, detectLanguageFromPath } from './diff-line-highlighted';
export type { DiffLineHighlightedProps } from './diff-line-highlighted';
export { DiffViewerDemo } from './diff-viewer-demo';
export { DiffViewerHighlightedDemo } from './diff-viewer-highlighted-demo';
export type { FileDiff, DiffHunk, DiffLine, ParsedDiff, DiffOptions } from '@/lib/types/diff';
