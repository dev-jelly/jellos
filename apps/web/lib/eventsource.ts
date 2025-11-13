/**
 * EventSource Client with Reconnection Support
 * Implements robust SSE client with exponential backoff, jitter, and Last-Event-ID support
 */

import { fetchEventSource } from '@microsoft/fetch-event-source';

/**
 * Connection states for EventSource
 */
export enum ConnectionState {
  CONNECTING = 'connecting',
  OPEN = 'open',
  CLOSED = 'closed',
  ERROR = 'error',
}

/**
 * SSE Event structure
 */
export interface SSEEvent<T = unknown> {
  type: string;
  data: T;
  timestamp: string;
  executionId: string;
  id?: string;
}

/**
 * EventSource configuration options
 */
export interface EventSourceOptions {
  /**
   * Initial reconnection delay in milliseconds
   * @default 1000
   */
  initialRetryDelay?: number;

  /**
   * Maximum reconnection delay in milliseconds
   * @default 30000
   */
  maxRetryDelay?: number;

  /**
   * Maximum number of reconnection attempts (0 = unlimited)
   * @default 0
   */
  maxRetries?: number;

  /**
   * Backoff multiplier for exponential backoff
   * @default 2
   */
  backoffMultiplier?: number;

  /**
   * Jitter factor (0-1) to add randomness to retry delays
   * @default 0.3
   */
  jitterFactor?: number;

  /**
   * Additional headers to send with the request
   */
  headers?: Record<string, string>;

  /**
   * Whether to automatically reconnect on network errors
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Event deduplication window in milliseconds
   * @default 5000
   */
  deduplicationWindow?: number;

  /**
   * Maximum number of buffered events to keep
   * @default 1000
   */
  maxBufferSize?: number;
}

/**
 * Event handler callback
 */
export type EventHandler<T = unknown> = (event: SSEEvent<T>) => void;

/**
 * State change handler callback
 */
export type StateChangeHandler = (state: ConnectionState) => void;

/**
 * Error handler callback
 */
export type ErrorHandler = (error: Error) => void;

/**
 * Buffered event with metadata
 */
interface BufferedEvent {
  id: string;
  event: SSEEvent;
  timestamp: number;
}

/**
 * Robust EventSource client with reconnection support
 */
export class ReconnectingEventSource {
  private url: string;
  private options: Required<EventSourceOptions>;
  private state: ConnectionState = ConnectionState.CLOSED;
  private lastEventId: string | null = null;
  private retryCount = 0;
  private retryTimeout: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;

  // Event handlers
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private stateChangeHandlers = new Set<StateChangeHandler>();
  private errorHandlers = new Set<ErrorHandler>();

  // Event buffering and deduplication
  private eventBuffer: BufferedEvent[] = [];
  private seenEventIds = new Set<string>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Network change detection
  private networkChangeHandler: (() => void) | null = null;

  /**
   * Creates a new ReconnectingEventSource instance
   */
  constructor(url: string, options: EventSourceOptions = {}) {
    this.url = url;
    this.options = {
      initialRetryDelay: options.initialRetryDelay ?? 1000,
      maxRetryDelay: options.maxRetryDelay ?? 30000,
      maxRetries: options.maxRetries ?? 0,
      backoffMultiplier: options.backoffMultiplier ?? 2,
      jitterFactor: options.jitterFactor ?? 0.3,
      headers: options.headers ?? {},
      autoReconnect: options.autoReconnect ?? true,
      deduplicationWindow: options.deduplicationWindow ?? 5000,
      maxBufferSize: options.maxBufferSize ?? 1000,
    };

    this.setupNetworkChangeDetection();
    this.startCleanupInterval();
  }

