# EventSource Client Usage Examples

This document demonstrates how to use the `ReconnectingEventSource` client for SSE streaming with automatic reconnection support.

## Basic Usage

```typescript
import { ReconnectingEventSource, ConnectionState } from '@/lib/eventsource';

// Create an event source
const eventSource = new ReconnectingEventSource(
  'http://localhost:3001/api/executions/abc123/stream',
  {
    initialRetryDelay: 1000,    // Start with 1 second retry delay
    maxRetryDelay: 30000,        // Cap at 30 seconds
    jitterFactor: 0.3,           // Add 30% jitter to prevent thundering herd
    autoReconnect: true,         // Automatically reconnect on errors
  }
);

// Listen for events
eventSource.on('output', (event) => {
  console.log('Received output:', event.data);
});

eventSource.on('progress', (event) => {
  console.log('Progress:', event.data);
});

eventSource.on('complete', (event) => {
  console.log('Execution completed:', event.data);
});

// Monitor connection state
eventSource.onStateChange((state) => {
  console.log('Connection state:', state);

  switch (state) {
    case ConnectionState.CONNECTING:
      console.log('Connecting to server...');
      break;
    case ConnectionState.OPEN:
      console.log('Connected successfully');
      break;
    case ConnectionState.ERROR:
      console.log('Connection error, will retry...');
      break;
    case ConnectionState.CLOSED:
      console.log('Connection closed');
      break;
  }
});

// Handle errors
eventSource.onError((error) => {
  console.error('EventSource error:', error);
});

// Connect
await eventSource.connect();

// Later: close the connection
eventSource.close();
```

## React Hook Usage

```typescript
import { useAgentExecution } from '@/lib/hooks/use-agent-execution';

function ExecutionMonitor({ executionId }: { executionId: string }) {
  const {
    state,
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
  } = useAgentExecution(executionId, {
    initialRetryDelay: 1000,
    maxRetryDelay: 30000,
    autoReconnect: true,
  });

  return (
    <div>
      <div>Status: {state}</div>
      {retryCount > 0 && <div>Retrying (attempt {retryCount})</div>}

      {progress && (
        <div>
          Progress: {progress.percentage}% - {progress.step}
        </div>
      )}

      <div>
        {output.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>

      {completion && <div>Completed with exit code: {completion.exitCode}</div>}
      {error && <div className="error">Error: {error.error}</div>}

      <button onClick={connect} disabled={state === 'open'}>
        Connect
      </button>
      <button onClick={disconnect}>Disconnect</button>
      <button onClick={clear}>Clear Output</button>
    </div>
  );
}
```

## Component Usage

```typescript
import { AgentExecutionViewer } from '@/components/agents/agent-execution-viewer';

function ExecutionPage({ executionId }: { executionId: string }) {
  return (
    <div className="h-screen p-4">
      <AgentExecutionViewer
        executionId={executionId}
        onClose={() => console.log('Viewer closed')}
      />
    </div>
  );
}
```

## Advanced: Manual Event Handling

```typescript
const eventSource = new ReconnectingEventSource(url, options);

// Listen to all events with wildcard
eventSource.on('*', (event) => {
  console.log('Any event:', event.type, event.data);
});

// Get connection metadata
console.log('Current state:', eventSource.getState());
console.log('Last event ID:', eventSource.getLastEventId());
console.log('Retry count:', eventSource.getRetryCount());
console.log('Buffered events:', eventSource.getBufferedEvents());

// Unsubscribe from events
const unsubscribe = eventSource.on('output', handler);
unsubscribe(); // Remove the handler

// Or use off() method
eventSource.off('output', handler);
```

## Features

### 1. Exponential Backoff with Jitter

The client implements exponential backoff for reconnection attempts:

- **Initial delay**: 1 second (configurable)
- **Max delay**: 30 seconds (configurable)
- **Backoff multiplier**: 2x (configurable)
- **Jitter**: 30% randomization to prevent simultaneous reconnections

Example progression (with jitter):
- Attempt 1: ~1000ms
- Attempt 2: ~2000ms (±30%)
- Attempt 3: ~4000ms (±30%)
- Attempt 4: ~8000ms (±30%)
- Attempt 5+: ~30000ms (capped, ±30%)

### 2. Last-Event-ID Support

Automatically sends the `Last-Event-ID` header on reconnection to resume from the last received event:

```typescript
// The server receives this header on reconnection
headers: {
  'Last-Event-ID': 'execution-123-45'
}

// Server can replay missed events using this ID
```

### 3. Event Deduplication

Prevents duplicate events within a configurable time window (default 5 seconds):

```typescript
const eventSource = new ReconnectingEventSource(url, {
  deduplicationWindow: 5000, // 5 seconds
});
```

### 4. Event Buffering

Buffers events for potential replay (default 1000 events):

