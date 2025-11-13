# Git Diff API Documentation

## Overview

The Git Diff API provides high-performance diff viewing capabilities through structured JSON responses. The API parses `git diff` output into a structured format suitable for building diff viewers.

## Endpoints

### GET `/api/diff/diff-data`

Returns structured git diff data with per-file changes, hunks, and line-by-line information.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `projectId` | string (CUID) | Yes | - | Project identifier |
| `base` | string | No | - | Base reference (branch, commit, tag) |
| `compare` | string | No | - | Compare reference (requires `base`) |
| `staged` | boolean | No | `false` | Show only staged changes |
| `contextLines` | number | No | `3` | Number of context lines (0-10) |

#### Response Schema

```typescript
{
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
}

interface FileDiff {
  path: string;
  oldPath?: string;  // For renamed files
  changeType: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';
  hunks: DiffHunk[];
  binary: boolean;
  additions: number;
  deletions: number;
}

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  header: string;
}

interface DiffLine {
  type: 'context' | 'addition' | 'deletion';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}
```

#### Examples

**1. Working tree changes (unstaged)**
```
GET /api/diff/diff-data?projectId=abc123
```

**2. Staged changes only**
```
GET /api/diff/diff-data?projectId=abc123&staged=true
```

**3. Changes vs specific branch**
```
GET /api/diff/diff-data?projectId=abc123&base=main
```

**4. Branch-to-branch comparison**
```
GET /api/diff/diff-data?projectId=abc123&base=main&compare=feature-branch
```

**5. Changes vs previous commit**
```
GET /api/diff/diff-data?projectId=abc123&base=HEAD~1
```

**6. With custom context lines**
```
GET /api/diff/diff-data?projectId=abc123&base=main&contextLines=5
```

#### Response Example

```json
{
  "files": [
    {
      "path": "src/app.ts",
      "changeType": "modified",
      "hunks": [
        {
          "oldStart": 10,
          "oldLines": 5,
          "newStart": 10,
          "newLines": 6,
          "header": "export async function buildApp()",
          "lines": [
            {
              "type": "context",
              "content": "  const app = Fastify({",
              "oldLineNumber": 10,
              "newLineNumber": 10
            },
            {
              "type": "deletion",
              "content": "    logger: true,",
              "oldLineNumber": 11
            },
            {
              "type": "addition",
              "content": "    logger: {",
              "newLineNumber": 11
            },
            {
              "type": "addition",
              "content": "      level: 'info',",
              "newLineNumber": 12
            },
            {
              "type": "addition",
              "content": "    },",
              "newLineNumber": 13
            }
          ]
        }
      ],
      "binary": false,
      "additions": 3,
      "deletions": 1
    }
  ],
  "totalAdditions": 3,
  "totalDeletions": 1,
  "totalFiles": 1
}
```

---

### GET `/api/diff/diff-stats`

Returns quick diff statistics without full parsing. Much faster for large diffs when you only need counts.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `projectId` | string (CUID) | Yes | - | Project identifier |
| `base` | string | No | - | Base reference (branch, commit, tag) |
| `compare` | string | No | - | Compare reference (requires `base`) |
| `staged` | boolean | No | `false` | Show only staged changes |

#### Response Schema

```typescript
{
  filesChanged: number;
  additions: number;
  deletions: number;
}
```

#### Example

```
GET /api/diff/diff-stats?projectId=abc123&base=main
```

**Response:**
```json
{
  "filesChanged": 5,
  "additions": 234,
  "deletions": 87
}
```

---

## Error Responses

### 400 Bad Request

Returned for validation errors or invalid git references.

```json
{
  "error": "BadRequest",
  "message": "Cannot specify \"compare\" without \"base\"",
  "statusCode": 400
}
```

**Common causes:**
- Invalid project ID format
- `compare` specified without `base`
- `staged` combined with `base` or `compare`
- Invalid git reference (unknown branch/commit)
- Project directory is not a git repository

