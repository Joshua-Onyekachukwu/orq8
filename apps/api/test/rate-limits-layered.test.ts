/**
 * Layered rate limits and provider concurrency gates — unit pins.
 *
 * Closes the unit half of docs/77 P1 §8 (built per docs/80 §3.3). The abuse
 * suite asserts the same controls over real HTTP; these pins keep the pieces
 * honest in isolation and cover the paths a live Postgres cannot easily stage:
 *
 *   - the endpoint-class table (first match wins, POST-only, purchase before
 *     credits);
 *   - the sliding window, including window expiry and the kill switch;
 *   - **fail-closed** behaviour when Redis is configured but unreachable — a
 *     Redis outage must not become an unbounded-spend incident;
 *   - the provider gates: per-provider caps are independent, the global cap
 *     bounds them all, and a waiter that exceeds its patience fails over
 *     instead of hanging.
 */

import { createLogger, loadConfig, type AppConfig } from '@orq8/core';
import { afterEach, describe, expect, it } from 'vitest';
import { layeredRateLimitsEnabled } from '../src/plugins/rate-limits.js';
import {
  acquireProviderSlot,
  ConcurrencyGate,
  GateTimeoutError,
  providerGateStats,
  __resetConcurrencyGates,
} from '../src/services/concurrency-gate.js';
import {
  endpointClassByName,
  matchEndpointClass,
  orgLimitKey,
  RateLimiter,
  RATE_LIMIT_WINDOWS,
  userLimitKey,
} from '../src/services/rate-limit-service.js';
import type { RedisClient } from '../src/services/redis.js';

const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
const base = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

afterEach(() => {
  __resetConcurrencyGates();
});

// ─── Endpoint class table ───────────────────────────────────────────────────

describe('layered rate limits — endpoint classes', () => {
  it('classifies only the POST spend paths, first match wins', () => {
    expect(matchEndpointClass(base, 'POST', '/v1/credits/purchase')).toMatchObject({ name: 'purchase' });
    expect(matchEndpointClass(base, 'POST', '/v1/billing/checkout')).toMatchObject({ name: 'purchase' });
    // purchase must win over the broader /v1/credits prefix
    expect(matchEndpointClass(base, 'POST', '/v1/credits/consume')).toMatchObject({ name: 'credits' });
    expect(matchEndpointClass(base, 'POST', '/v1/commands')).toMatchObject({ name: 'ai.execute' });
    expect(matchEndpointClass(base, 'POST', '/v1/commands/tasks/execute-pending')).toMatchObject({ name: 'ai.execute' });
    expect(matchEndpointClass(base, 'POST', '/v1/deliberations?ids=a,b')).toMatchObject({ name: 'ai.analyze' });
    expect(matchEndpointClass(base, 'POST', '/v1/business-imports/analyze')).toMatchObject({ name: 'ai.import' });

    // Reads and navigation are not spend.
    expect(matchEndpointClass(base, 'GET', '/v1/credits')).toBeNull();
    expect(matchEndpointClass(base, 'GET', '/v1/commands/history')).toBeNull();
    expect(matchEndpointClass(base, 'POST', '/v1/tasks')).toBeNull();
    expect(matchEndpointClass(base, 'POST', '/v1/agents/xyz/emergency-stop')).toBeNull();
    expect(matchEndpointClass(base, 'POST', '/v1/command-not-a-match')).toBeNull();
  });

  it('reads its budgets from config and keys per user / per org', () => {
    const custom: AppConfig = {
      ...base,
      RATE_LIMIT_EXECUTE_USER_PER_MIN: 7,
      RATE_LIMIT_EXECUTE_ORG_PER_HOUR: 9,
    };
    expect(endpointClassByName(custom, 'ai.execute').userPerMin).toBe(7);
    expect(endpointClassByName(custom, 'ai.execute').orgPerHour).toBe(9);
    expect(userLimitKey('sess:abc', 'ai.execute')).toBe('rl:user:ai.execute:sess:abc');
    expect(orgLimitKey('org-1', 'ai.import')).toBe('rl:org:ai.import:org-1');
    expect(RATE_LIMIT_WINDOWS.MINUTE).toBe(60_000);
    expect(RATE_LIMIT_WINDOWS.HOUR).toBe(3_600_000);
  });

  it('is off in tests unless forced, and off entirely behind the kill switch', () => {
    expect(layeredRateLimitsEnabled({ config: base })).toBe(false); // NODE_ENV=test, force off
    expect(layeredRateLimitsEnabled({ config: { ...base, RATE_LIMIT_FORCE: 'true' } })).toBe(true);
    expect(
      layeredRateLimitsEnabled({ config: { ...base, RATE_LIMIT_FORCE: 'true', RATE_LIMIT_ENABLED: 'false' } }),
    ).toBe(false);
    // Production always has the layers on — no force needed.
    expect(layeredRateLimitsEnabled({ config: { ...base, NODE_ENV: 'production' } })).toBe(true);
  });
});

// ─── Sliding window ─────────────────────────────────────────────────────────

