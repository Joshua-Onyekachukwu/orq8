import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import {
  AppError,
  InMemoryIdempotencyStore,
  allowedOrigins,
  internal,
  notFound,
  toErrorEnvelope,
  validation,
  type IdempotencyStore,
} from '@orq8/core';
import { getRedis } from './services/redis.js';
import { rateLimitHookRedis, rateLimitLoginRedis, rateLimitRouteRedis } from './plugins/rate-limit-redis.js';
import { RedisIdempotencyStore } from '@orq8/core';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { idempotencyPlugin } from './plugins/idempotency.js';
import { rateLimitLogin, rateLimitRoute } from './plugins/rate-limit.js';
import { registerActivityRoutes } from './routes/activity.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerApprovalRoutes } from './routes/approvals.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerProviderRoutes } from './routes/providers.js';
import { registerCommandRoutes } from './routes/commands.js';
import { registerCreditRoutes } from './routes/credits.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerFileRoutes } from './routes/files.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerGoalRoutes } from './routes/goals.js';
import { registerOnboardingRoutes } from './routes/onboarding.js';
import { registerWaitlistRoutes } from './routes/waitlist.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerConstitutionRoutes } from './routes/constitution.js';
import { registerDepartmentRoutes } from './routes/departments.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerMemberRoutes } from './routes/members.js';
import { registerRealtimeEndpoint } from './services/realtime.js';
import { csrfPlugin } from './plugins/csrf.js';
import type { AppDeps } from './types.js';

