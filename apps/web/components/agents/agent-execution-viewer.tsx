/**
 * Agent Execution Viewer Component
 * Displays real-time agent execution output with SSE streaming
 */

'use client';

import { useAgentExecution } from '@/lib/hooks/use-agent-execution';
import { ConnectionState } from '@/lib/eventsource';

export interface AgentExecutionViewerProps {
  executionId: string;
  onClose?: () => void;
}

/**
 * Displays agent execution output with real-time SSE streaming
 */
export function AgentExecutionViewer({ executionId, onClose }: AgentExecutionViewerProps) {
  const {
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
  } = useAgentExecution(executionId, {
    initialRetryDelay: 1000,
    maxRetryDelay: 30000,
    jitterFactor: 0.3,
    autoReconnect: true,
  });

  const getStateColor = () => {
    switch (state) {
      case ConnectionState.CONNECTING:
        return 'text-yellow-500';
      case ConnectionState.OPEN:
        return 'text-green-500';
      case ConnectionState.ERROR:
        return 'text-red-500';
      case ConnectionState.CLOSED:
        return 'text-gray-500';
      default:
        return 'text-gray-400';
    }
  };

  const getStateIcon = () => {
    switch (state) {
      case ConnectionState.CONNECTING:
        return '🔄';
      case ConnectionState.OPEN:
        return '🟢';
      case ConnectionState.ERROR:
        return '🔴';
      case ConnectionState.CLOSED:
        return '⚫';
      default:
        return '⚪';
    }
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Execution: {executionId.substring(0, 8)}...
          </h3>
          <div className="flex items-center gap-2">
            <span className={`text-sm ${getStateColor()}`}>
              {getStateIcon()} {state}
            </span>
            {retryCount > 0 && (
              <span className="text-xs text-gray-500">
                (retry {retryCount})
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {state === ConnectionState.CLOSED && (
            <button
              onClick={connect}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Reconnect
            </button>
          )}
          {state === ConnectionState.OPEN && (
            <button
              onClick={disconnect}
              className="rounded-md bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Disconnect
            </button>
          )}
          <button
            onClick={clear}
            className="rounded-md bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            Clear
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Status Section */}
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400">Status: </span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {isComplete
                ? 'Completed'
                : hasError
                  ? 'Error'
                  : isInProgress
                    ? 'Running'
                    : isStarted
                      ? 'Started'
                      : 'Pending'}
            </span>
          </div>

          {progress && (
            <div className="flex items-center gap-2">
              <span className="text-gray-600 dark:text-gray-400">Progress: </span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {progress.percentage.toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          {lastEventId && (
            <div className="ml-auto">
              <span className="text-xs text-gray-500">
                Last Event: {lastEventId.substring(0, 12)}...
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Output Section */}
      <div className="flex-1 overflow-auto p-4">
        {output.length > 0 ? (
          <pre className="font-mono text-sm text-gray-800 dark:text-gray-200">
            {output.map((line, index) => (
              <div key={index} className="hover:bg-gray-100 dark:hover:bg-gray-700">
                {line}
              </div>
            ))}
          </pre>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            {state === ConnectionState.CONNECTING
              ? 'Connecting to stream...'
              : state === ConnectionState.CLOSED
                ? 'Connection closed. Click Reconnect to resume.'
                : 'Waiting for output...'}
          </div>
        )}
      </div>

      {/* Footer with completion/error info */}
      {(completion || error) && (
        <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          {completion && (
            <div className="text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Completed in {(completion.duration / 1000).toFixed(2)}s with exit code{' '}
              </span>
              <span
                className={`font-medium ${completion.success ? 'text-green-600' : 'text-red-600'}`}
              >
                {completion.exitCode}
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
              <div className="flex">
                <div className="flex-shrink-0">
                  <span className="text-red-400">⚠️</span>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                    Execution Error
                  </h3>
                  <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                    <p>{error.error}</p>
                    {error.code && (
                      <p className="mt-1 text-xs">
                        Code: <code className="font-mono">{error.code}</code>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
