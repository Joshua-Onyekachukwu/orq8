import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError, stablePayloadHash, type IdempotencyStore } from '@orq8/core';

// docs/35.1 — Idempotency-Key header on mutating endpoints; responses replayed on retry.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const keys = new WeakMap<FastifyRequest, string>();

function safeParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function idempotencyPlugin(app: FastifyInstance, store: IdempotencyStore): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!MUTATING.has(request.method)) return;
    const header = request.headers['idempotency-key'];
    if (typeof header !== 'string' || header.length === 0) return;
    keys.set(request, header);

    const existing = store.get(header);
    if (!existing) return;
    if (existing.payloadHash !== stablePayloadHash(request.body)) {
      throw new AppError(409, 'idempotency.conflict', 'Idempotency-Key was already used with a different payload', { key: header });
    }
    reply.code(existing.status).headers(existing.headers).send(existing.body);
    return reply;
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const key = keys.get(request);
    if (!key) return;
    if (reply.statusCode < 200 || reply.statusCode >= 300) return;
    store.put(key, {
      payloadHash: stablePayloadHash(request.body),
      status: reply.statusCode,
      headers: { 'content-type': String(reply.getHeader('content-type') ?? 'application/json') },
      body: safeParse(payload),
      storedAt: Date.now(),
    });
  });
}
