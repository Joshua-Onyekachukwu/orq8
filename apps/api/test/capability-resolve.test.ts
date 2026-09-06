import { describe, it, expect, beforeAll, afterAll, describe as dbDescribe } from 'vitest';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { loadConfig } from '@orq8/core';
import { createDb, organizations, memberships, users, capabilityRegistry } from '@orq8/db';
import { randomUUID } from 'node:crypto';
import { capabilityTokens, resolveCapabilityRequest, ensureBuiltInCapabilities } from '../src/services/capability-registry.js';
import { createMemory } from '../src/services/memory.js';

// ─── Pure unit tests ───────────────────────────────────────────────────────

describe('capability tokenization', () => {
  it('lowercases, splits punctuation and drops stop words', () => {
    const tokens = capabilityTokens("Can we follow up with customers who haven't responded?");
    expect(tokens.has('follow')).toBe(true);
    expect(tokens.has('customers')).toBe(true);
    expect(tokens.has('responded')).toBe(true);
    expect(tokens.has('can')).toBe(false); // stop word
    expect(tokens.has('with')).toBe(false); // stop word
    expect(tokens.has('up')).toBe(false); // too short
    expect(tokens.has('t')).toBe(false); // too short
  });
});

// ─── DB-gated integration tests (skip without Postgres or before 0012) ────

const config = loadConfig();
let pool: Pool | null = null;
let dbUp = false;
let hasTable = false;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
  dbUp = true;
  const r = await pool.query(`select to_regclass('public.capability_registry') as t`);
  hasTable = Boolean(r.rows[0]?.t);
} catch {
  await pool?.end().catch(() => undefined);
  pool = null;
}

const run = dbUp && hasTable ? dbDescribe : dbDescribe.skip;

run('capability registry resolve (build-vs-buy)', () => {
  const { db } = createDb(config.DATABASE_URL);
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();

  beforeAll(async () => {
    if (!pool) return;
    await pool.query('begin');
    await db.insert(organizations).values({ id: orgA, name: 'Resolve A', slug: `res-a-${randomUUID().slice(0, 8)}`, settings: {} }).onConflictDoNothing();
    await db.insert(organizations).values({ id: orgB, name: 'Resolve B', slug: `res-b-${randomUUID().slice(0, 8)}`, settings: {} }).onConflictDoNothing();
    await db.insert(users).values({ id: userA, email: `res-a-${randomUUID()}@test.orq8`, name: 'A', passwordHash: 'x', status: 'active' }).onConflictDoNothing();
    await db.insert(memberships).values({ orgId: orgA, userId: userA, role: 'owner' }).onConflictDoNothing();
    await db.insert(memberships).values({ orgId: orgB, userId: userA, role: 'owner' }).onConflictDoNothing();
    await ensureBuiltInCapabilities(db, orgA);
    // Company knowledge about an existing customer follow-up process.
    await createMemory(db, {
      orgId: orgA,
      category: 'workflow',
      content: 'Customer follow-up workflow: email customers who have not responded to outreach within 48 hours using gmail search and send approved drafts.',
      importance: 7,
      source: 'test',
    });
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('rollback');
    await pool.end();
    pool = null;
  });

  it('recommends reuse when a registered capability already matches', async () => {
    const result = await resolveCapabilityRequest(db, orgA, 'create gmail drafts', { actorId: userA });
    expect(result.decision).toBe('reuse');
    expect(result.matches.some((m) => m.name.includes('gmail.create_draft'))).toBe(true);
    expect(result.matches.some((m) => m.kind === 'tool')).toBe(true);
  });

  it('finds company knowledge (workflows) and recommends reuse over building', async () => {
    const result = await resolveCapabilityRequest(db, orgA, "can we follow up with customers who haven't responded", { actorId: userA });
    expect(result.decision).toBe('reuse');
    expect(result.matches.some((m) => m.kind === 'knowledge')).toBe(true);
    expect(result.reason).toMatch(/reuse/i);
  });

  it('recommends building when nothing matches', async () => {
    const result = await resolveCapabilityRequest(db, orgA, 'quantum chemistry simulation on proprietary hardware', { actorId: userA });
    expect(result.decision).toBe('build');
    expect(result.matches).toHaveLength(0);
  });

  it('is company-scoped — org B can never see org A capabilities or knowledge', async () => {
    const resultA = await resolveCapabilityRequest(db, orgA, 'gmail create draft', { actorId: userA });
    const resultB = await resolveCapabilityRequest(db, orgB, 'gmail create draft', { actorId: userA });
    expect(resultA.decision).toBe('reuse');
    expect(resultB.decision).not.toBe('reuse');
    const orgBRegistry = await db.select().from(capabilityRegistry).where(eq(capabilityRegistry.orgId, orgB));
    expect(orgBRegistry).toHaveLength(0); // no built-ins seeded for org B
  });

  it('records an audit observation with a truncated request (no full prompt dump)', async () => {
    const long = `please automate ${'x'.repeat(500)} follow-up emails`;
    const result = await resolveCapabilityRequest(db, orgA, long, { actorId: userA });
    expect(result.request.length).toBeLessThanOrEqual(200);
  });
});
