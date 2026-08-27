import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Simple in-memory sliding-window rate limiter.
 * Per-IP tracking for sensitive endpoints like login.
 *
 * Production recommendation: use Redis-backed rate limiting (e.g., @fastify/rate-limit)
 * for multi-instance deployments. This in-memory version is sufficient for single-instance
 * serverless or development environments.
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > 60_000) {
      store.delete(key);
    }
  }
}, 300_000);

export interface RateLimitOptions {
  /** Window duration in milliseconds (default: 60s) */
  windowMs?: number;
  /** Max requests per window (default: 5) */
  max?: number;
  /** Custom key function (default: IP address) */
  keyFn?: (request: FastifyRequest) => string;
}

/**
 * Fastify hook that enforces per-key rate limiting.
 * Returns 429 with Retry-After header when exceeded.
 */
export function rateLimitHook(
  app: FastifyInstance,
  opts: RateLimitOptions = {},
): void {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 5;
  const keyFn = opts.keyFn ?? ((req: FastifyRequest) => req.ip ?? 'unknown');

  app.addHook('onRequest', async (request, reply) => {
    const key = keyFn(request);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      // New window
      store.set(key, { count: 1, windowStart: now });
      return;
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      reply.header('Retry-After', String(retryAfter));
      reply.code(429).send({
        error: {
          code: 'rate_limited',
          message: `Too many requests. Please try again in ${retryAfter} seconds.`,
          policy_ref: 'docs/37',
        },
      });
      return reply;
    }
  });
}

/**
 * Generic route-scoped rate limiter.
 * Usage: rateLimitRoute(app, { path, windowMs, max })
 */
export function rateLimitRoute(
  app: FastifyInstance,
  opts: { path: string; windowMs?: number; max?: number; label?: string },
): void {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 5;
  const label = opts.label ?? opts.path;
  const attempts = new Map<string, RateLimitEntry>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) {
      if (now - entry.windowStart > windowMs) attempts.delete(key);
    }
  }, 300_000);

  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'POST' || !request.url.startsWith(opts.path)) return;

    const ip = request.ip ?? 'unknown';
    const now = Date.now();
    const entry = attempts.get(ip);

    if (!entry || now - entry.windowStart > windowMs) {
      attempts.set(ip, { count: 1, windowStart: now });
      return;
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      reply.header('Retry-After', String(retryAfter));
      reply.code(429).send({
        error: {
          code: 'rate_limited',
          message: `Too many ${label} attempts. Please try again in ${retryAfter} seconds.`,
          policy_ref: 'docs/37',
        },
      });
      return reply;
    }
  });
}

/**
 * Create a scoped rate limiter for a specific route prefix.
 * Usage: rateLimitLogin(app, deps) — applies to POST /v1/auth/login
 */
export function rateLimitLogin(app: FastifyInstance): void {
  const windowMs = 60_000; // 1 minute
  const max = 5; // 5 attempts per minute per IP
  const loginAttempts = new Map<string, RateLimitEntry>();

  // Cleanup
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of loginAttempts) {
      if (now - entry.windowStart > windowMs) {
        loginAttempts.delete(key);
      }
    }
  }, 300_000);

  app.addHook('onRequest', async (request, reply) => {
    // Only apply to POST /v1/auth/login
    if (request.method !== 'POST' || request.url !== '/v1/auth/login') return;

    const ip = request.ip ?? 'unknown';
    const now = Date.now();
    const entry = loginAttempts.get(ip);

    if (!entry || now - entry.windowStart > windowMs) {
      loginAttempts.set(ip, { count: 1, windowStart: now });
      return;
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      reply.header('Retry-After', String(retryAfter));
      reply.code(429).send({
        error: {
          code: 'rate_limited',
          message: `Too many login attempts. Please try again in ${retryAfter} seconds.`,
          policy_ref: 'docs/37',
        },
      });
      return reply;
    }
  });
}
