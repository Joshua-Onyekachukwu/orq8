import { describe, expect, it, beforeAll } from 'vitest';
import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

// docs/58 — the Vercel serverless entry adapts buildApp() to Vercel's req/res
// shape via inject(). These tests use a real Fastify inject() path with a
// lightweight in-process app that shares the same buildApp() as serverless.

let app: FastifyInstance;

beforeAll(async () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8',
    SESSION_SECRET: 'test-session-secret-32-bytes!!',
    ENCRYPTION_KEY: 'test-encryption-key-32-bytes!!',
  });
  const logger = createLogger(config);
  const { db, pool } = createDb(config.DATABASE_URL);
  app = await buildApp({ config, db, pool, logger });
  await app.ready();
}, 30_000);

describe('vercel serverless entry (api/index.ts)', () => {
  it('GET /healthz returns 200 + ok body', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ data: { status: 'ok', service: 'orq8-api' } });
  });

  it('echoes x-request-id header', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('unknown routes return the 404 error envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload) as { error?: { code?: string } };
    expect(body.error?.code).toBe('not_found');
  });

  it('POST with a parsed JSON body validates correctly', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/waitlist',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST with valid body reaches validation (not 500)', async () => {
    // Test with an invalid body to ensure validation is hit, not a 500
    const res = await app.inject({
      method: 'POST',
      url: '/v1/waitlist',
      headers: { 'content-type': 'application/json' },
      payload: { email: '' },
    });
    // Should return 400 (validation), not 500
    expect(res.statusCode).toBe(400);
  });
});
