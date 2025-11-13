/**
 * Tests for useDiffViewMode hook
 */

import { renderHook, act } from '@testing-library/react';
import { useDiffViewMode } from '../use-diff-view-mode';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useDiffViewMode', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('initializes with default mode', () => {
    const { result } = renderHook(() => useDiffViewMode());
    expect(result.current.viewMode).toBe('split');
    expect(result.current.isSplit).toBe(true);
    expect(result.current.isUnified).toBe(false);
  });

  it('initializes with custom default mode', () => {
    const { result } = renderHook(() =>
      useDiffViewMode({ defaultMode: 'unified' })
    );
    expect(result.current.viewMode).toBe('unified');
    expect(result.current.isUnified).toBe(true);
    expect(result.current.isSplit).toBe(false);
  });

  it('loads mode from localStorage', () => {
    localStorageMock.setItem('diff-view-mode', 'unified');
    const { result } = renderHook(() => useDiffViewMode());
    expect(result.current.viewMode).toBe('unified');
  });

  it('sets view mode', () => {
    const { result } = renderHook(() => useDiffViewMode());

    act(() => {
      result.current.setViewMode('unified');
    });

    expect(result.current.viewMode).toBe('unified');
    expect(localStorageMock.getItem('diff-view-mode')).toBe('unified');
  });

  it('toggles view mode', () => {
    const { result } = renderHook(() => useDiffViewMode());

    expect(result.current.viewMode).toBe('split');

    act(() => {
      result.current.toggleViewMode();
    });

    expect(result.current.viewMode).toBe('unified');

    act(() => {
      result.current.toggleViewMode();
    });

    expect(result.current.viewMode).toBe('split');
  });

  it('persists mode to localStorage', () => {
    const { result } = renderHook(() => useDiffViewMode());

    act(() => {
      result.current.setViewMode('unified');
    });

    expect(localStorageMock.getItem('diff-view-mode')).toBe('unified');
  });

  it('uses custom storage key', () => {
    const customKey = 'my-custom-key';
    const { result } = renderHook(() =>
      useDiffViewMode({ storageKey: customKey })
    );

    act(() => {
      result.current.setViewMode('unified');
    });

    expect(localStorageMock.getItem(customKey)).toBe('unified');
  });

  it('handles keyboard shortcut', () => {
    const { result } = renderHook(() => useDiffViewMode());

    expect(result.current.viewMode).toBe('split');

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'm',
        metaKey: true,
      });
      window.dispatchEvent(event);
    });

    expect(result.current.viewMode).toBe('unified');
  });

  it('handles Ctrl+M shortcut', () => {
    const { result } = renderHook(() => useDiffViewMode());

    expect(result.current.viewMode).toBe('split');

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'm',
        ctrlKey: true,
      });
      window.dispatchEvent(event);
    });

    expect(result.current.viewMode).toBe('unified');
  });
});
