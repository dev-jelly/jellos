-- CreateTable
CREATE TABLE "agent_executions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "projectId" TEXT,
    "issueId" TEXT,
    "worktreePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processId" INTEGER,
    "exitCode" INTEGER,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "lastHeartbeat" DATETIME,
    "context" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "agent_executions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "code_agent_runtimes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "agent_executions_agentId_idx" ON "agent_executions"("agentId");

-- CreateIndex
CREATE INDEX "agent_executions_status_idx" ON "agent_executions"("status");

-- CreateIndex
CREATE INDEX "agent_executions_projectId_idx" ON "agent_executions"("projectId");
