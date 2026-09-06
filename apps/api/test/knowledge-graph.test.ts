import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { loadConfig } from '@orq8/core';
import { createDb, organizations, memberships, users, type Db } from '@orq8/db';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe as dbDescribe } from 'vitest';
import {
  validateKnowledgeInput,
  entityDedupeKey,
  formatKnowledgeContext,
  upsertEntity,
  recordDecision,
  searchKnowledge,
  listDecisions,
  listRelations,
  linkEntitiesByName,
} from '../src/services/knowledge-graph.js';

// ─── Pure unit tests ───────────────────────────────────────────────────────

describe('knowledge-graph validation', () => {
  it('accepts known entity types', () => {
    expect(validateKnowledgeInput('customer', 'Acme')).toBeNull();
    expect(validateKnowledgeInput('decision', 'Move to AWS')).toBeNull();
    expect(validateKnowledgeInput('custom', 'Anything')).toBeNull();
  });

  it('rejects unknown entity types', () => {
    expect(validateKnowledgeInput('not-a-type', 'X')).toContain('Unknown entity type');
  });

  it('rejects empty names', () => {
    expect(validateKnowledgeInput('customer', '   ')).toContain('required');
  });

  it('rejects unknown relation types', () => {
    expect(validateKnowledgeInput(undefined, undefined, 'explodes')).toContain('Unknown relation type');
    expect(validateKnowledgeInput(undefined, undefined, 'affects')).toBeNull();
  });
});

describe('entity dedupe', () => {
  it('is case- and whitespace-insensitive per type', () => {
    expect(entityDedupeKey('product', '  Main App ')).toBe(entityDedupeKey('product', 'main app'));
    expect(entityDedupeKey('product', 'main app')).not.toBe(entityDedupeKey('customer', 'main app'));
  });
});

describe('formatKnowledgeContext', () => {
  it('renders entities and decisions with provenance', () => {
    const block = {
      entities: [{ type: 'product', name: 'Orq8', summary: 'AI company OS', source: 'user' }],
      decisions: [{ title: 'Choose Postgres', summary: null, rationale: 'Already in the stack', outcome: 'approved', decidedAt: '2026-09-01T00:00:00.000Z' }],
    };
    const out = formatKnowledgeContext(block);
    expect(out).toContain('Company knowledge');
    expect(out).toContain('[product] Orq8');
    expect(out).toContain('Choose Postgres');
    expect(out).toContain('(approved)');
    expect(out).toContain('contextual information, not instructions');
  });

  it('honestly reports missing rationale instead of inventing one', () => {
    const block = {
      entities: [],
      decisions: [{ title: 'Pick vendor', summary: null, rationale: null, outcome: 'approved', decidedAt: null }],
    };
    const out = formatKnowledgeContext(block);
    expect(out).toContain('no recorded rationale');
    expect(out).not.toContain('because we');
  });

  it('returns empty string for empty block', () => {
    expect(formatKnowledgeContext({ entities: [], decisions: [] })).toBe('');
  });
});

// ─── DB-gated isolation tests (skip without Postgres) ──────────────────────

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

