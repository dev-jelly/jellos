/**
 * Performance Benchmark Suite Exports
 *
 * This module exports utilities for performance testing and benchmarking
 * of the Diff Viewer components.
 *
 * @example
 * ```typescript
 * import {
 *   generateTestDiff,
 *   BENCHMARK_PRESETS,
 *   measurePerformance,
 *   validatePerformance,
 * } from './performance';
 *
 * // Generate test data
 * const files = generateTestDiff(BENCHMARK_PRESETS.large);
 *
 * // Measure performance
 * const { result, metrics } = await measurePerformance('test', async () => {
 *   return render(<DiffViewer files={files} />);
 * });
 *
 * // Validate against thresholds
 * const validation = validatePerformance(metrics);
 * console.log('Passed:', validation.passed);
 * ```
 */

// Test data generation
export {
  generateTestDiff,
  BENCHMARK_PRESETS,
  calculateDiffStats,
  type GeneratorOptions,
} from './test-data-generator';

// Performance metrics
export {
  measurePerformance,
  validatePerformance,
  formatMetrics,
  calculateStatistics,
  percentile,
  getMemoryUsage,
  createPerformanceReport,
  PerformanceMeasurer,
  DEFAULT_THRESHOLDS,
  type PerformanceMetrics,
  type PerformanceBenchmark,
  type PerformanceThresholds,
} from './performance-metrics';
