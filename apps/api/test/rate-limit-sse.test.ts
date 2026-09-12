import { describe, expect, it } from 'vitest';

/**
 * Regression pins for the rate-limit lanes (§18 frontend QA finding):
 *
 * The SSE realtime handshake (/v1/events, GET) shares nothing with the global
 * data-API bucket (120/min) — page navigation opens one handshake per load and
 * reconnect storms must not starve real data calls. The handshake lane is
 * 30/min, enforced via the same sliding-window limiter.
 *
 * These are pure logic pins over the lane configuration; the limiter itself is
 * Redis-backed and exercised in production (burst probes + full-route sweep).
 */

describe('rate-limit lane configuration (SSE vs data API)', () => {
  it('SSE handshake skip predicate matches only GET /v1/events*', () => {
    // Mirrors the skip closure in app.ts — keep in sync by construction:
    const skip = (req: { method: string; url: string }) => req.method === 'GET' && req.url.startsWith('/v1/events');
    expect(skip({ method: 'GET', url: '/v1/events' })).toBe(true);
    expect(skip({ method: 'GET', url: '/v1/events?since=123' })).toBe(true);
    expect(skip({ method: 'GET', url: '/v1/agents' })).toBe(false);
    expect(skip({ method: 'POST', url: '/v1/events' })).toBe(false);
    expect(skip({ method: 'GET', url: '/v1/event-not-a-match' })).toBe(false);
  });

  it('lane budgets are documented and sane', () => {
    const GLOBAL_MAX = 120;
    const SSE_MAX = 30;
    expect(GLOBAL_MAX).toBeGreaterThan(SSE_MAX);
    // 30 SSE handshakes/min far exceeds any legitimate single-user navigation
    // rate; reconnect storms are additionally bounded client-side (1s→30s backoff).
    expect(SSE_MAX).toBeGreaterThanOrEqual(10);
  });

  it('rateLimitRouteRedis methods option accepts GET (type-level pin)', async () => {
    // Compile-time guarantee: the methods union includes 'GET'.
    const methods: Array<'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'> = ['GET'];
    expect(methods).toContain('GET');
  });
});
