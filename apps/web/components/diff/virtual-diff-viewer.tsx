/**
 * Virtual Diff Viewer Component
 * High-performance virtual scrolling diff viewer using react-virtuoso
 * Target: 5000+ lines with <100ms initial paint
 */

'use client';

import { memo, useMemo } from 'react';
import { GroupedVirtuoso } from 'react-virtuoso';
import type { FileDiff, DiffHunk, DiffLine } from '@/lib/types/diff';

export interface VirtualDiffViewerProps {
  files: FileDiff[];
  className?: string;
  onFileClick?: (filePath: string) => void;
}

interface VirtualItem {
  type: 'file-header' | 'hunk-header' | 'line';
  fileIndex: number;
  file: FileDiff;
  hunkIndex?: number;
  hunk?: DiffHunk;
  lineIndex?: number;
  line?: DiffLine;
  id: string;
}

/**
 * Flatten diff structure into virtual items for virtuoso
 */
function flattenDiffItems(files: FileDiff[]): {
  items: VirtualItem[];
  groupCounts: number[];
} {
  const items: VirtualItem[] = [];
  const groupCounts: number[] = [];

  files.forEach((file, fileIndex) => {
    let groupItemCount = 0;

    // File header
    items.push({
      type: 'file-header',
      fileIndex,
      file,
      id: `file-${fileIndex}`,
    });
    groupItemCount++;

    // Hunks and lines
    file.hunks.forEach((hunk, hunkIndex) => {
      // Hunk header
      items.push({
        type: 'hunk-header',
        fileIndex,
        file,
        hunkIndex,
        hunk,
        id: `file-${fileIndex}-hunk-${hunkIndex}`,
      });
      groupItemCount++;

      // Lines
      hunk.lines.forEach((line, lineIndex) => {
        items.push({
          type: 'line',
          fileIndex,
          file,
          hunkIndex,
          hunk,
          lineIndex,
          line,
          id: `file-${fileIndex}-hunk-${hunkIndex}-line-${lineIndex}`,
        });
        groupItemCount++;
      });
    });

    groupCounts.push(groupItemCount);
  });

  return { items, groupCounts };
}

/**
 * File Header Component - Memoized for performance
 */
const FileHeader = memo(({ file, onClick }: { file: FileDiff; onClick?: () => void }) => {
  const getChangeTypeColor = () => {
    switch (file.changeType) {
      case 'added':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'deleted':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'modified':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'renamed':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'copied':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800"
      onClick={onClick}
    >
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${getChangeTypeColor()}`}
      >
        {file.changeType}
      </span>
      <code className="flex-1 font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
        {file.path}
      </code>
      {file.oldPath && file.oldPath !== file.path && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          from {file.oldPath}
        </span>
      )}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
        <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
      </div>
    </div>
  );
});
FileHeader.displayName = 'FileHeader';

/**
 * Hunk Header Component - Memoized for performance
 */
const HunkHeader = memo(({ hunk }: { hunk: DiffHunk }) => (
  <div className="bg-gray-100 px-4 py-1 font-mono text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-400">
    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@ {hunk.header}
  </div>
));
HunkHeader.displayName = 'HunkHeader';

/**
 * Diff Line Component - Memoized for performance
 */
const DiffLineComponent = memo(({ line }: { line: DiffLine }) => {
  const getLineClass = () => {
    switch (line.type) {
      case 'addition':
        return 'bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100';
      case 'deletion':
        return 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100';
      case 'context':
        return 'bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-200';
      default:
        return 'bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getLinePrefix = () => {
    switch (line.type) {
      case 'addition':
        return '+';
      case 'deletion':
        return '-';
      case 'context':
        return ' ';
      default:
        return ' ';
    }
  };

  return (
    <div className={`flex font-mono text-xs leading-relaxed ${getLineClass()}`}>
      <div className="flex w-24 flex-shrink-0 select-none px-2 text-gray-500 dark:text-gray-500">
        <span className="w-10 text-right">{line.oldLineNumber}</span>
        <span className="w-10 text-right">{line.newLineNumber}</span>
      </div>
      <div className="flex-1 px-2">
        <span className="select-none text-gray-400">{getLinePrefix()}</span>
        <span className="ml-1">{line.content}</span>
      </div>
    </div>
  );
});
DiffLineComponent.displayName = 'DiffLine';

/**
 * Item renderer for virtuoso
 */
const ItemRenderer = memo(
  ({ item, onFileClick }: { item: VirtualItem; onFileClick?: (filePath: string) => void }) => {
    switch (item.type) {
      case 'file-header':
        return (
          <FileHeader
            file={item.file}
            onClick={() => onFileClick?.(item.file.path)}
          />
        );
      case 'hunk-header':
        return item.hunk ? <HunkHeader hunk={item.hunk} /> : null;
      case 'line':
        return item.line ? <DiffLineComponent line={item.line} /> : null;
      default:
        return null;
    }
  }
);
ItemRenderer.displayName = 'ItemRenderer';

/**
 * Group header renderer for virtuoso (file grouping)
 */
const GroupHeader = memo(({ groupIndex, files }: { groupIndex: number; files: FileDiff[] }) => {
  const file = files[groupIndex];
  if (!file) return null;

  return (
    <div className="bg-gray-100 px-4 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-900 dark:text-gray-400">
      File {groupIndex + 1} of {files.length}
    </div>
  );
});
GroupHeader.displayName = 'GroupHeader';

/**
 * Virtual Diff Viewer - Main Component
 * Uses GroupedVirtuoso for optimal performance with file grouping
 */
export const VirtualDiffViewer = memo(
  ({ files, className = '', onFileClick }: VirtualDiffViewerProps) => {
    // Flatten diff structure into virtual items
    const { items, groupCounts } = useMemo(() => flattenDiffItems(files), [files]);

    // Empty state
    if (files.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">
          No diff data available
        </div>
      );
    }

    return (
      <div className={`h-full w-full ${className}`}>
        <GroupedVirtuoso
          groupCounts={groupCounts}
          groupContent={(index) => <GroupHeader groupIndex={index} files={files} />}
          itemContent={(index) => (
            <ItemRenderer item={items[index]} onFileClick={onFileClick} />
          )}
          overscan={200}
          increaseViewportBy={{ top: 400, bottom: 400 }}
          className="h-full w-full"
          style={{
            height: '100%',
            width: '100%',
          }}
        />
      </div>
    );
  }
);
VirtualDiffViewer.displayName = 'VirtualDiffViewer';

/**
 * Export types for external use
 */
export type { FileDiff, DiffHunk, DiffLine };
