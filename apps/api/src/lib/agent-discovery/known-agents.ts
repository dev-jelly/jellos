/**
 * Known agents that can be auto-detected
 */

import type { KnownAgent } from '../../types/agent';

/**
 * Registry of known code agents
 */
export const KNOWN_AGENTS: KnownAgent[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    commands: ['claude', 'claude-code'],
    versionArgs: ['--version'],
    versionPattern: /(\d+\.\d+\.\d+)/,
  },
  {
    id: 'playwright',
    name: 'Playwright',
    commands: ['playwright', 'npx playwright'],
    versionArgs: ['--version'],
    versionPattern: /Version (\d+\.\d+\.\d+)/,
  },
  {
    id: 'chrome-devtools',
    name: 'Chrome DevTools',
    commands: ['chrome', 'google-chrome', 'chromium'],
    versionArgs: ['--version'],
    versionPattern: /Chrome\/(\d+\.\d+\.\d+\.\d+)/,
  },
  {
    id: 'serena',
    name: 'Serena MCP',
    commands: ['serena', 'npx serena'],
    versionArgs: ['--version'],
  },
  {
    id: 'tavily',
    name: 'Tavily Search',
    commands: ['tavily'],
    versionArgs: ['--version'],
  },
  {
    id: 'context7',
    name: 'Context7',
    commands: ['context7'],
    versionArgs: ['--version'],
  },
  {
    id: 'magic',
    name: '21st Magic',
    commands: ['magic', '21st'],
    versionArgs: ['--version'],
  },
  {
    id: 'task-master',
    name: 'Task Master AI',
    commands: ['task-master', 'npx task-master-ai'],
    versionArgs: ['--version'],
  },
  {
    id: 'node',
    name: 'Node.js',
    commands: ['node'],
    versionArgs: ['--version'],
    versionPattern: /v(\d+\.\d+\.\d+)/,
  },
  {
    id: 'npm',
    name: 'npm',
    commands: ['npm'],
    versionArgs: ['--version'],
  },
  {
    id: 'pnpm',
    name: 'pnpm',
    commands: ['pnpm'],
    versionArgs: ['--version'],
  },
  {
    id: 'yarn',
    name: 'Yarn',
    commands: ['yarn'],
    versionArgs: ['--version'],
  },
  {
    id: 'git',
    name: 'Git',
    commands: ['git'],
    versionArgs: ['--version'],
    versionPattern: /git version (\d+\.\d+\.\d+)/,
  },
  {
    id: 'docker',
    name: 'Docker',
    commands: ['docker'],
    versionArgs: ['--version'],
    versionPattern: /Docker version (\d+\.\d+\.\d+)/,
  },
  {
    id: 'python',
    name: 'Python',
    commands: ['python3', 'python'],
    versionArgs: ['--version'],
    versionPattern: /Python (\d+\.\d+\.\d+)/,
  },
  {
    id: 'go',
    name: 'Go',
    commands: ['go'],
    versionArgs: ['version'],
    versionPattern: /go(\d+\.\d+\.\d+)/,
  },
  {
    id: 'rust',
    name: 'Rust',
    commands: ['rustc'],
    versionArgs: ['--version'],
    versionPattern: /rustc (\d+\.\d+\.\d+)/,
  },
];

/**
 * Get known agent by ID
 */
export function getKnownAgent(id: string): KnownAgent | undefined {
  return KNOWN_AGENTS.find((agent) => agent.id === id);
}

/**
 * Get known agent by command name
 */
export function getKnownAgentByCommand(
  command: string
): KnownAgent | undefined {
  return KNOWN_AGENTS.find((agent) => agent.commands.includes(command));
}
