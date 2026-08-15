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
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoutes } from './routes/health.js';
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
  });

  await app.register(cors, { origin: allowedOrigins(deps.config), credentials: true });
  await app.register(cookie);

  // docs/35.1 — X-Request-Id echoed on every response
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // docs/35.1 — Idempotency-Key on mutating endpoints
  idempotencyPlugin(app, opts.idempotencyStore ?? new InMemoryIdempotencyStore());

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
    request.log.error({ err: error }, 'unhandled error');
    reply.code(500).send({ error: toErrorEnvelope(internal(), requestId) });
  });

  registerHealthRoutes(app, deps);
  registerAuthRoutes(app, deps);
  return app;
}
