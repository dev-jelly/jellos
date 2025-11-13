/**
 * View Mode Toggle Component
 * Allows switching between split (side-by-side) and unified (single column) diff views
 */

'use client';

import { memo } from 'react';
import type { DiffViewMode } from '@/lib/hooks/use-diff-view-mode';

export interface DiffViewModeToggleProps {
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  className?: string;
  showLabel?: boolean;
  showKeyboardHint?: boolean;
}

/**
 * View Mode Toggle Component
 */
export const DiffViewModeToggle = memo(
  ({
    viewMode,
    onViewModeChange,
    className = '',
    showLabel = true,
    showKeyboardHint = false,
  }: DiffViewModeToggleProps) => {
    const isSplit = viewMode === 'split';

    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {showLabel && (
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            View:
          </span>
        )}

        {/* Toggle Button Group */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800">
          {/* Split View Button */}
          <button
            onClick={() => onViewModeChange('split')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              isSplit
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
            aria-label="Split view (side-by-side)"
            title="Split view - side-by-side comparison"
          >
            {/* Split View Icon */}
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4m0-16v16m0-16h6m-6 16h6m0-16h4a2 2 0 012 2v12a2 2 0 01-2 2h-4m-6-16v16"
              />
            </svg>
            <span>Split</span>
          </button>

          {/* Unified View Button */}
          <button
            onClick={() => onViewModeChange('unified')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              !isSplit
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
            aria-label="Unified view (single column)"
            title="Unified view - single column with inline changes"
          >
            {/* Unified View Icon */}
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
            <span>Unified</span>
          </button>
        </div>

        {/* Keyboard Shortcut Hint */}
        {showKeyboardHint && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            <kbd className="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 font-mono dark:border-gray-600 dark:bg-gray-700">
              {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
            </kbd>
            <kbd className="ml-0.5 rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 font-mono dark:border-gray-600 dark:bg-gray-700">
              M
            </kbd>
          </span>
        )}
      </div>
    );
  }
);

DiffViewModeToggle.displayName = 'DiffViewModeToggle';

/**
 * Compact View Mode Toggle (Icon Only)
 */
export const DiffViewModeToggleCompact = memo(
  ({ viewMode, onViewModeChange, className = '' }: DiffViewModeToggleProps) => {
    const isSplit = viewMode === 'split';

    return (
      <button
        onClick={() => onViewModeChange(isSplit ? 'unified' : 'split')}
        className={`flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 ${className}`}
        aria-label={`Switch to ${isSplit ? 'unified' : 'split'} view`}
        title={`Current: ${isSplit ? 'Split' : 'Unified'} view (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+M to toggle)`}
      >
        {isSplit ? (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4m0-16v16m0-16h6m-6 16h6m0-16h4a2 2 0 012 2v12a2 2 0 01-2 2h-4m-6-16v16"
              />
            </svg>
            <span>Split</span>
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
            <span>Unified</span>
          </>
        )}
      </button>
    );
  }
);

DiffViewModeToggleCompact.displayName = 'DiffViewModeToggleCompact';
