/**
 * Layered rate limiting (docs/80 §3.3, closing docs/77 P1 §8).
 *
 * The legacy limiters in `plugins/rate-limit*.ts` answer one question: "is this
 * IP/session hammering the auth surface?" This service answers the economic
 * question instead: "is this user, company, agent or endpoint class about to
 * consume more AI work than it should?"
 *
 * Four layers, each usable from where the identity is actually known:
 *
 *   user   session/IP  — enforced in an `onRequest` hook (class → user bucket)
 *   org    org id      — enforced inside handlers, after `requireAuth`
 *   agent  agent id    — enforced where work is enqueued (jobs service)
 *   class  route group — the table below decides which bucket a request hits
 *
 * Storage: Redis sliding windows when `REDIS_URL` is configured (correct across
 * replicas), otherwise an in-memory sliding window that is honest about being
 * single-instance. AI-spend rules are **fail-closed**: if Redis is configured
 * but unreachable, they deny rather than fail open, so a Redis outage cannot
 * become an unbounded-spend incident. Read-only/navigation buckets stay
 * fail-open.
 */

import type { AppConfig } from '@orq8/core';
import type { Logger } from 'pino';
import { getRedis, type RedisClient } from './redis.js';

export interface RateLimitRule {
  windowMs: number;
  max: number;
  /** Override the global fail-closed policy for this rule. */
  failClosed?: boolean;
}

