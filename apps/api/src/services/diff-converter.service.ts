/**
 * Diff Converter Service
 * Converts parsed git diff data into frontend-optimized JSON format
 * Optimized for virtual scrolling and efficient rendering
 */

import type { FileDiff, DiffHunk, DiffLine, ParsedDiff } from './git-diff-parser.service';

/**
 * Frontend-optimized file diff with metadata for virtual scrolling
 */
export interface FrontendFileDiff {
  // File identification
  id: string; // Unique identifier for virtual scrolling
  path: string;
  oldPath?: string;

  // Change metadata
  changeType: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';
  binary: boolean;

  // File statistics
  stats: {
    additions: number;
    deletions: number;
    changes: number; // additions + deletions
  };

  // File metadata
  metadata: {
    extension: string;
    fileName: string;
    directory: string;
    estimatedLines: number; // Approximate total lines in file
  };

  // Virtual scrolling optimization
  scrolling: {
    totalLines: number; // Total rendered lines (including context)
    lineRanges: LineRange[]; // Ranges for efficient lookup
    chunkSizes: number[]; // Size of each hunk for rendering
  };

  // Diff content
  hunks: FrontendDiffHunk[];
}

/**
 * Frontend-optimized diff hunk
 */
export interface FrontendDiffHunk {
  id: string; // Unique identifier

  // Position metadata
  position: {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
  };

  // Header info
  header: string;

  // Statistics
  stats: {
    additions: number;
    deletions: number;
    context: number;
  };

  // Lines with enhanced metadata
  lines: FrontendDiffLine[];

  // Virtual scrolling
  lineRange: {
    start: number; // Absolute line number in rendered output
    end: number;
  };
}

/**
 * Frontend-optimized diff line
 */
export interface FrontendDiffLine {
  id: string; // Unique identifier for React keys
  type: 'context' | 'addition' | 'deletion';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;

  // Rendering hints
  hasTrailingWhitespace: boolean;
  isEmpty: boolean;
  absoluteIndex: number; // Index in the entire file's rendered lines
}

/**
 * Line range for efficient lookups
 */
export interface LineRange {
  hunkIndex: number;
  startLine: number;
  endLine: number;
}

/**
 * Frontend-optimized parsed diff
 */
export interface FrontendParsedDiff {
  // Overall statistics
  stats: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
    totalChanges: number;

    // Per-type counts
    filesAdded: number;
    filesDeleted: number;
    filesModified: number;
    filesRenamed: number;
    filesCopied: number;
    filesBinary: number;
  };

  // Files with metadata
  files: FrontendFileDiff[];

  // Lookup indices for performance
  indices: {
    filesByPath: Record<string, number>; // path -> files array index
    filesByType: Record<string, number[]>; // changeType -> file indices
  };

  // Rendering metadata
  metadata: {
    totalRenderableLines: number;
    largestFile: string | null;
    largestFileLines: number;
    hasAnyBinary: boolean;
  };
}

/**
 * Diff Converter Service
 */
