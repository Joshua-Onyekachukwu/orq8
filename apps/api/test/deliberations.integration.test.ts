/**
 * Decision Council API integration tests (§47).
 *
 * The founder-facing /app/council page consumes GET /v1/deliberations and
 * GET /v1/deliberations/:id through the web proxy. These tests pin the route
 * contract the page depends on:
 *
 *   1. List returns only `ai_council` decisions for the caller's org,
 *      newest first, with the exact field set the page renders.
 *   2. Detail returns the full session (`councilDetail`) for a council decision.
 *   3. Non-council decisions are excluded from the list and 404 on detail —
 *      the Council page must never surface ordinary decisions.
 *   4. Cross-org isolation: another org's owner gets 404 on our session id
 *      and never sees our rows in their list.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

let dbUp = false;
let pool: Pool | undefined;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
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
const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

interface Ctx {
  token: string;
  orgId: string;
  userId: string;
}

const contexts: Ctx[] = [];

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);

  for (const tag of ['council-a', 'council-b']) {
    const email = `${tag}-${randomUUID().slice(0, 8)}@test.example.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'Test1234!', org_name: `${tag} Org` },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    contexts.push({ token: body.data.token, orgId: body.data.org.id, userId: body.data.user.id });
  }
  a = contexts[0]!;
  b = contexts[1]!;

  // Track created rows for cleanup.
  for (const c of contexts) {
    createdOrgIds.push(c.orgId);
    createdUserIds.push(c.userId);
  }

  // Org A: one council decision with a full recorded session, one ordinary
  // (user) decision, one second council decision to verify ordering.
  const councilSession = {
    question: 'Should we double engineering headcount next quarter?',
    context: 'ARR is growing 12% MoM; delivery is the bottleneck.',
    participants: [
      { name: 'Atlas', role: 'Chief of Staff', model: 'test-model', department: 'Executive Office' },
      { name: 'Vera', role: 'Engineering Manager', model: 'test-model', department: 'Engineering' },
    ],
    rounds: [
      {
        round: 1,
        analyses: [
          {
            participant: 'Atlas',
            role: 'Chief of Staff',
            model: 'test-model',
            analysis: 'Hiring now risks runway before the Series A milestone.',
            claims: [{ kind: 'assumption', text: 'Series A lands within 9 months' }],
            tokensUsed: 420,
          },
        ],
      },
    ],
    disagreements: ['Atlas: runway risk vs Vera: delivery bottleneck compounds weekly'],
    risks: ['Key-person dependency if the hire stalls'],
    unknowns: ['True attrition rate for senior engineers'],
    alternatives: [{ name: 'Contract-to-hire', reasonRejected: 'Slower ramp, weaker ownership' }],
    consensusReached: false,
    confidence: 'medium',
    requiresFounderApproval: true,
    budgetUsd: 0.5,
    totalTokensUsed: 840,
    stoppedReason: 'max_rounds',
  };

  const [a1] = await deps.db
    .insert((await import('@orq8/db')).decisions)
    .values({
      orgId: a.orgId,
      title: 'Double engineering headcount next quarter?',
      decisionType: 'strategic',
      status: 'decided',
      confidence: 'medium',
      decisionMakerType: 'ai_council',
      whatWasDecided: 'Hire two senior engineers in Q3, contract first.',
      rationale: 'Delivery is the bottleneck; runway supports two hires.',
      expectedOutcome: 'Cycle time drops below 5 days per task.',
      decidedAt: new Date(),
      councilDetail: councilSession,
    })
    .returning();
  councilA = a1!.id;

  const [a2] = await deps.db
    .insert((await import('@orq8/db')).decisions)
    .values({
      orgId: a.orgId,
      title: 'Switch email provider',
      decisionMakerType: 'user',
      whatWasDecided: 'Move transactional email to Resend.',
    })
    .returning();
  nonCouncilA = a2!.id;

  const [a3] = await deps.db
    .insert((await import('@orq8/db')).decisions)
    .values({
      orgId: a.orgId,
      title: 'Older council decision (ordering check)',
      decisionType: 'operational',
      status: 'active',
      confidence: 'low',
      decisionMakerType: 'ai_council',
      whatWasDecided: 'Postpone the pricing experiment by one sprint.',
      councilDetail: null,
      createdAt: new Date(Date.now() - 60_000), // explicit: ordering must be deterministic
    })
    .returning();
  councilOldA = a3!.id;
});

afterAll(async () => {
  if (dbUp) {
    for (const orgId of createdOrgIds) {
      // Registration writes audit_events + sessions for the new org; children
      // must go before the organizations row (no cascade in that direction).
      await pool!.query('delete from decisions where org_id = $1', [orgId]);
      await pool!.query('delete from audit_events where org_id = $1', [orgId]);
      await pool!.query('delete from sessions where org_id = $1', [orgId]);
      await pool!.query('delete from memberships where org_id = $1', [orgId]);
      await pool!.query('delete from organizations where id = $1', [orgId]);
    }
    for (const userId of createdUserIds) {
      await pool!.query('delete from sessions where user_id = $1', [userId]);
      await pool!.query('delete from users where id = $1', [userId]);
    }
  }
  if (app) await app.close();
  await deps.pool.end();
});

let a: Ctx;
let b: Ctx;
let councilA: string;
let councilOldA: string;
let nonCouncilA: string;

run('Decision Council API (§47)', () => {
  it('list returns only ai_council decisions, newest first, with the page field set', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/deliberations',
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json().data as Array<Record<string, unknown>>;

    const titles = rows.map((r) => r.title);
    expect(titles).toContain('Double engineering headcount next quarter?');
    expect(titles).toContain('Older council decision (ordering check)');
    expect(titles).not.toContain('Switch email provider'); // non-council excluded

    // Newest first.
    expect(rows.findIndex((r) => r.title === 'Double engineering headcount next quarter?'))
      .toBeLessThan(rows.findIndex((r) => r.title === 'Older council decision (ordering check)'));

    // Exact field set the Council page consumes — no more, no less.
    const fields = Object.keys(rows[0]!).sort();
    expect(fields).toEqual(
      [
        'actualOutcome',
        'confidence',
        'createdAt',
        'decidedAt',
        'decisionType',
        'expectedOutcome',
        'id',
        'predictionAccuracy',
        'rationale',
        'status',
        'title',
        'whatWasDecided',
      ].sort(),
    );
  });

  it('detail returns the full session (councilDetail) for a council decision', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/deliberations/${councilA}`,
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;

    expect(body.title).toBe('Double engineering headcount next quarter?');
    expect(body.councilDetail).not.toBeNull();
    expect(body.councilDetail.question).toContain('engineering headcount');
    expect(body.councilDetail.participants).toHaveLength(2);
    expect(body.councilDetail.participants[0].model).toBe('test-model');
    expect(body.councilDetail.rounds[0].round).toBe(1);
    expect(body.councilDetail.disagreements).toHaveLength(1);
    expect(body.councilDetail.risks).toHaveLength(1);
    expect(body.councilDetail.unknowns).toHaveLength(1);
    expect(body.councilDetail.consensusReached).toBe(false);
    expect(body.councilDetail.confidence).toBe('medium');
    expect(body.councilDetail.requiresFounderApproval).toBe(true);
    expect(body.councilDetail.budgetUsd).toBe(0.5);
    expect(body.councilDetail.stoppedReason).toBe('max_rounds');
  });

  it('non-council decision is 404 on detail — Council never surfaces ordinary decisions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/deliberations/${nonCouncilA}`,
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('cross-org isolation: another org cannot read or list our council sessions', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/v1/deliberations/${councilA}`,
      headers: { authorization: `Bearer ${b.token}` },
    });
    expect(detail.statusCode).toBe(404);

    const list = await app.inject({
      method: 'GET',
      url: '/v1/deliberations',
      headers: { authorization: `Bearer ${b.token}` },
    });
    expect(list.statusCode).toBe(200);
    const titles = (list.json().data as Array<{ title: string }>).map((r) => r.title);
    expect(titles).not.toContain('Double engineering headcount next quarter?');
    expect(titles).not.toContain('Older council decision (ordering check)');
  });

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/deliberations' });
    expect(res.statusCode).toBe(401);

    const detail = await app.inject({ method: 'GET', url: `/v1/deliberations/${councilA}` });
    expect(detail.statusCode).toBe(401);
  });
});
