/**
 * Custom hook for managing diff view mode state
 * Supports split (side-by-side) and unified (single column) modes
 * Persists user preference in localStorage
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

export type DiffViewMode = 'split' | 'unified';

const STORAGE_KEY = 'diff-view-mode';
const DEFAULT_MODE: DiffViewMode = 'split';

interface UseDiffViewModeOptions {
  defaultMode?: DiffViewMode;
  storageKey?: string;
}

interface UseDiffViewModeReturn {
  viewMode: DiffViewMode;
  setViewMode: (mode: DiffViewMode) => void;
  toggleViewMode: () => void;
  isSplit: boolean;
  isUnified: boolean;
}

/**
 * Hook for managing diff view mode with localStorage persistence
 */
export function useDiffViewMode(
  options: UseDiffViewModeOptions = {}
): UseDiffViewModeReturn {
  const { defaultMode = DEFAULT_MODE, storageKey = STORAGE_KEY } = options;

  // Initialize from localStorage or default
  const [viewMode, setViewModeState] = useState<DiffViewMode>(() => {
    if (typeof window === 'undefined') {
      return defaultMode;
    }

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'split' || stored === 'unified') {
        return stored;
      }
    } catch (error) {
      console.warn('Failed to read diff view mode from localStorage:', error);
    }

    return defaultMode;
  });

  // Persist to localStorage when mode changes
  const setViewMode = useCallback(
    (mode: DiffViewMode) => {
      setViewModeState(mode);

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, mode);
        } catch (error) {
          console.warn('Failed to save diff view mode to localStorage:', error);
        }
      }
    },
    [storageKey]
  );

  // Toggle between split and unified
  const toggleViewMode = useCallback(() => {
    setViewMode(viewMode === 'split' ? 'unified' : 'split');
  }, [viewMode, setViewMode]);

  // Keyboard shortcut: Cmd+M / Ctrl+M
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'm') {
        event.preventDefault();
        toggleViewMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleViewMode]);

  return {
    viewMode,
    setViewMode,
    toggleViewMode,
    isSplit: viewMode === 'split',
    isUnified: viewMode === 'unified',
  };
}

/**
 * Responsive view mode hook - defaults to unified on mobile
 */
export function useResponsiveDiffViewMode(
  options: UseDiffViewModeOptions = {}
): UseDiffViewModeReturn {
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Override default mode for mobile
  const defaultMode = isMobile ? 'unified' : options.defaultMode;

  return useDiffViewMode({ ...options, defaultMode });
}
