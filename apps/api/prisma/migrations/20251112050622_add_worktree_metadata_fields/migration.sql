/*
  Warnings:

  - Added the required column `updatedAt` to the `worktrees` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_worktrees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "issueId" TEXT,
    "path" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastActivity" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "worktrees_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "worktrees_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_worktrees" ("branch", "createdAt", "id", "issueId", "path", "projectId", "status", "updatedAt") SELECT "branch", "createdAt", "id", "issueId", "path", "projectId", "status", CURRENT_TIMESTAMP FROM "worktrees";
DROP TABLE "worktrees";
ALTER TABLE "new_worktrees" RENAME TO "worktrees";
CREATE UNIQUE INDEX "worktrees_branch_key" ON "worktrees"("branch");
CREATE INDEX "worktrees_projectId_idx" ON "worktrees"("projectId");
CREATE INDEX "worktrees_issueId_idx" ON "worktrees"("issueId");
CREATE INDEX "worktrees_status_idx" ON "worktrees"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
