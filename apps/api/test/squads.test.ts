import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { loadConfig } from '@orq8/core';
import { createDb, organizations, memberships, users, agents } from '@orq8/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe as dbDescribe } from 'vitest';
import { createSquad, listSquads, getSquad, monitorSquad } from '../src/services/squads.js';

// ─── DB-gated tests (skip without Postgres) ────────────────────────────────

const config = loadConfig();
let pool: Pool | null = null;
let dbUp = false;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
  dbUp = true;
} catch {
  await pool?.end().catch(() => undefined);
  pool = null;
  dbUp = false;
}

const run = dbUp ? dbDescribe : dbDescribe.skip;

run('cross-agent squads', () => {
  const { db } = createDb(config.DATABASE_URL);
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const agentA = randomUUID();
  const agentB = randomUUID();
  const foreignAgent = randomUUID();

  beforeAll(async () => {
    if (!pool) return;
    await pool.query('begin');
    await db.insert(organizations).values({ id: orgA, name: 'Squad Org A', slug: `squad-a-${randomUUID().slice(0, 8)}`, settings: {} }).onConflictDoNothing();
    await db.insert(organizations).values({ id: orgB, name: 'Squad Org B', slug: `squad-b-${randomUUID().slice(0, 8)}`, settings: {} }).onConflictDoNothing();
    await db.insert(users).values({ id: userA, email: `sq-${randomUUID()}@test.orq8`, name: 'A', passwordHash: 'x', status: 'active' }).onConflictDoNothing();
    await db.insert(memberships).values({ orgId: orgA, userId: userA, role: 'owner' }).onConflictDoNothing();
    await db.insert(agents).values({ id: agentA, orgId: orgA, name: 'Agent A1', role: 'marketer', status: 'active' }).onConflictDoNothing();
    await db.insert(agents).values({ id: agentB, orgId: orgA, name: 'Agent A2', role: 'writer', status: 'active' }).onConflictDoNothing();
    await db.insert(agents).values({ id: foreignAgent, orgId: orgB, name: 'Foreign Agent', role: 'engineer', status: 'active' }).onConflictDoNothing();
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('rollback');
    await pool.end();
    pool = null;
  });

  it('creates a squad with validated in-org members', async () => {
    const squad = await createSquad(db, orgA, userA, {
      name: 'Launch Squad',
      purpose: 'Ship the launch',
      objective: 'Launch the product in 4 weeks',
      agentIds: [agentA, agentB],
    });
    expect(squad.name).toBe('Launch Squad');
    expect(squad.agents.length).toBe(2);
    expect(squad.agents.map(a => a.id).sort()).toEqual([agentA, agentB].sort());
  });

  it('rejects foreign agents (company isolation)', async () => {
    await expect(
      createSquad(db, orgA, userA, {
        name: 'Bad Squad',
        purpose: 'x',
        objective: 'y',
        agentIds: [foreignAgent],
      }),
    ).rejects.toThrow(/does not belong to this organization/);
  });

  it('lists only this org squads and monitors empty task distribution', async () => {
    const squads = await listSquads(db, orgA);
    expect(squads.some(s => s.name === 'Launch Squad')).toBe(true);

    const squad = await getSquad(db, orgA, squads.find(s => s.name === 'Launch Squad')!.id);
    expect(squad).not.toBeNull();

    const monitor = await monitorSquad(db, orgA, squad!.id);
    expect(monitor).not.toBeNull();
    expect(monitor!.summary.totalTasks).toBe(0);
    expect(monitor!.summary.completionRate).toBe(0);
  });

  it('org B cannot see org A squads', async () => {
    const squads = await listSquads(db, orgB);
    expect(squads.some(s => s.name === 'Launch Squad')).toBe(false);
  });
});