import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// docs/58 — proof that the esbuild-bundled Lambda (what Vercel actually runs)
// boots and serves /healthz with a production config. Gated on secrets so CI
// without them skips cleanly.
// vitest may run from apps/api or the repo root — probe both layouts.
const candidates = (rel: string): string[] => [
  join(process.cwd(), rel),
  join(process.cwd(), '../../', rel), // apps/api → repo root
];
const secretsPath = candidates('.freebuff/prod-secrets.txt').find((p) => {
  try {
    return readFileSync(p, 'utf8').includes('=');
  } catch {
    return false;
  }
});
// The test loads secrets from the file itself; the file's presence is the gate.
const hasSecrets = Boolean(secretsPath);

const bundle = candidates('apps/api/api/index.js').find((p) => {
  try {
    return readFileSync(p, 'utf8').length > 0;
  } catch {
    return false;
  }
});
const bundleExists = Boolean(bundle);

const describeOrSkip = hasSecrets && bundleExists ? describe : describe.skip;

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}

describeOrSkip('esbuild bundle (api/index.js — committed artifact) in production mode', () => {
  it('boots and answers /healthz', async () => {
    // Parse prod secrets from the local file into env for this process.
    for (const line of readFileSync(secretsPath!, 'utf8').split(/\r?\n/)) {
      const eq = line.indexOf('=');
      if (eq > 0) process.env[line.slice(0, eq)] = line.slice(eq + 1);
    }
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/orq8'; // boot-only; health never queries

    // Mirror Vercel's bridge: mod.default ?? mod (CJS module.exports = handler).
    const require = createRequire(import.meta.url);
    const mod = require(bundle!) as { default?: (req: unknown, res: unknown) => Promise<void> };
    const handler = (mod.default ?? mod) as (req: unknown, res: unknown) => Promise<void>;
    expect(typeof handler).toBe('function');

    const res: FakeRes = {
      statusCode: 0,
      headers: {},
      body: '',
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body) {
        this.body = body;
      },
    };
    await handler({ method: 'GET', url: '/healthz', headers: {}, body: undefined } as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ data: { status: 'ok', service: 'orq8-api' } });
  }, 30_000);
});
