/**
 * Highlighted Diff Viewer Demo Component
 * Demonstrates VirtualDiffViewerHighlighted with syntax highlighting
 */

'use client';

import { useState } from 'react';
import { VirtualDiffViewerHighlighted } from './virtual-diff-viewer-highlighted';
import { DiffViewModeToggle } from './diff-view-mode-toggle';
import { useDiffViewMode } from '@/lib/hooks/use-diff-view-mode';
import type { FileDiff } from '@/lib/types/diff';

/**
 * Generate sample diff data with more complex code for highlighting
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
            {
              type: 'addition',
              content: '',
              newLineNumber: 8,
            },
            {
              type: 'addition',
              content: '/**',
              newLineNumber: 9,
            },
            {
              type: 'addition',
              content: ' * Password strength validator',
              newLineNumber: 10,
            },
            {
              type: 'addition',
              content: ' */',
              newLineNumber: 11,
            },
            {
              type: 'addition',
              content: 'export function isStrongPassword(password: string): boolean {',
              newLineNumber: 12,
            },
            {
              type: 'addition',
              content: '  const minLength = 8;',
              newLineNumber: 13,
            },
            {
              type: 'addition',
              content: '  const hasUpperCase = /[A-Z]/.test(password);',
              newLineNumber: 14,
            },
            {
              type: 'addition',
              content: '  const hasLowerCase = /[a-z]/.test(password);',
              newLineNumber: 15,
            },
            {
              type: 'addition',
              content: '  const hasNumber = /[0-9]/.test(password);',
              newLineNumber: 16,
            },
            {
              type: 'addition',
              content: '  const hasSpecial = /[!@#$%^&*]/.test(password);',
              newLineNumber: 17,
            },
            {
              type: 'addition',
              content: '  return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecial;',
              newLineNumber: 18,
            },
            {
              type: 'addition',
              content: '}',
              newLineNumber: 19,
            },
          ],
        },
      ],
    },
    {
      path: 'package.json',
      changeType: 'modified',
      binary: false,
      additions: 3,
      deletions: 1,
      hunks: [
        {
          oldStart: 15,
          oldLines: 10,
          newStart: 15,
          newLines: 12,
          header: 'dependencies',
          lines: [
            {
              type: 'context',
              content: '  "dependencies": {',
              oldLineNumber: 15,
              newLineNumber: 15,
            },
            {
              type: 'context',
              content: '    "react": "^18.2.0",',
              oldLineNumber: 16,
              newLineNumber: 16,
            },
            {
              type: 'deletion',
              content: '    "react-dom": "^18.2.0"',
              oldLineNumber: 17,
            },
            {
              type: 'addition',
              content: '    "react-dom": "^18.2.0",',
              newLineNumber: 17,
            },
            {
              type: 'addition',
              content: '    "zod": "^3.22.0",',
              newLineNumber: 18,
            },
            {
              type: 'addition',
              content: '    "bcrypt": "^5.1.0"',
              newLineNumber: 19,
            },
            {
              type: 'context',
              content: '  }',
              oldLineNumber: 18,
              newLineNumber: 20,
            },
          ],
        },
      ],
    },
  ];
}

export function DiffViewerHighlightedDemo() {
  const [files] = useState<FileDiff[]>(generateSampleDiff());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [enableHighlighting, setEnableHighlighting] = useState(true);
  const { viewMode, setViewMode } = useDiffViewMode();

  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Virtual Diff Viewer with Syntax Highlighting
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Web Worker-based syntax highlighting for 5000+ lines
            </p>
          </div>
          <div className="flex items-center gap-3">
            <DiffViewModeToggle
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              showKeyboardHint
            />
            <button
              onClick={() => setEnableHighlighting(!enableHighlighting)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                enableHighlighting
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {enableHighlighting ? 'Highlighting: ON' : 'Highlighting: OFF'}
            </button>
          </div>
        </div>
        {selectedFile && (
          <div className="mt-2 text-sm text-blue-600 dark:text-blue-400">
            Selected: <code className="font-mono">{selectedFile}</code>
          </div>
        )}
      </div>

      {/* Diff Viewer */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="h-full rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <VirtualDiffViewerHighlighted
            files={files}
            onFileClick={setSelectedFile}
            enableHighlighting={enableHighlighting}
            viewMode={viewMode}
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
          <div>
            <span className="font-medium">View Mode:</span>{' '}
            <span className="text-blue-600 dark:text-blue-400">
              {viewMode === 'split' ? 'Split' : 'Unified'}
            </span>
          </div>
          <div className="ml-auto">
            <span className="font-medium">Syntax Highlighting:</span>{' '}
            <span className={enableHighlighting ? 'text-green-600' : 'text-gray-500'}>
              {enableHighlighting ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
