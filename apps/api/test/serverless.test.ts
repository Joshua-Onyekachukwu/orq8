import { describe, expect, it } from 'vitest';
import handler from '../src/serverless.js';

// docs/58 — the Vercel serverless entry adapts buildApp() to Vercel's req/res
// shape via inject(). These tests exercise that exact path with a mock
// VercelRequest/VercelResponse — no DB needed (health route never touches it).

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}

function makeRes(): FakeRes {
  return {
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
}

function makeReq(
  overrides: { method?: string; url?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  return {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? '/',
    // A JSON POST carries its content-type (Vercel forwards it); without it
    // Fastify correctly returns 415, matching real client behavior.
    headers: overrides.headers ?? {},
    body: overrides.body,
  };
}

// Note: the handler caches the app + pg pool at module scope; the pool connects
// lazily and never touches the DB in these tests, so no teardown is required.

describe('vercel serverless entry (api/index.ts)', () => {
  it('GET /healthz through the handler returns 200 + ok body', async () => {
    const res = makeRes();
    await handler(makeReq({ url: '/healthz' }) as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ data: { status: 'ok', service: 'orq8-api' } });
  });

  it('echoes x-request-id header', async () => {
    const res = makeRes();
    await handler(makeReq({ url: '/healthz' }) as never, res as never);
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('unknown routes return the 404 error envelope', async () => {
    const res = makeRes();
    await handler(makeReq({ url: '/nope' }) as never, res as never);
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body) as { error?: { code?: string } };
    expect(body.error?.code).toBe('not_found');
  });

  it('POST with a parsed JSON body still parses server-side', async () => {
    // Vercel pre-parses JSON into req.body (an object); the handler re-encodes it
    // for Fastify's parser. Waitlist register (no auth, no DB write on invalid) is
    // a safe endpoint to exercise the body path.
    const res = makeRes();
    await handler(
      makeReq({
        method: 'POST',
        url: '/v1/waitlist',
        headers: { 'content-type': 'application/json' },
        body: { email: 'not-an-email' },
      }) as never,
      res as never,
    );
    expect(res.statusCode).toBe(400);
  });

  it('a JSON POST without a content-type header returns 415, not 500', async () => {
    const res = makeRes();
    await handler(
      makeReq({ method: 'POST', url: '/v1/waitlist', body: { email: 'x@y.com' } }) as never,
      res as never,
    );
    expect(res.statusCode).toBe(415);
  });
});
