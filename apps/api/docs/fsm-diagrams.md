# FSM State Diagrams - Visual Reference

This document provides ASCII and Mermaid diagrams for visualizing the state machines.

## Issue State Machine

### Mermaid Diagram

```mermaid
stateDiagram-v2
    [*] --> TODO

    TODO --> IN_PROGRESS : start_work
    TODO --> CANCELED : cancel

    IN_PROGRESS --> BLOCKED : block
    IN_PROGRESS --> IN_REVIEW : submit_for_review
    IN_PROGRESS --> CANCELED : cancel

    BLOCKED --> IN_PROGRESS : unblock
    BLOCKED --> CANCELED : cancel

    IN_REVIEW --> IN_PROGRESS : request_changes
    IN_REVIEW --> MERGED : approve
    IN_REVIEW --> REJECTED : reject
    IN_REVIEW --> CANCELED : cancel

    MERGED --> DEPLOYED : deploy
    MERGED --> CANCELED : cancel (if not deployed)

    REJECTED --> TODO : reopen

    DEPLOYED --> [*]
    REJECTED --> [*]
    CANCELED --> [*]

    note right of TODO
        Initial state
        Task created
    end note

    note right of IN_PROGRESS
        Active development
        Worktree created
    end note

    note right of IN_REVIEW
        PR submitted
        Awaiting approval
    end note

    note right of MERGED
        PR merged
        Awaiting deployment
    end note

    note right of DEPLOYED
        Final state
        Changes live
    end note
```

### ASCII Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                      ISSUE LIFECYCLE FSM                          │
└──────────────────────────────────────────────────────────────────┘

                        ╔════════╗
                        ║  TODO  ║ (Initial State)
                        ╚═══╤════╝
                            │ start_work [hasAssignee && noActiveWorktree]
                            ▼
                    ┌───────────────┐
                    │  IN_PROGRESS  │◄─────┐
                    └───┬───────┬───┘      │
                        │       │          │ unblock
              submit_   │       │ block    │ [blockingReasonResolved]
              for_review│       │          │
              [hasCommits]      │          │
                        │       ▼          │
                        │   ┌─────────┐    │
                        │   │ BLOCKED │────┘
                        │   └─────────┘
                        │
                        ▼
                  ┌───────────┐
                  │ IN_REVIEW │
                  └─┬───┬───┬─┘
                    │   │   │
    request_changes │   │   │ reject
                    │   │   │
                    ▼   │   ▼
              ┌─────────┐ ┌──────────┐
              │IN_PROGRESS│ │ REJECTED │ (Final)
              └─────────┘ └────┬─────┘
                              │ reopen
                    approve   │ [hasPermission]
                    [hasApprovals &&│
                     passesCI &&    │
                     noConflicts]   │
                              │     │
                    ┌─────────┐     │
                    │ MERGED  │     │
                    └────┬────┘     │
                         │          │
                         │ deploy   │
                         │ [hasDeployment]
                         ▼          ▼
                    ┌──────────┐ ┌──────┐
                    │ DEPLOYED │ │ TODO │
                    └──────────┘ └──────┘
                    (Final)

    Special Transitions:
    ANY_STATE ──cancel [hasPermission]──> CANCELED (Final)
```

## Agent Execution State Machine

### Mermaid Diagram

```mermaid
stateDiagram-v2
    [*] --> PENDING

    PENDING --> RUNNING : execute
    PENDING --> CANCELLED : cancel

    RUNNING --> COMPLETED : complete (exit 0)
    RUNNING --> FAILED : fail (exit != 0)
    RUNNING --> TIMEOUT : timeout
    RUNNING --> CANCELLED : cancel

    FAILED --> PENDING : retry

    COMPLETED --> [*]
    FAILED --> [*]
    TIMEOUT --> [*]
    CANCELLED --> [*]

    note right of PENDING
        Queued
        Waiting to execute
    end note

    note right of RUNNING
        Executing
        Heartbeat active
    end note

    note right of COMPLETED
        Success
        Exit code 0
    end note

    note right of FAILED
        Error
        May be retried
    end note

    note right of TIMEOUT
        Exceeded timeout
        Process killed
    end note