### 404 Not Found

Returned when project doesn't exist.

```json
{
  "error": "NotFound",
  "message": "Project abc123 not found",
  "statusCode": 404
}
```

### 500 Internal Server Error

Returned for unexpected server errors.

```json
{
  "error": "InternalServerError",
  "message": "Failed to get diff data",
  "statusCode": 500
}
```

---

## Performance Considerations

### Benchmarks

The endpoint is designed to handle:
- **100 files** with **5000 lines** changed in **< 500ms**
- Typical small changes (< 10 files): **50-100ms**
- Large refactors (100+ files): **300-800ms**

### Optimization Tips

1. **Use `/diff-stats` when possible** - Up to 10x faster for stat-only queries
2. **Reduce `contextLines`** - Lower values parse faster
3. **Use specific references** - `base=HEAD~1` is faster than `base=main...feature`
4. **Monitor response times** - Server logs warnings for responses > 500ms

### Response Time Logging

All requests are logged with performance metrics:

```json
{
  "endpoint": "/diff-data",
  "projectId": "abc123",
  "filesChanged": 45,
  "additions": 1234,
  "deletions": 567,
  "responseTime": 234
}
```

---

## Use Cases

### 1. Diff Viewer UI

Build a GitHub-style diff viewer with syntax highlighting:

```typescript
const response = await fetch(`/api/diff/diff-data?projectId=${id}&base=main`);
const diff = await response.json();

diff.files.forEach(file => {
  renderFileDiff(file);
});
```

### 2. Pull Request Preview

Show what will be included in a PR:

```typescript
const diff = await fetch(
  `/api/diff/diff-data?projectId=${id}&base=main&compare=feature-branch`
);
```

### 3. Commit Review

Review changes before committing:

```typescript
const stagedDiff = await fetch(
  `/api/diff/diff-data?projectId=${id}&staged=true`
);
```

### 4. Change Summary

Show quick stats in the UI:

```typescript
const stats = await fetch(
  `/api/diff/diff-stats?projectId=${id}&base=main`
);
// { filesChanged: 12, additions: 456, deletions: 123 }
```

---

## Implementation Details

### Technology Stack

- **Git diff parsing**: Custom parser for unified diff format
- **Validation**: Zod schemas for type-safe validation
- **Error handling**: Comprehensive git error detection
- **Performance**: Streaming-ready design with buffering

### Supported Diff Types

1. **Working tree** - Uncommitted changes
2. **Staged** - Changes in the index
3. **Branch comparison** - Between two branches
4. **Commit comparison** - Between specific commits
5. **Against ref** - Current state vs any ref

### Binary Files

Binary files are detected and marked:

```json
{
  "path": "image.png",
  "binary": true,
  "hunks": [],
  "additions": 0,
  "deletions": 0
}
```

### File Change Types

- **added** - New file created
- **deleted** - File removed
- **modified** - File content changed
- **renamed** - File moved/renamed
- **copied** - File copied to new location

---

## Testing

Run the test script:

```bash
cd apps/api
npx tsx src/scripts/test-diff.ts
```

Manual API testing:

```bash
# Start the server
npm run dev

# Test endpoint
curl "http://localhost:3001/api/diff/diff-stats?projectId=YOUR_PROJECT_ID"
```

---

## Future Enhancements

Potential improvements for subsequent tasks:

1. **Streaming responses** - For very large diffs (1000+ files)
2. **Caching** - Cache parsed diffs with Redis
3. **Syntax highlighting** - Add language detection and token info
4. **Diff algorithms** - Support for patience diff, histogram diff
5. **Partial loading** - Paginated file loading for huge diffs
6. **WebSocket support** - Real-time diff updates

---

## Related Tasks

- **Task 10.2**: Frontend diff viewer component
- **Task 10.3**: Performance optimization and caching
- **Task 10.4**: Syntax highlighting integration
