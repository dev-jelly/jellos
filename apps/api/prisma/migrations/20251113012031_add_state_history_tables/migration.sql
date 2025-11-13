-- CreateTable
CREATE TABLE "issue_pr_mappings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "prUrl" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "closedAt" DATETIME
);

-- CreateTable
CREATE TABLE "issue_state_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "context" TEXT,
    "triggeredBy" TEXT,
    "reason" TEXT,
    "metadata" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_state_history_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "execution_state_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "context" TEXT,
    "reason" TEXT,
    "metadata" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "execution_state_history_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "agent_executions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "issue_pr_mappings_issueId_idx" ON "issue_pr_mappings"("issueId");

-- CreateIndex
CREATE INDEX "issue_pr_mappings_projectId_idx" ON "issue_pr_mappings"("projectId");

-- CreateIndex
CREATE INDEX "issue_pr_mappings_branchName_idx" ON "issue_pr_mappings"("branchName");

-- CreateIndex
CREATE INDEX "issue_pr_mappings_state_idx" ON "issue_pr_mappings"("state");

-- CreateIndex
CREATE UNIQUE INDEX "issue_pr_mappings_issueId_prNumber_key" ON "issue_pr_mappings"("issueId", "prNumber");

-- CreateIndex
CREATE UNIQUE INDEX "issue_pr_mappings_projectId_branchName_state_key" ON "issue_pr_mappings"("projectId", "branchName", "state");

-- CreateIndex
CREATE INDEX "issue_state_history_issueId_idx" ON "issue_state_history"("issueId");

-- CreateIndex
CREATE INDEX "issue_state_history_timestamp_idx" ON "issue_state_history"("timestamp");

-- CreateIndex
CREATE INDEX "issue_state_history_toState_idx" ON "issue_state_history"("toState");

-- CreateIndex
CREATE INDEX "issue_state_history_issueId_timestamp_idx" ON "issue_state_history"("issueId", "timestamp");

-- CreateIndex
CREATE INDEX "execution_state_history_executionId_idx" ON "execution_state_history"("executionId");

-- CreateIndex
CREATE INDEX "execution_state_history_timestamp_idx" ON "execution_state_history"("timestamp");

-- CreateIndex
CREATE INDEX "execution_state_history_toState_idx" ON "execution_state_history"("toState");

-- CreateIndex
CREATE INDEX "execution_state_history_executionId_timestamp_idx" ON "execution_state_history"("executionId", "timestamp");
