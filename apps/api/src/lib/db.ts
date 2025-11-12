import { PrismaClient } from '@prisma/client';

// PrismaClient singleton pattern to avoid multiple instances
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Type exports for convenience
export type {
  Project,
  Issue,
  Worktree,
  CodeAgentRuntime,
  AgentExecution,
  ExternalIssueLink,
  IssueComment,
} from '@prisma/client';
