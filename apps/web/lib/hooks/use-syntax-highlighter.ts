/**
 * useSyntaxHighlighter Hook
 * Manages Web Worker for syntax highlighting with caching
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  HighlightResponse,
  BatchHighlightResponse,
} from '../workers/syntax-highlighter.worker';

export interface HighlightOptions {
  cacheSize?: number; // Maximum cache entries (default: 1000)
  workerCount?: number; // Number of workers (default: 1)
}

export interface HighlightResult {
  html: string;
  tokens: unknown[];
}

interface CacheEntry {
  html: string;
  tokens: unknown[];
  timestamp: number;
}

/**
 * LRU Cache for highlighted results
 */
class HighlightCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): HighlightResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, { ...entry, timestamp: Date.now() });

    return {
      html: entry.html,
      tokens: entry.tokens,
    };
  }

  set(key: string, value: HighlightResult): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      html: value.html,
      tokens: value.tokens,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Generate cache key for code + language
 */
function getCacheKey(code: string, language: string): string {
  return `${language}:${code}`;
}

/**
 * Hook for syntax highlighting with Web Worker
 */
export function useSyntaxHighlighter(options: HighlightOptions = {}) {
  const { cacheSize = 1000 } = options;

  const workerRef = useRef<Worker | null>(null);
  const cacheRef = useRef<HighlightCache>(new HighlightCache(cacheSize));
  const pendingRequests = useRef<Map<string, (result: HighlightResult) => void>>(new Map());
  const [isReady, setIsReady] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  // Initialize worker
  useEffect(() => {
    // Check if Web Worker is supported
    if (typeof Worker === 'undefined') {
      console.warn('Web Workers not supported in this environment');
      setIsSupported(false);
      setIsReady(true);
      return;
    }

    // Capture ref value at effect time
    const requests = pendingRequests.current;

    try {
      // Create worker
      const worker = new Worker(
        new URL('../workers/syntax-highlighter.worker.ts', import.meta.url),
        { type: 'module' }
      );

      // Handle messages from worker
      worker.onmessage = (event: MessageEvent) => {
        const data = event.data;

        if (data.type === 'highlight') {
          const response = data as HighlightResponse;
          const callback = requests.get(response.id);

          if (callback) {
            const result = {
              html: response.html,
              tokens: response.tokens,
            };

            // Cache the result
            const request = requests.get(response.id);
            if (request) {
              cacheRef.current.set(response.id, result);
            }

            callback(result);
            requests.delete(response.id);
          }
        } else if (data.type === 'batch-highlight') {
          const response = data as BatchHighlightResponse;

          response.results.forEach((result) => {
            const callback = requests.get(result.lineId);
            if (callback) {
              const highlightResult = {
                html: result.html,
                tokens: result.tokens,
              };

              cacheRef.current.set(result.lineId, highlightResult);
              callback(highlightResult);
              requests.delete(result.lineId);
            }
          });
        }
      };

      worker.onerror = (error) => {
        console.error('Worker error:', error);
      };

      workerRef.current = worker;
      setIsReady(true);
    } catch (error) {
      console.error('Failed to create worker:', error);
      setIsSupported(false);
      setIsReady(true);
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      // Use captured ref value in cleanup
      requests.clear();
    };
  }, []);

  /**
   * Highlight a single code snippet
   */
  const highlight = useCallback(
    (code: string, language: string): Promise<HighlightResult> => {
      const cacheKey = getCacheKey(code, language);

      // Check cache first
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        return Promise.resolve(cached);
      }

      // Fallback for unsupported environments
      if (!isSupported || !workerRef.current) {
        return Promise.resolve({
          html: code,
          tokens: [],
        });
      }

      return new Promise((resolve) => {
        const id = cacheKey;

        pendingRequests.current.set(id, resolve);

        const request = {
          type: 'highlight',
          id,
          code,
          language,
        };

        workerRef.current!.postMessage(request);
      });
    },
    [isSupported]
  );

  /**
   * Highlight multiple code snippets in batch
   */
  const highlightBatch = useCallback(
    (
      items: Array<{ lineId: string; code: string; language: string }>
    ): Promise<Map<string, HighlightResult>> => {
      const results = new Map<string, HighlightResult>();
      const uncachedItems: typeof items = [];

      // Check cache for each item
      items.forEach((item) => {
        const cacheKey = getCacheKey(item.code, item.language);
        const cached = cacheRef.current.get(cacheKey);

        if (cached) {
          results.set(item.lineId, cached);
        } else {
          uncachedItems.push(item);
        }
      });

      // If all cached, return immediately
      if (uncachedItems.length === 0) {
        return Promise.resolve(results);
      }

      // Fallback for unsupported environments
      if (!isSupported || !workerRef.current) {
        uncachedItems.forEach((item) => {
          results.set(item.lineId, { html: item.code, tokens: [] });
        });
        return Promise.resolve(results);
      }

      return new Promise((resolve) => {
        const batchId = `batch-${Date.now()}`;
        let resolvedCount = 0;

        uncachedItems.forEach((item) => {
          pendingRequests.current.set(item.lineId, (result) => {
            results.set(item.lineId, result);
            resolvedCount++;

            if (resolvedCount === uncachedItems.length) {
              resolve(results);
            }
          });
        });

        const request = {
          type: 'batch-highlight',
          id: batchId,
          items: uncachedItems,
        };

        workerRef.current!.postMessage(request);
      });
    },
    [isSupported]
  );

  /**
   * Clear the cache
   */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  /**
   * Get cache statistics
   */
  const getCacheStats = useCallback(() => {
    return {
      size: cacheRef.current.size(),
      maxSize: cacheSize,
    };
  }, [cacheSize]);

  return {
    highlight,
    highlightBatch,
    clearCache,
    getCacheStats,
    isReady,
    isSupported,
  };
}
