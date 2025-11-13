/**
 * React Hook for Agent Execution SSE Streaming
 * Provides a convenient interface for connecting to agent execution streams
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ReconnectingEventSource,
  ConnectionState,
  type EventSourceOptions,
} from '../eventsource';

/**
 * Execution event types from the backend
 */
export enum ExecutionEventType {
  STARTED = 'started',
  OUTPUT = 'output',
  PROGRESS = 'progress',
  COMPLETE = 'complete',
  ERROR = 'error',
  HEARTBEAT = 'heartbeat',
  METADATA = 'metadata',
}

/**
 * Execution output event
 */
export interface OutputEvent {
  stream: 'stdout' | 'stderr';
  data: string;
}

/**
 * Execution progress event
 */
export interface ProgressEvent {
  step: string;
  current: number;
  total: number;
  percentage: number;
}

/**
 * Execution complete event
 */
export interface CompleteEvent {
  exitCode: number;
  duration: number;
  success: boolean;
}

/**
 * Execution error event
 */
export interface ErrorEvent {
  error: string;
  code?: string;
  recoverable?: boolean;
}

/**
 * Hook options
 */
export interface UseAgentExecutionOptions extends EventSourceOptions {
  /**
   * Whether to automatically start streaming on mount
   * @default true
   */
  autoStart?: boolean;

  /**
   * Base API URL
   */
  apiUrl?: string;
}

/**
 * Hook return value
 */
export interface UseAgentExecutionResult {
  /**
   * Current connection state
   */
  state: ConnectionState;

  /**
   * Whether the execution has started
   */
  isStarted: boolean;

  /**
   * Whether the execution is in progress
   */
  isInProgress: boolean;

  /**
   * Whether the execution has completed
   */
  isComplete: boolean;

  /**
   * Whether an error occurred
   */
  hasError: boolean;

  /**
   * Collected output lines
   */
  output: string[];

  /**
   * Current progress information
   */
  progress: ProgressEvent | null;

  /**
   * Completion information
   */
  completion: CompleteEvent | null;

  /**
   * Error information
   */
  error: ErrorEvent | null;

  /**
   * Last event ID received
   */
  lastEventId: string | null;

  /**
   * Number of reconnection attempts
   */
  retryCount: number;

  /**
   * Manually start/restart the connection
   */
  connect: () => void;

  /**
   * Manually close the connection
   */
  disconnect: () => void;

  /**
   * Clear collected data
   */
  clear: () => void;
}

/**
 * React hook for agent execution SSE streaming
 */
export function useAgentExecution(
  executionId: string | null,
  options: UseAgentExecutionOptions = {}
): UseAgentExecutionResult {
  const {
    autoStart = true,
    apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    ...eventSourceOptions
  } = options;

  // State
  const [state, setState] = useState<ConnectionState>(ConnectionState.CLOSED);
  const [isStarted, setIsStarted] = useState(false);
  const [isInProgress, setIsInProgress] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [completion, setCompletion] = useState<CompleteEvent | null>(null);
  const [error, setError] = useState<ErrorEvent | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Refs
  const eventSourceRef = useRef<ReconnectingEventSource | null>(null);

  /**
   * Clear all collected data
   */
  const clear = useCallback(() => {
    setIsStarted(false);
    setIsInProgress(false);
    setIsComplete(false);
    setHasError(false);
    setOutput([]);
    setProgress(null);
    setCompletion(null);
    setError(null);
  }, []);

  /**
   * Connect to the execution stream
   */
  const connect = useCallback(() => {
    if (!executionId) {
      return;
    }

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Create new connection
    const url = `${apiUrl}/api/executions/${executionId}/stream`;
    const eventSource = new ReconnectingEventSource(url, eventSourceOptions);

    // State change handler
    eventSource.onStateChange((newState) => {
      setState(newState);
      setRetryCount(eventSource.getRetryCount());
      setLastEventId(eventSource.getLastEventId());
    });

    // Error handler
    eventSource.onError((err) => {
      console.error('EventSource error:', err);
    });

    // Event handlers
    eventSource.on<void>(ExecutionEventType.STARTED, () => {
      setIsStarted(true);
      setIsInProgress(true);
    });

    eventSource.on<OutputEvent>(ExecutionEventType.OUTPUT, (event) => {
      setOutput((prev) => [...prev, event.data.data]);
    });

    eventSource.on<ProgressEvent>(ExecutionEventType.PROGRESS, (event) => {
      setProgress(event.data);
    });

    eventSource.on<CompleteEvent>(ExecutionEventType.COMPLETE, (event) => {
      setIsInProgress(false);
      setIsComplete(true);
      setCompletion(event.data);
    });

    eventSource.on<ErrorEvent>(ExecutionEventType.ERROR, (event) => {
      setHasError(true);
      setIsInProgress(false);
      setError(event.data);
    });

    // Connect
    eventSource.connect();
    eventSourceRef.current = eventSource;
  }, [executionId, apiUrl, eventSourceOptions]);

  /**
   * Disconnect from the stream
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  /**
   * Auto-start on mount or when executionId changes
   */
  useEffect(() => {
    if (autoStart && executionId) {
      connect();
    }

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionId, autoStart]); // Only re-run when executionId or autoStart changes

  return {
    state,
    isStarted,
    isInProgress,
    isComplete,
    hasError,
    output,
    progress,
    completion,
    error,
    lastEventId,
    retryCount,
    connect,
    disconnect,
    clear,
  };
}
