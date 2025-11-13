/**
 * Tests for DiffConverterService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DiffConverterService, getDiffConverter } from '../diff-converter.service';
import type { ParsedDiff, FileDiff, DiffHunk, DiffLine } from '../git-diff-parser.service';

describe('DiffConverterService', () => {
  let service: DiffConverterService;

  beforeEach(() => {
    service = new DiffConverterService();
  });

  describe('convertToFrontend', () => {
    it('should convert empty diff', () => {
      const parsedDiff: ParsedDiff = {
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        totalFiles: 0,
      };

      const result = service.convertToFrontend(parsedDiff);

      expect(result.stats.totalFiles).toBe(0);
      expect(result.stats.totalAdditions).toBe(0);
      expect(result.stats.totalDeletions).toBe(0);
      expect(result.files).toHaveLength(0);
      expect(result.metadata.totalRenderableLines).toBe(0);
      expect(result.metadata.largestFile).toBeNull();
    });

    it('should convert single modified file', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          {
            path: 'src/app.ts',
            changeType: 'modified',
            hunks: [
              {
                oldStart: 1,
                oldLines: 3,
                newStart: 1,
                newLines: 4,
                header: 'main function',
                lines: [
                  { type: 'context', content: 'const app = () => {', oldLineNumber: 1, newLineNumber: 1 },
                  { type: 'deletion', content: '  console.log("old");', oldLineNumber: 2 },
                  { type: 'addition', content: '  console.log("new");', newLineNumber: 2 },
                  { type: 'addition', content: '  console.log("added");', newLineNumber: 3 },
                  { type: 'context', content: '};', oldLineNumber: 3, newLineNumber: 4 },
                ],
              },
            ],
            binary: false,
            additions: 2,
            deletions: 1,
          },
        ],
        totalAdditions: 2,
        totalDeletions: 1,
        totalFiles: 1,
      };

      const result = service.convertToFrontend(parsedDiff);

      // Overall stats
      expect(result.stats.totalFiles).toBe(1);
      expect(result.stats.totalAdditions).toBe(2);
      expect(result.stats.totalDeletions).toBe(1);
      expect(result.stats.totalChanges).toBe(3);
      expect(result.stats.filesModified).toBe(1);
      expect(result.stats.filesAdded).toBe(0);

      // File
      const file = result.files[0];
      expect(file.path).toBe('src/app.ts');
      expect(file.changeType).toBe('modified');
      expect(file.stats.additions).toBe(2);
      expect(file.stats.deletions).toBe(1);
      expect(file.stats.changes).toBe(3);

      // Metadata
      expect(file.metadata.fileName).toBe('app.ts');
      expect(file.metadata.extension).toBe('ts');
      expect(file.metadata.directory).toBe('src');

      // Scrolling
      expect(file.scrolling.totalLines).toBe(5);
      expect(file.scrolling.lineRanges).toHaveLength(1);
      expect(file.scrolling.chunkSizes).toEqual([5]);

      // Hunks
      expect(file.hunks).toHaveLength(1);
      const hunk = file.hunks[0];
      expect(hunk.stats.additions).toBe(2);
      expect(hunk.stats.deletions).toBe(1);
      expect(hunk.stats.context).toBe(2);
      expect(hunk.lines).toHaveLength(5);

      // Lines
      expect(hunk.lines[0].type).toBe('context');
      expect(hunk.lines[1].type).toBe('deletion');
      expect(hunk.lines[2].type).toBe('addition');
      expect(hunk.lines[0].absoluteIndex).toBe(0);
      expect(hunk.lines[1].absoluteIndex).toBe(1);
    });

    it('should handle added file', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          {
            path: 'new-file.js',
            changeType: 'added',
            hunks: [
              {
                oldStart: 0,
                oldLines: 0,
                newStart: 1,
                newLines: 2,
                header: '',
                lines: [
                  { type: 'addition', content: 'const x = 1;', newLineNumber: 1 },
                  { type: 'addition', content: 'console.log(x);', newLineNumber: 2 },
                ],
              },
            ],
            binary: false,
            additions: 2,
            deletions: 0,
          },
        ],
        totalAdditions: 2,
        totalDeletions: 0,
        totalFiles: 1,
      };

      const result = service.convertToFrontend(parsedDiff);

      expect(result.stats.filesAdded).toBe(1);
      expect(result.stats.filesModified).toBe(0);

      const file = result.files[0];
      expect(file.changeType).toBe('added');
      expect(file.metadata.extension).toBe('js');
      expect(file.metadata.estimatedLines).toBe(2);
    });

    it('should handle deleted file', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          {
            path: 'deleted-file.py',
            changeType: 'deleted',
            hunks: [
              {
                oldStart: 1,
                oldLines: 3,
                newStart: 0,
                newLines: 0,
                header: '',
                lines: [
                  { type: 'deletion', content: 'import os', oldLineNumber: 1 },
                  { type: 'deletion', content: 'import sys', oldLineNumber: 2 },
                  { type: 'deletion', content: 'print("hello")', oldLineNumber: 3 },
                ],
              },
            ],
            binary: false,
            additions: 0,
            deletions: 3,
          },
        ],
        totalAdditions: 0,
        totalDeletions: 3,
        totalFiles: 1,
      };

      const result = service.convertToFrontend(parsedDiff);

      expect(result.stats.filesDeleted).toBe(1);

      const file = result.files[0];
      expect(file.changeType).toBe('deleted');
      expect(file.metadata.extension).toBe('py');
      expect(file.metadata.estimatedLines).toBe(0);
    });

    it('should handle renamed file', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          {
            path: 'new-name.md',
            oldPath: 'old-name.md',
            changeType: 'renamed',
            hunks: [],
            binary: false,
            additions: 0,
            deletions: 0,
          },
        ],
        totalAdditions: 0,
        totalDeletions: 0,
        totalFiles: 1,
      };

      const result = service.convertToFrontend(parsedDiff);

      expect(result.stats.filesRenamed).toBe(1);

      const file = result.files[0];
      expect(file.changeType).toBe('renamed');
      expect(file.path).toBe('new-name.md');
      expect(file.oldPath).toBe('old-name.md');
      expect(file.metadata.extension).toBe('md');
    });

    it('should handle binary file', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          {
            path: 'image.png',
            changeType: 'modified',
            hunks: [],
            binary: true,
            additions: 0,
            deletions: 0,
          },
        ],
        totalAdditions: 0,
        totalDeletions: 0,
        totalFiles: 1,
      };

      const result = service.convertToFrontend(parsedDiff);

      expect(result.stats.filesBinary).toBe(1);
      expect(result.metadata.hasAnyBinary).toBe(true);

      const file = result.files[0];
      expect(file.binary).toBe(true);
      expect(file.metadata.extension).toBe('png');
    });

    it('should handle multiple files and calculate totals', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          {
            path: 'file1.ts',
            changeType: 'added',
            hunks: [
              {
                oldStart: 0,
                oldLines: 0,
                newStart: 1,
                newLines: 10,
                header: '',
                lines: Array(10).fill(null).map((_, i) => ({
                  type: 'addition' as const,
                  content: `line ${i}`,
                  newLineNumber: i + 1,
                })),
              },
            ],
            binary: false,
            additions: 10,
            deletions: 0,
          },
          {
            path: 'file2.js',
            changeType: 'modified',
            hunks: [
              {
                oldStart: 1,
                oldLines: 5,
                newStart: 1,
                newLines: 5,
                header: '',
                lines: Array(5).fill(null).map((_, i) => ({
                  type: 'context' as const,
                  content: `line ${i}`,
                  oldLineNumber: i + 1,
                  newLineNumber: i + 1,
                })),
              },
            ],
            binary: false,
            additions: 2,
            deletions: 3,
          },
          {
            path: 'file3.py',
            changeType: 'deleted',
            hunks: [],
            binary: false,
            additions: 0,
            deletions: 20,
          },
        ],
        totalAdditions: 12,
        totalDeletions: 23,
        totalFiles: 3,
      };

      const result = service.convertToFrontend(parsedDiff);

      expect(result.stats.totalFiles).toBe(3);
      expect(result.stats.totalAdditions).toBe(12);
      expect(result.stats.totalDeletions).toBe(23);
      expect(result.stats.totalChanges).toBe(35);
      expect(result.stats.filesAdded).toBe(1);
      expect(result.stats.filesModified).toBe(1);
      expect(result.stats.filesDeleted).toBe(1);

      expect(result.metadata.totalRenderableLines).toBe(15); // 10 + 5 + 0
      expect(result.metadata.largestFile).toBe('file1.ts');
      expect(result.metadata.largestFileLines).toBe(10);
    });

    it('should detect trailing whitespace', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          {
            path: 'test.txt',
            changeType: 'modified',
            hunks: [
              {
                oldStart: 1,
                oldLines: 2,
                newStart: 1,
                newLines: 2,
                header: '',
                lines: [
                  { type: 'context', content: 'no trailing', oldLineNumber: 1, newLineNumber: 1 },
                  { type: 'addition', content: 'has trailing  ', newLineNumber: 2 },
                ],
              },
            ],
            binary: false,
            additions: 1,
            deletions: 0,
          },
        ],
        totalAdditions: 1,
        totalDeletions: 0,
        totalFiles: 1,
      };

      const result = service.convertToFrontend(parsedDiff);

      const lines = result.files[0].hunks[0].lines;
      expect(lines[0].hasTrailingWhitespace).toBe(false);
      expect(lines[1].hasTrailingWhitespace).toBe(true);
    });

    it('should detect empty lines', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          {
            path: 'test.txt',
            changeType: 'modified',
            hunks: [
              {
                oldStart: 1,
                oldLines: 2,
                newStart: 1,
                newLines: 2,
                header: '',
                lines: [
                  { type: 'context', content: 'not empty', oldLineNumber: 1, newLineNumber: 1 },
                  { type: 'addition', content: '', newLineNumber: 2 },
                  { type: 'addition', content: '   ', newLineNumber: 3 },
                ],
              },
            ],
            binary: false,
            additions: 2,
            deletions: 0,
          },
        ],
        totalAdditions: 2,
        totalDeletions: 0,
        totalFiles: 1,
      };

      const result = service.convertToFrontend(parsedDiff);

      const lines = result.files[0].hunks[0].lines;
      expect(lines[0].isEmpty).toBe(false);
      expect(lines[1].isEmpty).toBe(true);
      expect(lines[2].isEmpty).toBe(true);
    });

    it('should build file indices correctly', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          { path: 'a.ts', changeType: 'added', hunks: [], binary: false, additions: 0, deletions: 0 },
          { path: 'b.ts', changeType: 'modified', hunks: [], binary: false, additions: 0, deletions: 0 },
          { path: 'c.ts', changeType: 'deleted', hunks: [], binary: false, additions: 0, deletions: 0 },
          { path: 'd.ts', changeType: 'added', hunks: [], binary: false, additions: 0, deletions: 0 },
        ],
        totalAdditions: 0,
        totalDeletions: 0,
        totalFiles: 4,
      };

      const result = service.convertToFrontend(parsedDiff);

      // Check filesByPath
      expect(result.indices.filesByPath['a.ts']).toBe(0);
      expect(result.indices.filesByPath['b.ts']).toBe(1);
      expect(result.indices.filesByPath['c.ts']).toBe(2);
      expect(result.indices.filesByPath['d.ts']).toBe(3);

      // Check filesByType
      expect(result.indices.filesByType.added).toEqual([0, 3]);
      expect(result.indices.filesByType.modified).toEqual([1]);
      expect(result.indices.filesByType.deleted).toEqual([2]);
    });

    it('should generate unique IDs', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          {
            path: 'test.ts',
            changeType: 'modified',
            hunks: [
              {
                oldStart: 1,
                oldLines: 2,
                newStart: 1,
                newLines: 2,
                header: '',
                lines: [
                  { type: 'addition', content: 'line1', newLineNumber: 1 },
                  { type: 'addition', content: 'line2', newLineNumber: 2 },
                ],
              },
              {
                oldStart: 10,
                oldLines: 1,
                newStart: 10,
                newLines: 1,
                header: '',
                lines: [
                  { type: 'context', content: 'line10', oldLineNumber: 10, newLineNumber: 10 },
                ],
              },
            ],
            binary: false,
            additions: 2,
            deletions: 0,
          },
        ],
        totalAdditions: 2,
        totalDeletions: 0,
        totalFiles: 1,
      };

      const result = service.convertToFrontend(parsedDiff);

      const file = result.files[0];
      expect(file.id).toMatch(/^file-0-/);

      const hunk0 = file.hunks[0];
      const hunk1 = file.hunks[1];
      expect(hunk0.id).toBe('hunk-0-0');
      expect(hunk1.id).toBe('hunk-0-1');

      const line0 = hunk0.lines[0];
      const line1 = hunk0.lines[1];
      const line2 = hunk1.lines[0];
      expect(line0.id).toBe('line-0-0-0');
      expect(line1.id).toBe('line-0-0-1');
      expect(line2.id).toBe('line-0-1-0');
    });
  });

  describe('helper methods', () => {
    it('should get files by type', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          { path: 'a.ts', changeType: 'added', hunks: [], binary: false, additions: 0, deletions: 0 },
          { path: 'b.ts', changeType: 'modified', hunks: [], binary: false, additions: 0, deletions: 0 },
          { path: 'c.ts', changeType: 'added', hunks: [], binary: false, additions: 0, deletions: 0 },
        ],
        totalAdditions: 0,
        totalDeletions: 0,
        totalFiles: 3,
      };

      const frontend = service.convertToFrontend(parsedDiff);

      const added = service.getFilesByType(frontend, 'added');
      expect(added).toHaveLength(2);
      expect(added[0].path).toBe('a.ts');
      expect(added[1].path).toBe('c.ts');

      const modified = service.getFilesByType(frontend, 'modified');
      expect(modified).toHaveLength(1);
      expect(modified[0].path).toBe('b.ts');
    });

    it('should get file by path', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          { path: 'a.ts', changeType: 'added', hunks: [], binary: false, additions: 0, deletions: 0 },
          { path: 'b.ts', changeType: 'modified', hunks: [], binary: false, additions: 0, deletions: 0 },
        ],
        totalAdditions: 0,
        totalDeletions: 0,
        totalFiles: 2,
      };

      const frontend = service.convertToFrontend(parsedDiff);

      const file = service.getFileByPath(frontend, 'b.ts');
      expect(file).not.toBeNull();
      expect(file?.path).toBe('b.ts');

      const notFound = service.getFileByPath(frontend, 'nonexistent.ts');
      expect(notFound).toBeNull();
    });

    it('should get hunk at line', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          {
            path: 'test.ts',
            changeType: 'modified',
            hunks: [
              {
                oldStart: 1,
                oldLines: 3,
                newStart: 1,
                newLines: 3,
                header: 'hunk 1',
                lines: [
                  { type: 'context', content: 'line1', oldLineNumber: 1, newLineNumber: 1 },
                  { type: 'context', content: 'line2', oldLineNumber: 2, newLineNumber: 2 },
                  { type: 'context', content: 'line3', oldLineNumber: 3, newLineNumber: 3 },
                ],
              },
              {
                oldStart: 10,
                oldLines: 2,
                newStart: 10,
                newLines: 2,
                header: 'hunk 2',
                lines: [
                  { type: 'context', content: 'line10', oldLineNumber: 10, newLineNumber: 10 },
                  { type: 'context', content: 'line11', oldLineNumber: 11, newLineNumber: 11 },
                ],
              },
            ],
            binary: false,
            additions: 0,
            deletions: 0,
          },
        ],
        totalAdditions: 0,
        totalDeletions: 0,
        totalFiles: 1,
      };

      const frontend = service.convertToFrontend(parsedDiff);
      const file = frontend.files[0];

      const hunk0 = service.getHunkAtLine(file, 0);
      expect(hunk0?.header).toBe('hunk 1');

      const hunk1 = service.getHunkAtLine(file, 3);
      expect(hunk1?.header).toBe('hunk 2');

      const notFound = service.getHunkAtLine(file, 100);
      expect(notFound).toBeNull();
    });

    it('should calculate stats by file type', () => {
      const parsedDiff: ParsedDiff = {
        files: [
          { path: 'a.ts', changeType: 'added', hunks: [], binary: false, additions: 10, deletions: 0 },
          { path: 'b.ts', changeType: 'modified', hunks: [], binary: false, additions: 5, deletions: 3 },
          { path: 'c.js', changeType: 'modified', hunks: [], binary: false, additions: 2, deletions: 1 },
          { path: 'd.ts', changeType: 'deleted', hunks: [], binary: false, additions: 0, deletions: 20 },
        ],
        totalAdditions: 17,
        totalDeletions: 24,
        totalFiles: 4,
      };

      const frontend = service.convertToFrontend(parsedDiff);
      const stats = service.getStatsByFileType(frontend);

      expect(stats.ts).toEqual({
        files: 3,
        additions: 15,
        deletions: 23,
      });

      expect(stats.js).toEqual({
        files: 1,
        additions: 2,
        deletions: 1,
      });
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getDiffConverter();
      const instance2 = getDiffConverter();

      expect(instance1).toBe(instance2);
    });
  });
});
