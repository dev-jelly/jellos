/**
 * Event Buffer Service
 * In-memory event buffering for SSE reconnection support
 */

import type { StreamEvent } from '../types/agent-execution';

interface BufferedEvent {
  id: string;
  event: StreamEvent;
  timestamp: number;
}

/**
 * Event buffer for SSE reconnection
 * Stores events in memory with configurable TTL
 */
export class EventBufferService {
  private buffers = new Map<string, BufferedEvent[]>();
  private maxEventsPerExecution = 1000; // Max events to buffer per execution
  private eventTTL = 3600000; // 1 hour in milliseconds
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired buffers every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredBuffers();
    }, 300000);
  }

  /**
   * Add event to buffer
   */
  public addEvent(executionId: string, eventId: string, event: StreamEvent): void {
    if (!this.buffers.has(executionId)) {
      this.buffers.set(executionId, []);
    }

    const buffer = this.buffers.get(executionId)!;

    // Add event
    buffer.push({
      id: eventId,
      event,
      timestamp: Date.now(),
    });

    // Trim buffer if it exceeds max size
    if (buffer.length > this.maxEventsPerExecution) {
      buffer.shift(); // Remove oldest event
    }
  }

  /**
   * Get events after a specific event ID
   */
  public getEventsAfter(executionId: string, lastEventId?: string): BufferedEvent[] {
    const buffer = this.buffers.get(executionId);

    if (!buffer || buffer.length === 0) {
      return [];
    }

    if (!lastEventId) {
      // Return all events if no lastEventId provided
      return buffer;
    }

    // Find the index of lastEventId
    const lastIndex = buffer.findIndex((e) => e.id === lastEventId);

    if (lastIndex === -1) {
      // Event not found, return all events (client might have missed a lot)
      return buffer;
    }

    // Return events after the lastEventId
    return buffer.slice(lastIndex + 1);
  }

  /**
   * Check if execution has buffered events
   */
  public hasBuffer(executionId: string): boolean {
    return this.buffers.has(executionId) && this.buffers.get(executionId)!.length > 0;
  }

  /**
   * Clear buffer for execution
   */
  public clearBuffer(executionId: string): void {
    this.buffers.delete(executionId);
  }

  /**
   * Get buffer size for execution
   */
  public getBufferSize(executionId: string): number {
    return this.buffers.get(executionId)?.length || 0;
  }

  /**
   * Cleanup expired buffers
   */
  private cleanupExpiredBuffers(): void {
    const now = Date.now();
    const expiredExecutions: string[] = [];

    for (const [executionId, buffer] of this.buffers.entries()) {
      // Check if all events in buffer are expired
      const allExpired = buffer.every((e) => now - e.timestamp > this.eventTTL);

      if (allExpired) {
        expiredExecutions.push(executionId);
      } else {
        // Remove expired events from buffer
        const validEvents = buffer.filter((e) => now - e.timestamp <= this.eventTTL);
        this.buffers.set(executionId, validEvents);
      }
    }

    // Delete expired execution buffers
    for (const executionId of expiredExecutions) {
      this.buffers.delete(executionId);
    }
  }

  /**
   * Get statistics
   */
  public getStats() {
    let totalEvents = 0;
    const executionCount = this.buffers.size;

    for (const buffer of this.buffers.values()) {
      totalEvents += buffer.length;
    }

    return {
      executionCount,
      totalEvents,
      averageEventsPerExecution: executionCount > 0 ? totalEvents / executionCount : 0,
    };
  }

  /**
   * Cleanup on service shutdown
   */
  public shutdown(): void {
    clearInterval(this.cleanupInterval);
    this.buffers.clear();
  }
}

// Singleton instance
let eventBufferInstance: EventBufferService | null = null;

export function getEventBufferService(): EventBufferService {
  if (!eventBufferInstance) {
    eventBufferInstance = new EventBufferService();
  }
  return eventBufferInstance;
}

export function resetEventBufferService(): void {
  if (eventBufferInstance) {
    eventBufferInstance.shutdown();
    eventBufferInstance = null;
  }
}
