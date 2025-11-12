-- AlterTable
ALTER TABLE "agent_executions" ADD COLUMN "filesChanged" INTEGER;
ALTER TABLE "agent_executions" ADD COLUMN "gitBranch" TEXT;
ALTER TABLE "agent_executions" ADD COLUMN "gitCommitHash" TEXT;
ALTER TABLE "agent_executions" ADD COLUMN "gitCommitMsg" TEXT;
ALTER TABLE "agent_executions" ADD COLUMN "gitDiff" TEXT;
ALTER TABLE "agent_executions" ADD COLUMN "linesAdded" INTEGER;
ALTER TABLE "agent_executions" ADD COLUMN "linesDeleted" INTEGER;

-- CreateIndex
CREATE INDEX "agent_executions_gitCommitHash_idx" ON "agent_executions"("gitCommitHash");
