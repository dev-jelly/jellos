/**
 * Tests for useSyntaxHighlighter hook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSyntaxHighlighter } from '../use-syntax-highlighter';

// Mock Web Worker
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((error: ErrorEvent) => void) | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  postMessage(data: any) {
    // Simulate async worker response
    setTimeout(() => {
      if (this.onmessage) {
        if (data.type === 'highlight') {
          this.onmessage(
            new MessageEvent('message', {
              data: {
                type: 'highlight',
                id: data.id,
                html: `<span class="token keyword">highlighted</span> ${data.code}`,
                tokens: [],
              },
            })
          );
        } else if (data.type === 'batch-highlight') {
          this.onmessage(
            new MessageEvent('message', {
              data: {
                type: 'batch-highlight',
                id: data.id,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                results: data.items.map((item: any) => ({
                  lineId: item.lineId,
                  html: `<span class="token keyword">highlighted</span> ${item.code}`,
                  tokens: [],
                })),
              },
            })
          );
        }
      }
    }, 10);
  }

  terminate() {
    // Mock terminate
  }
}

describe('useSyntaxHighlighter', () => {
  beforeEach(() => {
    // Mock Worker constructor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.Worker = MockWorker as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize and be ready', async () => {
    const { result } = renderHook(() => useSyntaxHighlighter());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.isSupported).toBe(true);
  });

  it('should highlight code', async () => {
    const { result } = renderHook(() => useSyntaxHighlighter());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    let highlightResult;
    await act(async () => {
      highlightResult = await result.current.highlight('const x = 1;', 'javascript');
    });

    expect(highlightResult).toBeDefined();
    expect(highlightResult?.html).toContain('highlighted');
  });

  it('should cache highlighted results', async () => {
    const { result } = renderHook(() => useSyntaxHighlighter({ cacheSize: 100 }));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Highlight once
    let firstResult;
    await act(async () => {
      firstResult = await result.current.highlight('const x = 1;', 'javascript');
    });

    // Highlight again (should be cached)
    let secondResult;
    await act(async () => {
      secondResult = await result.current.highlight('const x = 1;', 'javascript');
    });

    expect(firstResult).toEqual(secondResult);

    // Check cache stats
    const stats = result.current.getCacheStats();
    expect(stats.size).toBe(1);
  });

  it('should highlight batch', async () => {
    const { result } = renderHook(() => useSyntaxHighlighter());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    const items = [
      { lineId: 'line1', code: 'const x = 1;', language: 'javascript' },
      { lineId: 'line2', code: 'const y = 2;', language: 'javascript' },
    ];

    let batchResult;
    await act(async () => {
      batchResult = await result.current.highlightBatch(items);
    });

    expect(batchResult).toBeDefined();
    expect(batchResult?.size).toBe(2);
    expect(batchResult?.get('line1')?.html).toContain('highlighted');
    expect(batchResult?.get('line2')?.html).toContain('highlighted');
  });

  it('should clear cache', async () => {
    const { result } = renderHook(() => useSyntaxHighlighter());

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Highlight to populate cache
    await act(async () => {
      await result.current.highlight('const x = 1;', 'javascript');
    });

    let stats = result.current.getCacheStats();
    expect(stats.size).toBe(1);

    // Clear cache
    act(() => {
      result.current.clearCache();
    });

    stats = result.current.getCacheStats();
    expect(stats.size).toBe(0);
  });

  it('should respect cache size limit', async () => {
    const { result } = renderHook(() => useSyntaxHighlighter({ cacheSize: 2 }));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Add 3 items (should evict oldest)
    await act(async () => {
      await result.current.highlight('const x = 1;', 'javascript');
      await result.current.highlight('const y = 2;', 'javascript');
      await result.current.highlight('const z = 3;', 'javascript');
    });

    const stats = result.current.getCacheStats();
    expect(stats.size).toBeLessThanOrEqual(2);
  });
});
