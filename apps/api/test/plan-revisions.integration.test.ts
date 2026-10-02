import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships, auditEvents } from '@orq8/db';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/services/sessions.js';
import { deleteOrg } from './helpers/delete-org.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

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
let orgA: string;
let orgB: string;
let userA: string;
let userB: string;
let tokenA = '';
let tokenB = '';

const authA = () => ({ authorization: `Bearer ${tokenA}` });
const authB = () => ({ authorization: `Bearer ${tokenB}` });

async function cleanupAll(): Promise<void> {
  for (const id of [orgA, orgB].filter(Boolean)) {
    await deleteOrg(deps.pool, id);
  }
  for (const id of [userA, userB].filter(Boolean)) {
    await deps.db.delete(users).where(eq(users.id, id));
  }
}

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);

  const [orgARow] = await deps.db
    .insert(organizations)
    .values({ name: `planrev-a-${randomUUID()}`, slug: `planrev-a-${randomUUID()}` })
    .returning();
  orgA = orgARow!.id;
  const [orgBRow] = await deps.db
    .insert(organizations)
    .values({ name: `planrev-b-${randomUUID()}`, slug: `planrev-b-${randomUUID()}` })
    .returning();
  orgB = orgBRow!.id;

  const [userARow] = await deps.db
    .insert(users)
    .values({
      email: `planrev-a-${randomUUID()}@example.com`,
      name: 'Plan Rev A',
      passwordHash: 'not-a-real-hash',
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning();
  userA = userARow!.id;
  const [userBRow] = await deps.db
    .insert(users)
    .values({
      email: `planrev-b-${randomUUID()}@example.com`,
      name: 'Plan Rev B',
      passwordHash: 'not-a-real-hash',
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning();
  userB = userBRow!.id;

  await deps.db.insert(memberships).values({ orgId: orgA, userId: userA, role: 'owner' });
  await deps.db.insert(memberships).values({ orgId: orgB, userId: userB, role: 'owner' });

  tokenA = (await createSession(deps.db, { userId: userA, orgId: orgA })).token;
  tokenB = (await createSession(deps.db, { userId: userB, orgId: orgB })).token;
});

afterAll(async () => {
  if (!dbUp) return;
  await cleanupAll();
  await app.close();
});

run('plan revisions + ratify (docs/71 §R item 4)', () => {
  it('starts empty with no current or pending revision', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/plan-revisions', headers: authA() });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { revisions: unknown[]; current: unknown; pending: unknown };
    expect(body.revisions).toEqual([]);
    expect(body.current).toBeNull();
    expect(body.pending).toBeNull();
  });

  it('drafts a revision with auto rev numbering and audits plan.revised', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/plan-revisions',
      headers: { ...authA(), 'content-type': 'application/json' },
      payload: {
        title: 'Initial plan',
        summary: 'Scope: launch pricing before ads',
        content: { whatWereBuilding: 'A lightweight client-report portal' },
      },
    });
    expect(res.statusCode).toBe(201);
    const rev1 = res.json() as { rev: number; status: string; authorName: string; authorType: string };
    expect(rev1.rev).toBe(1);
    expect(rev1.status).toBe('draft');

    // Audit trail: plan.revised, success, referencing the revision number.
    const [auditRow] = await deps.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.orgId, orgA))
      .orderBy(desc(auditEvents.id))
      .limit(1);
    expect(auditRow!.action).toBe('plan.revised');
    expect(auditRow!.outcome).toBe('success');
    expect(auditRow!.actorType).toBe('user');
    expect(auditRow!.resultRef).toContain('"revision":1');
  });

  it('keeps rev numbers per-org monotonic and org-scoped', async () => {
    // Org B drafts independently — it must also get rev 1.
    const resB = await app.inject({
      method: 'POST',
      url: '/v1/plan-revisions',
      headers: { ...authB(), 'content-type': 'application/json' },
      payload: { title: 'Org B plan' },
    });
    expect(resB.statusCode).toBe(201);
    expect((resB.json() as { rev: number }).rev).toBe(1);

    // Org A drafts a second revision — rev 2, authored as an agent (Atlas).
    const resA2 = await app.inject({
      method: 'POST',
      url: '/v1/plan-revisions',
      headers: { ...authA(), 'content-type': 'application/json' },
      payload: {
        title: 'Move launch to Friday',
        summary: 'Pricing launch moved to Friday',
        authorType: 'agent',
        authorName: 'Atlas',
      },
    });
    expect(resA2.statusCode).toBe(201);
    const rev2 = resA2.json() as { rev: number; authorName: string; authorType: string };
    expect(rev2.rev).toBe(2);
    expect(rev2.authorName).toBe('Atlas');
    expect(rev2.authorType).toBe('agent');
  });

  it('lists revisions newest-first with pending but no current before ratification', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/plan-revisions', headers: authA() });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      revisions: Array<{ rev: number }>;
      current: unknown;
      pending: { rev: number };
    };
    expect(body.revisions.map((r) => r.rev)).toEqual([2, 1]);
    expect(body.current).toBeNull();
    expect(body.pending!.rev).toBe(2);
  });

  it('ratifies a draft: becomes direction, previous ratified steps down, audits plan.ratified', async () => {
    // Ratify rev 1 first (the older draft), then rev 2 — supersede must work.
    const list = await app.inject({ method: 'GET', url: '/v1/plan-revisions', headers: authA() });
    const { revisions } = list.json() as { revisions: Array<{ id: string; rev: number }> };
    const rev1 = revisions.find((r) => r.rev === 1)!;
    const rev2 = revisions.find((r) => r.rev === 2)!;

    const ratify1 = await app.inject({
      method: 'POST',
      url: `/v1/plan-revisions/${rev1.id}/ratify`,
      headers: { ...authA(), 'content-type': 'application/json' },
      payload: { ratifierName: 'Joshua' },
    });
    expect(ratify1.statusCode).toBe(200);
    const after1 = ratify1.json() as { status: string; ratifiedBy: string | null };
    expect(after1.status).toBe('ratified');
    expect(after1.ratifiedBy).toBe('Joshua');

    // Rev 2 was also a draft — ratify it; rev 1 must step down to superseded.
    const ratify2 = await app.inject({
      method: 'POST',
      url: `/v1/plan-revisions/${rev2.id}/ratify`,
      headers: { ...authA(), 'content-type': 'application/json' },
      payload: {},
    });
    expect(ratify2.statusCode).toBe(200);

    const final = await app.inject({ method: 'GET', url: '/v1/plan-revisions', headers: authA() });
    const body = final.json() as {
      revisions: Array<{ id: string; rev: number; status: string }>;
      current: { rev: number };
      pending: unknown;
    };
    expect(body.current!.rev).toBe(2);
    expect(body.pending).toBeNull();
    const statuses = new Map(body.revisions.map((r) => [r.rev, r.status]));
    expect(statuses.get(2)).toBe('ratified');
    expect(statuses.get(1)).toBe('superseded');

    // plan.ratified audited for rev 2.
    const [auditRow] = await deps.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.orgId, orgA))
      .orderBy(desc(auditEvents.id))
      .limit(1);
    expect(auditRow!.action).toBe('plan.ratified');
    expect(auditRow!.outcome).toBe('success');
  });

  it('is idempotent on re-ratify of the already-direction revision', async () => {
    const list = await app.inject({ method: 'GET', url: '/v1/plan-revisions', headers: authA() });
    const current = (list.json() as { current: { id: string } }).current!;
    const res = await app.inject({
      method: 'POST',
      url: `/v1/plan-revisions/${current.id}/ratify`,
      headers: { ...authA(), 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe('ratified');
  });

  it('rejects a draft and refuses to ratify it afterwards', async () => {
    const drafted = await app.inject({
      method: 'POST',
      url: '/v1/plan-revisions',
      headers: { ...authA(), 'content-type': 'application/json' },
      payload: { title: 'Bad idea', summary: 'Should be rejected' },
    });
    const draft = drafted.json() as { id: string; rev: number };

    const rejected = await app.inject({
      method: 'POST',
      url: `/v1/plan-revisions/${draft.id}/reject`,
      headers: { ...authA(), 'content-type': 'application/json' },
      payload: {},
    });
    expect(rejected.statusCode).toBe(200);
    expect((rejected.json() as { status: string }).status).toBe('rejected');

    const ratify = await app.inject({
      method: 'POST',
      url: `/v1/plan-revisions/${draft.id}/ratify`,
      headers: { ...authA(), 'content-type': 'application/json' },
      payload: {},
    });
    expect(ratify.statusCode).toBe(409);

    // Rejecting the current (ratified) revision is refused too.
    const list = await app.inject({ method: 'GET', url: '/v1/plan-revisions', headers: authA() });
    const current = (list.json() as { current: { id: string } }).current!;
    const rejectCurrent = await app.inject({
      method: 'POST',
      url: `/v1/plan-revisions/${current.id}/reject`,
      headers: { ...authA(), 'content-type': 'application/json' },
      payload: {},
    });
    expect(rejectCurrent.statusCode).toBe(409);
  });

  it('404s another org’s revision and never leaks it in the list', async () => {
    const listB = await app.inject({ method: 'GET', url: '/v1/plan-revisions', headers: authB() });
    const revB = (listB.json() as { revisions: Array<{ id: string }> }).revisions[0]!;

    const cross = await app.inject({
      method: 'POST',
      url: `/v1/plan-revisions/${revB.id}/ratify`,
      headers: { ...authA(), 'content-type': 'application/json' },
      payload: {},
    });
    expect(cross.statusCode).toBe(404);

    const listA = await app.inject({ method: 'GET', url: '/v1/plan-revisions', headers: authA() });
    const idsA = (listA.json() as { revisions: Array<{ id: string }> }).revisions.map((r) => r.id);
    expect(idsA).not.toContain(revB.id);
  });

  it('requires auth and rejects invalid bodies', async () => {
    const noAuth = await app.inject({ method: 'GET', url: '/v1/plan-revisions' });
    expect(noAuth.statusCode).toBe(401);

    const emptyTitle = await app.inject({
      method: 'POST',
      url: '/v1/plan-revisions',
      headers: { ...authA(), 'content-type': 'application/json' },
      payload: { title: '   ' },
    });
    expect(emptyTitle.statusCode).toBeGreaterThanOrEqual(400);

    const badAuthorType = await app.inject({
      method: 'POST',
      url: '/v1/plan-revisions',
      headers: { ...authA(), 'content-type': 'application/json' },
      payload: { title: 'x', authorType: 'system' },
    });
    expect(badAuthorType.statusCode).toBeGreaterThanOrEqual(400);
  });
});
