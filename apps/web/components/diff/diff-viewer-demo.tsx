/**
 * Diff Viewer Demo Component
 * Demonstrates VirtualDiffViewer with sample data
 */

'use client';

import { useState } from 'react';
import { VirtualDiffViewer } from './virtual-diff-viewer';
import type { FileDiff } from '@/lib/types/diff';

/**
 * Generate sample diff data for demo
 */
function generateSampleDiff(): FileDiff[] {
  return [
    {
      path: 'src/components/auth/login-form.tsx',
      changeType: 'modified',
      binary: false,
      additions: 15,
      deletions: 8,
      hunks: [
        {
          oldStart: 10,
          oldLines: 20,
          newStart: 10,
          newLines: 27,
          header: 'function LoginForm()',
          lines: [
            {
              type: 'context',
              content: 'export function LoginForm() {',
              oldLineNumber: 10,
              newLineNumber: 10,
            },
            {
              type: 'context',
              content: '  const [email, setEmail] = useState("");',
              oldLineNumber: 11,
              newLineNumber: 11,
            },
            {
              type: 'deletion',
              content: '  const [password, setPassword] = useState("");',
              oldLineNumber: 12,
            },
            {
              type: 'addition',
              content: '  const [password, setPassword] = useState<string>("");',
              newLineNumber: 12,
            },
            {
              type: 'addition',
              content: '  const [error, setError] = useState<string | null>(null);',
              newLineNumber: 13,
            },
            {
              type: 'context',
              content: '',
              oldLineNumber: 13,
              newLineNumber: 14,
            },
            {
              type: 'deletion',
              content: '  const handleSubmit = async (e: FormEvent) => {',
              oldLineNumber: 14,
            },
            {
              type: 'addition',
              content: '  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {',
              newLineNumber: 15,
            },
            {
              type: 'context',
              content: '    e.preventDefault();',
              oldLineNumber: 15,
              newLineNumber: 16,
            },
            {
              type: 'addition',
              content: '    setError(null);',
              newLineNumber: 17,
            },
            {
              type: 'context',
              content: '    try {',
              oldLineNumber: 16,
              newLineNumber: 18,
            },
            {
              type: 'context',
              content: '      await login(email, password);',
              oldLineNumber: 17,
              newLineNumber: 19,
            },
            {
              type: 'context',
              content: '    } catch (err) {',
              oldLineNumber: 18,
              newLineNumber: 20,
            },
            {
              type: 'deletion',
              content: '      console.error(err);',
              oldLineNumber: 19,
            },
            {
              type: 'addition',
              content: '      setError(err instanceof Error ? err.message : "Login failed");',
              newLineNumber: 21,
            },
            {
              type: 'context',
              content: '    }',
              oldLineNumber: 20,
              newLineNumber: 22,
            },
            {
              type: 'context',
              content: '  };',
              oldLineNumber: 21,
              newLineNumber: 23,
            },
          ],
        },
      ],
    },
    {
      path: 'src/utils/validation.ts',
      changeType: 'added',
      binary: false,
      additions: 25,
      deletions: 0,
      hunks: [
        {
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: 25,
          header: '',
          lines: [
            {
              type: 'addition',
              content: '/**',
              newLineNumber: 1,
            },
            {
              type: 'addition',
              content: ' * Email validation utility',
              newLineNumber: 2,
            },
            {
              type: 'addition',
              content: ' */',
              newLineNumber: 3,
            },
            {
              type: 'addition',
              content: 'export function isValidEmail(email: string): boolean {',
              newLineNumber: 4,
            },
            {
              type: 'addition',
              content: '  const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;',
              newLineNumber: 5,
            },
            {
              type: 'addition',
              content: '  return regex.test(email);',
              newLineNumber: 6,
            },
            {
              type: 'addition',
              content: '}',
              newLineNumber: 7,
            },
          ],
        },
      ],
    },
    {
      path: 'src/lib/deprecated-helper.ts',
      changeType: 'deleted',
      binary: false,
      additions: 0,
      deletions: 10,
      hunks: [
        {
          oldStart: 1,
          oldLines: 10,
          newStart: 0,
          newLines: 0,
          header: '',
          lines: [
            {
              type: 'deletion',
              content: '// Deprecated helper function',
              oldLineNumber: 1,
            },
            {
              type: 'deletion',
              content: 'export function oldHelper() {',
              oldLineNumber: 2,
            },
            {
              type: 'deletion',
              content: '  return "deprecated";',
              oldLineNumber: 3,
            },
            {
              type: 'deletion',
              content: '}',
              oldLineNumber: 4,
            },
          ],
        },
      ],
    },
  ];
}

export function DiffViewerDemo() {
  const [files] = useState<FileDiff[]>(generateSampleDiff());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Virtual Diff Viewer Demo
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          High-performance virtual scrolling for large diffs (5000+ lines)
        </p>
        {selectedFile && (
          <div className="mt-2 text-sm text-blue-600 dark:text-blue-400">
            Selected: <code className="font-mono">{selectedFile}</code>
          </div>
        )}
      </div>

      {/* Diff Viewer */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="h-full rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <VirtualDiffViewer
            files={files}
            onFileClick={setSelectedFile}
          />
        </div>
      </div>

      {/* Stats Footer */}
      <div className="border-t border-gray-200 bg-white px-6 py-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
          <div>
            <span className="font-medium">Files:</span> {files.length}
          </div>
          <div>
            <span className="font-medium">Total Lines:</span>{' '}
            {files.reduce((sum, f) => sum + f.hunks.reduce((hSum, h) => hSum + h.lines.length, 0), 0)}
          </div>
          <div>
            <span className="font-medium text-green-600 dark:text-green-400">Additions:</span>{' '}
            +{files.reduce((sum, f) => sum + f.additions, 0)}
          </div>
          <div>
            <span className="font-medium text-red-600 dark:text-red-400">Deletions:</span>{' '}
            -{files.reduce((sum, f) => sum + f.deletions, 0)}
          </div>
        </div>
      </div>
    </div>
  );
}
