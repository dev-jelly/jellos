/**
 * Performance Metrics Collection and Analysis
 * Utilities for measuring and reporting performance metrics
 */

export interface PerformanceMetrics {
  // Timing metrics (milliseconds)
  firstPaint: number;
  timeToInteractive: number;
  totalRenderTime: number;

  // Memory metrics (bytes)
  memoryUsed: number;
  peakMemory: number;

  // Render metrics
  componentMounts: number;
  componentUpdates: number;
  renderCount: number;

  // Data metrics
  itemsRendered: number;
  itemsTotal: number;

  // Custom metrics
  [key: string]: number;
}

export interface PerformanceBenchmark {
  name: string;
  metrics: PerformanceMetrics;
  timestamp: number;
  metadata: {
    fileCount: number;
    lineCount: number;
    hunksCount: number;
    viewMode?: string;
    highlightingEnabled?: boolean;
  };
}

export interface PerformanceThresholds {
  firstPaint: number; // Max acceptable first paint time
  timeToInteractive: number; // Max acceptable time to interactive
  totalRenderTime: number; // Max acceptable total render time
  memoryUsed: number; // Max acceptable memory usage
}

/**
 * Default performance thresholds based on target spec
 * Target: 100 files, 5000 lines in under 2 seconds
 */
export const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  firstPaint: 100, // 100ms for first paint
  timeToInteractive: 2000, // 2s for full interactivity
  totalRenderTime: 2000, // 2s total render time
  memoryUsed: 100 * 1024 * 1024, // 100MB memory limit
};

/**
 * Measure performance of a function execution
 */
export async function measurePerformance<T>(
  name: string,
  fn: () => Promise<T> | T,
  metadata?: Record<string, unknown>
): Promise<{ result: T; metrics: Partial<PerformanceMetrics> }> {
  const startTime = performance.now();
  const startMemory = getMemoryUsage();

  const result = await fn();

  const endTime = performance.now();
  const endMemory = getMemoryUsage();

  const metrics: Partial<PerformanceMetrics> = {
    totalRenderTime: endTime - startTime,
    memoryUsed: endMemory - startMemory,
    peakMemory: endMemory,
  };

  return { result, metrics };
}

/**
 * Get current memory usage (if available)
 */
export function getMemoryUsage(): number {
  if (typeof performance !== 'undefined' && (performance as any).memory) {
    return (performance as any).memory.usedJSHeapSize;
  }
  return 0;
}

/**
 * Create a performance measurement wrapper for React components
 */
export class PerformanceMeasurer {
  private startTime: number = 0;
  private marks: Map<string, number> = new Map();
  private renderCount: number = 0;
  private mountCount: number = 0;
  private updateCount: number = 0;

  constructor(private name: string) {}

  start(): void {
    this.startTime = performance.now();
    this.marks.clear();
  }

  mark(label: string): void {
    const time = performance.now();
    this.marks.set(label, time - this.startTime);
  }

  recordMount(): void {
    this.mountCount++;
  }

  recordUpdate(): void {
    this.updateCount++;
  }

  recordRender(): void {
    this.renderCount++;
  }

  getMetrics(): Partial<PerformanceMetrics> {
    const totalTime = performance.now() - this.startTime;
    const firstPaint = this.marks.get('firstPaint') || 0;
    const timeToInteractive = this.marks.get('interactive') || totalTime;

    return {
      firstPaint,
      timeToInteractive,
      totalRenderTime: totalTime,
      componentMounts: this.mountCount,
      componentUpdates: this.updateCount,
      renderCount: this.renderCount,
      memoryUsed: getMemoryUsage(),
    };
  }

  reset(): void {
    this.startTime = 0;
    this.marks.clear();
    this.renderCount = 0;
    this.mountCount = 0;
    this.updateCount = 0;
  }
}

/**
 * Compare performance metrics against thresholds
 */
