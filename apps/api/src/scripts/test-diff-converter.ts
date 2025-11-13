#!/usr/bin/env tsx

/**
 * Test script for Diff Converter Service
 * Demonstrates the frontend-optimized JSON conversion
 */

import { getGitDiffParser } from '../services/git-diff-parser.service';
import { getDiffConverter } from '../services/diff-converter.service';

async function testDiffConverter() {
  console.log('Testing Diff Converter Service\n');
  console.log('================================\n');

  const diffParser = getGitDiffParser();
  const diffConverter = getDiffConverter();

  try {
    // Get diff for this repository
    const cwd = process.cwd();
    console.log(`Repository: ${cwd}\n`);

    // Test 1: Working tree changes
    console.log('Test 1: Working Tree Changes (Frontend Format)');
    console.log('-----------------------------------------------');

    const parsedDiff = await diffParser.getParsedDiff({
      cwd,
      contextLines: 3,
    });

    const frontendDiff = diffConverter.convertToFrontend(parsedDiff);

    console.log('\nOverall Statistics:');
    console.log(`  Total Files: ${frontendDiff.stats.totalFiles}`);
    console.log(`  Total Additions: ${frontendDiff.stats.totalAdditions}`);
    console.log(`  Total Deletions: ${frontendDiff.stats.totalDeletions}`);
    console.log(`  Total Changes: ${frontendDiff.stats.totalChanges}`);
    console.log(`\nFile Type Breakdown:`);
    console.log(`  Added: ${frontendDiff.stats.filesAdded}`);
    console.log(`  Modified: ${frontendDiff.stats.filesModified}`);
    console.log(`  Deleted: ${frontendDiff.stats.filesDeleted}`);
    console.log(`  Renamed: ${frontendDiff.stats.filesRenamed}`);
    console.log(`  Binary: ${frontendDiff.stats.filesBinary}`);

    console.log(`\nRendering Metadata:`);
    console.log(`  Total Renderable Lines: ${frontendDiff.metadata.totalRenderableLines}`);
    console.log(`  Largest File: ${frontendDiff.metadata.largestFile || 'N/A'}`);
    console.log(`  Largest File Lines: ${frontendDiff.metadata.largestFileLines}`);
    console.log(`  Has Binary Files: ${frontendDiff.metadata.hasAnyBinary}`);

    // Show detailed file info
    if (frontendDiff.files.length > 0) {
      console.log(`\nDetailed File Information:`);
      frontendDiff.files.slice(0, 3).forEach((file, index) => {
        console.log(`\nFile ${index + 1}: ${file.path}`);
        console.log(`  ID: ${file.id}`);
        console.log(`  Change Type: ${file.changeType}`);
        console.log(`  Extension: ${file.metadata.extension}`);
        console.log(`  Directory: ${file.metadata.directory}`);
        console.log(`  Estimated Lines: ${file.metadata.estimatedLines}`);
        console.log(`  Stats: +${file.stats.additions} -${file.stats.deletions}`);
        console.log(`  Scrolling:`);
        console.log(`    Total Lines: ${file.scrolling.totalLines}`);
        console.log(`    Chunks: ${file.scrolling.chunkSizes.length}`);
        console.log(`    Chunk Sizes: [${file.scrolling.chunkSizes.join(', ')}]`);

        if (file.hunks.length > 0) {
          const hunk = file.hunks[0];
          console.log(`  First Hunk:`);
          console.log(`    ID: ${hunk.id}`);
          console.log(`    Position: @@ -${hunk.position.oldStart},${hunk.position.oldLines} +${hunk.position.newStart},${hunk.position.newLines} @@`);
          console.log(`    Stats: +${hunk.stats.additions} -${hunk.stats.deletions} context=${hunk.stats.context}`);
          console.log(`    Line Range: ${hunk.lineRange.start}-${hunk.lineRange.end}`);

          if (hunk.lines.length > 0) {
            console.log(`    Sample Lines:`);
            hunk.lines.slice(0, 3).forEach(line => {
              const prefix = line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ' ';
              const lineNum = line.newLineNumber ?? line.oldLineNumber ?? '?';
              const trailing = line.hasTrailingWhitespace ? ' [trailing ws]' : '';
              const empty = line.isEmpty ? ' [empty]' : '';
              console.log(`      ${prefix}${lineNum}: ${line.content.slice(0, 60)}${trailing}${empty}`);
            });
          }
        }
      });

      if (frontendDiff.files.length > 3) {
        console.log(`\n... and ${frontendDiff.files.length - 3} more files`);
      }
    }

    // Test helper functions
    console.log('\n\nTest 2: Helper Functions');
    console.log('-------------------------');

    // Get files by type
    const addedFiles = diffConverter.getFilesByType(frontendDiff, 'added');
    const modifiedFiles = diffConverter.getFilesByType(frontendDiff, 'modified');
    console.log(`\nAdded files: ${addedFiles.length}`);
    console.log(`Modified files: ${modifiedFiles.length}`);

    // Get file by path
    if (frontendDiff.files.length > 0) {
      const firstFilePath = frontendDiff.files[0].path;
      const foundFile = diffConverter.getFileByPath(frontendDiff, firstFilePath);
      console.log(`\nFile lookup test:`);
      console.log(`  Looking for: ${firstFilePath}`);
      console.log(`  Found: ${foundFile ? 'Yes' : 'No'}`);
    }

    // Get stats by file type
    const statsByType = diffConverter.getStatsByFileType(frontendDiff);
    console.log(`\nStatistics by file extension:`);
    Object.entries(statsByType).forEach(([ext, stats]) => {
      console.log(`  .${ext}: ${stats.files} files, +${stats.additions} -${stats.deletions}`);
    });

    // Test 3: Virtual scrolling helper
    if (frontendDiff.files.length > 0 && frontendDiff.files[0].hunks.length > 0) {
      console.log('\n\nTest 3: Virtual Scrolling Helper');
      console.log('---------------------------------');

      const file = frontendDiff.files[0];
      const midLine = Math.floor(file.scrolling.totalLines / 2);

      console.log(`\nFile: ${file.path}`);
      console.log(`Total lines: ${file.scrolling.totalLines}`);
      console.log(`Looking for hunk at line: ${midLine}`);

      const hunk = diffConverter.getHunkAtLine(file, midLine);
      if (hunk) {
        console.log(`Found hunk: ${hunk.id}`);
        console.log(`  Line range: ${hunk.lineRange.start}-${hunk.lineRange.end}`);
        console.log(`  Header: ${hunk.header}`);
      } else {
        console.log('No hunk found at that line');
      }
    }

    console.log('\n\nAll tests completed successfully!');

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDiffConverter();
