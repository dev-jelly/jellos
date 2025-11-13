/**
 * Simple test script for git diff parser
 * Run with: tsx src/scripts/test-diff.ts
 */

import { getGitDiffParser } from '../services/git-diff-parser.service';

async function testDiffParser() {
  const diffParser = getGitDiffParser();

  console.log('Testing Git Diff Parser...\n');

  const cwd = process.cwd();
  console.log(`Working directory: ${cwd}\n`);

  try {
    // Test 1: Get working tree changes
    console.log('=== Test 1: Working Tree Changes ===');
    const workingTreeDiff = await diffParser.getParsedDiff({
      cwd,
      contextLines: 3,
    });

    console.log(`Total files changed: ${workingTreeDiff.totalFiles}`);
    console.log(`Total additions: ${workingTreeDiff.totalAdditions}`);
    console.log(`Total deletions: ${workingTreeDiff.totalDeletions}\n`);

    // Show first 3 files
    for (const file of workingTreeDiff.files.slice(0, 3)) {
      console.log(`File: ${file.path}`);
      console.log(`  Change type: ${file.changeType}`);
      console.log(`  Additions: ${file.additions}, Deletions: ${file.deletions}`);
      console.log(`  Hunks: ${file.hunks.length}`);
      if (file.hunks.length > 0) {
        console.log(`  First hunk: ${file.hunks[0].header}`);
      }
      console.log();
    }

    // Test 2: Get diff stats only
    console.log('=== Test 2: Diff Stats ===');
    const stats = await diffParser.getDiffStats({
      cwd,
    });

    console.log(`Files changed: ${stats.filesChanged}`);
    console.log(`Additions: ${stats.additions}`);
    console.log(`Deletions: ${stats.deletions}\n`);

    // Test 3: Parse sample diff text
    console.log('=== Test 3: Parse Sample Diff ===');
    const sampleDiff = `diff --git a/test.txt b/test.txt
index 1234567..abcdefg 100644
--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,4 @@
 line 1
-line 2
+line 2 modified
+line 2.5 added
 line 3
`;

    const parsedSample = diffParser.parseDiff(sampleDiff);
    console.log(`Sample diff parsed files: ${parsedSample.totalFiles}`);
    if (parsedSample.files.length > 0) {
      const file = parsedSample.files[0];
      console.log(`  File: ${file.path}`);
      console.log(`  Additions: ${file.additions}, Deletions: ${file.deletions}`);
      console.log(`  Change type: ${file.changeType}`);
    }

    console.log('\nAll tests passed!');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testDiffParser();