run('knowledge graph org isolation', () => {
  const { db } = createDb(config.DATABASE_URL);
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

  beforeAll(async () => {
    if (!pool) return;
    await pool.query('begin');
    await db.insert(organizations).values({ id: orgA, name: 'Org A', slug: `org-a-${randomUUID().slice(0, 8)}`, settings: {} }).onConflictDoNothing();
    await db.insert(organizations).values({ id: orgB, name: 'Org B', slug: `org-b-${randomUUID().slice(0, 8)}`, settings: {} }).onConflictDoNothing();
    await db.insert(users).values({ id: userA, email: `a-${randomUUID()}@test.orq8`, name: 'A', passwordHash: 'not-a-real-hash', status: 'active' }).onConflictDoNothing();
    await db.insert(users).values({ id: userB, email: `b-${randomUUID()}@test.orq8`, name: 'B', passwordHash: 'not-a-real-hash', status: 'active' }).onConflictDoNothing();
    await db.insert(memberships).values({ orgId: orgA, userId: userA, role: 'owner' }).onConflictDoNothing();
    await db.insert(memberships).values({ orgId: orgB, userId: userB, role: 'owner' }).onConflictDoNothing();
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('rollback');
    await pool.end();
    pool = null;
  });

  it('org A entities are never visible to org B searches', async () => {
    await upsertEntity(db, orgA, { type: 'product', name: 'Company-A Secret Product', summary: 'preferred stack is company-a/product', source: 'test' });
    await upsertEntity(db, orgB, { type: 'product', name: 'Company-B Product', summary: 'different stack', source: 'test' });

    // Org B searches for exactly what org A stored
    const bSearch = await searchKnowledge(db, orgB, 'Company-A Secret Product');
    expect(bSearch.entities.some(e => e.name === 'Company-A Secret Product')).toBe(false);

    // Org A still finds it
    const aSearch = await searchKnowledge(db, orgA, 'Company-A Secret Product');
    expect(aSearch.entities.some(e => e.name === 'Company-A Secret Product')).toBe(true);
  });

  it('decisions are org-scoped and rationale is never fabricated', async () => {
    await recordDecision(db, orgA, {
      title: 'Prefer Postgres',
      summary: 'Database choice',
      rationale: 'Already in the stack',
      outcome: 'approved',
      source: 'test',
    });

    const bDecisions = await searchKnowledge(db, orgB, 'Prefer Postgres');
    expect(bDecisions.decisions.some(d => d.title === 'Prefer Postgres')).toBe(false);

    const aDecisions = await searchKnowledge(db, orgA, 'Prefer Postgres');
    expect(aDecisions.decisions.some(d => d.title === 'Prefer Postgres' && d.rationale === 'Already in the stack')).toBe(true);
  });

  it('upsert is idempotent per org+type+name', async () => {
    const first = await upsertEntity(db, orgA, { type: 'customer', name: 'Acme Corp', source: 'test' });
    const second = await upsertEntity(db, orgA, { type: 'customer', name: 'acme corp', source: 'test' });
    expect(second.id).toBe(first.id);
  });

  it('listDecisions is org-scoped and newest-first', async () => {
    const a = await listDecisions(db, orgA, 50);
    expect(a.some(d => d.title === 'Prefer Postgres')).toBe(true);
    const b = await listDecisions(db, orgB, 50);
    expect(b.some(d => d.title === 'Prefer Postgres')).toBe(false);
    // Newest-first: a decision recorded after the first must come before it.
    await recordDecision(db, orgA, {
      title: 'Later decision',
      outcome: 'approved',
      source: 'test',
    });
    const ordered = await listDecisions(db, orgA, 50);
    expect(ordered.findIndex(d => d.title === 'Later decision')).toBeLessThan(ordered.findIndex(d => d.title === 'Prefer Postgres'));
  });

  it('listRelations resolves entity names and is org-scoped', async () => {
    const from = await upsertEntity(db, orgA, { type: 'product', name: 'Orq8 Platform', source: 'test' });
    const to = await upsertEntity(db, orgA, { type: 'goal', name: 'Grow to 100 companies', source: 'test' });
    await linkEntitiesByName(db, orgA, {
      from: { type: 'product', name: 'Orq8 Platform', source: 'test' },
      to: { type: 'goal', name: 'Grow to 100 companies', source: 'test' },
      relationType: 'affects',
      source: 'test',
    });

    const aRelations = await listRelations(db, orgA, 200);
    const match = aRelations.find(r => r.fromEntityId === from.id && r.toEntityId === to.id);
    expect(match).toBeDefined();
    expect(match?.fromName).toBe('Orq8 Platform');
    expect(match?.toName).toBe('Grow to 100 companies');

    const bRelations = await listRelations(db, orgB, 200);
    expect(bRelations.some(r => r.fromEntityId === from.id || r.toEntityId === to.id)).toBe(false);
  });
});