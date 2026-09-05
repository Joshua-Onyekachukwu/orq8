import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships, sessions, departments, teams, agents, goals, tasks, auditEvents } from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/services/sessions.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

// DB reachability probe.
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

// RLS tests additionally need Supabase's auth.uid() (request.jwt.claims).
let rlsAvailable = false;
if (dbUp && pool) {
  try {
    const res = await pool.query(
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE p.proname = 'uid' AND n.nspname = 'auth'`,
    );
    rlsAvailable = res.rowCount === 1;
  } catch {
    rlsAvailable = false;
  }
}
const runRls = dbUp && rlsAvailable ? describe : describe.skip;

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
    await deps.db.delete(sessions).where(eq(sessions.orgId, id));
    await deps.db.delete(agents).where(eq(agents.orgId, id));
    await deps.db.delete(tasks).where(eq(tasks.orgId, id));
    await deps.db.delete(goals).where(eq(goals.orgId, id));
    await deps.db.delete(teams).where(eq(teams.orgId, id));
    await deps.db.delete(departments).where(eq(departments.orgId, id));
    await deps.db.delete(memberships).where(eq(memberships.orgId, id));
    await deps.db.delete(auditEvents).where(eq(auditEvents.orgId, id));
    await deps.db.delete(organizations).where(eq(organizations.id, id));
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
    .values({ name: `org-integ-a-${randomUUID()}`, slug: `org-integ-a-${randomUUID()}` })
    .returning();
  orgA = orgARow!.id;
  const [orgBRow] = await deps.db
    .insert(organizations)
    .values({ name: `org-integ-b-${randomUUID()}`, slug: `org-integ-b-${randomUUID()}` })
    .returning();
  orgB = orgBRow!.id;

  const [userARow] = await deps.db
    .insert(users)
    .values({ email: `a-${randomUUID()}@example.com`, name: 'User A', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userA = userARow!.id;
  const [userBRow] = await deps.db
    .insert(users)
    .values({ email: `b-${randomUUID()}@example.com`, name: 'User B', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userB = userBRow!.id;

  await deps.db.insert(memberships).values({ orgId: orgA, userId: userA, role: 'owner' });
  await deps.db.insert(memberships).values({ orgId: orgB, userId: userB, role: 'owner' });

  const sA = await createSession(deps.db, { userId: userA, orgId: orgA });
  const sB = await createSession(deps.db, { userId: userB, orgId: orgB });
  tokenA = sA.token;
  tokenB = sB.token;
});

afterAll(async () => {
  if (dbUp) {
    await app.close();
    await cleanupAll();
  }
  await deps.pool.end();
  await pool?.end();
});

run('org structure — API + RLS integration', () => {
  let deptA: string;
  let deptA2: string;
  let teamA: string;
  let teamA2: string;
  let agentA: string;
  let deptB: string;

  it('unauthenticated requests are rejected (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/teams' });
    expect(res.statusCode).toBe(401);
    const res2 = await app.inject({ method: 'POST', url: '/v1/departments', payload: { name: 'x' } });
    expect(res2.statusCode).toBe(401);
  });

  it('creates a department, a team and an AI employee inside org A', async () => {
    const deptRes = await app.inject({
      method: 'POST',
      url: '/v1/departments',
      headers: authA(),
      payload: { name: `Eng-${randomUUID()}`, description: 'Builds things' },
    });
    expect(deptRes.statusCode).toBe(201);
    deptA = deptRes.json().data.id;

    const dept2Res = await app.inject({
      method: 'POST',
      url: '/v1/departments',
      headers: authA(),
      payload: { name: `Ops-${randomUUID()}` },
    });
    expect(dept2Res.statusCode).toBe(201);
    deptA2 = dept2Res.json().data.id;

    const teamRes = await app.inject({
      method: 'POST',
      url: '/v1/teams',
      headers: authA(),
      payload: { name: `Platform-${randomUUID()}`, departmentId: deptA, lead: 'Lead Alpha' },
    });
    expect(teamRes.statusCode).toBe(201);
    teamA = teamRes.json().data.id;

    const team2Res = await app.inject({
      method: 'POST',
      url: '/v1/teams',
      headers: authA(),
      payload: { name: `QA-${randomUUID()}`, departmentId: deptA2 },
    });
    expect(team2Res.statusCode).toBe(201);
    teamA2 = team2Res.json().data.id;

    const agentRes = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: authA(),
      payload: { name: `Alpha-${randomUUID()}`, role: 'software_engineer', departmentId: deptA, teamId: teamA },
    });
    expect(agentRes.statusCode).toBe(201);
    agentA = agentRes.json().data.id;
    expect(agentRes.json().data.teamId).toBe(teamA);
    expect(agentRes.json().data.departmentId).toBe(deptA);

    // Cross-org decoy so isolation assertions have a concrete target.
    const deptBRes = await app.inject({
      method: 'POST',
      url: '/v1/departments',
      headers: authB(),
      payload: { name: `Rival-${randomUUID()}` },
    });
    expect(deptBRes.statusCode).toBe(201);
    deptB = deptBRes.json().data.id;
  });

  it('rejects creating a team with another org\u2019s departmentId (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/teams',
      headers: authA(),
      payload: { name: `Evil-${randomUUID()}`, departmentId: deptB },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error?.message).toContain('not found in this organization');
  });

  it('cross-org reads are rejected (404 — resource invisible)', async () => {
    const read = await app.inject({ method: 'GET', url: `/v1/teams/${teamA}`, headers: authB() });
    expect(read.statusCode).toBe(404);
    const readAgent = await app.inject({ method: 'GET', url: `/v1/agents/${agentA}`, headers: authB() });
    expect(readAgent.statusCode).toBe(404);
    const readDept = await app.inject({ method: 'GET', url: `/v1/departments/${deptA}`, headers: authB() });
    expect(readDept.statusCode).toBe(404);
  });

  it('cross-org mutations are rejected (404)', async () => {
    const patchTeam = await app.inject({
      method: 'PATCH',
      url: `/v1/teams/${teamA}`,
      headers: authB(),
      payload: { status: 'archived' },
    });
    expect(patchTeam.statusCode).toBe(404);

    const patchAgent = await app.inject({
      method: 'PATCH',
      url: `/v1/agents/${agentA}`,
      headers: authB(),
      payload: { status: 'paused' },
    });
    expect(patchAgent.statusCode).toBe(404);

    const patchDept = await app.inject({
      method: 'PATCH',
      url: `/v1/departments/${deptA}`,
      headers: authB(),
      payload: { status: 'archived' },
    });
    expect(patchDept.statusCode).toBe(404);
  });

  it('org B\u2019s list endpoints never include org A entities', async () => {
    const teamsB = await app.inject({ method: 'GET', url: '/v1/teams', headers: authB() });
    const body = teamsB.json().data as Array<{ id: string; name: string }>;
    expect(body.every((t) => t.id !== teamA)).toBe(true);
    const agentsB = await app.inject({ method: 'GET', url: '/v1/agents', headers: authB() });
    const agentsBody = agentsB.json().data as Array<{ id: string }>;
    expect(agentsBody.every((a) => a.id !== agentA)).toBe(true);
  });

  it('reassigns an employee between teams and a team between departments', async () => {
    const moveAgent = await app.inject({
      method: 'PATCH',
      url: `/v1/agents/${agentA}`,
      headers: authA(),
      payload: { teamId: teamA2 },
    });
    expect(moveAgent.statusCode).toBe(200);
    expect(moveAgent.json().data.teamId).toBe(teamA2);

    const moveTeam = await app.inject({
      method: 'PATCH',
      url: `/v1/teams/${teamA2}`,
      headers: authA(),
      payload: { departmentId: deptA },
    });
    expect(moveTeam.statusCode).toBe(200);
    expect(moveTeam.json().data.departmentId).toBe(deptA);
  });

  it('pauses an employee; team pause is not supported (rejected as invalid)', async () => {
    const pause = await app.inject({
      method: 'PATCH',
      url: `/v1/agents/${agentA}`,
      headers: authA(),
      payload: { status: 'paused' },
    });
    expect(pause.statusCode).toBe(200);
    expect(pause.json().data.status).toBe('paused');

    const teamPause = await app.inject({
      method: 'PATCH',
      url: `/v1/teams/${teamA}`,
      headers: authA(),
      payload: { status: 'paused' },
    });
    expect(teamPause.statusCode).toBe(400); // teams only support active|archived
  });

  it('archives employee, team and department — ownership retained', async () => {
    const archiveAgent = await app.inject({
      method: 'PATCH',
      url: `/v1/agents/${agentA}`,
      headers: authA(),
      payload: { status: 'archived' },
    });
    expect(archiveAgent.statusCode).toBe(200);

    const archiveTeam = await app.inject({
      method: 'PATCH',
      url: `/v1/teams/${teamA}`,
      headers: authA(),
      payload: { status: 'archived' },
    });
    expect(archiveTeam.statusCode).toBe(200);

    const archiveDept = await app.inject({
      method: 'PATCH',
      url: `/v1/departments/${deptA}`,
      headers: authA(),
      payload: { status: 'archived' },
    });
    expect(archiveDept.statusCode).toBe(200);

    const teamRow = await deps.db.select().from(teams).where(eq(teams.id, teamA)).limit(1);
    expect(teamRow[0]!.orgId).toBe(orgA);
    expect(teamRow[0]!.status).toBe('archived');
  });
});

runRls('RLS — direct database access is org-scoped', () => {
  it('a non-member user cannot read or insert another org\u2019s rows via SQL', async () => {
    if (!pool) throw new Error('pool unavailable');

    // Emulate the Supabase authenticated role for user B.
    await pool.query(`select set_config('request.jwt.claims', $1::text, true)`, [
      JSON.stringify({ sub: userB, role: 'authenticated' }),
    ]);

    const read = await pool.query('select id from public.teams where org_id = $1', [orgA]);
    expect(read.rowCount).toBe(0);

    const insert = await pool.query(
      'insert into public.teams (org_id, name) values ($1, $2) returning id',
      [orgA, `rls-evil-${randomUUID()}`],
    );
    expect(insert.rowCount).toBe(0);

    const update = await pool.query('update public.agents set status = $1 where org_id = $2', ['paused', orgA]);
    expect(update.rowCount).toBe(0);
  });

  it('an org member can read and mutate their own org via SQL', async () => {
    if (!pool) throw new Error('pool unavailable');

    await pool.query(`select set_config('request.jwt.claims', $1::text, true)`, [
      JSON.stringify({ sub: userA, role: 'authenticated' }),
    ]);

    const read = await pool.query('select id from public.departments where org_id = $1', [orgA]);
    expect((read.rowCount ?? 0)).toBeGreaterThan(0);
  });

  it('resets the JWT context so later queries are not polluted', async () => {
    if (!pool) throw new Error('pool unavailable');
    await pool.query(`select set_config('request.jwt.claims', '{}', true)`);
  });
});