describe('layered rate limits — sliding window', () => {
  it('allows up to the cap, then denies with a retry hint; identities are independent', async () => {
    const limiter = new RateLimiter(null, true, logger);
    const rule = { windowMs: RATE_LIMIT_WINDOWS.MINUTE, max: 2 };

    expect((await limiter.check('user:a', rule)).allowed).toBe(true);
    const second = await limiter.check('user:a', rule);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);

    const third = await limiter.check('user:a', rule);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSec).toBeGreaterThanOrEqual(1);

    // Every identity gets its own budget: one user's burst cannot lock out a peer.
    expect((await limiter.check('user:b', rule)).allowed).toBe(true);
  });

  it('forgets hits once they leave the window', async () => {
    const limiter = new RateLimiter(null, true, logger);
    const rule = { windowMs: 40, max: 1 };
    expect((await limiter.check('expiry', rule)).allowed).toBe(true);
    expect((await limiter.check('expiry', rule)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect((await limiter.check('expiry', rule)).allowed).toBe(true);
  });

  it('treats max <= 0 as disabled, not as deny-all', async () => {
    const limiter = new RateLimiter(null, true, logger);
    expect((await limiter.check('off', { windowMs: 1_000, max: 0 })).allowed).toBe(true);
  });

  it('fails closed when Redis is configured but unreachable', async () => {
    const down = { isConnected: () => false } as unknown as RedisClient;
    const closed = new RateLimiter(down, true, logger);

    const verdict = await closed.check('redis:down', { windowMs: 60_000, max: 10 });
    expect(verdict.allowed).toBe(false);
    expect(verdict.degraded).toBe(true);

    // A non-spend rule may opt out and fall back to the local window…
    const optedOut = await closed.check('redis:down:optout', { windowMs: 60_000, max: 10, failClosed: false });
    expect(optedOut.allowed).toBe(true);
    expect(optedOut.degraded).toBe(true);

    // …and a fail-open limiter degrades to memory for all rules.
    const open = new RateLimiter(down, false, logger);
    const degradedAllowed = await open.check('redis:down:open', { windowMs: 60_000, max: 10 });
    expect(degradedAllowed.allowed).toBe(true);
    expect(degradedAllowed.degraded).toBe(true);
  });

  it('does not trust a zero count when the connection drops mid-call', async () => {
    let connected = true;
    const flaky = {
      isConnected: () => connected,
      zadd: async () => 1,
      zremrangebyscore: async () => 1,
      zcount: async () => {
        connected = false;
        return 0;
      },
      expire: async () => 1,
    } as unknown as RedisClient;

    const verdict = await new RateLimiter(flaky, true, logger).check('redis:flaky', { windowMs: 60_000, max: 10 });
    expect(verdict.allowed).toBe(false);
    expect(verdict.degraded).toBe(true);
  });

  it('fails closed when a Redis command throws', async () => {
    const broken = {
      isConnected: () => true,
      zadd: async () => {
        throw new Error('connection reset');
      },
    } as unknown as RedisClient;

    const verdict = await new RateLimiter(broken, true, logger).check('redis:broken', { windowMs: 60_000, max: 10 });
    expect(verdict.allowed).toBe(false);
    expect(verdict.degraded).toBe(true);
  });
});

// ─── Provider gates ─────────────────────────────────────────────────────────

describe('provider concurrency gates', () => {
  it('caps active holders and rejects a waiter that exceeds its patience', async () => {
    const gate = new ConcurrencyGate('unit', 1, 30);
    const release = await gate.acquire();
    expect(gate.activeCount).toBe(1);

    await expect(gate.acquire()).rejects.toBeInstanceOf(GateTimeoutError);
    release();
    expect(gate.activeCount).toBe(0);

    const again = await gate.acquire();
    again();
  });

  it('hands a freed slot straight to the next waiter (FIFO)', async () => {
    const gate = new ConcurrencyGate('fifo', 1, 500);
    const first = await gate.acquire();
    const order: string[] = [];
    const secondPromise = gate.acquire().then((release) => {
      order.push('second');
      return release;
    });
    const thirdPromise = gate.acquire().then((release) => {
      order.push('third');
      return release;
    });
    expect(gate.waitingCount).toBe(2);

    first();
    const secondRelease = await secondPromise;
    expect(order).toEqual(['second']);
    secondRelease();
    const thirdRelease = await thirdPromise;
    expect(order).toEqual(['second', 'third']);
    thirdRelease();
    expect(gate.activeCount).toBe(0);
  });

  it('treats max <= 0 as a disabled gate', async () => {
    const gate = new ConcurrencyGate('off', 0, 10);
    const a = await gate.acquire();
    const b = await gate.acquire();
    a();
    b();
  });

  it('bounds each provider separately under the global ceiling', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      LLM_MAX_CONCURRENT: '4',
      LLM_MAX_CONCURRENT_PER_PROVIDER: '1',
      LLM_CONCURRENCY_WAIT_MS: '1000',
    } as NodeJS.ProcessEnv);

    __resetConcurrencyGates();
    const openrouter = await acquireProviderSlot(config, 'openrouter');
    const nvidia = await acquireProviderSlot(config, 'nvidia'); // different provider, global has room

    // The same provider is saturated: fail over (here: timeout) instead of queueing.
    await expect(acquireProviderSlot(config, 'openrouter')).rejects.toBeInstanceOf(GateTimeoutError);

    const stats = providerGateStats();
    expect(stats.find((g) => g.name === 'provider:openrouter')?.active).toBe(1);
    expect(stats.find((g) => g.name === 'provider:nvidia')?.active).toBe(1);

    openrouter();
    const reused = await acquireProviderSlot(config, 'openrouter');
    reused();
    nvidia();
  });

  it('bounds all providers together under the global ceiling', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      LLM_MAX_CONCURRENT: '1',
      LLM_MAX_CONCURRENT_PER_PROVIDER: '5',
      LLM_CONCURRENCY_WAIT_MS: '1000',
    } as NodeJS.ProcessEnv);

    __resetConcurrencyGates();
    const held = await acquireProviderSlot(config, 'openrouter');
    await expect(acquireProviderSlot(config, 'nvidia')).rejects.toBeInstanceOf(GateTimeoutError);
    held();
  });
});