```

### ASCII Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                  AGENT EXECUTION LIFECYCLE FSM                    │
└──────────────────────────────────────────────────────────────────┘

                        ╔═════════╗
                        ║ PENDING ║ (Initial)
                        ╚════╤════╝
                             │ execute
                             │ [agentAvailable && resourcesAvailable]
                             ▼
                     ┌───────────────┐
                     │    RUNNING    │
                     └───┬───┬───┬───┘
                         │   │   │
        complete         │   │   │ timeout
        [exitCode=0]     │   │   │ [exceeded deadline]
                         │   │   │
                         │   │   ▼
                         │   │  ┌─────────┐
                         │   │  │ TIMEOUT │ (Final)
                         │   │  └─────────┘
                         │   │
                         │   │ cancel
                         │   │ [user/system request]
                         │   │
                         │   ▼
                         │  ┌───────────┐
                         │  │ CANCELLED │ (Final)
                         │  └───────────┘
                         │
                         │ fail
                         │ [exitCode!=0]
                         ▼
                    ┌────────┐
                    │ FAILED │◄────┐
                    └───┬────┘     │
                        │          │
                        │ retry    │ fail again
                        │ [retriesRemaining && isRetryable]
                        │          │
                        ▼          │
                   ┌─────────┐     │
                   │ PENDING │─────┘
                   └─────────┘
                        │
                        │ max retries exhausted
                        ▼
                   ┌────────┐
                   │ FAILED │ (Final)
                   └────────┘

    Success Path:
    PENDING --> RUNNING --> COMPLETED (Final)
```

## Deployment State Machine (Future)

### Mermaid Diagram

```mermaid
stateDiagram-v2
    [*] --> QUEUED

    QUEUED --> DEPLOYING : start
    QUEUED --> CANCELLED : cancel

    DEPLOYING --> DEPLOYED : complete
    DEPLOYING --> FAILED : fail
    DEPLOYING --> CANCELLED : cancel

    FAILED --> QUEUED : retry
    FAILED --> ROLLED_BACK : rollback

    DEPLOYED --> ROLLED_BACK : rollback

    DEPLOYED --> [*]
    ROLLED_BACK --> [*]
    CANCELLED --> [*]

    note right of QUEUED
        Waiting to deploy
        In deployment queue
    end note

    note right of DEPLOYING
        Deployment in progress
        CI/CD pipeline running
    end note

    note right of DEPLOYED
        Successfully deployed
        Live in production
    end note

    note right of FAILED
        Deployment failed
        Can retry or rollback
    end note
```

### ASCII Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                   DEPLOYMENT LIFECYCLE FSM                        │
└──────────────────────────────────────────────────────────────────┘

                        ╔════════╗
                        ║ QUEUED ║ (Initial)
                        ╚═══╤════╝
                            │ start
                            │ [hasPermission && environmentReady]
                            ▼
                    ┌──────────────┐
                    │  DEPLOYING   │
                    └───┬──────┬───┘
                        │      │
          complete      │      │ fail
          [success]     │      │ [deploymentFailed]
                        │      │
                        ▼      ▼
                  ┌──────────┐ ┌────────┐
                  │ DEPLOYED │ │ FAILED │
                  └────┬─────┘ └───┬────┘
                       │           │
                       │           │ retry
                       │           │ [retriesRemaining]
                       │           │
                       │           ▼
                       │      ┌────────┐
                       │      │ QUEUED │
                       │      └────────┘
                       │
                       │ rollback     │ rollback
                       │ [incident]   │ [cannotRecover]
                       │              │
                       ▼              ▼
                  ┌──────────────────────┐
                  │    ROLLED_BACK       │ (Final)
                  └──────────────────────┘
