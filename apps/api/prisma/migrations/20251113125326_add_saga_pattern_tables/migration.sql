-- CreateTable
CREATE TABLE "saga_instances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "patternType" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "stepStates" TEXT NOT NULL,
    "completedSteps" TEXT NOT NULL,
    "failedSteps" TEXT NOT NULL,
    "compensatedSteps" TEXT NOT NULL,
    "error" TEXT,
    "metadata" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "saga_instances_type_idx" ON "saga_instances"("type");

-- CreateIndex
CREATE INDEX "saga_instances_status_idx" ON "saga_instances"("status");

-- CreateIndex
CREATE INDEX "saga_instances_startedAt_idx" ON "saga_instances"("startedAt");

-- CreateIndex
CREATE INDEX "saga_instances_type_status_idx" ON "saga_instances"("type", "status");