export class DiffConverterService {
  /**
   * Convert parsed diff to frontend-optimized format
   */
  public convertToFrontend(parsedDiff: ParsedDiff): FrontendParsedDiff {
    const frontendFiles: FrontendFileDiff[] = [];
    const filesByPath: Record<string, number> = {};
    const filesByType: Record<string, number[]> = {
      added: [],
      deleted: [],
      modified: [],
      renamed: [],
      copied: [],
    };

    let totalRenderableLines = 0;
    let largestFileLines = 0;
    let largestFile: string | null = null;

    // Statistics counters
    let filesAdded = 0;
    let filesDeleted = 0;
    let filesModified = 0;
    let filesRenamed = 0;
    let filesCopied = 0;
    let filesBinary = 0;

    // Convert each file
    parsedDiff.files.forEach((file, index) => {
      const frontendFile = this.convertFileDiff(file, index);
      frontendFiles.push(frontendFile);

      // Build indices
      filesByPath[file.path] = index;
      filesByType[file.changeType].push(index);

      // Update metadata
      totalRenderableLines += frontendFile.scrolling.totalLines;

      if (frontendFile.scrolling.totalLines > largestFileLines) {
        largestFileLines = frontendFile.scrolling.totalLines;
        largestFile = file.path;
      }

      // Update counters
      if (file.changeType === 'added') filesAdded++;
      if (file.changeType === 'deleted') filesDeleted++;
      if (file.changeType === 'modified') filesModified++;
      if (file.changeType === 'renamed') filesRenamed++;
      if (file.changeType === 'copied') filesCopied++;
      if (file.binary) filesBinary++;
    });

    return {
      stats: {
        totalFiles: parsedDiff.totalFiles,
        totalAdditions: parsedDiff.totalAdditions,
        totalDeletions: parsedDiff.totalDeletions,
        totalChanges: parsedDiff.totalAdditions + parsedDiff.totalDeletions,
        filesAdded,
        filesDeleted,
        filesModified,
        filesRenamed,
        filesCopied,
        filesBinary,
      },
      files: frontendFiles,
      indices: {
        filesByPath,
        filesByType,
      },
      metadata: {
        totalRenderableLines,
        largestFile,
        largestFileLines,
        hasAnyBinary: filesBinary > 0,
      },
    };
  }

  /**
   * Convert a single file diff
   */
  private convertFileDiff(file: FileDiff, fileIndex: number): FrontendFileDiff {
    const metadata = this.extractFileMetadata(file.path);
    const lineRanges: LineRange[] = [];
    const chunkSizes: number[] = [];
    let absoluteLineIndex = 0;

    // Convert hunks
    const frontendHunks: FrontendDiffHunk[] = file.hunks.map((hunk, hunkIndex) => {
      const frontendHunk = this.convertDiffHunk(
        hunk,
        hunkIndex,
        fileIndex,
        absoluteLineIndex
      );

      // Track line ranges
      lineRanges.push({
        hunkIndex,
        startLine: absoluteLineIndex,
        endLine: absoluteLineIndex + frontendHunk.lines.length,
      });

      // Track chunk size
      chunkSizes.push(frontendHunk.lines.length);

      // Update absolute index
      absoluteLineIndex += frontendHunk.lines.length;

      return frontendHunk;
    });

    // Calculate estimated total lines in file (for new/modified files)
    let estimatedLines = 0;
    if (file.changeType !== 'deleted' && frontendHunks.length > 0) {
      const lastHunk = frontendHunks[frontendHunks.length - 1];
      // newStart is 1-indexed, so the last line is newStart + newLines - 1
      estimatedLines = lastHunk.position.newStart + lastHunk.position.newLines - 1;
    }

    return {
      id: `file-${fileIndex}-${this.sanitizeForId(file.path)}`,
      path: file.path,
      oldPath: file.oldPath,
      changeType: file.changeType,
      binary: file.binary,
      stats: {
        additions: file.additions,
        deletions: file.deletions,
        changes: file.additions + file.deletions,
      },
      metadata: {
        ...metadata,
        estimatedLines,
      },
      scrolling: {
        totalLines: absoluteLineIndex,
        lineRanges,
        chunkSizes,
      },
      hunks: frontendHunks,
    };
  }

