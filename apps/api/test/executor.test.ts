import { describe, expect, it, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertInsideSandbox,
  executeCommand,
  killTree,
  sandboxRootFor,
  scrubEnv,
  toSafeSummary,
  validateCommand,
  MAX_COMMAND_LENGTH,
} from '../src/services/executor.js';

// Each test gets its own scratch base so parallel tests cannot collide.
async function freshBase(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'orq8-exec-test-'));
}

describe('validateCommand', () => {
  it('rejects empty and whitespace-only commands', () => {
    expect(validateCommand('')).not.toBeNull();
    expect(validateCommand('   ')).not.toBeNull();
  });

  it('rejects oversized commands', () => {
    expect(validateCommand('x'.repeat(MAX_COMMAND_LENGTH + 1))).not.toBeNull();
  });

  it('rejects null bytes', () => {
    expect(validateCommand('echo a\u0000b')).not.toBeNull();
  });

  it('accepts a normal command', () => {
    expect(validateCommand('echo hello')).toBeNull();
  });
});

describe('sandbox containment', () => {
  it('resolves the org sandbox root deterministically', () => {
    expect(sandboxRootFor('org-1')).toBe(path.join(tmpdir(), 'orq8-sandbox', 'org-1'));
  });

  it('accepts paths inside the sandbox', async () => {
    const base = await freshBase();
    const root = sandboxRootFor('org-1', base);
    const inside = path.join(root, 'run-123', 'src');
    const resolved = assertInsideSandbox('org-1', inside, base);
    expect(resolved).toBe(path.resolve(inside));
  });

  it('rejects paths that escape via parent traversal', async () => {
    const base = await freshBase();
    const root = sandboxRootFor('org-1', base);
    const escaping = path.join(root, 'run-123', '..', '..', '..', 'etc');
    expect(assertInsideSandbox('org-1', escaping, base)).toBeNull();
  });

  it('rejects absolute paths outside the sandbox', async () => {
    const base = await freshBase();
    const outside = path.join(base, 'other-org');
    expect(assertInsideSandbox('org-1', outside, base)).toBeNull();
  });
});

describe('scrubEnv', () => {
  const originalDbUrl = process.env.DATABASE_URL;
  const originalSecret = process.env.ORQ8_TEST_SECRET;

  afterEach(() => {
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;
    if (originalSecret === undefined) delete process.env.ORQ8_TEST_SECRET;
    else process.env.ORQ8_TEST_SECRET = originalSecret;
  });

  it('strips secrets, keys and tokens', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@db/orq8';
    process.env.ORQ8_TEST_SECRET = 'hunter2';
    const env = scrubEnv();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.ORQ8_TEST_SECRET).toBeUndefined();
    expect(env.API_KEY).toBeUndefined();
  });

  it('keeps the minimal allowlist and rejects non-allowlisted extras', () => {
    const env = scrubEnv({ PATH: '/custom', LEAKED_TOKEN: 'nope' });
    expect(env.PATH).toBe('/custom');
    expect(env.LEAKED_TOKEN).toBeUndefined();
  });

  it('the running child never sees scrubbed secrets', async () => {
    const base = await freshBase();
    process.env.ORQ8_TEST_SECRET = 'hunter2';
    const result = await executeCommand({
      orgId: 'org-scrub',
      base,
      command: `node -e "console.log(process.env.ORQ8_TEST_SECRET || 'CLEAN')"`,
      timeoutMs: 10_000,
    });
    expect(result.status).toBe('completed');
    expect(result.stdout).toContain('CLEAN');
    expect(result.stdout).not.toContain('hunter2');
  });
});

