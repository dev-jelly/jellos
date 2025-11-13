/**
 * Virtual Diff Viewer with Syntax Highlighting
 * High-performance virtual scrolling diff viewer with Web Worker-based syntax highlighting
 * Target: 5000+ lines with <100ms initial paint
 */

'use client';

import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { GroupedVirtuoso } from 'react-virtuoso';
import type { FileDiff, DiffHunk, DiffLine } from '@/lib/types/diff';
import { useSyntaxHighlighter } from '@/lib/hooks/use-syntax-highlighter';
import { DiffLineHighlighted, detectLanguageFromPath } from './diff-line-highlighted';

export interface VirtualDiffViewerHighlightedProps {
  files: FileDiff[];
  className?: string;
  onFileClick?: (filePath: string) => void;
  enableHighlighting?: boolean; // Toggle syntax highlighting
  viewMode?: 'split' | 'unified'; // View mode: split (side-by-side) or unified (single column)
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
  language?: string;
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
    const language = detectLanguageFromPath(file.path);

    // File header
    items.push({
      type: 'file-header',
      fileIndex,
      file,
      id: `file-${fileIndex}`,
      language,
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
        language,
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
          language,
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
 * Split Diff Line Component - Side-by-side view
 */
const SplitDiffLine = memo(
  ({
    line,
    highlightedHtml,
  }: {
    line: DiffLine;
    language: string;
    highlightedHtml?: string;
  }) => {
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

    const isAddition = line.type === 'addition';
    const isDeletion = line.type === 'deletion';

    return (
      <div className="grid grid-cols-2 gap-px">
        {/* Left side (deletions and context) */}
        <div className={`flex font-mono text-xs leading-relaxed ${isDeletion ? getLineClass() : 'bg-gray-50 dark:bg-gray-900'}`}>
          <div className="w-12 flex-shrink-0 select-none px-2 text-right text-gray-500 dark:text-gray-500">
            {!isAddition && line.oldLineNumber}
          </div>
          <div className="flex-1 px-2">
            {!isAddition && (
              <>
                <span className="select-none text-gray-400">{isDeletion ? '-' : ' '}</span>
                {highlightedHtml ? (
                  <span
                    className="ml-1 highlighted-code"
                    dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                  />
                ) : (
                  <span className="ml-1">{line.content}</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right side (additions and context) */}
        <div className={`flex font-mono text-xs leading-relaxed ${isAddition ? getLineClass() : 'bg-gray-50 dark:bg-gray-900'}`}>
          <div className="w-12 flex-shrink-0 select-none px-2 text-right text-gray-500 dark:text-gray-500">
            {!isDeletion && line.newLineNumber}
          </div>
          <div className="flex-1 px-2">
            {!isDeletion && (
              <>
                <span className="select-none text-gray-400">{isAddition ? '+' : ' '}</span>
                {highlightedHtml ? (
                  <span
                    className="ml-1 highlighted-code"
                    dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                  />
                ) : (
                  <span className="ml-1">{line.content}</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
);
SplitDiffLine.displayName = 'SplitDiffLine';

/**
 * Item renderer for virtuoso with syntax highlighting
 */
const ItemRenderer = memo(
  ({
    item,
    onFileClick,
    highlightedLines,
    viewMode = 'unified',
  }: {
    item: VirtualItem;
    onFileClick?: (filePath: string) => void;
    highlightedLines: Map<string, string>;
    viewMode?: 'split' | 'unified';
  }) => {
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
        if (!item.line || !item.language) return null;

        if (viewMode === 'split') {
          return (
            <SplitDiffLine
              line={item.line}
              language={item.language}
              highlightedHtml={highlightedLines.get(item.id)}
            />
          );
        }

        return (
          <DiffLineHighlighted
            line={item.line}
            language={item.language}
            highlightedHtml={highlightedLines.get(item.id)}
          />
        );
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
 * Virtual Diff Viewer with Syntax Highlighting - Main Component
 * Uses GroupedVirtuoso for optimal performance with file grouping
 */
export const VirtualDiffViewerHighlighted = memo(
  ({
    files,
    className = '',
    onFileClick,
    enableHighlighting = true,
    viewMode = 'unified',
  }: VirtualDiffViewerHighlightedProps) => {
    const { highlightBatch, isReady, isSupported } = useSyntaxHighlighter({
      cacheSize: 2000,
    });

    const [highlightedLines, setHighlightedLines] = useState<Map<string, string>>(new Map());
    const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 50]);

    // Flatten diff structure into virtual items
    const { items, groupCounts } = useMemo(() => flattenDiffItems(files), [files]);

    // Pre-highlight visible lines
    const highlightVisibleLines = useCallback(
      async (startIndex: number, endIndex: number) => {
        if (!enableHighlighting || !isReady || !isSupported) {
          return;
        }

        // Get line items in visible range
        const visibleLineItems = items
          .slice(startIndex, endIndex)
          .filter((item) => item.type === 'line' && item.line && item.language);

        // Prepare batch request
        const batchItems = visibleLineItems
          .filter((item) => !highlightedLines.has(item.id))
          .map((item) => ({
            lineId: item.id,
            code: item.line!.content,
            language: item.language!,
          }));

        if (batchItems.length === 0) {
          return;
        }

        try {
          const results = await highlightBatch(batchItems);

          setHighlightedLines((prev) => {
            const next = new Map(prev);
            results.forEach((result, lineId) => {
              next.set(lineId, result.html);
            });
            return next;
          });
        } catch (error) {
          console.error('Highlighting error:', error);
        }
      },
      [items, highlightedLines, enableHighlighting, isReady, isSupported, highlightBatch]
    );

    // Handle visible range changes
    const handleRangeChanged = useCallback(
      (range: { startIndex: number; endIndex: number }) => {
        const newRange: [number, number] = [range.startIndex, range.endIndex];

        // Only highlight if range changed significantly
        if (
          Math.abs(newRange[0] - visibleRange[0]) > 10 ||
          Math.abs(newRange[1] - visibleRange[1]) > 10
        ) {
          setVisibleRange(newRange);

          // Pre-highlight with buffer
          const bufferSize = 50;
          highlightVisibleLines(
            Math.max(0, range.startIndex - bufferSize),
            Math.min(items.length, range.endIndex + bufferSize)
          );
        }
      },
      [visibleRange, items.length, highlightVisibleLines]
    );

    // Initial highlighting
    useEffect(() => {
      if (enableHighlighting && isReady && items.length > 0) {
        highlightVisibleLines(0, Math.min(items.length, 100));
      }
    }, [enableHighlighting, isReady, items.length, highlightVisibleLines]);

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
        {enableHighlighting && !isSupported && (
          <div className="bg-yellow-50 px-4 py-2 text-xs text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            Syntax highlighting is not supported in this environment
          </div>
        )}
        {/* View mode indicator */}
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
          {viewMode === 'split' ? 'Split View (Side-by-Side)' : 'Unified View'}
        </div>
        <GroupedVirtuoso
          groupCounts={groupCounts}
          groupContent={(index) => <GroupHeader groupIndex={index} files={files} />}
          itemContent={(index) => (
            <ItemRenderer
              item={items[index]}
              onFileClick={onFileClick}
              highlightedLines={highlightedLines}
              viewMode={viewMode}
            />
          )}
          rangeChanged={handleRangeChanged}
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
VirtualDiffViewerHighlighted.displayName = 'VirtualDiffViewerHighlighted';

/**
 * Export types for external use
 */
export type { FileDiff, DiffHunk, DiffLine };