export async function buildApp(
  deps: AppDeps,
  opts: { idempotencyStore?: IdempotencyStore } = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    // pino Logger satisfies FastifyBaseLogger; cast bridges version skew between the
    // workspace pino and fastify's bundled pino (docs/39 — pino everywhere).
    loggerInstance: deps.logger as unknown as FastifyBaseLogger,
    genReqId: () => randomUUID(),
    // Trust X-Forwarded-* from Vercel/nginx so request.ip is the real client IP
    // (docs/58). The API never sets cookies, so this has no auth implications.
    trustProxy: true,
    // Limit request body size to 5MB to prevent abuse
    bodyLimit: 5 * 1024 * 1024,
  });

  await app.register(cors, { origin: allowedOrigins(deps.config), credentials: true });
  await app.register(cookie);

  // CSRF protection for cookie-based session requests
  csrfPlugin(app);

  // docs/35.1 — X-Request-Id echoed on every response
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Initialize Redis client (falls back to in-memory if REDIS_URL not set)
  const redis = getRedis(deps.config, deps.logger);

  // docs/35.1 — Idempotency-Key on mutating endpoints
  // Use Redis-backed store if Redis is available, otherwise in-memory
  const idempotencyStore: IdempotencyStore = redis.isConnected()
    ? new RedisIdempotencyStore(redis)
    : new InMemoryIdempotencyStore();
  idempotencyPlugin(app, idempotencyStore);

  // Security: global rate-limit for all endpoints (60 req/min per IP)
  // Uses Redis sorted sets when available for multi-instance support
  if (redis.isConnected()) {
    rateLimitHookRedis(app, redis, { windowMs: 60_000, max: 60, prefix: 'rl:global' });
  } else {
    const globalRL = new Map<string, { count: number; windowStart: number }>();
    app.addHook('onRequest', async (request, reply) => {
      if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;
      const ip = request.ip ?? 'unknown';
      const now = Date.now();
      const entry = globalRL.get(ip);
      if (!entry || now - entry.windowStart > 60_000) {
        globalRL.set(ip, { count: 1, windowStart: now });
        return;
      }
      entry.count++;
      if (entry.count > 60) {
        const retryAfter = Math.ceil((entry.windowStart + 60_000 - now) / 1000);
        reply.header('Retry-After', String(retryAfter));
        reply.code(429).send({ error: { code: 'rate_limited', message: `Too many requests. Try again in ${retryAfter}s.` } });
        return reply;
      }
    });
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of globalRL) { if (now - v.windowStart > 60_000) globalRL.delete(k); }
    }, 300_000);
  }

  // Security: rate-limit sensitive auth endpoints
  // Use Redis-backed rate limiting if available, otherwise in-memory
  if (redis.isConnected()) {
    rateLimitLoginRedis(app, redis);
    rateLimitRouteRedis(app, redis, { path: '/v1/auth/register', max: 3, label: 'registration' });
    rateLimitRouteRedis(app, redis, { path: '/v1/auth/forgot-password', max: 3, windowMs: 900_000, label: 'forgot-password' });
    rateLimitRouteRedis(app, redis, { path: '/v1/auth/reset-password', max: 5, windowMs: 900_000, label: 'reset-password' });
    rateLimitRouteRedis(app, redis, { path: '/v1/commands', max: 10, windowMs: 60_000, label: 'commands' });
  } else {
    rateLimitLogin(app);
    rateLimitRoute(app, { path: '/v1/auth/register', max: 3, label: 'registration' });
    rateLimitRoute(app, { path: '/v1/auth/forgot-password', max: 3, windowMs: 900_000, label: 'forgot-password' });
    rateLimitRoute(app, { path: '/v1/auth/reset-password', max: 5, windowMs: 900_000, label: 'reset-password' });
    rateLimitRoute(app, { path: '/v1/commands', max: 10, windowMs: 60_000, label: 'commands' });
  }

  // Security headers on every response (including CSRF cookie + HSTS)
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    // Content-Security-Policy: restrict sources to prevent XSS and data exfiltration
    reply.header('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '));
  });

  // docs/35.1 — unmatched routes still return the envelope
  app.setNotFoundHandler((request, reply) => {
    reply
      .code(404)
      .send({ error: toErrorEnvelope(notFound('Route not found'), request.id) });
  });

  // docs/35.1 — uniform error envelope { error: { code, message, details?, policy_ref? } }
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    if (error instanceof AppError) {
      reply.code(error.status).send({ error: toErrorEnvelope(error, requestId) });
      return;
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'validation' in error &&
      Array.isArray((error as { validation?: unknown }).validation)
    ) {
      reply
        .code(400)
        .send({ error: toErrorEnvelope(validation((error as { validation?: unknown }).validation), requestId) });
      return;
    }
    // Fastify's own errors carry a status (415 unsupported media type, 413 body
    // too large, …) — surface it instead of collapsing to a 500 envelope.
    const fastifyErr = error as { statusCode?: unknown; message?: unknown };
    if (
      typeof error === 'object' &&
      error !== null &&
      typeof fastifyErr.statusCode === 'number' &&
      fastifyErr.statusCode >= 400
    ) {
      const status = fastifyErr.statusCode;
      const msg =
        typeof fastifyErr.message === 'string' ? fastifyErr.message : 'Bad request';
      reply.code(status).send({
        error: toErrorEnvelope(new AppError(status, 'bad_request', msg), requestId),
      });
      return;
    }
    request.log.error({ err: error }, 'unhandled error');
    reply.code(500).send({ error: toErrorEnvelope(internal(), requestId) });
  });

  registerHealthRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerAgentRoutes(app, deps);
  registerApprovalRoutes(app, deps);
  registerActivityRoutes(app, deps);
  registerProviderRoutes(app, deps);
  registerGoalRoutes(app, deps);
  registerCommandRoutes(app, deps);
  registerCreditRoutes(app, deps);
  registerBillingRoutes(app, deps);
  registerMemoryRoutes(app, deps);
  registerFileRoutes(app, deps);
  registerAdminRoutes(app, deps);
  registerOnboardingRoutes(app, deps);
  registerWaitlistRoutes(app, deps);
  registerNotificationRoutes(app, deps);
  registerConstitutionRoutes(app, deps);
  registerDepartmentRoutes(app, deps);
  registerSettingsRoutes(app, deps);
  registerMemberRoutes(app, deps);
  registerRealtimeEndpoint(app, deps);
  return app;
}