```typescript
const eventSource = new ReconnectingEventSource(url, {
  maxBufferSize: 1000,
});

// Access buffered events
const buffered = eventSource.getBufferedEvents();
```

### 5. Network Change Detection

Automatically reconnects when network connectivity is restored:

```typescript
// Listens to browser 'online' event
window.addEventListener('online', () => {
  // Automatically reconnects with reset retry count
});
```

### 6. Connection State Tracking

Four connection states:
- `CONNECTING`: Attempting to connect
- `OPEN`: Successfully connected
- `ERROR`: Connection error occurred
- `CLOSED`: Connection closed

### 7. Automatic Cleanup

Properly cleans up resources on close:
- Aborts pending connections
- Clears retry timeouts
- Removes event listeners
- Clears cleanup intervals

## Testing Reconnection

### Manual Testing

1. Start the server and client
2. Connect to an execution stream
3. Stop the server (simulates network failure)
4. Observe exponential backoff retries in console
5. Restart the server
6. Client should automatically reconnect and resume from last event

### Browser DevTools Testing

1. Open Network tab
2. Start execution stream
3. Throttle network to "Offline"
4. Observe retry attempts
5. Return to "Online"
6. Verify reconnection with Last-Event-ID header

### Testing Event Deduplication

1. Connect to stream
2. Simulate network interruption during event transmission
3. Verify duplicate events are filtered
4. Check buffered events contain only unique IDs

## Configuration Best Practices

### Production Settings

```typescript
const eventSource = new ReconnectingEventSource(url, {
  initialRetryDelay: 1000,      // 1 second initial delay
  maxRetryDelay: 30000,          // 30 second max delay
  maxRetries: 0,                 // Unlimited retries
  backoffMultiplier: 2,          // Exponential backoff
  jitterFactor: 0.3,             // 30% jitter
  autoReconnect: true,           // Always auto-reconnect
  deduplicationWindow: 5000,     // 5 second dedup window
  maxBufferSize: 1000,           // Buffer 1000 events
});
```

### Development Settings

```typescript
const eventSource = new ReconnectingEventSource(url, {
  initialRetryDelay: 500,        // Faster retry for development
  maxRetryDelay: 10000,          // Lower max delay
  maxRetries: 5,                 // Limit retries in dev
  jitterFactor: 0.1,             // Less jitter for predictability
});
```

### Low-Bandwidth Settings

```typescript
const eventSource = new ReconnectingEventSource(url, {
  initialRetryDelay: 2000,       // Longer initial delay
  maxRetryDelay: 60000,          // 1 minute max delay
  backoffMultiplier: 1.5,        // Slower backoff
  deduplicationWindow: 10000,    // Longer dedup window
  maxBufferSize: 500,            // Smaller buffer
});
```

## Error Handling

### Client Errors (4xx)

Non-retryable errors (400, 401, 403, 404):
```typescript
eventSource.onError((error) => {
  if (error.message.includes('Client error: 404')) {
    // Execution not found, don't retry
    eventSource.close();
    showNotification('Execution not found');
  }
});
```

### Server Errors (5xx)

Automatically retried with exponential backoff:
```typescript
eventSource.onError((error) => {
  if (error.message.includes('Server error: 500')) {
    // Will automatically retry with backoff
    showNotification('Server error, retrying...');
  }
});
```

### Rate Limiting (429)

Automatically retried with backoff:
```typescript
eventSource.onError((error) => {
  if (error.message.includes('429')) {
    // Exponential backoff will handle rate limiting
  }
});
```

## Performance Considerations

1. **Event Buffering**: Large buffers consume memory. Adjust `maxBufferSize` based on event frequency.

2. **Deduplication Window**: Longer windows use more memory but provide better deduplication.

3. **Network Events**: Browser 'online' event may not be 100% reliable. Consider heartbeat monitoring.

4. **Cleanup**: Always call `close()` when done to prevent memory leaks.

5. **Multiple Instances**: Each instance maintains its own buffer and state. Share instances when possible.

## Browser Compatibility

- Modern browsers with Fetch API support
- Polyfill provided by `@microsoft/fetch-event-source`
- Tested on Chrome, Firefox, Safari, Edge

## Server Requirements

The server must:
1. Support Server-Sent Events (SSE)
2. Handle `Last-Event-ID` header for event replay
3. Send event IDs with each event
4. Implement event buffering for reconnection support
5. Set appropriate CORS headers if needed

Example server response format:
```
id: execution-123-0
event: output
data: {"type":"output","data":{"stream":"stdout","data":"Hello"},"timestamp":"2024-01-01T00:00:00Z","executionId":"123"}

id: execution-123-1
event: progress
data: {"type":"progress","data":{"step":"Running tests","current":1,"total":10,"percentage":10},"timestamp":"2024-01-01T00:00:01Z","executionId":"123"}
```
