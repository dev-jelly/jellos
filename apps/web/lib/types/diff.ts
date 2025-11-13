/**
 * Diff Type Definitions
 * Matches backend GitDiffParserService types
 */

export interface FileDiff {
  path: string;
  oldPath?: string; // For renamed files
  changeType: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';
  hunks: DiffHunk[];
  binary: boolean;
  additions: number;
  deletions: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  header: string;
}

export interface DiffLine {
  type: 'context' | 'addition' | 'deletion';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface ParsedDiff {
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
}

export interface DiffOptions {
  cwd: string;
  base?: string; // Base ref (branch, commit, tag)
  compare?: string; // Compare ref (branch, commit, tag)
  staged?: boolean; // Show staged changes only
  contextLines?: number; // Number of context lines (default 3)
}
