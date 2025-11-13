-- CreateTable
CREATE TABLE "issue_state_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "lastSequenceNumber" INTEGER NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "execution_state_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "lastSequenceNumber" INTEGER NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_execution_state_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "context" TEXT,
    "reason" TEXT,
    "metadata" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "correlationId" TEXT,
    "causationId" TEXT,
    "sequenceNumber" INTEGER,
    "persistedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "execution_state_history_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "agent_executions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_execution_state_history" ("context", "event", "executionId", "fromState", "id", "metadata", "reason", "timestamp", "toState") SELECT "context", "event", "executionId", "fromState", "id", "metadata", "reason", "timestamp", "toState" FROM "execution_state_history";
DROP TABLE "execution_state_history";
ALTER TABLE "new_execution_state_history" RENAME TO "execution_state_history";
CREATE UNIQUE INDEX "execution_state_history_eventId_key" ON "execution_state_history"("eventId");
CREATE INDEX "execution_state_history_executionId_idx" ON "execution_state_history"("executionId");
CREATE INDEX "execution_state_history_timestamp_idx" ON "execution_state_history"("timestamp");
CREATE INDEX "execution_state_history_toState_idx" ON "execution_state_history"("toState");
CREATE INDEX "execution_state_history_executionId_timestamp_idx" ON "execution_state_history"("executionId", "timestamp");
CREATE INDEX "execution_state_history_eventId_idx" ON "execution_state_history"("eventId");
CREATE INDEX "execution_state_history_correlationId_idx" ON "execution_state_history"("correlationId");
CREATE INDEX "execution_state_history_executionId_sequenceNumber_idx" ON "execution_state_history"("executionId", "sequenceNumber");
CREATE TABLE "new_issue_state_history" (
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
    "eventId" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "correlationId" TEXT,
    "causationId" TEXT,
    "sequenceNumber" INTEGER,
    "persistedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_state_history_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_issue_state_history" ("context", "event", "fromState", "id", "issueId", "metadata", "reason", "timestamp", "toState", "triggeredBy") SELECT "context", "event", "fromState", "id", "issueId", "metadata", "reason", "timestamp", "toState", "triggeredBy" FROM "issue_state_history";
DROP TABLE "issue_state_history";
ALTER TABLE "new_issue_state_history" RENAME TO "issue_state_history";
CREATE UNIQUE INDEX "issue_state_history_eventId_key" ON "issue_state_history"("eventId");
CREATE INDEX "issue_state_history_issueId_idx" ON "issue_state_history"("issueId");
CREATE INDEX "issue_state_history_timestamp_idx" ON "issue_state_history"("timestamp");
CREATE INDEX "issue_state_history_toState_idx" ON "issue_state_history"("toState");
CREATE INDEX "issue_state_history_issueId_timestamp_idx" ON "issue_state_history"("issueId", "timestamp");
CREATE INDEX "issue_state_history_eventId_idx" ON "issue_state_history"("eventId");
CREATE INDEX "issue_state_history_correlationId_idx" ON "issue_state_history"("correlationId");
CREATE INDEX "issue_state_history_issueId_sequenceNumber_idx" ON "issue_state_history"("issueId", "sequenceNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "issue_state_snapshots_issueId_idx" ON "issue_state_snapshots"("issueId");

-- CreateIndex
CREATE INDEX "issue_state_snapshots_issueId_lastSequenceNumber_idx" ON "issue_state_snapshots"("issueId", "lastSequenceNumber");

-- CreateIndex
CREATE INDEX "execution_state_snapshots_executionId_idx" ON "execution_state_snapshots"("executionId");

-- CreateIndex
CREATE INDEX "execution_state_snapshots_executionId_lastSequenceNumber_idx" ON "execution_state_snapshots"("executionId", "lastSequenceNumber");
