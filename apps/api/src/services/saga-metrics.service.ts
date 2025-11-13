/**
 * Saga Metrics Service
 * Task 12.8: State Machine Monitoring and Metrics
 *
 * Collects and tracks metrics for saga execution:
 * - Execution duration
 * - Success/failure rates
 * - Step-level performance
 * - Circuit breaker states
 */

import { EventEmitter } from 'events';

export interface SagaMetrics {
  sagaId: string;
  sagaName: string;
  status: 'started' | 'completed' | 'failed' | 'compensated';
  startedAt: number;
  completedAt?: number;
  duration?: number;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  compensatedSteps: number;
  stepMetrics: StepMetric[];
  error?: string;
}

export interface StepMetric {
  stepName: string;
  status: 'started' | 'completed' | 'failed' | 'compensated';
  startedAt: number;
  completedAt?: number;
  duration?: number;
  retryCount: number;
  error?: string;
}

export interface AggregatedMetrics {
  totalSagas: number;
  completedSagas: number;
  failedSagas: number;
  compensatedSagas: number;
  averageDuration: number;
  successRate: number;
  failureRate: number;
  stepSuccessRate: number;
  averageStepsPerSaga: number;
  averageRetries: number;
}

/**
 * Saga Metrics Collector
 */
export class SagaMetricsService extends EventEmitter {
  private metricsStore: Map<string, SagaMetrics> = new Map();
  private stepTimers: Map<string, number> = new Map();
  private maxStoredMetrics: number;

  constructor(maxStoredMetrics: number = 1000) {
    super();
    this.maxStoredMetrics = maxStoredMetrics;
  }

  /**
   * Record saga start
   */
  onSagaStarted(sagaId: string, sagaName: string, totalSteps: number): void {
    const metrics: SagaMetrics = {
      sagaId,
      sagaName,
      status: 'started',
      startedAt: Date.now(),
      totalSteps,
      completedSteps: 0,
      failedSteps: 0,
      compensatedSteps: 0,
      stepMetrics: [],
    };

    this.metricsStore.set(sagaId, metrics);
    this.enforceMaxSize();
    this.emit('saga.started', metrics);
  }

  /**
   * Record saga completion
   */
  onSagaCompleted(sagaId: string): void {
    const metrics = this.metricsStore.get(sagaId);
    if (!metrics) return;

    metrics.status = 'completed';
    metrics.completedAt = Date.now();
    metrics.duration = metrics.completedAt - metrics.startedAt;

    this.emit('saga.completed', metrics);
  }

  /**
   * Record saga failure
   */
  onSagaFailed(sagaId: string, error: Error): void {
    const metrics = this.metricsStore.get(sagaId);
    if (!metrics) return;

    metrics.status = 'failed';
    metrics.completedAt = Date.now();
    metrics.duration = metrics.completedAt - metrics.startedAt;
    metrics.error = error.message;

    this.emit('saga.failed', metrics);
  }

  /**
   * Record saga compensation
   */
  onSagaCompensated(sagaId: string): void {
    const metrics = this.metricsStore.get(sagaId);
    if (!metrics) return;

    metrics.status = 'compensated';
    metrics.completedAt = Date.now();
    metrics.duration = metrics.completedAt - metrics.startedAt;

    this.emit('saga.compensated', metrics);
  }

  /**
   * Record step start
   */
  onStepStarted(sagaId: string, stepName: string): void {
    const metrics = this.metricsStore.get(sagaId);
    if (!metrics) return;

    const stepKey = `${sagaId}:${stepName}`;
    this.stepTimers.set(stepKey, Date.now());

    const stepMetric: StepMetric = {
      stepName,
      status: 'started',
      startedAt: Date.now(),
      retryCount: 0,
    };

    metrics.stepMetrics.push(stepMetric);
  }

  /**
   * Record step completion
   */
  onStepCompleted(sagaId: string, stepName: string): void {
    const metrics = this.metricsStore.get(sagaId);
    if (!metrics) return;

    const stepKey = `${sagaId}:${stepName}`;
    const startTime = this.stepTimers.get(stepKey);

    const stepMetric = metrics.stepMetrics.find((s) => s.stepName === stepName && s.status === 'started');
    if (stepMetric && startTime) {
      stepMetric.status = 'completed';
      stepMetric.completedAt = Date.now();
      stepMetric.duration = stepMetric.completedAt - startTime;
      metrics.completedSteps++;

      this.stepTimers.delete(stepKey);
    }
  }

