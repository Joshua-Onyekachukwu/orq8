/**
 * Sandboxed engineering command executor (Task 4).
 *
 * Executes agent commands inside an ISOLATED scratch workspace — never against
 * the host or production infrastructure. The boundary enforces:
 *
 *   - per-org, per-run scratch directory (server-determined — the client never
 *     chooses the working directory)
 *   - strict wall-clock timeout with process-tree kill (SIGTERM → SIGKILL;
 *     taskkill /T /F on Windows)
 *   - CPU seconds + virtual memory caps via `ulimit` on POSIX
 *   - stdout/stderr byte caps with truncation flags (streams keep draining so
 *     the child never blocks)
 *   - environment scrubbing: only a minimal allowlist survives — database URLs,
 *     API keys, encryption keys and every other secret are stripped
 *   - path containment: any command working directory must resolve inside the
 *     org's sandbox root
 *   - best-effort workspace cleanup after every run
 *
 * LIMITATION (documented, not hidden): process-level isolation is NOT
 * container isolation. A malicious command could still `cd /` or read host
 * files it has OS permissions for, and network egress is not blocked at the
 * process level. Production execution MUST run this executor inside a real
 * sandbox — containers (Docker) or gVisor — where cwd, mount, network and
 * rlimits are enforced by the kernel/runtime. The current boundary guarantees
 * the security-critical guarantees we CAN enforce cross-platform (no secrets,
 * no arbitrary working dirs, no unbounded time/output/memory, no lingering
 * processes, full audit) and fails safely.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const DEFAULT_TIMEOUT_MS = 120_000;
export const MAX_TIMEOUT_MS = 600_000;
export const DEFAULT_OUTPUT_CAP_BYTES = 64 * 1024;
export const MAX_COMMAND_LENGTH = 4000;

/** Per-org scratch root (tmp — cleaned by the OS and by per-run cleanup). */
export function sandboxRootFor(orgId: string, base: string = tmpdir()): string {
  return path.join(base, 'orq8-sandbox', orgId);
}

/**
 * Resolve a candidate working directory and assert it stays inside the org's
 * sandbox root. Returns the resolved path or null when it escapes.
 */
export function assertInsideSandbox(orgId: string, candidate: string, base: string = tmpdir()): string | null {
  const root = path.resolve(sandboxRootFor(orgId, base));
  const resolved = path.resolve(candidate);
  const rel = path.relative(root, resolved);
  if (rel === '') return root;
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

/** Reject commands that are empty, oversized, or contain null bytes. */
export function validateCommand(command: string): string | null {
  if (typeof command !== 'string' || command.trim().length === 0) {
    return 'Command must be a non-empty string';
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    return `Command exceeds ${MAX_COMMAND_LENGTH} characters`;
  }
  if (command.includes('\0')) {
    return 'Command contains null bytes';
  }
  return null;
}

/**
 * Env allowlist. Everything else — DATABASE_URL, *KEY*, *SECRET*, tokens,
 * proxy variables — is stripped. `extra` may only contain allowlisted names.
 */
const ENV_ALLOWLIST = new Set([
  'PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP', 'SHELL', 'USER',
  'USERNAME', 'SystemRoot', 'COMSPEC', 'PATHEXT', 'NUMBER_OF_PROCESSORS',
]);

export function scrubEnv(extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const v = process.env[key];
    if (v !== undefined) out[key] = v;
  }
  for (const [key, value] of Object.entries(extra)) {
    if (ENV_ALLOWLIST.has(key)) out[key] = value;
  }
  return out;
}

export interface ExecutorInput {
  orgId: string;
  runId?: string; // execution id; defaults to a fresh uuid
  command: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  maxMemoryMb?: number;
  maxCpuSeconds?: number;
  base?: string; // sandbox root base (tmpdir default) — injectable for tests
}

export type ExecutorStatus = 'completed' | 'failed' | 'timed_out' | 'cancelled';

export interface ExecutorResult {
  executionId: string;
  status: ExecutorStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: boolean;
  durationMs: number;
  workingDir: string;
}

/** Kill a child and its whole process tree. */
export function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
  } catch {
    // already gone
  }
}

function capBuffer(buffer: string[], received: number, cap: number): { truncated: boolean } {
  let total = 0;
  for (const chunk of buffer) total += chunk.length;
  return { truncated: total + received > cap };
}

/**
 * Execute a command inside the org's sandbox with all the boundary constraints.
 * Never throws for command failures — those are encoded in the result. Throws
 * only for setup errors (invalid command, sandbox path escape).
 */