  /**
   * Convert a diff hunk
   */
  private convertDiffHunk(
    hunk: DiffHunk,
    hunkIndex: number,
    fileIndex: number,
    startAbsoluteIndex: number
  ): FrontendDiffHunk {
    let additions = 0;
    let deletions = 0;
    let context = 0;

    // Convert lines
    const frontendLines: FrontendDiffLine[] = hunk.lines.map((line, lineIndex) => {
      const absoluteIndex = startAbsoluteIndex + lineIndex;
      const frontendLine = this.convertDiffLine(
        line,
        lineIndex,
        hunkIndex,
        fileIndex,
        absoluteIndex
      );

      // Count types
      if (line.type === 'addition') additions++;
      else if (line.type === 'deletion') deletions++;
      else context++;

      return frontendLine;
    });

    return {
      id: `hunk-${fileIndex}-${hunkIndex}`,
      position: {
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
      },
      header: hunk.header,
      stats: {
        additions,
        deletions,
        context,
      },
      lines: frontendLines,
      lineRange: {
        start: startAbsoluteIndex,
        end: startAbsoluteIndex + frontendLines.length,
      },
    };
  }

  /**
   * Convert a diff line
   */
  private convertDiffLine(
    line: DiffLine,
    lineIndex: number,
    hunkIndex: number,
    fileIndex: number,
    absoluteIndex: number
  ): FrontendDiffLine {
    return {
      id: `line-${fileIndex}-${hunkIndex}-${lineIndex}`,
      type: line.type,
      content: line.content,
      oldLineNumber: line.oldLineNumber,
      newLineNumber: line.newLineNumber,
      hasTrailingWhitespace: this.hasTrailingWhitespace(line.content),
      isEmpty: line.content.trim().length === 0,
      absoluteIndex,
    };
  }

  /**
   * Extract file metadata from path
   */
  private extractFileMetadata(path: string): {
    extension: string;
    fileName: string;
    directory: string;
  } {
    const parts = path.split('/');
    const fileName = parts[parts.length - 1] || '';
    const directory = parts.slice(0, -1).join('/') || '.';

    // Extract extension
    const dotIndex = fileName.lastIndexOf('.');
    const extension = dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';

    return {
      extension,
      fileName,
      directory,
    };
  }

  /**
   * Check if content has trailing whitespace
   */
  private hasTrailingWhitespace(content: string): boolean {
    return content.length > 0 && content !== content.trimEnd();
  }

  /**
   * Sanitize string for use in HTML id
   */
  private sanitizeForId(str: string): string {
    return str.replace(/[^a-zA-Z0-9-_]/g, '-');
  }

  /**
   * Get files by change type
   */
  public getFilesByType(
    diff: FrontendParsedDiff,
    type: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied'
  ): FrontendFileDiff[] {
    const indices = diff.indices.filesByType[type] || [];
    return indices.map(index => diff.files[index]);
  }

  /**
   * Get file by path
   */
  public getFileByPath(diff: FrontendParsedDiff, path: string): FrontendFileDiff | null {
    const index = diff.indices.filesByPath[path];
    return index !== undefined ? diff.files[index] : null;
  }

  /**
   * Get hunk at absolute line number
   */
  public getHunkAtLine(file: FrontendFileDiff, lineNumber: number): FrontendDiffHunk | null {
    const range = file.scrolling.lineRanges.find(
      r => lineNumber >= r.startLine && lineNumber < r.endLine
    );

    return range ? file.hunks[range.hunkIndex] : null;
  }

  /**
   * Calculate change statistics by file type
   */
  public getStatsByFileType(diff: FrontendParsedDiff): Record<string, {
    files: number;
    additions: number;
    deletions: number;
  }> {
    const stats: Record<string, { files: number; additions: number; deletions: number }> = {};

    diff.files.forEach(file => {
      const ext = file.metadata.extension || 'no-extension';

      if (!stats[ext]) {
        stats[ext] = { files: 0, additions: 0, deletions: 0 };
      }

      stats[ext].files++;
      stats[ext].additions += file.stats.additions;
      stats[ext].deletions += file.stats.deletions;
    });

    return stats;
  }
}

// Singleton instance
let diffConverterInstance: DiffConverterService | null = null;

export function getDiffConverter(): DiffConverterService {
  if (!diffConverterInstance) {
    diffConverterInstance = new DiffConverterService();
  }
  return diffConverterInstance;
}
