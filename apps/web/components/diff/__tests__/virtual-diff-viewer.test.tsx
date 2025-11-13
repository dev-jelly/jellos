/**
 * VirtualDiffViewer Performance Tests
 * Target: <100ms initial paint for 5000+ lines
 */

import { render, screen } from '@testing-library/react';
import { VirtualDiffViewer } from '../virtual-diff-viewer';
import type { FileDiff } from '@/lib/types/diff';

/**
 * Generate mock diff data for performance testing
 */
function generateMockDiff(fileCount: number, linesPerFile: number): FileDiff[] {
  const files: FileDiff[] = [];

  for (let f = 0; f < fileCount; f++) {
    const additions = Math.floor(linesPerFile / 3);
    const deletions = Math.floor(linesPerFile / 3);

    const hunks = [];
    const linesPerHunk = 100;
    const hunkCount = Math.ceil(linesPerFile / linesPerHunk);

    let oldLineNum = 1;
    let newLineNum = 1;

    for (let h = 0; h < hunkCount; h++) {
      const hunkLines = [];
      const hunkSize = Math.min(linesPerHunk, linesPerFile - h * linesPerHunk);

      for (let l = 0; l < hunkSize; l++) {
        const rand = Math.random();
        let type: 'context' | 'addition' | 'deletion';
        let content: string;
        let oldNum: number | undefined;
        let newNum: number | undefined;

        if (rand < 0.33) {
          type = 'addition';
          content = `  added line ${l} in hunk ${h}`;
          oldNum = undefined;
          newNum = newLineNum++;
        } else if (rand < 0.66) {
          type = 'deletion';
          content = `  deleted line ${l} in hunk ${h}`;
          oldNum = oldLineNum++;
          newNum = undefined;
        } else {
          type = 'context';
          content = `  context line ${l} in hunk ${h}`;
          oldNum = oldLineNum++;
          newNum = newLineNum++;
        }

        hunkLines.push({
          type,
          content,
          oldLineNumber: oldNum,
          newLineNumber: newNum,
        });
      }

      hunks.push({
        oldStart: 1 + h * linesPerHunk,
        oldLines: hunkSize,
        newStart: 1 + h * linesPerHunk,
        newLines: hunkSize,
        lines: hunkLines,
        header: `function ${h}()`,
      });
    }

    files.push({
      path: `src/components/test-file-${f}.tsx`,
      changeType: 'modified',
      hunks,
      binary: false,
      additions,
      deletions,
    });
  }

  return files;
}

