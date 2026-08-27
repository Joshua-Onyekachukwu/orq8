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
import { registerGoalRoutes } from './routes/goals.js';
import { registerOnboardingRoutes } from './routes/onboarding.js';
import { registerWaitlistRoutes } from './routes/waitlist.js';
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
  });

  await app.register(cors, { origin: allowedOrigins(deps.config), credentials: true });
  await app.register(cookie);

  // docs/35.1 — X-Request-Id echoed on every response
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // docs/35.1 — Idempotency-Key on mutating endpoints
  idempotencyPlugin(app, opts.idempotencyStore ?? new InMemoryIdempotencyStore());

  // Security: rate-limit sensitive auth endpoints
  rateLimitLogin(app);
  rateLimitRoute(app, { path: '/v1/auth/register', max: 3, label: 'registration' });

  // Security headers on every response
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // Note: CSP is better handled at the web app / CDN layer
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
  registerOnboardingRoutes(app, deps);
  registerWaitlistRoutes(app, deps);
  return app;
}
