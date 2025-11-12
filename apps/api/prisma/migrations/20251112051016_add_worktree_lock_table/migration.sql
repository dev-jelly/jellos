-- CreateTable
CREATE TABLE "worktree_locks" (
    "resourceId" TEXT NOT NULL PRIMARY KEY,
    "lockId" TEXT NOT NULL,
    "processId" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL
);
