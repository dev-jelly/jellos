/**
 * Highlighted Diff Line Component
 * Renders a diff line with syntax highlighting
 */

'use client';

import { memo, useEffect, useState } from 'react';
import type { DiffLine } from '@/lib/types/diff';

export interface DiffLineHighlightedProps {
  line: DiffLine;
  language: string;
  highlightedHtml?: string;
  onHighlight?: (lineId: string, html: string) => void;
}

/**
 * Detect language from file extension
 */
export function detectLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    bash: 'bash',
    py: 'python',
    go: 'go',
    rs: 'rust',
    sql: 'sql',
    dockerfile: 'docker',
    diff: 'diff',
  };

  return languageMap[ext] || 'javascript';
}

/**
 * Highlighted Diff Line Component
 */
export const DiffLineHighlighted = memo(
  ({ line, highlightedHtml }: DiffLineHighlightedProps) => {
    const [isHighlighted, setIsHighlighted] = useState(!!highlightedHtml);

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

    useEffect(() => {
      if (highlightedHtml) {
        setIsHighlighted(true);
      }
    }, [highlightedHtml]);

    return (
      <div className={`flex font-mono text-xs leading-relaxed ${getLineClass()}`}>
        {/* Line numbers */}
        <div className="flex w-24 flex-shrink-0 select-none px-2 text-gray-500 dark:text-gray-500">
          <span className="w-10 text-right">{line.oldLineNumber}</span>
          <span className="w-10 text-right">{line.newLineNumber}</span>
        </div>

        {/* Line content */}
        <div className="flex-1 px-2">
          <span className="select-none text-gray-400">{getLinePrefix()}</span>
          {isHighlighted && highlightedHtml ? (
            <span
              className="ml-1 highlighted-code"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          ) : (
            <span className="ml-1">{line.content}</span>
          )}
        </div>
      </div>
    );
  }
);

DiffLineHighlighted.displayName = 'DiffLineHighlighted';
