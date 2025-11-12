/**
 * Agent Execution Types
 * Type definitions for agent execution and streaming
 */

export enum AgentExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
  CANCELLED = 'CANCELLED',
}

export enum StreamEventType {
  STDOUT = 'stdout',
  STDERR = 'stderr',
  ERROR = 'error',
  COMPLETE = 'complete',
  HEARTBEAT = 'heartbeat',
  METADATA = 'metadata',
}

export interface ExecutionContext {
  prompt?: string;
  worktreePath?: string;
  environment?: Record<string, string>;
  timeout?: number;
  [key: string]: any;
}

export interface StreamEvent {
  type: StreamEventType;
  data: string | object;
  timestamp: Date;
  executionId: string;
}

export interface ExecutionMetadata {
  executionId: string;
  agentId: string;
  processId?: number;
  status: AgentExecutionStatus;
  startedAt?: Date;
  context?: ExecutionContext;
}

export interface AgentExecuteOptions {
  agentId: string;
  projectId?: string;
  issueId?: string;
  worktreePath?: string;
  context?: ExecutionContext;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
}

export interface ExecutionResult {
  executionId: string;
  status: AgentExecutionStatus;
  exitCode?: number;
  error?: string;
  duration?: number;
}
