/**
 * Syntax Highlighter Web Worker
 * Performs syntax highlighting off the main thread for better performance
 */

import Prism from 'prismjs';

// Import language grammars
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-diff';

export interface HighlightRequest {
  id: string;
  code: string;
  language: string;
}

export interface HighlightResponse {
  id: string;
  html: string;
  tokens: Prism.Token[];
  error?: string;
}

export interface BatchHighlightRequest {
  id: string;
  items: Array<{
    lineId: string;
    code: string;
    language: string;
  }>;
}

export interface BatchHighlightResponse {
  id: string;
  results: Array<{
    lineId: string;
    html: string;
    tokens: Prism.Token[];
  }>;
  error?: string;
}

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    bash: 'bash',
    py: 'python',
    go: 'go',
    rs: 'rust',
    sql: 'sql',
    dockerfile: 'docker',
    diff: 'diff',
  };

  return languageMap[ext] || 'javascript';
}

/**
 * Highlight code using Prism
 */
function highlightCode(code: string, language: string): { html: string; tokens: Prism.Token[] } {
  try {
    // Get the grammar for the language
    const grammar = Prism.languages[language];

    if (!grammar) {
      // Fallback to plain text
      return {
        html: code,
        tokens: []
      };
    }

    // Tokenize the code
    const tokens = Prism.tokenize(code, grammar);

    // Generate HTML from tokens
    const html = Prism.Token.stringify(tokens, language);

    return { html, tokens };
  } catch (error) {
    console.error('Highlighting error:', error);
    return { html: code, tokens: [] };
  }
}

/**
 * Handle single highlight request
 */
function handleHighlight(request: HighlightRequest): HighlightResponse {
  try {
    const { html, tokens } = highlightCode(request.code, request.language);

    return {
      id: request.id,
      html,
      tokens,
    };
  } catch (error) {
    return {
      id: request.id,
      html: request.code,
      tokens: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle batch highlight request
 */
function handleBatchHighlight(request: BatchHighlightRequest): BatchHighlightResponse {
  try {
    const results = request.items.map((item) => {
      const { html, tokens } = highlightCode(item.code, item.language);
      return {
        lineId: item.lineId,
        html,
        tokens,
      };
    });

    return {
      id: request.id,
      results,
    };
  } catch (error) {
    return {
      id: request.id,
      results: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Message handler
 */
self.addEventListener('message', (event: MessageEvent) => {
  const data = event.data;

  if (data.type === 'highlight') {
    const response = handleHighlight(data as HighlightRequest);
    self.postMessage({ type: 'highlight', ...response });
  } else if (data.type === 'batch-highlight') {
    const response = handleBatchHighlight(data as BatchHighlightRequest);
    self.postMessage({ type: 'batch-highlight', ...response });
  } else if (data.type === 'detect-language') {
    const language = detectLanguage(data.filePath);
    self.postMessage({ type: 'detect-language', id: data.id, language });
  }
});

// Export types for use in main thread
export type { Prism };
