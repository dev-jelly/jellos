/**
 * Diff Viewer Performance Benchmarks
 * Tests rendering performance of virtual diff viewer with various data sizes
 * Target: 100 files, 5000 lines loading in under 2 seconds
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { VirtualDiffViewer } from '../../virtual-diff-viewer';
import { VirtualDiffViewerHighlighted } from '../../virtual-diff-viewer-highlighted';
import {
  generateTestDiff,
  BENCHMARK_PRESETS,
  calculateDiffStats,
} from './test-data-generator';
import {
  measurePerformance,
  validatePerformance,
  formatMetrics,
  calculateStatistics,
  DEFAULT_THRESHOLDS,
  type PerformanceBenchmark,
} from './performance-metrics';

describe('Diff Viewer Performance Benchmarks', () => {
  const benchmarkResults: PerformanceBenchmark[] = [];

  beforeEach(() => {
    // Clear any previous render artifacts
    document.body.innerHTML = '';
  });

  describe('VirtualDiffViewer (without highlighting)', () => {
    it('renders small diff (5 files, 100 lines each) under threshold', async () => {
      const files = generateTestDiff(BENCHMARK_PRESETS.small);
      const stats = calculateDiffStats(files);

      const { metrics } = await measurePerformance('VirtualDiffViewer-small', async () => {
        const startTime = performance.now();
        const { container } = render(<VirtualDiffViewer files={files} />);

        // Wait for component to mount and measure first paint
        await waitFor(() => {
          const virtuosoScroller = container.querySelector('[data-virtuoso-scroller]');
          expect(virtuosoScroller).toBeTruthy();
        });

        const firstPaint = performance.now() - startTime;
        return { container, firstPaint };
      });

      const benchmark: PerformanceBenchmark = {
        name: 'VirtualDiffViewer-small',
        metrics: {
          ...metrics,
          firstPaint: metrics.firstPaint || 0,
          timeToInteractive: metrics.timeToInteractive || metrics.totalRenderTime || 0,
          totalRenderTime: metrics.totalRenderTime || 0,
          memoryUsed: metrics.memoryUsed || 0,
          peakMemory: metrics.peakMemory || 0,
          componentMounts: 0,
          componentUpdates: 0,
          renderCount: 0,
          itemsRendered: 0,
          itemsTotal: stats.totalLines,
        },
        timestamp: Date.now(),
        metadata: {
          fileCount: stats.fileCount,
          lineCount: stats.totalLines,
          hunksCount: stats.totalHunks,
          viewMode: 'unified',
          highlightingEnabled: false,
        },
      };
      benchmarkResults.push(benchmark);

      console.log('\nSmall Diff Benchmark (no highlighting):');
      console.log(formatMetrics(metrics));

      // Very lenient thresholds for small diffs
      const validation = validatePerformance(metrics, {
        firstPaint: 200,
        timeToInteractive: 500,
        totalRenderTime: 500,
        memoryUsed: 50 * 1024 * 1024,
      });

      expect(validation.passed).toBe(true);
    });

    it('renders medium diff (20 files, 250 lines each) under threshold', async () => {
      const files = generateTestDiff(BENCHMARK_PRESETS.medium);
      const stats = calculateDiffStats(files);

      const { metrics } = await measurePerformance('VirtualDiffViewer-medium', async () => {
        const startTime = performance.now();
        const { container } = render(<VirtualDiffViewer files={files} />);

        await waitFor(() => {
          const virtuosoScroller = container.querySelector('[data-virtuoso-scroller]');
          expect(virtuosoScroller).toBeTruthy();
        });

        const firstPaint = performance.now() - startTime;
        return { container, firstPaint };
      });

      const benchmark: PerformanceBenchmark = {
        name: 'VirtualDiffViewer-medium',
        metrics: {
          ...metrics,
          firstPaint: metrics.firstPaint || 0,
          timeToInteractive: metrics.timeToInteractive || metrics.totalRenderTime || 0,
          totalRenderTime: metrics.totalRenderTime || 0,
          memoryUsed: metrics.memoryUsed || 0,
          peakMemory: metrics.peakMemory || 0,
          componentMounts: 0,
          componentUpdates: 0,
          renderCount: 0,
          itemsRendered: 0,
          itemsTotal: stats.totalLines,
        },
        timestamp: Date.now(),
        metadata: {
          fileCount: stats.fileCount,
          lineCount: stats.totalLines,
          hunksCount: stats.totalHunks,
          viewMode: 'unified',
          highlightingEnabled: false,
        },
      };
      benchmarkResults.push(benchmark);

      console.log('\nMedium Diff Benchmark (no highlighting):');
      console.log(formatMetrics(metrics));

      const validation = validatePerformance(metrics, {
        firstPaint: 300,
        timeToInteractive: 1000,
        totalRenderTime: 1000,
        memoryUsed: 75 * 1024 * 1024,
      });

      expect(validation.passed).toBe(true);
    });

    it('renders large diff (50 files, 500 lines each) under threshold', async () => {
      const files = generateTestDiff(BENCHMARK_PRESETS.large);
      const stats = calculateDiffStats(files);

      const { metrics } = await measurePerformance('VirtualDiffViewer-large', async () => {
        const startTime = performance.now();
        const { container } = render(<VirtualDiffViewer files={files} />);

        await waitFor(
          () => {
            const virtuosoScroller = container.querySelector('[data-virtuoso-scroller]');
            expect(virtuosoScroller).toBeTruthy();
          },
          { timeout: 3000 }
        );

        const firstPaint = performance.now() - startTime;
        return { container, firstPaint };
      });

      const benchmark: PerformanceBenchmark = {
        name: 'VirtualDiffViewer-large',
        metrics: {
          ...metrics,
          firstPaint: metrics.firstPaint || 0,
          timeToInteractive: metrics.timeToInteractive || metrics.totalRenderTime || 0,
          totalRenderTime: metrics.totalRenderTime || 0,
          memoryUsed: metrics.memoryUsed || 0,
          peakMemory: metrics.peakMemory || 0,
          componentMounts: 0,
          componentUpdates: 0,
          renderCount: 0,
          itemsRendered: 0,
          itemsTotal: stats.totalLines,
        },
        timestamp: Date.now(),
        metadata: {
          fileCount: stats.fileCount,
          lineCount: stats.totalLines,
          hunksCount: stats.totalHunks,
          viewMode: 'unified',
          highlightingEnabled: false,
        },
      };
      benchmarkResults.push(benchmark);

      console.log('\nLarge Diff Benchmark (no highlighting):');
      console.log(formatMetrics(metrics));

      const validation = validatePerformance(metrics, {
        firstPaint: 500,
        timeToInteractive: 1500,
        totalRenderTime: 1500,
        memoryUsed: 100 * 1024 * 1024,
      });

      expect(validation.passed).toBe(true);
    });

    it('meets target spec: 100 files with 5000 lines in under 2 seconds', async () => {
      const files = generateTestDiff(BENCHMARK_PRESETS.target);
      const stats = calculateDiffStats(files);

      console.log('\n=== TARGET SPEC BENCHMARK ===');
      console.log(`Files: ${stats.fileCount}`);
      console.log(`Total Lines: ${stats.totalLines}`);
      console.log(`Total Hunks: ${stats.totalHunks}`);
      console.log(`Target: < 2000ms\n`);

      const { metrics } = await measurePerformance('VirtualDiffViewer-target', async () => {
        const startTime = performance.now();
        const { container } = render(<VirtualDiffViewer files={files} />);

        await waitFor(
          () => {
            const virtuosoScroller = container.querySelector('[data-virtuoso-scroller]');
            expect(virtuosoScroller).toBeTruthy();
          },
          { timeout: 10000 }
        );

        const firstPaint = performance.now() - startTime;
        return { container, firstPaint };
      });

      const benchmark: PerformanceBenchmark = {
        name: 'VirtualDiffViewer-target',
        metrics: {
          ...metrics,
          firstPaint: metrics.firstPaint || 0,
          timeToInteractive: metrics.timeToInteractive || metrics.totalRenderTime || 0,
          totalRenderTime: metrics.totalRenderTime || 0,
          memoryUsed: metrics.memoryUsed || 0,
          peakMemory: metrics.peakMemory || 0,
          componentMounts: 0,
          componentUpdates: 0,
          renderCount: 0,
          itemsRendered: 0,
          itemsTotal: stats.totalLines,
        },
        timestamp: Date.now(),
        metadata: {
          fileCount: stats.fileCount,
          lineCount: stats.totalLines,
          hunksCount: stats.totalHunks,
          viewMode: 'unified',
          highlightingEnabled: false,
        },
      };
      benchmarkResults.push(benchmark);

      console.log('Target Spec Benchmark Results:');
      console.log(formatMetrics(metrics));

      const validation = validatePerformance(metrics, DEFAULT_THRESHOLDS);

      if (!validation.passed) {
        console.error('\nPerformance threshold failures:');
        validation.failures.forEach((f) => {
          console.error(
            `  ${f.metric}: ${f.value.toFixed(2)} > ${f.threshold.toFixed(2)} (${((f.value / f.threshold - 1) * 100).toFixed(1)}% over)`
          );
        });
      }

      expect(validation.passed).toBe(true);
    });
  });

  describe('VirtualDiffViewerHighlighted (with syntax highlighting)', () => {
    it('renders medium diff with highlighting disabled', async () => {
      const files = generateTestDiff(BENCHMARK_PRESETS.medium);
      const stats = calculateDiffStats(files);

      const { metrics } = await measurePerformance(
        'VirtualDiffViewerHighlighted-medium-no-highlight',
        async () => {
          const startTime = performance.now();
          const { container } = render(
            <VirtualDiffViewerHighlighted files={files} enableHighlighting={false} />
          );

          await waitFor(() => {
            const virtuosoScroller = container.querySelector('[data-virtuoso-scroller]');
            expect(virtuosoScroller).toBeTruthy();
          });

          const firstPaint = performance.now() - startTime;
          return { container, firstPaint };
        }
      );

      const benchmark: PerformanceBenchmark = {
        name: 'VirtualDiffViewerHighlighted-medium-no-highlight',
        metrics: {
          ...metrics,
          firstPaint: metrics.firstPaint || 0,
          timeToInteractive: metrics.timeToInteractive || metrics.totalRenderTime || 0,
          totalRenderTime: metrics.totalRenderTime || 0,
          memoryUsed: metrics.memoryUsed || 0,
          peakMemory: metrics.peakMemory || 0,
          componentMounts: 0,
          componentUpdates: 0,
          renderCount: 0,
          itemsRendered: 0,
          itemsTotal: stats.totalLines,
        },
        timestamp: Date.now(),
        metadata: {
          fileCount: stats.fileCount,
          lineCount: stats.totalLines,
          hunksCount: stats.totalHunks,
          viewMode: 'unified',
          highlightingEnabled: false,
        },
      };
      benchmarkResults.push(benchmark);

      console.log('\nMedium Diff with Highlighting Disabled:');
      console.log(formatMetrics(metrics));

      const validation = validatePerformance(metrics, {
        firstPaint: 300,
        timeToInteractive: 1000,
        totalRenderTime: 1000,
        memoryUsed: 75 * 1024 * 1024,
      });

      expect(validation.passed).toBe(true);
    });

    it('renders small diff in split view mode', async () => {
      const files = generateTestDiff(BENCHMARK_PRESETS.small);
      const stats = calculateDiffStats(files);

      const { metrics } = await measurePerformance(
        'VirtualDiffViewerHighlighted-small-split',
        async () => {
          const startTime = performance.now();
          const { container } = render(
            <VirtualDiffViewerHighlighted
              files={files}
              viewMode="split"
              enableHighlighting={false}
            />
          );

          await waitFor(() => {
            const virtuosoScroller = container.querySelector('[data-virtuoso-scroller]');
            expect(virtuosoScroller).toBeTruthy();
          });

          const firstPaint = performance.now() - startTime;
          return { container, firstPaint };
        }
      );

      const benchmark: PerformanceBenchmark = {
        name: 'VirtualDiffViewerHighlighted-small-split',
        metrics: {
          ...metrics,
          firstPaint: metrics.firstPaint || 0,
          timeToInteractive: metrics.timeToInteractive || metrics.totalRenderTime || 0,
          totalRenderTime: metrics.totalRenderTime || 0,
          memoryUsed: metrics.memoryUsed || 0,
          peakMemory: metrics.peakMemory || 0,
          componentMounts: 0,
          componentUpdates: 0,
          renderCount: 0,
          itemsRendered: 0,
          itemsTotal: stats.totalLines,
        },
        timestamp: Date.now(),
        metadata: {
          fileCount: stats.fileCount,
          lineCount: stats.totalLines,
          hunksCount: stats.totalHunks,
          viewMode: 'split',
          highlightingEnabled: false,
        },
      };
      benchmarkResults.push(benchmark);

      console.log('\nSmall Diff Split View:');
      console.log(formatMetrics(metrics));

      // Split view might be slightly slower due to double rendering
      const validation = validatePerformance(metrics, {
        firstPaint: 250,
        timeToInteractive: 600,
        totalRenderTime: 600,
        memoryUsed: 60 * 1024 * 1024,
      });

      expect(validation.passed).toBe(true);
    });
  });

  describe('Performance Statistics', () => {
    it('generates performance report from all benchmarks', () => {
      if (benchmarkResults.length === 0) {
        console.log('\nNo benchmark results to analyze (tests may have been skipped)');
        return;
      }

      console.log('\n=== PERFORMANCE BENCHMARK SUMMARY ===\n');

      // Group by scenario
      const scenarios = new Map<string, number[]>();
      benchmarkResults.forEach((b) => {
        const existing = scenarios.get(b.name) || [];
        existing.push(b.metrics.totalRenderTime);
        scenarios.set(b.name, existing);
      });

      scenarios.forEach((times, name) => {
        const stats = calculateStatistics(times);
        console.log(`${name}:`);
        console.log(`  Mean: ${stats.mean.toFixed(2)}ms`);
        console.log(`  Median: ${stats.median.toFixed(2)}ms`);
        console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
        console.log(`  Min/Max: ${stats.min.toFixed(2)}ms / ${stats.max.toFixed(2)}ms`);
        console.log('');
      });

      // Calculate overall statistics
      const allTimes = benchmarkResults.map((b) => b.metrics.totalRenderTime);
      const overallStats = calculateStatistics(allTimes);

      console.log('Overall Statistics:');
      console.log(`  Mean Render Time: ${overallStats.mean.toFixed(2)}ms`);
      console.log(`  Median Render Time: ${overallStats.median.toFixed(2)}ms`);
      console.log(`  P95 Render Time: ${overallStats.p95.toFixed(2)}ms`);
      console.log('');

      expect(benchmarkResults.length).toBeGreaterThan(0);
    });
  });
});
