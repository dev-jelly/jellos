# Finite State Machine (FSM) Design for Jellos

**Version:** 1.0
**Date:** 2025-11-13
**Status:** Design Complete
**Task:** 12.1 - FSM Design and State Transition Rules Definition

## Table of Contents

1. [Overview](#overview)
2. [Domain Models](#domain-models)
3. [State Machine Designs](#state-machine-designs)
4. [Transition Rules and Guards](#transition-rules-and-guards)
5. [Implementation Strategy](#implementation-strategy)
6. [XState vs Custom FSM Evaluation](#xstate-vs-custom-fsm-evaluation)
7. [Event Bus Integration](#event-bus-integration)
8. [Testing Strategy](#testing-strategy)

---

## Overview

This document defines the finite state machine (FSM) architecture for managing the lifecycle of Issues, Pull Requests, and Deployments within the Jellos platform. The FSM ensures deterministic state transitions with well-defined guards and side effects, enabling reliable event sourcing and recovery patterns.

### Design Goals

- **Deterministic State Transitions**: Clear, testable state transition rules
- **Event-Driven Architecture**: Integration with event bus for distributed operations
- **Recovery & Resilience**: Support for saga patterns, compensation, and retry logic
- **Extensibility**: Easy addition of new states and transitions
- **Observability**: Complete state history and transition auditing

### Key Concepts

- **State**: A discrete phase in an entity's lifecycle (e.g., TODO, IN_PROGRESS)
- **Transition**: Movement from one state to another with associated guards and actions
- **Guard**: Boolean condition that must be satisfied for a transition to occur
- **Action**: Side effect executed when a transition is triggered
- **Context**: Additional data associated with the state machine instance

---

## Domain Models

### Current Domain Entities

Based on the existing Prisma schema and TypeScript types, we have three primary entities:

#### 1. Issue (Task/Feature)

```prisma
model Issue {
  id          String   @id @default(cuid())
  projectId   String
  title       String
  description String?
  status      String   @default("TODO")
  priority    String   @default("MEDIUM")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project       Project             @relation(...)
  worktrees     Worktree[]
  externalLinks ExternalIssueLink[]
  comments      IssueComment[]
}
```

**Current Status Values:**
- TODO
- IN_PROGRESS
- IN_REVIEW
- MERGED
- DEPLOYED
- REJECTED
- CANCELED

#### 2. Agent Execution

```prisma
model AgentExecution {
  id             String    @id @default(cuid())
  agentId        String
  projectId      String?
  issueId        String?
  status         String    @default("PENDING")
  processId      Int?
  exitCode       Int?
  startedAt      DateTime?
  completedAt    DateTime?
  lastHeartbeat  DateTime?
  errorMessage   String?
  // Git metadata fields...
}
```

**Current Status Values:**
- PENDING
- RUNNING
- COMPLETED
- FAILED
- TIMEOUT
- CANCELLED

#### 3. Worktree

```prisma
model Worktree {
  id           String    @id @default(cuid())
  projectId    String
  issueId      String?
  path         String
  branch       String    @unique
  status       String    @default("ACTIVE")
  lastActivity DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

**Current Status Values:**
- ACTIVE
- STALE
- DIRTY
- REMOVED

---

## State Machine Designs

### 1. Issue State Machine

The Issue FSM manages the complete lifecycle from task creation to deployment.

#### State Diagram

```
                    ┌──────────┐
                    │   TODO   │ (Initial State)
                    └────┬─────┘
                         │ start_work
                         ▼
              ┌──────────────────┐
              │   IN_PROGRESS    │
              └─────┬──────┬─────┘
                    │      │
       submit_for_review   │ block
                    │      │
                    ▼      ▼
              ┌──────────┐ ┌─────────┐
              │IN_REVIEW │ │ BLOCKED │
              └─────┬────┘ └────┬────┘
                    │           │ unblock
           approve  │ reject    │
                    │           ▼
                    ▼      ┌─────────────┐
              ┌─────────┐  │ IN_PROGRESS │
              │ MERGED  │  └─────────────┘
              └────┬────┘
                   │ deploy
                   ▼
              ┌──────────┐
              │ DEPLOYED │ (Final State)
              └──────────┘

     Special Transitions:
     ANY_STATE ──cancel──> CANCELED (Final State)
     IN_REVIEW ──reject──> REJECTED (Final State)
```

#### States

| State | Description | Entry Actions | Exit Actions |
|-------|-------------|---------------|--------------|
| **TODO** | Task created, not started | Create IssueStateHistory entry | - |
| **IN_PROGRESS** | Active development underway | Assign worktree, start timer | - |
| **BLOCKED** | Waiting on external dependency | Notify stakeholders, pause timer | - |
| **IN_REVIEW** | PR submitted for review | Create PR link, request reviewers | - |
| **MERGED** | PR merged to target branch | Cleanup worktree (optional) | - |
| **DEPLOYED** | Changes live in production | Record deployment metadata | - |
| **REJECTED** | PR rejected, will not merge | Archive worktree, notify author | - |
| **CANCELED** | Task no longer needed | Cleanup all resources | - |

#### Transitions

| From | To | Event | Guards | Actions | Side Effects |
|------|----|----|--------|---------|--------------|
| TODO | IN_PROGRESS | start_work | - hasAssignee<br>- noActiveWorktree | - createWorktree()<br>- notifyAssignee() | Event: IssueStarted |
| TODO | CANCELED | cancel | - hasPermission('cancel') | - cleanupResources() | Event: IssueCanceled |
| IN_PROGRESS | BLOCKED | block | - hasBlockingReason | - pauseTimer()<br>- notifyStakeholders() | Event: IssueBlocked |
| IN_PROGRESS | IN_REVIEW | submit_for_review | - hasCommits<br>- passesPreChecks | - createPR()<br>- requestReviewers() | Event: ReviewRequested |
| IN_PROGRESS | CANCELED | cancel | - hasPermission('cancel') | - cleanupWorktree()<br>- cancelExecutions() | Event: IssueCanceled |
| BLOCKED | IN_PROGRESS | unblock | - blockingReasonResolved | - resumeTimer() | Event: IssueUnblocked |
| BLOCKED | CANCELED | cancel | - hasPermission('cancel') | - cleanupResources() | Event: IssueCanceled |
| IN_REVIEW | MERGED | approve | - hasApprovals(minRequired)<br>- passesCI<br>- noConflicts | - mergePR()<br>- notifyTeam() | Event: PRMerged |
| IN_REVIEW | REJECTED | reject | - hasRejection | - notifyAuthor()<br>- archiveWorktree() | Event: PRRejected |
| IN_REVIEW | IN_PROGRESS | request_changes | - hasChangeRequests | - notifyAuthor() | Event: ChangesRequested |
| IN_REVIEW | CANCELED | cancel | - hasPermission('cancel') | - closePR()<br>- cleanupResources() | Event: IssueCanceled |
| MERGED | DEPLOYED | deploy | - hasDeployment<br>- deploymentSuccessful | - recordDeployment()<br>- notifyStakeholders() | Event: IssueDeployed |
| MERGED | CANCELED | cancel | - hasPermission('cancel')<br>- !isDeployed | - revertMerge?(optional) | Event: IssueCanceled |
| REJECTED | TODO | reopen | - hasPermission('reopen') | - resetState() | Event: IssueReopened |
| ANY | CANCELED | cancel | - hasPermission('cancel') | - cleanupAll() | Event: IssueCanceled |

### 2. Agent Execution State Machine

The Agent Execution FSM manages individual agent run lifecycles with timeout and recovery.

#### State Diagram

```
                    ┌──────────┐
                    │ PENDING  │ (Initial State)
                    └────┬─────┘
                         │ execute
                         ▼
                  ┌──────────────┐
                  │   RUNNING    │
                  └──┬──┬──┬───┬─┘
                     │  │  │   │
      complete/      │  │  │   │ timeout
         success     │  │  │   │
                     │  │  │   ▼
                     ▼  │  │  ┌─────────┐
              ┌──────────┐│  │ │ TIMEOUT │ (Final)
              │COMPLETED ││  │ └─────────┘
              └──────────┘│  │
               (Final)    │  │ cancel
                          │  │
                   fail   │  ▼
                          │ ┌───────────┐
                          │ │ CANCELLED │ (Final)
                          │ └───────────┘
                          ▼
                    ┌─────────┐
                    │ FAILED  │ (Final, Retryable)
                    └────┬────┘
                         │ retry
                         ▼
                    ┌─────────┐
                    │ PENDING │
                    └─────────┘
```

#### States

| State | Description | Entry Actions | Exit Actions |
|-------|-------------|---------------|--------------|
| **PENDING** | Execution queued, not started | Allocate resources | - |
| **RUNNING** | Agent actively executing | Start heartbeat, record startedAt | - |
| **COMPLETED** | Execution finished successfully | Collect git metadata, record exitCode | - |
| **FAILED** | Execution failed with error | Log error, trigger retry if allowed | - |
| **TIMEOUT** | Execution exceeded timeout | Kill process, cleanup | - |
| **CANCELLED** | User/system cancelled execution | Kill process, cleanup | - |

#### Transitions

| From | To | Event | Guards | Actions | Side Effects |
|------|----|----|--------|---------|--------------|
| PENDING | RUNNING | execute | - agentAvailable<br>- resourcesAvailable | - spawnProcess()<br>- startHeartbeat()<br>- recordProcessId() | Event: ExecutionStarted |
| PENDING | CANCELLED | cancel | - | - cleanupQueue() | Event: ExecutionCancelled |
| RUNNING | COMPLETED | complete | - exitCode === 0 | - collectGitMetadata()<br>- stopHeartbeat() | Event: ExecutionCompleted |
| RUNNING | FAILED | fail | - exitCode !== 0 | - captureError()<br>- checkRetryPolicy() | Event: ExecutionFailed |
| RUNNING | TIMEOUT | timeout | - currentTime > deadline | - killProcess()<br>- cleanupResources() | Event: ExecutionTimedOut |
| RUNNING | CANCELLED | cancel | - | - killProcess()<br>- cleanupResources() | Event: ExecutionCancelled |
| FAILED | PENDING | retry | - retriesRemaining > 0<br>- isRetryable | - incrementRetryCount()<br>- scheduleRetry() | Event: ExecutionRetrying |

### 3. Deployment State Machine

A simplified deployment FSM for tracking deployment status (future extension for Task 12).

#### State Diagram

```
                    ┌──────────┐
                    │ QUEUED   │ (Initial)
                    └────┬─────┘
                         │ start
                         ▼
                  ┌──────────────┐
                  │  DEPLOYING   │
                  └──┬────────┬──┘
                     │        │
       complete      │        │ fail
                     │        │
                     ▼        ▼
              ┌──────────┐ ┌─────────┐
              │ DEPLOYED │ │ FAILED  │
              └────┬─────┘ └────┬────┘
                   │            │
                   │ rollback   │ retry
                   │            │
                   ▼            ▼
              ┌──────────┐ ┌──────────┐
              │ROLLED_BACK│ │  QUEUED  │
              └───────────┘ └──────────┘
```

---

## Transition Rules and Guards

### Guard Functions

Guards are pure functions that return boolean values to determine if a transition is allowed.

#### Issue Guards

```typescript
type IssueGuard = (issue: Issue, context: IssueContext) => boolean;

// Guard: Check if issue has an assignee
const hasAssignee: IssueGuard = (issue, context) => {
  return context.assigneeId !== null && context.assigneeId !== undefined;
};

// Guard: Check if there's no active worktree
const noActiveWorktree: IssueGuard = (issue, context) => {
  return !context.worktrees.some(w => w.status === 'ACTIVE');
};

// Guard: Check if issue has commits
const hasCommits: IssueGuard = (issue, context) => {
  const worktree = context.worktrees.find(w => w.issueId === issue.id);
  return worktree && context.commitCount > 0;
};

// Guard: Check if pre-checks pass (linting, tests, etc.)
const passesPreChecks: IssueGuard = (issue, context) => {
  return context.preCheckResults.every(r => r.status === 'passed');
};

// Guard: Check if PR has minimum required approvals
const hasApprovals = (minRequired: number): IssueGuard => {
  return (issue, context) => {
    return context.approvalCount >= minRequired;
  };
};

// Guard: Check if CI passes
const passesCI: IssueGuard = (issue, context) => {
  return context.ciStatus === 'success';
};

// Guard: Check for merge conflicts
const noConflicts: IssueGuard = (issue, context) => {
  return !context.hasMergeConflicts;
};

// Guard: Check if user has permission
const hasPermission = (action: string): IssueGuard => {
  return (issue, context) => {
    return context.userPermissions.includes(action);
  };
};

// Guard: Check if blocking reason is resolved
const blockingReasonResolved: IssueGuard = (issue, context) => {
  return context.blockingDependencies.every(d => d.resolved);
};
```

#### Agent Execution Guards

```typescript
type ExecutionGuard = (execution: AgentExecution, context: ExecutionContext) => boolean;

// Guard: Check if agent is available
const agentAvailable: ExecutionGuard = (execution, context) => {
  return context.agent.healthStatus === 'healthy' && context.agent.enabled;
};

// Guard: Check if resources are available
const resourcesAvailable: ExecutionGuard = (execution, context) => {
  return context.availableMemory > context.requiredMemory &&
         context.activeConcurrentExecutions < context.maxConcurrentExecutions;
};

// Guard: Check if execution is retryable
const isRetryable: ExecutionGuard = (execution, context) => {
  const nonRetryableErrors = ['INVALID_CONFIG', 'AUTH_FAILED'];
  return !nonRetryableErrors.includes(context.errorType);
};

// Guard: Check if retries remaining
const retriesRemaining: ExecutionGuard = (execution, context) => {
  return context.retryCount < context.maxRetries;
};
```

### Context Data Structures

```typescript
interface IssueContext {
  assigneeId: string | null;
  worktrees: Worktree[];
  commitCount: number;
  preCheckResults: PreCheckResult[];
  approvalCount: number;
  ciStatus: 'pending' | 'success' | 'failure';
  hasMergeConflicts: boolean;
  userPermissions: string[];
  blockingDependencies: BlockingDependency[];
  pullRequest?: PullRequestInfo;
}

interface ExecutionContext {
  agent: CodeAgentRuntime;
  availableMemory: number;
  requiredMemory: number;
  activeConcurrentExecutions: number;
  maxConcurrentExecutions: number;
  retryCount: number;
  maxRetries: number;
  errorType?: string;
  processId?: number;
}

interface PreCheckResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  details?: string;
}

interface BlockingDependency {
  id: string;
  type: 'issue' | 'external';
  resolved: boolean;
  description: string;
}

interface PullRequestInfo {
  id: string;
  url: string;
  number: number;
  state: 'open' | 'closed' | 'merged';
}
```

---

## Implementation Strategy

### Recommended Approach: Custom FSM

After evaluating both XState and custom implementations, **a custom TypeScript FSM is recommended** for Jellos due to:

1. **Simplicity**: Our state machines are relatively simple with clear hierarchies
2. **Type Safety**: Full TypeScript type inference and compile-time checking
3. **Zero Dependencies**: No external library dependencies or bundle size impact
4. **Flexibility**: Complete control over event bus integration and persistence
5. **Performance**: Minimal overhead, no runtime interpretation
6. **Learning Curve**: Easier for team members to understand and maintain

### Custom FSM Architecture

```typescript
// Core FSM types
type StateValue = string;
type EventType = string;

interface TransitionDefinition<TContext> {
  from: StateValue | StateValue[];
  to: StateValue;
  event: EventType;
  guards?: Guard<TContext>[];
  actions?: Action<TContext>[];
}

interface Guard<TContext> {
  name: string;
  check: (context: TContext) => boolean | Promise<boolean>;
}

interface Action<TContext> {
  name: string;
  execute: (context: TContext) => void | Promise<void>;
}

interface StateMachineConfig<TContext> {
  id: string;
  initialState: StateValue;
  states: Record<StateValue, StateConfig>;
  transitions: TransitionDefinition<TContext>[];
  context: TContext;
}

interface StateConfig {
  onEntry?: Action<any>[];
  onExit?: Action<any>[];
  meta?: Record<string, any>;
}

interface TransitionResult<TContext> {
  success: boolean;
  fromState: StateValue;
  toState: StateValue;
  event: EventType;
  context: TContext;
  error?: string;
  failedGuards?: string[];
}

// Core FSM class
class FiniteStateMachine<TContext> {
  private config: StateMachineConfig<TContext>;
  private currentState: StateValue;
  private context: TContext;
  private history: StateHistoryEntry[] = [];

  constructor(config: StateMachineConfig<TContext>) {
    this.config = config;
    this.currentState = config.initialState;
    this.context = config.context;
  }

  async transition(event: EventType, eventData?: any): Promise<TransitionResult<TContext>> {
    const transition = this.findTransition(this.currentState, event);

    if (!transition) {
      return {
        success: false,
        fromState: this.currentState,
        toState: this.currentState,
        event,
        context: this.context,
        error: `No transition found for event '${event}' from state '${this.currentState}'`
      };
    }

    // Check guards
    const failedGuards = await this.checkGuards(transition.guards || [], eventData);
    if (failedGuards.length > 0) {
      return {
        success: false,
        fromState: this.currentState,
        toState: this.currentState,
        event,
        context: this.context,
        error: 'Guard check failed',
        failedGuards
      };
    }

    // Execute transition
    const fromState = this.currentState;

    // Exit actions from current state
    await this.executeActions(this.config.states[fromState]?.onExit || []);

    // Transition actions
    await this.executeActions(transition.actions || []);

    // Update state
    this.currentState = transition.to;

    // Entry actions for new state
    await this.executeActions(this.config.states[transition.to]?.onEntry || []);

    // Record history
    this.history.push({
      fromState,
      toState: transition.to,
      event,
      timestamp: new Date(),
      context: { ...this.context }
    });

    return {
      success: true,
      fromState,
      toState: transition.to,
      event,
      context: this.context
    };
  }

  private findTransition(fromState: StateValue, event: EventType): TransitionDefinition<TContext> | undefined {
    return this.config.transitions.find(t => {
      const fromMatches = Array.isArray(t.from)
        ? t.from.includes(fromState)
        : t.from === fromState || t.from === '*';
      const eventMatches = t.event === event;
      return fromMatches && eventMatches;
    });
  }

  private async checkGuards(guards: Guard<TContext>[], eventData?: any): Promise<string[]> {
    const failed: string[] = [];

    for (const guard of guards) {
      const result = await guard.check(this.context);
      if (!result) {
        failed.push(guard.name);
      }
    }

    return failed;
  }

  private async executeActions(actions: Action<TContext>[]): Promise<void> {
    for (const action of actions) {
      await action.execute(this.context);
    }
  }

  getCurrentState(): StateValue {
    return this.currentState;
  }

  getContext(): TContext {
    return { ...this.context };
  }

  getHistory(): StateHistoryEntry[] {
    return [...this.history];
  }

  updateContext(updates: Partial<TContext>): void {
    this.context = { ...this.context, ...updates };
  }

  canTransition(event: EventType): boolean {
    return this.findTransition(this.currentState, event) !== undefined;
  }

  getAvailableTransitions(): Array<{ event: EventType; to: StateValue }> {
    return this.config.transitions
      .filter(t => {
        const fromMatches = Array.isArray(t.from)
          ? t.from.includes(this.currentState)
          : t.from === this.currentState || t.from === '*';
        return fromMatches;
      })
      .map(t => ({ event: t.event, to: t.to }));
  }
}

interface StateHistoryEntry {
  fromState: StateValue;
  toState: StateValue;
  event: EventType;
  timestamp: Date;
  context: any;
}
```

### Issue FSM Implementation Example

```typescript
// Issue state machine configuration
const issueStateMachine = new FiniteStateMachine<IssueContext>({
  id: 'issue-fsm',
  initialState: IssueStatus.TODO,
  context: {
    assigneeId: null,
    worktrees: [],
    commitCount: 0,
    preCheckResults: [],
    approvalCount: 0,
    ciStatus: 'pending',
    hasMergeConflicts: false,
    userPermissions: [],
    blockingDependencies: []
  },
  states: {
    [IssueStatus.TODO]: {
      onEntry: [
        {
          name: 'recordCreation',
          execute: async (ctx) => {
            await issueStateHistoryRepo.create({
              issueId: ctx.issueId,
              fromState: null,
              toState: IssueStatus.TODO,
              event: 'create'
            });
          }
        }
      ]
    },
    [IssueStatus.IN_PROGRESS]: {
      onEntry: [
        {
          name: 'notifyAssignee',
          execute: async (ctx) => {
            await notificationService.send({
              type: 'issue_started',
              recipientId: ctx.assigneeId
            });
          }
        }
      ]
    },
    [IssueStatus.IN_REVIEW]: {
      onEntry: [
        {
          name: 'requestReviewers',
          execute: async (ctx) => {
            await prService.requestReviewers(ctx.pullRequest.id);
          }
        }
      ]
    },
    // ... other states
  },
  transitions: [
    {
      from: IssueStatus.TODO,
      to: IssueStatus.IN_PROGRESS,
      event: 'start_work',
      guards: [
        { name: 'hasAssignee', check: hasAssignee },
        { name: 'noActiveWorktree', check: noActiveWorktree }
      ],
      actions: [
        {
          name: 'createWorktree',
          execute: async (ctx) => {
            const worktree = await worktreeService.create({
              projectId: ctx.projectId,
              issueId: ctx.issueId,
              branch: `feature/${ctx.issueId}`
            });
            ctx.worktrees.push(worktree);
          }
        }
      ]
    },
    {
      from: IssueStatus.IN_PROGRESS,
      to: IssueStatus.IN_REVIEW,
      event: 'submit_for_review',
      guards: [
        { name: 'hasCommits', check: hasCommits },
        { name: 'passesPreChecks', check: passesPreChecks }
      ],
      actions: [
        {
          name: 'createPR',
          execute: async (ctx) => {
            const pr = await prService.create({
              issueId: ctx.issueId,
              branch: ctx.worktrees[0].branch
            });
            ctx.pullRequest = pr;
          }
        }
      ]
    },
    {
      from: IssueStatus.IN_REVIEW,
      to: IssueStatus.MERGED,
      event: 'approve',
      guards: [
        { name: 'hasApprovals', check: hasApprovals(2) },
        { name: 'passesCI', check: passesCI },
        { name: 'noConflicts', check: noConflicts }
      ],
      actions: [
        {
          name: 'mergePR',
          execute: async (ctx) => {
            await prService.merge(ctx.pullRequest.id);
          }
        }
      ]
    },
    // Cancel transition from any state
    {
      from: '*',
      to: IssueStatus.CANCELED,
      event: 'cancel',
      guards: [
        { name: 'hasPermission', check: hasPermission('cancel') }
      ],
      actions: [
        {
          name: 'cleanupResources',
          execute: async (ctx) => {
            // Cleanup worktrees, cancel executions, etc.
            await worktreeService.cleanupAll(ctx.issueId);
            await executionService.cancelAll(ctx.issueId);
          }
        }
      ]
    }
  ]
});
```

### State Persistence Layer

```typescript
interface StateMachineService {
  // Load FSM instance from database
  loadIssueStateMachine(issueId: string): Promise<FiniteStateMachine<IssueContext>>;

  // Save FSM instance to database
  saveIssueStateMachine(issueId: string, fsm: FiniteStateMachine<IssueContext>): Promise<void>;

  // Execute transition with persistence
  transitionIssue(issueId: string, event: EventType, eventData?: any): Promise<TransitionResult<IssueContext>>;
}

class StateMachineServiceImpl implements StateMachineService {
  async loadIssueStateMachine(issueId: string): Promise<FiniteStateMachine<IssueContext>> {
    const issue = await issueRepo.findById(issueId);
    const worktrees = await worktreeRepo.findByIssueId(issueId);
    const context = await this.buildIssueContext(issue, worktrees);

    const config = {
      ...issueStateMachineConfig,
      context
    };

    const fsm = new FiniteStateMachine(config);
    // Restore current state
    fsm.updateContext({ currentState: issue.status });

    return fsm;
  }

  async transitionIssue(
    issueId: string,
    event: EventType,
    eventData?: any
  ): Promise<TransitionResult<IssueContext>> {
    const fsm = await this.loadIssueStateMachine(issueId);
    const result = await fsm.transition(event, eventData);

    if (result.success) {
      // Persist state change
      await issueRepo.update(issueId, { status: result.toState });

      // Record state history
      await issueStateHistoryRepo.create({
        issueId,
        fromState: result.fromState,
        toState: result.toState,
        event,
        context: result.context,
        timestamp: new Date()
      });

      // Publish event to event bus
      await eventBus.publish({
        type: `issue.${event}`,
        payload: {
          issueId,
          fromState: result.fromState,
          toState: result.toState,
          timestamp: new Date()
        }
      });
    }

    return result;
  }

  private async buildIssueContext(issue: Issue, worktrees: Worktree[]): Promise<IssueContext> {
    // Fetch all necessary data to build context
    const commitCount = await gitService.getCommitCount(worktrees[0]?.path);
    const ciStatus = await ciService.getStatus(issue.id);
    // ... fetch other context data

    return {
      assigneeId: issue.assigneeId,
      worktrees,
      commitCount,
      preCheckResults: [],
      approvalCount: 0,
      ciStatus,
      hasMergeConflicts: false,
      userPermissions: [],
      blockingDependencies: []
    };
  }
}
```

---

## XState vs Custom FSM Evaluation

### XState Evaluation

**Pros:**
- Battle-tested, production-ready library
- Built-in visualizer for state charts
- Hierarchical state machines
- Actor model support
- TypeScript support

**Cons:**
- Additional 50KB+ bundle size
- Steeper learning curve for team
- More complex API than needed
- Overkill for our relatively simple state machines
- Requires adapters for event bus integration

### Custom FSM Evaluation

**Pros:**
- Full control and flexibility
- Zero dependencies
- Exactly what we need, nothing more
- Perfect TypeScript integration
- Native event bus integration
- Simpler debugging and testing
- Team can easily understand and extend

**Cons:**
- Need to implement and maintain ourselves
- No built-in visualizer (can build simple one)
- Less features out of the box

### Decision: Custom FSM

**Recommendation: Implement Custom FSM**

Reasons:
1. Our state machines are straightforward and don't require XState's advanced features
2. Custom implementation provides better integration with our event bus architecture
3. Zero external dependencies aligns with project goals
4. Full TypeScript type safety and inference
5. Team members can easily understand, modify, and debug
6. No performance overhead from unused features
7. Can visualize state diagrams in documentation (this file) and generate simple visualizations if needed

---

## Event Bus Integration

### Event Publishing

State transitions automatically publish events to the event bus for distributed consumption.

```typescript
interface StateTransitionEvent {
  type: string; // e.g., 'issue.status_changed', 'execution.started'
  entityType: 'issue' | 'execution' | 'deployment';
  entityId: string;
  fromState: string;
  toState: string;
  event: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Event bus integration in FSM service
class StateMachineServiceImpl {
  async transitionIssue(issueId: string, event: EventType): Promise<TransitionResult<IssueContext>> {
    // ... FSM transition logic ...

    if (result.success) {
      // Publish to event bus
      await this.eventBus.publish({
        type: `issue.${event}`,
        entityType: 'issue',
        entityId: issueId,
        fromState: result.fromState,
        toState: result.toState,
        event,
        timestamp: new Date(),
        metadata: {
          projectId: result.context.projectId,
          // ... additional metadata
        }
      });
    }

    return result;
  }
}
```

### Event Subscribers

Other services can subscribe to state transition events:

```typescript
// Notification service subscribes to issue events
eventBus.subscribe('issue.*', async (event: StateTransitionEvent) => {
  if (event.type === 'issue.approve') {
    await notificationService.notifyMerged(event.entityId);
  }
});

// Deployment service subscribes to merge events
eventBus.subscribe('issue.approve', async (event: StateTransitionEvent) => {
  if (event.toState === IssueStatus.MERGED) {
    await deploymentService.queueDeployment(event.entityId);
  }
});

// Analytics service subscribes to all state changes
eventBus.subscribe('*.status_changed', async (event: StateTransitionEvent) => {
  await analyticsService.recordStateTransition(event);
});
```

---

## Testing Strategy

### Unit Tests

Test individual guards, actions, and transitions in isolation.

```typescript
describe('Issue FSM Guards', () => {
  describe('hasAssignee', () => {
    it('should return true when assigneeId is set', () => {
      const context: IssueContext = {
        assigneeId: 'user-123',
        // ... other fields
      };

      expect(hasAssignee(mockIssue, context)).toBe(true);
    });

    it('should return false when assigneeId is null', () => {
      const context: IssueContext = {
        assigneeId: null,
        // ... other fields
      };

      expect(hasAssignee(mockIssue, context)).toBe(false);
    });
  });

  describe('hasCommits', () => {
    it('should return true when commit count > 0', () => {
      const context: IssueContext = {
        commitCount: 5,
        // ... other fields
      };

      expect(hasCommits(mockIssue, context)).toBe(true);
    });

    it('should return false when commit count is 0', () => {
      const context: IssueContext = {
        commitCount: 0,
        // ... other fields
      };

      expect(hasCommits(mockIssue, context)).toBe(false);
    });
  });
});

describe('Issue FSM Transitions', () => {
  let fsm: FiniteStateMachine<IssueContext>;

  beforeEach(() => {
    fsm = createIssueStateMachine({
      assigneeId: 'user-123',
      worktrees: [],
      commitCount: 0,
      // ... other context
    });
  });

  it('should transition from TODO to IN_PROGRESS on start_work event', async () => {
    const result = await fsm.transition('start_work');

    expect(result.success).toBe(true);
    expect(result.fromState).toBe(IssueStatus.TODO);
    expect(result.toState).toBe(IssueStatus.IN_PROGRESS);
    expect(fsm.getCurrentState()).toBe(IssueStatus.IN_PROGRESS);
  });

  it('should fail transition when guards are not satisfied', async () => {
    fsm.updateContext({ assigneeId: null }); // Remove assignee

    const result = await fsm.transition('start_work');

    expect(result.success).toBe(false);
    expect(result.failedGuards).toContain('hasAssignee');
    expect(fsm.getCurrentState()).toBe(IssueStatus.TODO);
  });

  it('should execute entry actions on state entry', async () => {
    const mockNotify = jest.fn();
    const fsm = createIssueStateMachine({
      // ... context
    }, {
      notifyAssignee: mockNotify
    });

    await fsm.transition('start_work');

    expect(mockNotify).toHaveBeenCalled();
  });
});
```

### Integration Tests

Test complete state transition flows with mocked dependencies.

```typescript
describe('Issue FSM Integration', () => {
  let stateMachineService: StateMachineService;
  let mockEventBus: EventBus;
  let mockIssueRepo: IssueRepository;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockIssueRepo = createMockIssueRepo();
    stateMachineService = new StateMachineServiceImpl(
      mockEventBus,
      mockIssueRepo,
      // ... other dependencies
    );
  });

  it('should complete full issue lifecycle', async () => {
    const issueId = 'issue-123';

    // TODO -> IN_PROGRESS
    await stateMachineService.transitionIssue(issueId, 'start_work');
    expect(mockIssueRepo.findById).toHaveBeenCalledWith(issueId);
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'issue.start_work',
        toState: IssueStatus.IN_PROGRESS
      })
    );

    // IN_PROGRESS -> IN_REVIEW
    await stateMachineService.transitionIssue(issueId, 'submit_for_review');
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'issue.submit_for_review',
        toState: IssueStatus.IN_REVIEW
      })
    );

    // IN_REVIEW -> MERGED
    await stateMachineService.transitionIssue(issueId, 'approve');
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'issue.approve',
        toState: IssueStatus.MERGED
      })
    );

    // MERGED -> DEPLOYED
    await stateMachineService.transitionIssue(issueId, 'deploy');
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'issue.deploy',
        toState: IssueStatus.DEPLOYED
      })
    );
  });

  it('should persist state history', async () => {
    const issueId = 'issue-123';

    await stateMachineService.transitionIssue(issueId, 'start_work');

    const history = await issueStateHistoryRepo.findByIssueId(issueId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      issueId,
      fromState: IssueStatus.TODO,
      toState: IssueStatus.IN_PROGRESS,
      event: 'start_work'
    });
  });
});
```

### State Chart Visualization Tests

Verify that all states are reachable and no invalid transitions exist.

```typescript
describe('Issue FSM State Chart', () => {
  it('should have all states reachable from initial state', () => {
    const reachableStates = calculateReachableStates(issueStateMachineConfig);
    const allStates = Object.values(IssueStatus);

    expect(reachableStates).toEqual(expect.arrayContaining(allStates));
  });

  it('should have no invalid transitions', () => {
    const invalidTransitions = findInvalidTransitions(issueStateMachineConfig);

    expect(invalidTransitions).toHaveLength(0);
  });

  it('should have all states in enum defined in config', () => {
    const configuredStates = Object.keys(issueStateMachineConfig.states);
    const enumStates = Object.values(IssueStatus);

    expect(configuredStates.sort()).toEqual(enumStates.sort());
  });
});

