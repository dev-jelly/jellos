/**
 * PATH scanner for auto-detecting agents
 */

import fs from 'fs/promises';
import path from 'path';
import { KNOWN_AGENTS } from './known-agents';
import type { KnownAgent } from '../../types/agent';

/**
 * Get system PATH directories
 */
export function getPathDirectories(): string[] {
  const pathEnv = process.env.PATH || '';
  const separator = process.platform === 'win32' ? ';' : ':';
  return pathEnv.split(separator).filter((dir) => dir.length > 0);
}

/**
 * Check if a file exists and is executable
 */
async function isExecutable(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return false;
    }

    // On Windows, check if it has .exe, .bat, .cmd, or .ps1 extension
    if (process.platform === 'win32') {
      const ext = path.extname(filePath).toLowerCase();
      return ['.exe', '.bat', '.cmd', '.ps1'].includes(ext);
    }

    // On Unix-like systems, check if file has execute permission
    try {
      await fs.access(filePath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Find executable in PATH directories
 */
export async function findExecutableInPath(
  command: string
): Promise<string | null> {
  const pathDirs = getPathDirectories();

  // Add potential extensions for Windows
  const extensions =
    process.platform === 'win32' ? ['', '.exe', '.bat', '.cmd', '.ps1'] : [''];

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, command + ext);
      if (await isExecutable(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Scan PATH for known agents
 */
export async function scanPathForAgents(): Promise<
  Array<{ agent: KnownAgent; path: string; command: string }>
> {
  const found: Array<{ agent: KnownAgent; path: string; command: string }> =
    [];

  for (const agent of KNOWN_AGENTS) {
    for (const command of agent.commands) {
      // Skip commands with spaces (like "npx playwright") for PATH scanning
      if (command.includes(' ')) {
        continue;
      }

      const execPath = await findExecutableInPath(command);
      if (execPath) {
        found.push({
          agent,
          path: execPath,
          command,
        });
        break; // Found one command for this agent, move to next agent
      }
    }
  }

  return found;
}

/**
 * Check if specific command exists in PATH
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
  // Handle compound commands (e.g., "npx playwright")
  const mainCommand = command.split(' ')[0];
  const execPath = await findExecutableInPath(mainCommand);
  return execPath !== null;
}