describe('executeCommand', () => {
  it('runs a successful command and captures stdout', async () => {
    const base = await freshBase();
    const result = await executeCommand({
      orgId: 'org-ok',
      base,
      command: `node -e "process.stdout.write('hello-from-sandbox')"`,
      timeoutMs: 10_000,
    });
    expect(result.status).toBe('completed');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello-from-sandbox');
    expect(result.timedOut).toBe(false);
    expect(result.stdoutTruncated).toBe(false);
  });

  it('captures stderr separately', async () => {
    const base = await freshBase();
    const result = await executeCommand({
      orgId: 'org-err',
      base,
      command: `node -e "console.error('boom')"`,
      timeoutMs: 10_000,
    });
    expect(result.status).toBe('completed');
    expect(result.stderr).toContain('boom');
  });

  it('reports non-zero exit codes as failed', async () => {
    const base = await freshBase();
    const result = await executeCommand({
      orgId: 'org-fail',
      base,
      command: `node -e "process.exit(3)"`,
      timeoutMs: 10_000,
    });
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(3);
  });

  it('kills long-running processes and reports timed_out', async () => {
    const base = await freshBase();
    const started = Date.now();
    const result = await executeCommand({
      orgId: 'org-timeout',
      base,
      command: `node -e "setTimeout(() => {}, 60_000)"`,
      timeoutMs: 400,
    });
    expect(result.status).toBe('timed_out');
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(Date.now() - started).toBeLessThan(30_000);
  }, 30_000);

  it('caps stdout at the byte limit and flags truncation', async () => {
    const base = await freshBase();
    const result = await executeCommand({
      orgId: 'org-trunc',
      base,
      command: `node -e "process.stdout.write('x'.repeat(200_000))"`,
      timeoutMs: 10_000,
      maxOutputBytes: 2048,
    });
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(2048);
  });

  it('executes inside the org sandbox root', async () => {
    const base = await freshBase();
    const result = await executeCommand({
      orgId: 'org-cwd',
      base,
      command: `node -e "console.log(process.cwd())"`,
      timeoutMs: 10_000,
    });
    expect(result.status).toBe('completed');
    expect(result.stdout.trim()).toContain(path.join('orq8-sandbox', 'org-cwd'));
    expect(result.stdout.trim()).toContain(result.executionId);
  });

  it('rejects commands that would escape the sandbox', async () => {
    const base = await freshBase();
    const root = sandboxRootFor('org-escape', base);
    // A runId shaped as a path traversal — the executor must refuse it.
    await expect(
      executeCommand({
        orgId: 'org-escape',
        base,
        runId: path.join('..', '..', 'evil'),
        command: 'echo pwned',
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow(/escapes/);
    // No sandbox directory may have been created for the rejected run.
    expect(await access(root).then(() => false).catch(() => true)).toBe(true);
  });

  it('rejects invalid commands before spawning', async () => {
    await expect(
      executeCommand({ orgId: 'org-invalid', command: '', timeoutMs: 1_000 }),
    ).rejects.toThrow(/non-empty/);
  });
});

describe('toSafeSummary', () => {
  it('produces a bounded, structured summary', async () => {
    const base = await freshBase();
    const result = await executeCommand({
      orgId: 'org-summary',
      base,
      command: `node -e "process.stdout.write('ok')"`,
      timeoutMs: 10_000,
    });
    const summary = toSafeSummary(result);
    expect(summary.status).toBe('completed');
    expect(summary.exitCode).toBe(0);
    expect(summary.stdoutPreview).toContain('ok');
    expect(summary.executionId).toBeTruthy();
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('truncates long previews', () => {
    const summary = toSafeSummary({
      executionId: 'x',
      status: 'completed',
      exitCode: 0,
      stdout: 'y'.repeat(10_000),
      stderr: '',
      stdoutTruncated: true,
      stderrTruncated: false,
      timedOut: false,
      durationMs: 1,
      workingDir: '/tmp',
    });
    expect(summary.stdoutPreview.length).toBeLessThan(10_000);
    expect(summary.stdoutPreview.endsWith('…')).toBe(true);
  });
});

describe('killTree', () => {
  it('is safe to call on a dead or spawned process', () => {
    const child = spawn(process.platform === 'win32' ? 'cmd.exe' : '/bin/sh', ['-c', 'exit 0']);
    child.on('exit', () => killTree(child));
    // Calling with a pid-less object must not throw either.
    expect(() => killTree({} as never)).not.toThrow();
  });
});