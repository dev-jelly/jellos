-- Configure SQLite WAL mode for better performance with concurrent reads/writes
-- Note: WAL2 requires SQLite 3.42.0+, falling back to WAL for compatibility
PRAGMA journal_mode=WAL;

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "localPath" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "issues_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "worktrees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "issueId" TEXT,
    "path" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "worktrees_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "worktrees_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "code_agent_runtimes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "externalId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cmd" TEXT NOT NULL,
    "args" TEXT NOT NULL,
    "envMask" TEXT NOT NULL,
    "version" TEXT,
    "path" TEXT,
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastChecked" DATETIME,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "discoveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "code_agent_runtimes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "external_issue_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT NOT NULL,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_issue_links_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "issue_comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_comments_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_localPath_key" ON "projects"("localPath");

-- CreateIndex
CREATE INDEX "issues_projectId_idx" ON "issues"("projectId");

-- CreateIndex
CREATE INDEX "issues_status_idx" ON "issues"("status");

-- CreateIndex
CREATE UNIQUE INDEX "worktrees_branch_key" ON "worktrees"("branch");

-- CreateIndex
CREATE INDEX "worktrees_projectId_idx" ON "worktrees"("projectId");

-- CreateIndex
CREATE INDEX "worktrees_issueId_idx" ON "worktrees"("issueId");

-- CreateIndex
CREATE INDEX "code_agent_runtimes_projectId_idx" ON "code_agent_runtimes"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "code_agent_runtimes_projectId_externalId_key" ON "code_agent_runtimes"("projectId", "externalId");

-- CreateIndex
CREATE INDEX "external_issue_links_externalId_idx" ON "external_issue_links"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "external_issue_links_issueId_provider_key" ON "external_issue_links"("issueId", "provider");

-- CreateIndex
CREATE INDEX "issue_comments_issueId_idx" ON "issue_comments"("issueId");