```

## State Transition Complexity

### Issue State Machine Statistics

- **Total States**: 8 (TODO, IN_PROGRESS, BLOCKED, IN_REVIEW, MERGED, DEPLOYED, REJECTED, CANCELED)
- **Total Transitions**: 13
- **Initial State**: TODO
- **Final States**: 3 (DEPLOYED, REJECTED, CANCELED)
- **Maximum Depth**: 5 (TODO → IN_PROGRESS → IN_REVIEW → MERGED → DEPLOYED)
- **Branching Factor**: 2-3 from most states

### Agent Execution State Machine Statistics

- **Total States**: 6 (PENDING, RUNNING, COMPLETED, FAILED, TIMEOUT, CANCELLED)
- **Total Transitions**: 8
- **Initial State**: PENDING
- **Final States**: 4 (COMPLETED, FAILED, TIMEOUT, CANCELLED)
- **Maximum Depth**: 3 with retry loop
- **Branching Factor**: 4 from RUNNING state

## Guard and Action Summary

### Issue Guards (11 total)

1. `hasAssignee` - Checks if issue has an assigned user
2. `noActiveWorktree` - Ensures no active worktree exists
3. `hasCommits` - Verifies commits exist in worktree
4. `passesPreChecks` - Validates linting, tests pass
5. `hasApprovals(n)` - Checks for minimum approvals
6. `passesCI` - Verifies CI status is success
7. `noConflicts` - Checks for merge conflicts
8. `hasPermission(action)` - Validates user permissions
9. `blockingReasonResolved` - Checks if blockers cleared
10. `hasBlockingReason` - Validates blocking reason exists
11. `hasDeployment` - Checks deployment exists and succeeded

### Issue Actions (15 total)

1. `createWorktree()` - Create git worktree for issue
2. `notifyAssignee()` - Send notification to assignee
3. `pauseTimer()` - Pause time tracking
4. `resumeTimer()` - Resume time tracking
5. `notifyStakeholders()` - Notify relevant parties
6. `createPR()` - Create pull request
7. `requestReviewers()` - Request PR reviewers
8. `mergePR()` - Merge pull request
9. `notifyTeam()` - Notify team of merge
10. `notifyAuthor()` - Notify PR author
11. `archiveWorktree()` - Archive worktree
12. `recordDeployment()` - Record deployment metadata
13. `cleanupResources()` - Cleanup all resources
14. `cancelExecutions()` - Cancel running executions
15. `resetState()` - Reset issue state

### Execution Guards (4 total)

1. `agentAvailable` - Agent healthy and enabled
2. `resourcesAvailable` - Memory and concurrency limits
3. `isRetryable` - Error type allows retry
4. `retriesRemaining` - Retry count under max

### Execution Actions (6 total)

1. `spawnProcess()` - Start agent process
2. `startHeartbeat()` - Begin heartbeat monitoring
3. `stopHeartbeat()` - Stop heartbeat monitoring
4. `collectGitMetadata()` - Collect git stats
5. `killProcess()` - Terminate process
6. `cleanupResources()` - Cleanup execution resources

## Visualization Tools

### Recommended Tools for Visualizing FSMs

1. **Mermaid Live Editor**: https://mermaid.live
   - Paste the Mermaid diagrams above
   - Export as PNG/SVG

2. **Draw.io**: https://app.diagrams.net
   - Import Mermaid or draw custom diagrams
   - Great for presentations

3. **PlantUML**: https://plantuml.com
   - State diagram syntax support
   - Can be integrated into docs

4. **GraphViz**: https://graphviz.org
   - DOT language for graphs
   - Programmatic generation

### Generating Diagrams from Code

For runtime visualization, we can implement a simple FSM visualizer:

```typescript
class FSMVisualizer {
  static generateMermaidDiagram(config: StateMachineConfig<any>): string {
    let diagram = 'stateDiagram-v2\n';
    diagram += `    [*] --> ${config.initialState}\n\n`;

    for (const transition of config.transitions) {
      const fromStates = Array.isArray(transition.from)
        ? transition.from
        : [transition.from];

      for (const from of fromStates) {
        if (from === '*') {
          // Handle wildcard transitions
          for (const state of Object.keys(config.states)) {
            if (state !== transition.to) {
              diagram += `    ${state} --> ${transition.to} : ${transition.event}\n`;
            }
          }
        } else {
          diagram += `    ${from} --> ${transition.to} : ${transition.event}\n`;
        }
      }
    }

    return diagram;
  }

  static generateASCIIDiagram(config: StateMachineConfig<any>): string {
    // Simple ASCII representation
    let diagram = 'State Machine Diagram:\n\n';
    diagram += `Initial State: ${config.initialState}\n\n`;
    diagram += 'Transitions:\n';

    for (const transition of config.transitions) {
      const from = Array.isArray(transition.from)
        ? transition.from.join('|')
        : transition.from;
      diagram += `  ${from} --[${transition.event}]--> ${transition.to}\n`;
    }

    return diagram;
  }
}

// Usage
const mermaidDiagram = FSMVisualizer.generateMermaidDiagram(issueStateMachineConfig);
console.log(mermaidDiagram);
```

## Testing Visualizations

For test reports, we can generate visual representations of test coverage:

```typescript
class FSMTestCoverageVisualizer {
  static generateCoverageReport(
    config: StateMachineConfig<any>,
    testResults: TestResult[]
  ): string {
    const testedTransitions = new Set(
      testResults.map(r => `${r.from}->${r.to}`)
    );

    let report = '# FSM Test Coverage Report\n\n';
    report += '## Transition Coverage\n\n';
    report += '| From | To | Event | Tested |\n';
    report += '|------|----|----|--------|\n';

    for (const transition of config.transitions) {
      const fromStates = Array.isArray(transition.from)
        ? transition.from
        : [transition.from];

      for (const from of fromStates) {
        const key = `${from}->${transition.to}`;
        const tested = testedTransitions.has(key) ? '✅' : '❌';
        report += `| ${from} | ${transition.to} | ${transition.event} | ${tested} |\n`;
      }
    }

    const coverage = (testedTransitions.size / config.transitions.length) * 100;
    report += `\n**Coverage**: ${coverage.toFixed(1)}%\n`;

    return report;
  }
}
```

---

**Document Status**: ✅ Complete
**Related**: fsm-design.md
**Usage**: Reference these diagrams when implementing state machines