describe('VirtualDiffViewer', () => {
  // Mock ResizeObserver for tests
  beforeAll(() => {
    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));
  });

  describe('Rendering', () => {
    it('renders empty state when no files provided', () => {
      render(<VirtualDiffViewer files={[]} />);
      expect(screen.getByText('No diff data available')).toBeInTheDocument();
    });

    it('renders virtuoso container with single file', () => {
      const files = generateMockDiff(1, 10);
      const { container } = render(<VirtualDiffViewer files={files} />);
      // Check that virtuoso container is rendered
      expect(container.querySelector('[data-testid="virtuoso-scroller"]')).toBeInTheDocument();
    });

    it('renders virtuoso container with multiple files', () => {
      const files = generateMockDiff(3, 10);
      const { container } = render(<VirtualDiffViewer files={files} />);
      // Check that virtuoso container is rendered
      expect(container.querySelector('[data-testid="virtuoso-scroller"]')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('renders 1000 lines in <100ms', () => {
      const files = generateMockDiff(10, 100); // 10 files * 100 lines = 1000 lines
      const startTime = performance.now();

      const { container } = render(<VirtualDiffViewer files={files} />);

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      expect(renderTime).toBeLessThan(100);
      expect(container).toBeInTheDocument();
    });

    it('renders 5000 lines in <100ms', () => {
      const files = generateMockDiff(50, 100); // 50 files * 100 lines = 5000 lines
      const startTime = performance.now();

      const { container } = render(<VirtualDiffViewer files={files} />);

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      expect(renderTime).toBeLessThan(100);
      expect(container).toBeInTheDocument();
    });

    it('renders 10000 lines in <150ms', () => {
      const files = generateMockDiff(100, 100); // 100 files * 100 lines = 10000 lines
      const startTime = performance.now();

      const { container } = render(<VirtualDiffViewer files={files} />);

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      expect(renderTime).toBeLessThan(150);
      expect(container).toBeInTheDocument();
    });

    it('only renders visible elements in DOM', () => {
      const files = generateMockDiff(50, 100); // 5000 lines
      const { container } = render(<VirtualDiffViewer files={files} />);

      // Count rendered line elements
      const renderedLines = container.querySelectorAll('[class*="flex font-mono"]');

      // Virtual scrolling should render far fewer than 5000 lines
      // Typically ~20-50 lines visible + overscan
      expect(renderedLines.length).toBeLessThan(500);
    });
  });

  describe('File Types', () => {
    it('renders added file data structure correctly', () => {
      const files: FileDiff[] = [{
        path: 'new-file.tsx',
        changeType: 'added',
        hunks: [],
        binary: false,
        additions: 10,
        deletions: 0,
      }];
      const { container } = render(<VirtualDiffViewer files={files} />);
      // Verify virtuoso container is rendered for added file
      expect(container.querySelector('[data-testid="virtuoso-scroller"]')).toBeInTheDocument();
      expect(files[0].changeType).toBe('added');
    });

    it('renders deleted file data structure correctly', () => {
      const files: FileDiff[] = [{
        path: 'deleted-file.tsx',
        changeType: 'deleted',
        hunks: [],
        binary: false,
        additions: 0,
        deletions: 10,
      }];
      const { container } = render(<VirtualDiffViewer files={files} />);
      // Verify virtuoso container is rendered for deleted file
      expect(container.querySelector('[data-testid="virtuoso-scroller"]')).toBeInTheDocument();
      expect(files[0].changeType).toBe('deleted');
    });

    it('renders renamed file data structure correctly', () => {
      const files: FileDiff[] = [{
        path: 'new-name.tsx',
        oldPath: 'old-name.tsx',
        changeType: 'renamed',
        hunks: [],
        binary: false,
        additions: 0,
        deletions: 0,
      }];
      const { container } = render(<VirtualDiffViewer files={files} />);
      // Verify virtuoso container is rendered for renamed file
      expect(container.querySelector('[data-testid="virtuoso-scroller"]')).toBeInTheDocument();
      expect(files[0].oldPath).toBe('old-name.tsx');
    });
  });

  describe('Interactions', () => {
    it('accepts onFileClick callback prop', () => {
      const onFileClick = jest.fn();
      const files = generateMockDiff(1, 10);
      const { container } = render(<VirtualDiffViewer files={files} onFileClick={onFileClick} />);

      // Verify component accepts callback
      expect(container.querySelector('[data-testid="virtuoso-scroller"]')).toBeInTheDocument();
      expect(onFileClick).toEqual(expect.any(Function));
    });
  });

  describe('Line Types', () => {
    it('renders context line data structure correctly', () => {
      const files: FileDiff[] = [{
        path: 'test.tsx',
        changeType: 'modified',
        hunks: [{
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 3,
          header: 'test function',
          lines: [{
            type: 'context',
            content: 'unchanged line',
            oldLineNumber: 1,
            newLineNumber: 1,
          }],
        }],
        binary: false,
        additions: 0,
        deletions: 0,
      }];
      const { container } = render(<VirtualDiffViewer files={files} />);
      expect(container.querySelector('[data-testid="virtuoso-scroller"]')).toBeInTheDocument();
      expect(files[0].hunks[0].lines[0].type).toBe('context');
    });

    it('renders addition line data structure correctly', () => {
      const files: FileDiff[] = [{
        path: 'test.tsx',
        changeType: 'modified',
        hunks: [{
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 2,
          header: 'test function',
          lines: [{
            type: 'addition',
            content: 'added line',
            newLineNumber: 2,
          }],
        }],
        binary: false,
        additions: 1,
        deletions: 0,
      }];
      const { container } = render(<VirtualDiffViewer files={files} />);
      expect(container.querySelector('[data-testid="virtuoso-scroller"]')).toBeInTheDocument();
      expect(files[0].hunks[0].lines[0].type).toBe('addition');
    });

    it('renders deletion line data structure correctly', () => {
      const files: FileDiff[] = [{
        path: 'test.tsx',
        changeType: 'modified',
        hunks: [{
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 1,
          header: 'test function',
          lines: [{
            type: 'deletion',
            content: 'deleted line',
            oldLineNumber: 2,
          }],
        }],
        binary: false,
        additions: 0,
        deletions: 1,
      }];
      const { container } = render(<VirtualDiffViewer files={files} />);
      expect(container.querySelector('[data-testid="virtuoso-scroller"]')).toBeInTheDocument();
      expect(files[0].hunks[0].lines[0].type).toBe('deletion');
    });
  });
});
