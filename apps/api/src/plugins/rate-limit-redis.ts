import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RedisClient } from '../services/redis.js';

/**
 * Redis-backed sliding-window rate limiter.
 *
 * Uses Redis sorted sets for accurate sliding-window counting:
 * - Score = timestamp in milliseconds
 * - Member = unique request ID (prevents collisions)
 * - On each request: add to sorted set, remove expired entries, count remaining
 *
 * Falls back gracefully when Redis is unavailable (allows all requests).
 *
 * Design: docs/37 Rate Limiting, docs/42 Infrastructure
 */

interface RateLimitOptions {
  /** Window duration in milliseconds (default: 60s) */
  windowMs?: number;
  /** Max requests per window (default: 5) */
  max?: number;
  /** Custom key function (default: IP address) */
  keyFn?: (request: FastifyRequest) => string;
  /** Key prefix for Redis (default: 'rl') */
  prefix?: string;
}

/**
 * Create a Redis-backed rate limiter hook.
 */
export function rateLimitHookRedis(
  app: FastifyInstance,
  redis: RedisClient,
  opts: RateLimitOptions = {},
): void {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 5;
  const prefix = opts.prefix ?? 'rl';
  const keyFn = opts.keyFn ?? ((req: FastifyRequest) => req.ip ?? 'unknown');

  app.addHook('onRequest', async (request, reply) => {
    const key = `${prefix}:${keyFn(request)}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const requestId = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    try {
      // Add the current request to the sorted set
      await redis.zadd(key, now, requestId);

      // Remove entries outside the sliding window
      await redis.zremrangebyscore(key, 0, windowStart);

      // Count requests in the current window
      const count = await redis.zcount(key, windowStart, now + 1);

      // Set TTL on the key to auto-cleanup
      await redis.expire(key, Math.ceil(windowMs / 1000) + 1);

      if (count > max) {
        const retryAfter = Math.ceil((windowMs - (now - windowStart)) / 1000);
        reply.header('Retry-After', String(retryAfter));
        reply.header('X-RateLimit-Limit', String(max));
        reply.header('X-RateLimit-Remaining', '0');
        reply.header('X-RateLimit-Reset', String(Math.ceil((windowStart + windowMs) / 1000)));
        reply.code(429).send({
          error: {
            code: 'rate_limited',
            message: `Too many requests. Please try again in ${retryAfter} seconds.`,
            policy_ref: 'docs/37',
          },
        });
        return reply;
      }

      // Add rate limit headers
      reply.header('X-RateLimit-Limit', String(max));
      reply.header('X-RateLimit-Remaining', String(max - count));
      reply.header('X-RateLimit-Reset', String(Math.ceil((windowStart + windowMs) / 1000)));
    } catch {
      // Redis unavailable — allow the request through (fail open)
    }
  });
}

/**
 * Create a route-specific Redis-backed rate limiter.
 */
export function rateLimitRouteRedis(
  app: FastifyInstance,
  redis: RedisClient,
  opts: { path: string; windowMs?: number; max?: number; label?: string; prefix?: string },
): void {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 5;
  const label = opts.label ?? opts.path;
  const prefix = opts.prefix ?? 'rl:route';

  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'POST' || !request.url.startsWith(opts.path)) return;

    const ip = request.ip ?? 'unknown';
    const key = `${prefix}:${opts.path}:${ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const requestId = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    try {
      await redis.zadd(key, now, requestId);
      await redis.zremrangebyscore(key, 0, windowStart);
      const count = await redis.zcount(key, windowStart, now + 1);
      await redis.expire(key, Math.ceil(windowMs / 1000) + 1);

      if (count > max) {
        const retryAfter = Math.ceil((windowMs - (now - windowStart)) / 1000);
        reply.header('Retry-After', String(retryAfter));
        reply.header('X-RateLimit-Limit', String(max));
        reply.header('X-RateLimit-Remaining', '0');
        reply.code(429).send({
          error: {
            code: 'rate_limited',
            message: `Too many ${label} attempts. Please try again in ${retryAfter} seconds.`,
            policy_ref: 'docs/37',
          },
        });
        return reply;
      }

      reply.header('X-RateLimit-Limit', String(max));
      reply.header('X-RateLimit-Remaining', String(max - count));
    } catch {
      // Fail open
    }
  });
}

/**
 * Login-specific rate limiter (POST /v1/auth/login).
 */
export function rateLimitLoginRedis(
  app: FastifyInstance,
  redis: RedisClient,
): void {
  rateLimitRouteRedis(app, redis, {
    path: '/v1/auth/login',
    windowMs: 60_000, // 1 minute
    max: 5, // 5 attempts per minute per IP
    label: 'login',
    prefix: 'rl:auth',
  });
}
