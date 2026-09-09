import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { deleteOrg } from './helpers/delete-org.js';
import type { AppDeps } from '../src/types.js';

// Executive Agent streaming endpoint (demo-latency fix):
//   GET /v1/commands/stream runs the REAL executeCommand pipeline and pushes
//   live `stage` events over SSE, then a final `done` event carrying the full
//   command result (same shape as POST /v1/commands).
//
// Verified here end-to-end against a real database with no LLM key: the
// pipeline's rule-based fallback intent analysis keeps the flow hermetic.
// Assertions cover the SSE wire format (data: frames), the ordered stage
// lifecycle, and the result contract — the exact events a demo UI consumes.

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8',
} as NodeJS.ProcessEnv);

let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const run = dbUp ? describe : describe.skip;

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

let app: FastifyInstance;
let token = '';
let orgId = '';

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);
  const email = `stream-${Date.now()}@example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'TestPass123!', org_name: 'stream-org' },
    headers: { 'content-type': 'application/json' },
  });
  if (res.statusCode !== 201) throw new Error(`register failed (${res.statusCode}): ${res.payload}`);
  const body = res.json() as { data?: { token?: string; org?: { id?: string } } };
  token = body.data?.token ?? '';
  orgId = body.data?.org?.id ?? '';
});

afterAll(async () => {
  if (!dbUp) return;
  if (orgId) await deleteOrg(deps.pool, orgId);
  await app?.close();
});

interface StageEvent {
  type: 'stage';
  stage: string;
  label: string;
  status: 'started' | 'completed' | 'skipped' | 'failed';
}
type StreamEvent = StageEvent | { type: 'done'; result: Record<string, unknown>; completedStages: string[] };

/** Parse the SSE wire format into events. */
function parseSSE(payload: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const frame of payload.split('\n\n')) {
    for (const line of frame.split('\n')) {
      if (!line.startsWith('data:')) continue;
      try {
        events.push(JSON.parse(line.slice(5).trim()));
      } catch {
        // ignore partial frames
      }
    }
  }
  return events;
}

run('executive agent command streaming', () => {
  it('streams live stages and returns the full result in a final done event', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/commands/stream?command=Analyze%20our%20workflow%20and%20report%20gaps',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const events = parseSSE(res.payload);
    const stages = events.filter((e): e is StageEvent => e.type === 'stage');
    const done = events.find((e): e is Extract<StreamEvent, { type: 'done' }> => e.type === 'done');

    // Live progress actually happened — multiple stages streamed.
    expect(stages.length).toBeGreaterThanOrEqual(4);
    // Wire format a UI relies on.
    for (const s of stages) {
      expect(typeof s.stage).toBe('string');
      expect(typeof s.label).toBe('string');
      expect(['started', 'completed', 'skipped', 'failed']).toContain(s.status);
    }
    // Ordered lifecycle: first event is context_building starting.
    expect(stages[0]?.stage).toBe('context_building');
    expect(stages[0]?.status).toBe('started');
    // Every started stage reaches a terminal state in-stream.
    const started = new Set(stages.filter((s) => s.status === 'started').map((s) => s.stage));
    for (const stage of started) {
      expect(stages.some((s) => s.stage === stage && s.status !== 'started')).toBe(true);
    }
    // intent_analysis runs for real in this flow (no early auth/validation exit).
    expect(started.has('intent_analysis')).toBe(true);

    // The done event carries the full command result — same contract as POST.
    expect(done).toBeTruthy();
    expect((done!.result as any).commandId).toBeTruthy();
    expect(['completed', 'awaiting_approval', 'error']).toContain((done!.result as any).status);
    expect(typeof (done!.result as any).message).toBe('string');
    expect(Array.isArray((done!.result as any).taskIds)).toBe(true);
    expect(Array.isArray(done!.completedStages)).toBe(true);
  });

  it('rejects unauthenticated stream requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/commands/stream?command=hello%20world%20today',
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('rejects an invalid command without streaming', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/commands/stream?command=ab',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
