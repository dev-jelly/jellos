/**
 * Git Diff Parser Service
 * Parses git diff output into structured JSON format
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

/**
 * Git Diff Parser Service
 */
export class GitDiffParserService {
  /**
   * Get and parse git diff
   */
  public async getParsedDiff(options: DiffOptions): Promise<ParsedDiff> {
    const diffText = await this.getRawDiff(options);
    return this.parseDiff(diffText);
  }

  /**
   * Get raw git diff text
   */
  private async getRawDiff(options: DiffOptions): Promise<string> {
    const { cwd, base, compare, staged, contextLines = 3 } = options;

    let command = 'git diff';

    // Add context lines
    command += ` -U${contextLines}`;

    // Handle different diff types
    if (staged) {
      command += ' --cached';
    } else if (base && compare) {
      // Branch/commit comparison
      command += ` ${base}...${compare}`;
    } else if (base) {
      // Compare against single ref
      command += ` ${base}`;
    }
    // else: working tree changes (default)

    try {
      const { stdout } = await execAsync(command, {
        cwd,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
      });
      return stdout;
    } catch (error: any) {
      // Handle "no changes" gracefully
      if (error.code === 1 && !error.stdout && !error.stderr) {
        return '';
      }
      throw new Error(`Failed to get git diff: ${error.message}`);
    }
  }

  /**
   * Parse git diff text into structured format
   */
  public parseDiff(diffText: string): ParsedDiff {
    if (!diffText.trim()) {
      return {
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        totalFiles: 0,
      };
    }

    const files: FileDiff[] = [];
    const lines = diffText.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Start of a new file diff
      if (line.startsWith('diff --git')) {
        const fileDiff = this.parseFileDiff(lines, i);
        if (fileDiff) {
          files.push(fileDiff.file);
          i = fileDiff.nextIndex;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }

    // Calculate totals
    const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

    return {
      files,
      totalAdditions,
      totalDeletions,
      totalFiles: files.length,
    };
  }

  /**
   * Parse a single file diff section
   */
  private parseFileDiff(
    lines: string[],
    startIndex: number
  ): { file: FileDiff; nextIndex: number } | null {
    let i = startIndex;
    const diffLine = lines[i]; // diff --git a/... b/...

    // Extract file paths from diff line
    const match = diffLine.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    if (!match) {
      return null;
    }

    const oldPath = match[1];
    const newPath = match[2];
    let changeType: FileDiff['changeType'] = 'modified';
    let binary = false;
    let path = newPath;

    i++;

    // Parse file metadata (index, mode, etc.)
    while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
      const line = lines[i];

      if (line.startsWith('new file mode')) {
        changeType = 'added';
      } else if (line.startsWith('deleted file mode')) {
        changeType = 'deleted';
        path = oldPath;
      } else if (line.startsWith('rename from')) {
        changeType = 'renamed';
      } else if (line.startsWith('copy from')) {
        changeType = 'copied';
      } else if (line.includes('Binary files')) {
        binary = true;
      }

      i++;
    }

    // Parse hunks
    const hunks: DiffHunk[] = [];
    let additions = 0;
    let deletions = 0;

    while (i < lines.length && lines[i].startsWith('@@')) {
      const hunk = this.parseHunk(lines, i);
      if (hunk) {
        hunks.push(hunk.hunk);
        additions += hunk.additions;
        deletions += hunk.deletions;
        i = hunk.nextIndex;
      } else {
        break;
      }
    }

    const fileDiff: FileDiff = {
      path,
      oldPath: changeType === 'renamed' || changeType === 'copied' ? oldPath : undefined,
      changeType,
      hunks,
      binary,
      additions,
      deletions,
    };

    return { file: fileDiff, nextIndex: i };
  }

  /**
   * Parse a single hunk (@@ ... @@)
   */
  private parseHunk(
    lines: string[],
    startIndex: number
  ): { hunk: DiffHunk; additions: number; deletions: number; nextIndex: number } | null {
    const headerLine = lines[startIndex];

    // Parse hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    const match = headerLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (!match) {
      return null;
    }

    const oldStart = parseInt(match[1], 10);
    const oldLines = match[2] ? parseInt(match[2], 10) : 1;
    const newStart = parseInt(match[3], 10);
    const newLines = match[4] ? parseInt(match[4], 10) : 1;
    const header = match[5].trim();

    const hunkLines: DiffLine[] = [];
    let additions = 0;
    let deletions = 0;
    let oldLineNum = oldStart;
    let newLineNum = newStart;
    let i = startIndex + 1;

    // Parse hunk lines
    while (i < lines.length) {
      const line = lines[i];

      // End of hunk
      if (line.startsWith('@@') || line.startsWith('diff --git')) {
        break;
      }

      // Skip "\ No newline at end of file"
      if (line.startsWith('\\')) {
        i++;
        continue;
      }

      let type: DiffLine['type'] = 'context';
      let content = line;
      let oldNum: number | undefined = oldLineNum;
      let newNum: number | undefined = newLineNum;

      if (line.startsWith('+')) {
        type = 'addition';
        content = line.slice(1);
        oldNum = undefined;
        newLineNum++;
        additions++;
      } else if (line.startsWith('-')) {
        type = 'deletion';
        content = line.slice(1);
        newNum = undefined;
        oldLineNum++;
        deletions++;
      } else if (line.startsWith(' ')) {
        type = 'context';
        content = line.slice(1);
        oldLineNum++;
        newLineNum++;
      } else {
        // Malformed line, treat as context
        oldLineNum++;
        newLineNum++;
      }

      hunkLines.push({
        type,
        content,
        oldLineNumber: oldNum,
        newLineNumber: newNum,
      });

      i++;
    }

    const hunk: DiffHunk = {
      oldStart,
      oldLines,
      newStart,
      newLines,
      lines: hunkLines,
      header,
    };

    return { hunk, additions, deletions, nextIndex: i };
  }

  /**
   * Get diff summary stats
   */
  public async getDiffStats(options: DiffOptions): Promise<{
    filesChanged: number;
    additions: number;
    deletions: number;
  }> {
    const { cwd, base, compare, staged } = options;

    let command = 'git diff --numstat';

    if (staged) {
      command += ' --cached';
    } else if (base && compare) {
      command += ` ${base}...${compare}`;
    } else if (base) {
      command += ` ${base}`;
    }

    try {
      const { stdout } = await execAsync(command, { cwd });

      if (!stdout.trim()) {
        return { filesChanged: 0, additions: 0, deletions: 0 };
      }

      const lines = stdout.trim().split('\n');
      let filesChanged = 0;
      let additions = 0;
      let deletions = 0;

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const added = parseInt(parts[0], 10);
          const deleted = parseInt(parts[1], 10);

          if (!isNaN(added) && !isNaN(deleted)) {
            additions += added;
            deletions += deleted;
            filesChanged++;
          }
        }
      }

      return { filesChanged, additions, deletions };
    } catch (error: any) {
      throw new Error(`Failed to get diff stats: ${error.message}`);
    }
  }
}

// Singleton instance
let gitDiffParserInstance: GitDiffParserService | null = null;

export function getGitDiffParser(): GitDiffParserService {
  if (!gitDiffParserInstance) {
    gitDiffParserInstance = new GitDiffParserService();
  }
  return gitDiffParserInstance;
}
