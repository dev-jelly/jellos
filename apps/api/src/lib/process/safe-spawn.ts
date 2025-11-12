/**
 * Safe child_process wrapper with timeout and resource management
 */

import { spawn, type SpawnOptions } from 'child_process';

/**
 * Result of a successful process execution
 */
export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

/**
 * Options for safe spawn execution
 */
export interface SafeSpawnOptions {
  timeout?: number; // Timeout in milliseconds (default: 5000)
  maxBuffer?: number; // Max buffer size in bytes (default: 10MB)
  killSignal?: NodeJS.Signals; // Signal to send on timeout (default: SIGTERM)
  env?: Record<string, string>; // Environment variables
  cwd?: string; // Working directory
  shell?: boolean; // Run in shell (default: false for security)
}

/**
 * Error thrown when process times out
 */
export class ProcessTimeoutError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly timeout: number
  ) {
    super(message);
    this.name = 'ProcessTimeoutError';
  }
}

/**
 * Error thrown when buffer size exceeds limit
 */
export class ProcessBufferError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly bufferSize: number
  ) {
    super(message);
    this.name = 'ProcessBufferError';
  }
}

const DEFAULT_TIMEOUT = 5000; // 5 seconds
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10MB
const DEFAULT_KILL_SIGNAL: NodeJS.Signals = 'SIGTERM';

/**
 * Safely spawn a child process with timeout and buffer management
 */
export function safeSpawn(
  command: string,
  args: string[] = [],
  options: SafeSpawnOptions = {}
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
    const killSignal = options.killSignal ?? DEFAULT_KILL_SIGNAL;

    // Build spawn options
    const spawnOptions: SpawnOptions = {
      env: options.env ? { ...process.env, ...options.env } : process.env,
      cwd: options.cwd,
      shell: options.shell ?? false,
    };

    // Spawn the process
    const child = spawn(command, args, spawnOptions);

    let stdout = '';
    let stderr = '';
    let killed = false;
    let timedOut = false;
    let stdoutSize = 0;
    let stderrSize = 0;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (!killed) {
        timedOut = true;
        killed = true;
        child.kill(killSignal);
      }
    }, timeout);

    // Handle stdout
    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdoutSize += Buffer.byteLength(chunk);

        if (stdoutSize > maxBuffer) {
          clearTimeout(timeoutId);
          killed = true;
          child.kill(killSignal);
          reject(
            new ProcessBufferError(
              `Process stdout exceeded max buffer size of ${maxBuffer} bytes`,
              command,
              stdoutSize
            )
          );
          return;
        }

        stdout += chunk;
      });
    }

    // Handle stderr
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderrSize += Buffer.byteLength(chunk);

        if (stderrSize > maxBuffer) {
          clearTimeout(timeoutId);
          killed = true;
          child.kill(killSignal);
          reject(
            new ProcessBufferError(
              `Process stderr exceeded max buffer size of ${maxBuffer} bytes`,
              command,
              stderrSize
            )
          );
          return;
        }

        stderr += chunk;
      });
    }

    // Handle process exit
    child.on('close', (code, signal) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        reject(
          new ProcessTimeoutError(
            `Process '${command}' timed out after ${timeout}ms`,
            command,
            timeout
          )
        );
        return;
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? -1,
        signal,
        timedOut: false,
      });
    });

    // Handle spawn errors
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    // Prevent zombie processes by ensuring child is killed on parent exit
    const cleanup = () => {
      if (!killed && !child.killed) {
        child.kill(killSignal);
      }
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
}

/**
 * Execute a command and return only stdout (throws on non-zero exit)
 */
export async function execCommand(
  command: string,
  args: string[] = [],
  options: SafeSpawnOptions = {}
): Promise<string> {
  const result = await safeSpawn(command, args, options);

  if (result.exitCode !== 0) {
    throw new Error(
      `Command '${command}' exited with code ${result.exitCode}: ${result.stderr || result.stdout}`
    );
  }

  return result.stdout;
}

/**
 * Check if a command exists and is executable
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    // Use 'which' on Unix-like systems, 'where' on Windows
    const checkCommand = process.platform === 'win32' ? 'where' : 'which';
    await safeSpawn(checkCommand, [command], { timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get version from a command (tries --version, -v, version)
 */
export async function getCommandVersion(
  command: string,
  versionArgs: string[] = ['--version']
): Promise<string | null> {
  try {
    const result = await safeSpawn(command, versionArgs, {
      timeout: 3000,
    });
    return result.stdout || result.stderr || null;
  } catch {
    return null;
  }
}
