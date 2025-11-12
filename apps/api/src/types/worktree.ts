/**
 * Worktree types and enums
 */

/**
 * Worktree status enum
 * Matches the status field in the Prisma schema
 */
export enum WorktreeStatus {
  ACTIVE = 'ACTIVE',   // Worktree is active and in use
  STALE = 'STALE',     // Worktree has not been used for a while
  DIRTY = 'DIRTY',     // Worktree has uncommitted changes
  REMOVED = 'REMOVED', // Worktree has been removed
}

/**
 * Helper to check if a string is a valid WorktreeStatus
 */
export function isValidWorktreeStatus(status: string): status is WorktreeStatus {
  return Object.values(WorktreeStatus).includes(status as WorktreeStatus);
}

/**
 * Convert string to WorktreeStatus
 */
export function toWorktreeStatus(status: string): WorktreeStatus {
  if (isValidWorktreeStatus(status)) {
    return status;
  }
  return WorktreeStatus.ACTIVE; // Default
}