export function validatePerformance(
  metrics: Partial<PerformanceMetrics>,
  thresholds: PerformanceThresholds = DEFAULT_THRESHOLDS
): {
  passed: boolean;
  failures: Array<{ metric: string; value: number; threshold: number }>;
} {
  const failures: Array<{ metric: string; value: number; threshold: number }> = [];

  if (metrics.firstPaint && metrics.firstPaint > thresholds.firstPaint) {
    failures.push({
      metric: 'firstPaint',
      value: metrics.firstPaint,
      threshold: thresholds.firstPaint,
    });
  }

  if (metrics.timeToInteractive && metrics.timeToInteractive > thresholds.timeToInteractive) {
    failures.push({
      metric: 'timeToInteractive',
      value: metrics.timeToInteractive,
      threshold: thresholds.timeToInteractive,
    });
  }

  if (metrics.totalRenderTime && metrics.totalRenderTime > thresholds.totalRenderTime) {
    failures.push({
      metric: 'totalRenderTime',
      value: metrics.totalRenderTime,
      threshold: thresholds.totalRenderTime,
    });
  }

  if (metrics.memoryUsed && metrics.memoryUsed > thresholds.memoryUsed) {
    failures.push({
      metric: 'memoryUsed',
      value: metrics.memoryUsed,
      threshold: thresholds.memoryUsed,
    });
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Format metrics for console output
 */
export function formatMetrics(metrics: Partial<PerformanceMetrics>): string {
  const lines: string[] = [];

  if (metrics.firstPaint !== undefined) {
    lines.push(`  First Paint: ${metrics.firstPaint.toFixed(2)}ms`);
  }
  if (metrics.timeToInteractive !== undefined) {
    lines.push(`  Time to Interactive: ${metrics.timeToInteractive.toFixed(2)}ms`);
  }
  if (metrics.totalRenderTime !== undefined) {
    lines.push(`  Total Render Time: ${metrics.totalRenderTime.toFixed(2)}ms`);
  }
  if (metrics.memoryUsed !== undefined) {
    const mb = metrics.memoryUsed / (1024 * 1024);
    lines.push(`  Memory Used: ${mb.toFixed(2)}MB`);
  }
  if (metrics.renderCount !== undefined) {
    lines.push(`  Render Count: ${metrics.renderCount}`);
  }
  if (metrics.componentMounts !== undefined) {
    lines.push(`  Component Mounts: ${metrics.componentMounts}`);
  }
  if (metrics.componentUpdates !== undefined) {
    lines.push(`  Component Updates: ${metrics.componentUpdates}`);
  }

  return lines.join('\n');
}

/**
 * Calculate percentile from sorted array
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= sorted.length) return sorted[sorted.length - 1];
  if (lower === upper) return sorted[lower];

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Calculate statistics from multiple benchmark runs
 */
export function calculateStatistics(values: number[]): {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stdDev: number;
} {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0, stdDev: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;

  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    stdDev,
  };
}

/**
 * Create a performance report from multiple benchmarks
 */
export function createPerformanceReport(benchmarks: PerformanceBenchmark[]): string {
  const lines: string[] = [];
  lines.push('\n=== Performance Benchmark Report ===\n');

  // Group by name
  const grouped = new Map<string, PerformanceBenchmark[]>();
  benchmarks.forEach((b) => {
    const existing = grouped.get(b.name) || [];
    existing.push(b);
    grouped.set(b.name, existing);
  });

  // Report each group
  grouped.forEach((runs, name) => {
    lines.push(`\n${name}:`);
    lines.push(`  Runs: ${runs.length}`);

    if (runs.length > 0) {
      const firstRun = runs[0];
      lines.push(`  Data: ${firstRun.metadata.fileCount} files, ${firstRun.metadata.lineCount} lines`);
    }

    const metrics = ['firstPaint', 'timeToInteractive', 'totalRenderTime', 'memoryUsed'] as const;

    metrics.forEach((metric) => {
      const values = runs
        .map((r) => r.metrics[metric])
        .filter((v): v is number => v !== undefined);

      if (values.length > 0) {
        const stats = calculateStatistics(values);
        const unit = metric === 'memoryUsed' ? 'MB' : 'ms';
        const divisor = metric === 'memoryUsed' ? 1024 * 1024 : 1;

        lines.push(`\n  ${metric}:`);
        lines.push(`    Mean: ${(stats.mean / divisor).toFixed(2)}${unit}`);
        lines.push(`    Median: ${(stats.median / divisor).toFixed(2)}${unit}`);
        lines.push(`    P95: ${(stats.p95 / divisor).toFixed(2)}${unit}`);
        lines.push(`    Min/Max: ${(stats.min / divisor).toFixed(2)}${unit} / ${(stats.max / divisor).toFixed(2)}${unit}`);
      }
    });
  });

  lines.push('\n');
  return lines.join('\n');
}
