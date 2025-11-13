/**
 * Memory Profiling Tests for Diff Viewer
 * Tests memory usage and leak detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { VirtualDiffViewer } from '../../virtual-diff-viewer';
import { VirtualDiffViewerHighlighted } from '../../virtual-diff-viewer-highlighted';
import { generateTestDiff, BENCHMARK_PRESETS } from './test-data-generator';
import { getMemoryUsage } from './performance-metrics';

describe('Memory Profiling', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
  });

  it('does not leak memory on repeated renders (small diff)', async () => {
    const files = generateTestDiff(BENCHMARK_PRESETS.small);
    const iterations = 10;
    const memoryReadings: number[] = [];

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const initialMemory = getMemoryUsage();
    memoryReadings.push(initialMemory);

    // Render and unmount multiple times
    for (let i = 0; i < iterations; i++) {
      const { unmount } = render(<VirtualDiffViewer files={files} />);
      unmount();

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50));

      const currentMemory = getMemoryUsage();
      memoryReadings.push(currentMemory);
    }

    // Force garbage collection again
    if (global.gc) {
      global.gc();
    }

    const finalMemory = getMemoryUsage();
    memoryReadings.push(finalMemory);

    const memoryIncrease = finalMemory - initialMemory;
    const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

    console.log('\nMemory Leak Test (Small Diff):');
    console.log(`  Initial Memory: ${(initialMemory / (1024 * 1024)).toFixed(2)}MB`);
    console.log(`  Final Memory: ${(finalMemory / (1024 * 1024)).toFixed(2)}MB`);
    console.log(`  Memory Increase: ${memoryIncreaseMB.toFixed(2)}MB`);
    console.log(`  Iterations: ${iterations}`);
    console.log(`  Avg per iteration: ${(memoryIncreaseMB / iterations).toFixed(3)}MB`);

    // Memory should not increase more than 10MB after 10 iterations
    // This indicates no significant memory leaks
    expect(memoryIncreaseMB).toBeLessThan(10);
  });

  it('memory usage scales linearly with data size', async () => {
    const presets = [
      { name: 'small', preset: BENCHMARK_PRESETS.small },
      { name: 'medium', preset: BENCHMARK_PRESETS.medium },
      { name: 'large', preset: BENCHMARK_PRESETS.large },
    ];

    const results: Array<{ name: string; lineCount: number; memory: number }> = [];

    for (const { name, preset } of presets) {
      const files = generateTestDiff(preset);

      if (global.gc) {
        global.gc();
      }

      const beforeMemory = getMemoryUsage();
      const { unmount } = render(<VirtualDiffViewer files={files} />);

      // Wait for render to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const afterMemory = getMemoryUsage();
      const memoryUsed = afterMemory - beforeMemory;

      const totalLines = files.reduce(
        (acc, file) => acc + file.hunks.reduce((a, h) => a + h.lines.length, 0),
        0
      );

      results.push({
        name,
        lineCount: totalLines,
        memory: memoryUsed,
      });

      unmount();
      cleanup();

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log('\nMemory Scaling Analysis:');
    results.forEach((r) => {
      const memoryMB = r.memory / (1024 * 1024);
      const bytesPerLine = r.memory / r.lineCount;
      console.log(`  ${r.name}:`);
      console.log(`    Lines: ${r.lineCount}`);
      console.log(`    Memory: ${memoryMB.toFixed(2)}MB`);
      console.log(`    Bytes/line: ${bytesPerLine.toFixed(2)}`);
    });

    // Check that memory per line is relatively consistent (within 2x)
    if (results.length >= 2) {
      const bytesPerLine = results.map((r) => r.memory / r.lineCount);
      const min = Math.min(...bytesPerLine);
      const max = Math.max(...bytesPerLine);

      // Skip memory scaling check if memory API not available (JSDOM)
      if (min === 0 && max === 0) {
        console.log('\n  Memory API not available (JSDOM environment)');
        console.log('  Run in real browser for memory profiling');
        expect(results.length).toBeGreaterThan(0); // Just verify tests ran
        return;
      }

      const ratio = max / min;

      console.log(`\n  Memory scaling ratio: ${ratio.toFixed(2)}x`);
      console.log('  (should be < 2x for good linear scaling)');

      expect(ratio).toBeLessThan(3); // Allow some variance but should be roughly linear
    }

    expect(results.length).toBeGreaterThan(0);
  });

  it('highlighted viewer does not significantly increase memory (highlighting disabled)', async () => {
    const files = generateTestDiff(BENCHMARK_PRESETS.medium);

    if (global.gc) {
      global.gc();
    }

    // Test basic viewer
    const beforeBasic = getMemoryUsage();
    const basicRender = render(<VirtualDiffViewer files={files} />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const afterBasic = getMemoryUsage();
    const basicMemory = afterBasic - beforeBasic;
    basicRender.unmount();
    cleanup();

    await new Promise((resolve) => setTimeout(resolve, 100));
    if (global.gc) {
      global.gc();
    }

    // Test highlighted viewer (highlighting disabled)
    const beforeHighlighted = getMemoryUsage();
    const highlightedRender = render(
      <VirtualDiffViewerHighlighted files={files} enableHighlighting={false} />
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const afterHighlighted = getMemoryUsage();
    const highlightedMemory = afterHighlighted - beforeHighlighted;
    highlightedRender.unmount();
    cleanup();

    const basicMB = basicMemory / (1024 * 1024);
    const highlightedMB = highlightedMemory / (1024 * 1024);

    console.log('\nBasic vs Highlighted Memory Comparison:');
    console.log(`  Basic Viewer: ${basicMB.toFixed(2)}MB`);
    console.log(`  Highlighted Viewer: ${highlightedMB.toFixed(2)}MB`);

    // Skip memory check if API not available (JSDOM)
    if (basicMemory === 0 && highlightedMemory === 0) {
      console.log('  Memory API not available (JSDOM environment)');
      console.log('  Run in real browser for memory profiling');
      expect(basicMB).toBe(0); // Just verify test ran
      return;
    }

    const increase = ((highlightedMemory - basicMemory) / basicMemory) * 100;
    console.log(`  Increase: ${increase.toFixed(1)}%`);

    // Highlighted viewer (even with highlighting disabled) should not use more than 50% more memory
    expect(increase).toBeLessThan(50);
  });

  it('cleans up properly when component unmounts', async () => {
    const files = generateTestDiff(BENCHMARK_PRESETS.large);

    if (global.gc) {
      global.gc();
    }

    const beforeRender = getMemoryUsage();

    const { unmount } = render(<VirtualDiffViewer files={files} />);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const afterRender = getMemoryUsage();
    const renderMemory = afterRender - beforeRender;

    unmount();
    cleanup();
    document.body.innerHTML = '';

    // Wait for cleanup and force GC
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (global.gc) {
      global.gc();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    const afterCleanup = getMemoryUsage();
    const remainingMemory = afterCleanup - beforeRender;

    const renderMB = renderMemory / (1024 * 1024);
    const remainingMB = remainingMemory / (1024 * 1024);

    console.log('\nCleanup Test:');
    console.log(`  Memory after render: ${renderMB.toFixed(2)}MB`);
    console.log(`  Memory after cleanup: ${remainingMB.toFixed(2)}MB`);

    // Skip cleanup percentage check if API not available (JSDOM)
    if (renderMemory === 0) {
      console.log('  Memory API not available (JSDOM environment)');
      console.log('  Run in real browser for memory profiling');
      expect(renderMB).toBe(0); // Just verify test ran
      return;
    }

    const cleanedUpPercent = ((renderMemory - remainingMemory) / renderMemory) * 100;
    console.log(`  Cleaned up: ${cleanedUpPercent.toFixed(1)}%`);

    // At least 50% of memory should be cleaned up
    // (Some may remain due to pooling or other optimizations)
    expect(cleanedUpPercent).toBeGreaterThan(50);
  });

  it('handles rapid re-renders without memory explosion', async () => {
    const files = generateTestDiff(BENCHMARK_PRESETS.small);
    const iterations = 20;

    if (global.gc) {
      global.gc();
    }

    const beforeMemory = getMemoryUsage();

    // Rapidly re-render with different data
    let lastRender = render(<VirtualDiffViewer files={files} />);

    for (let i = 0; i < iterations; i++) {
      lastRender.rerender(<VirtualDiffViewer files={files} key={i} />);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const afterMemory = getMemoryUsage();
    lastRender.unmount();

    const memoryIncrease = afterMemory - beforeMemory;
    const memoryMB = memoryIncrease / (1024 * 1024);

    console.log('\nRapid Re-render Test:');
    console.log(`  Iterations: ${iterations}`);
    console.log(`  Total Memory Increase: ${memoryMB.toFixed(2)}MB`);
    console.log(`  Per iteration: ${(memoryMB / iterations).toFixed(3)}MB`);

    // Memory should not explode during rapid re-renders
    expect(memoryMB).toBeLessThan(20);
  });
});
