/**
 * Test Data Generator for Performance Benchmarks
 * Generates synthetic diff data for performance testing
 */

import type { FileDiff, DiffHunk, DiffLine } from '@/lib/types/diff';

export interface GeneratorOptions {
  fileCount: number;
  linesPerFile: number;
  hunksPerFile?: number;
  additionRatio?: number; // 0-1, ratio of additions vs deletions
  contextRatio?: number; // 0-1, ratio of context lines
}

/**
 * Generate realistic code content
 */
function generateCodeLine(lineNumber: number, language: string = 'typescript'): string {
  const patterns = [
    `function processData${lineNumber}(input: string): string {`,
    `  const result = transform(input);`,
    `  return result.toString();`,
    `}`,
    ``,
    `interface Config${lineNumber} {`,
    `  enabled: boolean;`,
    `  timeout: number;`,
    `}`,
    ``,
    `const value = calculateSum(a, b, c);`,
    `console.log('Processing item:', value);`,
    `if (condition) {`,
    `  doSomething();`,
    `} else {`,
    `  doSomethingElse();`,
    `}`,
    ``,
    `// This is a comment line ${lineNumber}`,
    `/* Multi-line comment`,
    ` * with documentation ${lineNumber}`,
    ` */`,
  ];

  return patterns[lineNumber % patterns.length];
}

/**
 * Generate a single diff line
 */
function generateDiffLine(
  type: 'context' | 'addition' | 'deletion',
  lineIndex: number,
  oldLineNum: number,
  newLineNum: number
): DiffLine {
  return {
    type,
    content: generateCodeLine(lineIndex),
    oldLineNumber: type !== 'addition' ? oldLineNum : undefined,
    newLineNumber: type !== 'deletion' ? newLineNum : undefined,
  };
}

/**
 * Generate a diff hunk
 */
function generateHunk(
  hunkIndex: number,
  startLine: number,
  lineCount: number,
  additionRatio: number,
  contextRatio: number
): DiffHunk {
  const lines: DiffLine[] = [];
  let oldLine = startLine;
  let newLine = startLine;
  let additions = 0;
  let deletions = 0;

  for (let i = 0; i < lineCount; i++) {
    const rand = Math.random();

    if (rand < contextRatio) {
      // Context line
      lines.push(generateDiffLine('context', i, oldLine, newLine));
      oldLine++;
      newLine++;
    } else if (rand < contextRatio + additionRatio * (1 - contextRatio)) {
      // Addition
      lines.push(generateDiffLine('addition', i, oldLine, newLine));
      newLine++;
      additions++;
    } else {
      // Deletion
      lines.push(generateDiffLine('deletion', i, oldLine, newLine));
      oldLine++;
      deletions++;
    }
  }

  return {
    oldStart: startLine,
    oldLines: oldLine - startLine,
    newStart: startLine,
    newLines: newLine - startLine,
    lines,
    header: `Modified section ${hunkIndex + 1}`,
  };
}

/**
 * Generate file path
 */
function generateFilePath(fileIndex: number, fileCount: number): string {
  const dirs = ['src', 'lib', 'components', 'utils', 'services', 'api'];
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.json'];

  const dir = dirs[fileIndex % dirs.length];
  const subdir = fileIndex < fileCount / 2 ? 'core' : 'features';
  const ext = extensions[fileIndex % extensions.length];

  return `${dir}/${subdir}/file-${fileIndex}${ext}`;
}

/**
 * Generate a complete file diff
 */
function generateFileDiff(
  fileIndex: number,
  fileCount: number,
  linesPerFile: number,
  hunksPerFile: number,
  additionRatio: number,
  contextRatio: number
): FileDiff {
  const hunks: DiffHunk[] = [];
  const linesPerHunk = Math.floor(linesPerFile / hunksPerFile);

  let totalAdditions = 0;
  let totalDeletions = 0;

  for (let h = 0; h < hunksPerFile; h++) {
    const startLine = h * linesPerHunk + 1;
    const hunk = generateHunk(h, startLine, linesPerHunk, additionRatio, contextRatio);
    hunks.push(hunk);

    hunk.lines.forEach((line) => {
      if (line.type === 'addition') totalAdditions++;
      if (line.type === 'deletion') totalDeletions++;
    });
  }

  const changeTypes: Array<'added' | 'deleted' | 'modified' | 'renamed' | 'copied'> = [
    'modified',
    'modified',
    'modified',
    'added',
    'deleted',
  ];

  return {
    path: generateFilePath(fileIndex, fileCount),
    changeType: changeTypes[fileIndex % changeTypes.length],
    hunks,
    binary: false,
    additions: totalAdditions,
    deletions: totalDeletions,
  };
}

/**
 * Generate synthetic diff data for testing
 */
export function generateTestDiff(options: GeneratorOptions): FileDiff[] {
  const {
    fileCount,
    linesPerFile,
    hunksPerFile = 10,
    additionRatio = 0.4,
    contextRatio = 0.4,
  } = options;

  const files: FileDiff[] = [];

  for (let i = 0; i < fileCount; i++) {
    files.push(
      generateFileDiff(i, fileCount, linesPerFile, hunksPerFile, additionRatio, contextRatio)
    );
  }

  return files;
}

/**
 * Preset configurations for common scenarios
 */
export const BENCHMARK_PRESETS = {
  small: {
    fileCount: 5,
    linesPerFile: 100,
    hunksPerFile: 3,
  },
  medium: {
    fileCount: 20,
    linesPerFile: 250,
    hunksPerFile: 8,
  },
  large: {
    fileCount: 50,
    linesPerFile: 500,
    hunksPerFile: 15,
  },
  xlarge: {
    fileCount: 100,
    linesPerFile: 1000,
    hunksPerFile: 20,
  },
  target: {
    // Target spec: 100 files, 5000 lines
    fileCount: 100,
    linesPerFile: 5000,
    hunksPerFile: 50,
  },
} as const;

/**
 * Calculate total stats for a diff
 */
export function calculateDiffStats(files: FileDiff[]) {
  let totalLines = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;
  let totalHunks = 0;

  files.forEach((file) => {
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
    totalHunks += file.hunks.length;
    file.hunks.forEach((hunk) => {
      totalLines += hunk.lines.length;
    });
  });

  return {
    fileCount: files.length,
    totalLines,
    totalAdditions,
    totalDeletions,
    totalHunks,
    avgLinesPerFile: Math.round(totalLines / files.length),
    avgHunksPerFile: Math.round(totalHunks / files.length),
  };
}