// Helper function to calculate reachable states
function calculateReachableStates(config: StateMachineConfig<any>): string[] {
  const reachable = new Set<string>([config.initialState]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const transition of config.transitions) {
      const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from];
      for (const from of fromStates) {
        if (from === '*' || reachable.has(from)) {
          if (!reachable.has(transition.to)) {
            reachable.add(transition.to);
            changed = true;
          }
        }
      }
    }
  }

  return Array.from(reachable);
}
```

### Property-Based Tests

Use property-based testing to verify FSM invariants.

```typescript
import { fc } from 'fast-check';

describe('Issue FSM Property-Based Tests', () => {
  it('should maintain valid state after any sequence of events', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...Object.values(IssueEvents)), { maxLength: 20 }),
        async (events) => {
          const fsm = createIssueStateMachine({ /* initial context */ });

          for (const event of events) {
            await fsm.transition(event);
          }

          // State should always be valid
          const currentState = fsm.getCurrentState();
          expect(Object.values(IssueStatus)).toContain(currentState);
        }
      )
    );
  });

  it('should maintain context consistency', () => {
    fc.assert(
      fc.property(
        fc.record({
          assigneeId: fc.option(fc.string()),
          commitCount: fc.nat(),
          approvalCount: fc.nat()
        }),
        async (initialContext) => {
          const fsm = createIssueStateMachine(initialContext);

          await fsm.transition('start_work');

          const context = fsm.getContext();

          // Context values should never be negative
          expect(context.commitCount).toBeGreaterThanOrEqual(0);
          expect(context.approvalCount).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });
});
```

---

## State Transition Matrix

### Issue State Transition Matrix

| From \ To | TODO | IN_PROGRESS | BLOCKED | IN_REVIEW | MERGED | DEPLOYED | REJECTED | CANCELED |
|-----------|------|-------------|---------|-----------|--------|----------|----------|----------|
| **TODO** | - | start_work | - | - | - | - | - | cancel |
| **IN_PROGRESS** | - | - | block | submit_for_review | - | - | - | cancel |
| **BLOCKED** | - | unblock | - | - | - | - | - | cancel |
| **IN_REVIEW** | - | request_changes | - | - | approve | - | reject | cancel |
| **MERGED** | - | - | - | - | - | deploy | - | cancel* |
| **DEPLOYED** | - | - | - | - | - | - | - | - |
| **REJECTED** | reopen | - | - | - | - | - | - | - |
| **CANCELED** | - | - | - | - | - | - | - | - |

*Cancel from MERGED only if not deployed

### Agent Execution State Transition Matrix

| From \ To | PENDING | RUNNING | COMPLETED | FAILED | TIMEOUT | CANCELLED |
|-----------|---------|---------|-----------|--------|---------|-----------|
| **PENDING** | - | execute | - | - | - | cancel |
| **RUNNING** | - | - | complete | fail | timeout | cancel |
| **COMPLETED** | - | - | - | - | - | - |
| **FAILED** | retry | - | - | - | - | - |
| **TIMEOUT** | - | - | - | - | - | - |
| **CANCELLED** | - | - | - | - | - | - |

---

## State History Schema

For implementing Task 12.2 (IssueStateHistory table), here's the recommended schema:

```prisma
model IssueStateHistory {
  id          String   @id @default(cuid())
  issueId     String
  fromState   String?  // null for initial state
  toState     String
  event       String
  context     String?  // JSON serialized context
  triggeredBy String?  // User ID or system identifier
  timestamp   DateTime @default(now())

  // Relations
  issue Issue @relation(fields: [issueId], references: [id], onDelete: Cascade)

  @@index([issueId])
  @@index([timestamp])
  @@index([toState])
  @@map("issue_state_history")
}

model ExecutionStateHistory {
  id          String   @id @default(cuid())
  executionId String
  fromState   String?
  toState     String
  event       String
  context     String?  // JSON serialized context
  timestamp   DateTime @default(now())

  // Relations
  execution AgentExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  @@index([executionId])
  @@index([timestamp])
  @@map("execution_state_history")
}
```

---

## Next Steps

### Task 12.2: Implement IssueStateHistory Schema
- Add Prisma schema for state history tables
- Create migration
- Implement repository methods

### Task 12.3: Implement Event Bus Architecture
- Design pluggable event bus interface
- Implement in-memory event bus for development
- Add Redis/Kafka adapter support

### Task 12.4: Integrate with Fastify Hooks
- Add Fastify lifecycle hooks
- Connect state transitions to HTTP endpoints
- Add middleware for state validation

### Task 12.5: Implement Event Sourcing Pattern
- Store all state transitions in history
- Add replay capability
- Implement projection rebuilding

### Task 12.6: Implement Saga Pattern
- Define compensation transactions
- Implement saga orchestrator
- Add rollback capabilities

### Task 12.7: Implement Retry and DLQ
- Add exponential backoff retry logic
- Implement dead letter queue
- Add retry metrics

### Task 12.8: Add Monitoring and Metrics
- Track state transition counts
- Monitor transition latency
- Alert on invalid transitions

---

## References

- **State Machine Pattern**: [Wikipedia - Finite State Machine](https://en.wikipedia.org/wiki/Finite-state_machine)
- **Event Sourcing**: [Martin Fowler - Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- **Saga Pattern**: [Microservices.io - Saga](https://microservices.io/patterns/data/saga.html)
- **XState**: [XState Documentation](https://xstate.js.org/docs/)

---

**Document Status**: ✅ Complete
**Next Task**: 12.2 - IssueStateHistory Table Implementation
**Approved By**: [Pending Review]