  /**
   * Record step failure
   */
  onStepFailed(sagaId: string, stepName: string, error: Error): void {
    const metrics = this.metricsStore.get(sagaId);
    if (!metrics) return;

    const stepKey = `${sagaId}:${stepName}`;
    const startTime = this.stepTimers.get(stepKey);

    const stepMetric = metrics.stepMetrics.find((s) => s.stepName === stepName && s.status === 'started');
    if (stepMetric && startTime) {
      stepMetric.status = 'failed';
      stepMetric.completedAt = Date.now();
      stepMetric.duration = stepMetric.completedAt - startTime;
      stepMetric.error = error.message;
      metrics.failedSteps++;

      this.stepTimers.delete(stepKey);
    }
  }

  /**
   * Record step compensation
   */
  onStepCompensated(sagaId: string, stepName: string): void {
    const metrics = this.metricsStore.get(sagaId);
    if (!metrics) return;

    const stepMetric = metrics.stepMetrics.find((s) => s.stepName === stepName);
    if (stepMetric) {
      stepMetric.status = 'compensated';
      metrics.compensatedSteps++;
    }
  }

  /**
   * Record step retry
   */
  onStepRetried(sagaId: string, stepName: string): void {
    const metrics = this.metricsStore.get(sagaId);
    if (!metrics) return;

    const stepMetric = metrics.stepMetrics.find((s) => s.stepName === stepName);
    if (stepMetric) {
      stepMetric.retryCount++;
    }
  }

  /**
   * Get metrics for a specific saga
   */
  getSagaMetrics(sagaId: string): SagaMetrics | undefined {
    return this.metricsStore.get(sagaId);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): SagaMetrics[] {
    return Array.from(this.metricsStore.values());
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(): AggregatedMetrics {
    const all = this.getAllMetrics();
    const completed = all.filter((m) => m.status === 'completed');
    const failed = all.filter((m) => m.status === 'failed');
    const compensated = all.filter((m) => m.status === 'compensated');

    const totalSteps = all.reduce((sum, m) => sum + m.totalSteps, 0);
    const completedSteps = all.reduce((sum, m) => sum + m.completedSteps, 0);
    const totalRetries = all.reduce((sum, m) =>
      sum + m.stepMetrics.reduce((stepSum, s) => stepSum + s.retryCount, 0), 0
    );

    const durations = completed.map((m) => m.duration).filter((d): d is number => d !== undefined);
    const avgDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    return {
      totalSagas: all.length,
      completedSagas: completed.length,
      failedSagas: failed.length,
      compensatedSagas: compensated.length,
      averageDuration: Math.round(avgDuration),
      successRate: all.length > 0 ? (completed.length / all.length) * 100 : 0,
      failureRate: all.length > 0 ? (failed.length / all.length) * 100 : 0,
      stepSuccessRate: totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0,
      averageStepsPerSaga: all.length > 0 ? totalSteps / all.length : 0,
      averageRetries: totalSteps > 0 ? totalRetries / totalSteps : 0,
    };
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metricsStore.clear();
    this.stepTimers.clear();
  }

  /**
   * Get metrics for the last N sagas
   */
  getRecentMetrics(count: number): SagaMetrics[] {
    const all = this.getAllMetrics();
    return all
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, count);
  }

  /**
   * Get metrics by status
   */
  getMetricsByStatus(status: SagaMetrics['status']): SagaMetrics[] {
    return this.getAllMetrics().filter((m) => m.status === status);
  }

  /**
   * Get slow sagas (duration > threshold)
   */
  getSlowSagas(thresholdMs: number): SagaMetrics[] {
    return this.getAllMetrics().filter((m) =>
      m.duration && m.duration > thresholdMs
    );
  }

  /**
   * Enforce max stored metrics (LRU)
   */
  private enforceMaxSize(): void {
    if (this.metricsStore.size <= this.maxStoredMetrics) {
      return;
    }

    const all = this.getAllMetrics();
    const sorted = all.sort((a, b) => a.startedAt - b.startedAt);
    const toRemove = sorted.slice(0, this.metricsStore.size - this.maxStoredMetrics);

    toRemove.forEach((m) => {
      this.metricsStore.delete(m.sagaId);
    });
  }
}

// Singleton instance
let metricsService: SagaMetricsService | null = null;

/**
 * Get or create saga metrics service instance
 */
export function getSagaMetricsService(): SagaMetricsService {
  if (!metricsService) {
    metricsService = new SagaMetricsService();
  }
  return metricsService;
}