export interface RateLimitVerdict {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  /** True when the decision was made without the shared store (Redis down). */
  degraded: boolean;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;

/**
 * Humanize a retry-after duration the way the 429 bodies report it. Always the
 * REAL remaining time (never a rounded-up whole window): "42 seconds",
 * "2 minutes 30 seconds", "1 hour 5 minutes".
 */
export function formatRetryAfter(totalSeconds: number): string {
  const s = Math.max(1, Math.ceil(totalSeconds));
  if (s < 60) return s === 1 ? "1 second" : `${s} seconds`;
  if (s < HOUR / 1000) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (rem === 0) return m === 1 ? "1 minute" : `${m} minutes`;
    return `${m} minute${m === 1 ? "" : "s"} ${rem} second${rem === 1 ? "" : "s"}`;
  }
  const h = Math.floor(s / (HOUR / 1000));
  const m = Math.floor((s % (HOUR / 1000)) / 60);
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h} hour${h === 1 ? "" : "s"} ${m} minute${m === 1 ? "" : "s"}`;
}

/**
 * Sliding-window limiter over Redis (zset) or a local Map. One instance is
 * shared per process via `getRateLimiter`.
 */
export class RateLimiter {
  /** key → hit timestamps (ms), used only when Redis is absent/down. */
  private memory = new Map<string, number[]>();

  constructor(
    private readonly redis: RedisClient | null,
    private readonly failClosedDefault: boolean,
    private readonly logger: Logger,
  ) {}

  async check(key: string, rule: RateLimitRule): Promise<RateLimitVerdict> {
    if (rule.max <= 0) {
      return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfterSec: 0, degraded: false };
    }
    const failClosed = rule.failClosed ?? this.failClosedDefault;

    if (!this.redis) return this.memoryCheck(key, rule, false);

    if (!this.redis.isConnected()) {
      if (failClosed) {
        return { allowed: false, remaining: 0, retryAfterSec: 30, degraded: true };
      }
      return this.memoryCheck(key, rule, true);
    }

    const now = Date.now();
    const windowStart = now - rule.windowMs;
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    try {
      await this.redis.zadd(key, now, member);
      await this.redis.zremrangebyscore(key, 0, windowStart);
      const count = await this.redis.zcount(key, windowStart, now + 1);
      await this.redis.expire(key, Math.ceil(rule.windowMs / 1000) + 1);

      // A swallowed Redis error reads as count 0; if the connection dropped
      // mid-call, do not trust that zero.
      if (count === 0 && !this.redis.isConnected()) {
        if (failClosed) {
          return { allowed: false, remaining: 0, retryAfterSec: 30, degraded: true };
        }
        return this.memoryCheck(key, rule, true);
      }

      if (count > rule.max) {
        // The honest cooldown is when the OLDEST hit inside the sliding window
        // drops out — not the whole window. A client told "try again in 60
        // seconds" when the reset is in 8 seconds is exactly the lie that
        // makes clients distrust the header and hammer anyway.
        let retryAfterSec = Math.max(1, Math.ceil(rule.windowMs / 1000));
        try {
          const members = await this.redis.zrangebyscore(key, windowStart, now);
          const oldestMember = members[0];
          if (oldestMember) {
            // Members are `${hitTimeMs}:${rand}` — the timestamp is the prefix.
            const oldestAt = Number(oldestMember.split(":")[0]);
            if (Number.isFinite(oldestAt)) {
              retryAfterSec = Math.max(1, Math.ceil((oldestAt + rule.windowMs - now) / 1000));
            }
          }
        } catch {
          // Fall back to the whole window; the block itself still stands.
        }
        return { allowed: false, remaining: 0, retryAfterSec, degraded: false };
      }
      return { allowed: true, remaining: Math.max(0, rule.max - count), retryAfterSec: 0, degraded: false };
    } catch (err) {
      this.logger.warn({ err, key }, 'rate limiter: redis check failed');
      if (failClosed) {
        return { allowed: false, remaining: 0, retryAfterSec: 30, degraded: true };
      }
      return this.memoryCheck(key, rule, true);
    }
  }

  private memoryCheck(key: string, rule: RateLimitRule, degraded: boolean): RateLimitVerdict {
    const now = Date.now();
    const windowStart = now - rule.windowMs;
    const hits = (this.memory.get(key) ?? []).filter((t) => t > windowStart);

    if (hits.length >= rule.max) {
      this.memory.set(key, hits);
      const oldest = hits[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
        degraded,
      };
    }

    hits.push(now);
    this.memory.set(key, hits);
    // Bound the map: a long-lived process with many identities must not grow
    // forever. Eviction is oldest-insertion-first, which only affects windows
    // that are already cold.
    if (this.memory.size > 10_000) {
      const first = this.memory.keys().next().value;
      if (first !== undefined) this.memory.delete(first);
    }
    return { allowed: true, remaining: rule.max - hits.length, retryAfterSec: 0, degraded };
  }
}

// ─── Endpoint classes ───────────────────────────────────────────────────────

export type EndpointClassName = 'ai.execute' | 'ai.analyze' | 'ai.import' | 'credits' | 'purchase';

export interface EndpointClass {
  name: EndpointClassName;
  label: string;
  userPerMin: number;
  orgPerHour: number;
}

/**
 * Ordered, first-match-wins. `purchase` must precede `credits` (it is a subset
 * of /v1/credits and /v1/billing), and both are POST-only: reads of balances
 * and history are navigation, not spend.
 */
export function endpointClasses(config: AppConfig): EndpointClass[] {
  return [
    {
      name: 'purchase',
      label: 'purchase',
      userPerMin: config.RATE_LIMIT_PURCHASE_USER_PER_MIN,
      orgPerHour: config.RATE_LIMIT_PURCHASE_ORG_PER_HOUR,
    },
    {
      name: 'credits',
      label: 'credits',
      userPerMin: config.RATE_LIMIT_CREDITS_USER_PER_MIN,
      orgPerHour: config.RATE_LIMIT_CREDITS_ORG_PER_HOUR,
    },
    {
      name: 'ai.execute',
      label: 'task execution',
      userPerMin: config.RATE_LIMIT_EXECUTE_USER_PER_MIN,
      orgPerHour: config.RATE_LIMIT_EXECUTE_ORG_PER_HOUR,
    },
    {
      name: 'ai.analyze',
      label: 'analysis',
      userPerMin: config.RATE_LIMIT_ANALYZE_USER_PER_MIN,
      orgPerHour: config.RATE_LIMIT_ANALYZE_ORG_PER_HOUR,
    },
    {
      name: 'ai.import',
      label: 'business import',
      userPerMin: config.RATE_LIMIT_IMPORT_USER_PER_MIN,
      orgPerHour: config.RATE_LIMIT_IMPORT_ORG_PER_HOUR,
    },
  ];
}

const CLASS_PATHS: Record<EndpointClassName, string[]> = {
  purchase: ['/v1/credits/purchase', '/v1/billing/checkout'],
  credits: ['/v1/credits', '/v1/billing'],
  'ai.execute': ['/v1/commands'],
  'ai.analyze': ['/v1/deliberations', '/v1/simulations', '/v1/company-builder', '/v1/delegations', '/v1/multi-agent'],
  'ai.import': ['/v1/business-imports'],
};

export function endpointClassByName(config: AppConfig, name: EndpointClassName): EndpointClass {
  const found = endpointClasses(config).find((c) => c.name === name);
  if (!found) throw new Error(`unknown endpoint class: ${name}`);
  return found;
}

/** The class a request belongs to, or null when the route is ordinary traffic. */
export function matchEndpointClass(
  config: AppConfig,
  method: string,
  url: string,
): EndpointClass | null {
  if (method !== 'POST') return null;
  const path = url.split('?')[0] ?? url;
  for (const cls of endpointClasses(config)) {
    if (CLASS_PATHS[cls.name].some((prefix) => path.startsWith(prefix))) return cls;
  }
  return null;
}

// ─── Keys ───────────────────────────────────────────────────────────────────

export function userLimitKey(sessionKey: string, className: EndpointClassName): string {
  return `rl:user:${className}:${sessionKey}`;
}

export function orgLimitKey(orgId: string, className: EndpointClassName): string {
  return `rl:org:${className}:${orgId}`;
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let cachedLimiter: RateLimiter | null = null;

export function getRateLimiter(config: AppConfig, logger: Logger): RateLimiter {
  if (!cachedLimiter) {
    cachedLimiter = new RateLimiter(
      config.REDIS_URL ? getRedis(config, logger) : null,
      config.RATE_LIMIT_FAIL_CLOSED !== 'false',
      logger,
    );
  }
  return cachedLimiter;
}

/** Test hook — drops the cached limiter so a fresh config takes effect. */
export function __resetRateLimiter(): void {
  cachedLimiter = null;
}

export const RATE_LIMIT_WINDOWS = { MINUTE, HOUR } as const;