  /**
   * Opens the EventSource connection
   */
  public async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTING || this.state === ConnectionState.OPEN) {
      return;
    }

    this.setState(ConnectionState.CONNECTING);
    this.abortController = new AbortController();

    try {
      await fetchEventSource(this.url, {
        signal: this.abortController.signal,
        headers: {
          ...this.options.headers,
          ...(this.lastEventId ? { 'Last-Event-ID': this.lastEventId } : {}),
        },
        openWhenHidden: true, // Keep connection alive when tab is hidden

        async onopen(response) {
          if (response.ok) {
            return; // Connection successful
          }

          // Handle non-OK responses
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            // Client error - don't retry
            throw new Error(`Client error: ${response.status} ${response.statusText}`);
          }
        },

        onmessage: (msg) => {
          this.handleMessage(msg);
        },

        onerror: (err) => {
          this.handleError(err);
        },

        onclose: () => {
          this.handleClose();
        },
      });
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Closes the EventSource connection
   */
  public close(): void {
    this.options.autoReconnect = false;

    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.networkChangeHandler && typeof window !== 'undefined') {
      window.removeEventListener('online', this.networkChangeHandler);
      this.networkChangeHandler = null;
    }

    this.setState(ConnectionState.CLOSED);
  }

  /**
   * Registers an event handler for a specific event type
   */
  public on<T = unknown>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }

    this.eventHandlers.get(eventType)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => {
      this.off(eventType, handler);
    };
  }

  /**
   * Removes an event handler
   */
  public off<T = unknown>(eventType: string, handler: EventHandler<T>): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventType);
      }
    }
  }

  /**
   * Registers a state change handler
   */
  public onStateChange(handler: StateChangeHandler): () => void {
    this.stateChangeHandlers.add(handler);
    return () => this.stateChangeHandlers.delete(handler);
  }

  /**
   * Registers an error handler
   */
  public onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Gets the current connection state
   */
  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * Gets the last received event ID
   */
  public getLastEventId(): string | null {
    return this.lastEventId;
  }

  /**
   * Gets the buffered events
   */
  public getBufferedEvents(): readonly BufferedEvent[] {
    return [...this.eventBuffer];
  }

  /**
   * Gets the current retry count
   */
  public getRetryCount(): number {
    return this.retryCount;
  }

  /**
   * Handles incoming SSE messages
   */
  private handleMessage(msg: { event?: string; data: string; id?: string }): void {
    const eventType = msg.event || 'message';
    const eventId = msg.id;

    // Update last event ID
    if (eventId) {
      this.lastEventId = eventId;
    }

    // Parse event data
    let eventData: SSEEvent;
    try {
      eventData = JSON.parse(msg.data);
    } catch (error) {
      console.error('Failed to parse SSE event data:', error);
      return;
    }

    // Deduplicate events
    if (eventId && this.seenEventIds.has(eventId)) {
      console.debug(`Duplicate event ignored: ${eventId}`);
      return;
    }

    if (eventId) {
      this.seenEventIds.add(eventId);
    }

    // Buffer event
    this.bufferEvent(eventId || `${Date.now()}-${Math.random()}`, eventData);

    // Set state to OPEN on first successful message
    if (this.state === ConnectionState.CONNECTING) {
      this.setState(ConnectionState.OPEN);
      this.retryCount = 0; // Reset retry count on successful connection
    }

    // Dispatch to handlers
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(eventData);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error);
        }
      });
    }

    // Also dispatch to wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => {
        try {
          handler(eventData);
        } catch (error) {
          console.error('Error in wildcard event handler:', error);
        }
      });
    }
  }

  /**
   * Handles connection errors
   */
  private handleError(error: Error): void {
    console.error('EventSource error:', error);

    this.setState(ConnectionState.ERROR);

    // Notify error handlers
    this.errorHandlers.forEach((handler) => {
      try {
        handler(error);
      } catch (err) {
        console.error('Error in error handler:', err);
      }
    });

    // Attempt reconnection if auto-reconnect is enabled
    if (this.options.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handles connection close
   */
  private handleClose(): void {
    if (this.state === ConnectionState.CLOSED) {
      return; // Already closed
    }

    this.setState(ConnectionState.CLOSED);

    // Attempt reconnection if auto-reconnect is enabled
    if (this.options.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedules a reconnection attempt with exponential backoff and jitter
   */
  private scheduleReconnect(): void {
    // Check max retries limit
    if (this.options.maxRetries > 0 && this.retryCount >= this.options.maxRetries) {
      console.error('Max reconnection attempts reached');
      this.setState(ConnectionState.CLOSED);
      return;
    }

    // Clear existing timeout
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }

    // Calculate delay with exponential backoff
    const exponentialDelay = Math.min(
      this.options.initialRetryDelay * Math.pow(this.options.backoffMultiplier, this.retryCount),
      this.options.maxRetryDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * this.options.jitterFactor * (Math.random() - 0.5);
    const delay = Math.max(0, exponentialDelay + jitter);

    console.log(`Reconnecting in ${Math.round(delay)}ms (attempt ${this.retryCount + 1})`);

    this.retryTimeout = setTimeout(() => {
      this.retryCount++;
      this.connect();
    }, delay);
  }

  /**
   * Updates connection state and notifies handlers
   */
  private setState(newState: ConnectionState): void {
    if (this.state === newState) {
      return;
    }

    this.state = newState;

    // Notify state change handlers
    this.stateChangeHandlers.forEach((handler) => {
      try {
        handler(newState);
      } catch (error) {
        console.error('Error in state change handler:', error);
      }
    });
  }

  /**
   * Buffers an event for potential replay
   */
  private bufferEvent(id: string, event: SSEEvent): void {
    this.eventBuffer.push({
      id,
      event,
      timestamp: Date.now(),
    });

    // Trim buffer if it exceeds max size
    if (this.eventBuffer.length > this.options.maxBufferSize) {
      this.eventBuffer.shift();
    }
  }

  /**
   * Sets up network change detection for automatic reconnection
   */
  private setupNetworkChangeDetection(): void {
    if (typeof window === 'undefined') {
      return; // Not in browser environment
    }

    this.networkChangeHandler = () => {
      console.log('Network connectivity restored, reconnecting...');
      if (this.state !== ConnectionState.OPEN && this.options.autoReconnect) {
        this.retryCount = 0; // Reset retry count on network change
        this.connect();
      }
    };

    window.addEventListener('online', this.networkChangeHandler);
  }

  /**
   * Starts the cleanup interval for old events and seen IDs
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - this.options.deduplicationWindow;

      // Clean up old buffered events
      this.eventBuffer = this.eventBuffer.filter((e) => e.timestamp >= cutoff);

      // Clean up old seen event IDs
      // Note: This is a simple implementation. For production, consider using a proper LRU cache
      const recentEventIds = new Set(this.eventBuffer.map((e) => e.id));
      this.seenEventIds = recentEventIds;
    }, this.options.deduplicationWindow);
  }
}

/**
 * Creates and connects a new ReconnectingEventSource
 */
export async function createEventSource(
  url: string,
  options?: EventSourceOptions
): Promise<ReconnectingEventSource> {
  const eventSource = new ReconnectingEventSource(url, options);
  await eventSource.connect();
  return eventSource;
}