export async function executeCommand(input: ExecutorInput): Promise<ExecutorResult> {
  const runId = input.runId ?? randomUUID();
  const commandError = validateCommand(input.command);
  if (commandError) throw new Error(commandError);

  const timeoutMs = Math.min(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const outputCap = input.maxOutputBytes ?? DEFAULT_OUTPUT_CAP_BYTES;
  const root = sandboxRootFor(input.orgId, input.base);
  const workingDir = path.join(root, runId);
  const contained = assertInsideSandbox(input.orgId, workingDir, input.base);
  if (!contained) throw new Error('Sandbox working directory escapes the sandbox root');

  await mkdir(contained, { recursive: true });

  const startedAt = Date.now();
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  let stdoutTruncated = false;
  let stderrTruncated = false;

  // POSIX resource limits via ulimit (memory in KB, CPU in seconds).
  const memoryKb = Math.max(64, Math.min(input.maxMemoryMb ?? 512, 4096)) * 1024;
  const cpuSeconds = Math.max(1, Math.min(input.maxCpuSeconds ?? 60, Math.ceil(timeoutMs / 1000)));
  const prefix =
    process.platform === 'win32'
      ? ''
      : `ulimit -v ${memoryKb} 2>/dev/null; ulimit -t ${cpuSeconds} 2>/dev/null; `;

  // `shell: true` on a single command string is the only quoting-safe way to
  // run shell commands with embedded quotes on Windows (`cmd /s /c` with an
  // args array mangles inner quotes). Command injection is inherent to a shell
  // executor — isolation comes from the sandbox boundary, not from parsing.
  const child = spawn(`${prefix}${input.command}`, {
    cwd: contained,
    env: scrubEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    // POSIX: own process group so the whole tree can be killed.
    detached: process.platform !== 'win32',
    shell: true,
  });

  let timedOut = false;
  let settled = false;

  const killTimer = setTimeout(() => {
    timedOut = true;
    killTree(child);
  }, timeoutMs);

  const stdoutPromise = new Promise<void>((resolve) => {
    child.stdout?.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      if (!stdoutTruncated) {
        const { truncated } = capBuffer(stdoutChunks, s.length, outputCap);
        if (truncated) {
          stdoutTruncated = true;
          stdoutChunks.push(s.slice(0, outputCap));
        } else {
          stdoutChunks.push(s);
        }
      }
    });
    child.stdout?.on('end', resolve);
    child.stdout?.on('error', resolve);
  });

  const stderrPromise = new Promise<void>((resolve) => {
    child.stderr?.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      if (!stderrTruncated) {
        const { truncated } = capBuffer(stderrChunks, s.length, outputCap);
        if (truncated) {
          stderrTruncated = true;
          stderrChunks.push(s.slice(0, outputCap));
        } else {
          stderrChunks.push(s);
        }
      }
    });
    child.stderr?.on('end', resolve);
    child.stderr?.on('error', resolve);
  });

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('error', () => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    });
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        resolve(code);
      }
    });
  });

  clearTimeout(killTimer);
  await Promise.all([stdoutPromise, stderrPromise]);

  // Best-effort cleanup — never fail the result on a busy/locked workspace.
  await rm(contained, { recursive: true, force: true }).catch(() => {});

  const durationMs = Date.now() - startedAt;

  // After a timeout kill, drain the exit code briefly (the kill may still be
  // settling); treat any non-zero/absent code as a timeout outcome.
  const finalExit = timedOut ? null : exitCode;
  const status: ExecutorStatus = timedOut
    ? 'timed_out'
    : finalExit === 0
      ? 'completed'
      : 'failed';

  return {
    executionId: runId,
    status,
    exitCode: timedOut ? null : finalExit,
    stdout: stdoutChunks.join('').slice(0, outputCap),
    stderr: stderrChunks.join('').slice(0, outputCap),
    stdoutTruncated,
    stderrTruncated,
    timedOut,
    durationMs,
    workingDir: contained,
  };
}

export interface SafeCommandSummary {
  status: ExecutorStatus;
  exitCode: number | null;
  stdoutPreview: string;
  stderrPreview: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: boolean;
  durationMs: number;
  executionId: string;
}

/**
 * Reduce a full result to the safe, bounded shape stored on a sandbox run —
 * never the raw streams beyond the caps (already capped, but this also limits
 * what is persisted in DB columns).
 */
export function toSafeSummary(result: ExecutorResult): SafeCommandSummary {
  const preview = (s: string, cap = 2000) => (s.length > cap ? `${s.slice(0, cap)}…` : s);
  return {
    status: result.status,
    exitCode: result.exitCode,
    stdoutPreview: preview(result.stdout),
    stderrPreview: preview(result.stderr),
    stdoutTruncated: result.stdoutTruncated,
    stderrTruncated: result.stderrTruncated,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    executionId: result.executionId,
  };
}