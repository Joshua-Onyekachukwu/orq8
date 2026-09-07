/**
 * Audit chain concurrency tests.
 *
 * Verifies that the atomic append mechanism (migration 0016: advisory lock
 * per org) prevents chain forks under concurrent writes.  Also checks that
 * different organizations remain independent and that historical events are
 * never invalidated.
 *
 * Requires a real PostgreSQL database (skips when DATABASE_URL is absent).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { eq, sql } from 'drizzle-orm';
import { auditEvents } from '@orq8/db';
import { appendAudit, verifyChain, genesisHash } from '../src/services/audit.js';
import { createDb } from '@orq8/db';

const canRun = !!process.env.DATABASE_URL || process.env.CI === 'true';

let db: ReturnType<typeof createDb>['db'];
let pool: ReturnType<typeof createDb>['pool'];

// Unique org IDs to avoid collisions across test runs.
const ORG_A = crypto.randomUUID();
const ORG_B = crypto.randomUUID();

beforeAll(async () => {
  if (!canRun) return;
  const url = process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8';
  const created = createDb(url);
  db = created.db;
  pool = created.pool;

  // Insert stub org rows so FK references are valid.
  await pool.query(
    `INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [ORG_A, 'Concurrency Test Org A', `conc-test-a-${Date.now()}`],
  );
  await pool.query(
    `INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [ORG_B, 'Concurrency Test Org B', `conc-test-b-${Date.now()}`],
  );
}, 30_000);

afterAll(async () => {
  if (pool) {
    // Clean up test data.
    await pool.query(`DELETE FROM audit_events WHERE org_id IN ($1, $2)`, [ORG_A, ORG_B]);
    await pool.query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [ORG_A, ORG_B]);
    await pool.end();
  }
});

const describeIfDB = canRun ? describe : describe.skip;

// Helper: append N sequential audit events for the given org.
async function appendSequential(db: any, orgId: string, count: number, prefix: string): Promise<void> {
  for (let i = 0; i < count; i++) {
    await appendAudit(db, {
      orgId,
      actorType: 'user',
      actorId: crypto.randomUUID(),
      action: `${prefix}.action_${i}`,
      outcome: 'success',
      occurredAt: new Date(),
    });
  }
}

describeIfDB('audit chain — atomic append (migration 0016)', () => {

  it('single-org sequential appends produce a valid linear chain', async () => {
    await appendSequential(db, ORG_A, 10, 'seq');
    const result = await verifyChain(db, ORG_A);
    expect(result.valid).toBe(true);
    expect(result.rows).toBe(10);
  });

  it('concurrent appends for the SAME organization cannot fork the chain', async () => {
    const CONCURRENCY = 50;

    // Fire all appendAudit calls simultaneously.
    const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
      appendAudit(db, {
        orgId: ORG_A,
        actorType: 'agent',
        actorId: crypto.randomUUID(),
        action: `conc.action_${i}`,
        outcome: 'success',
        occurredAt: new Date(),
      }),
    );

    const results = await Promise.allSettled(promises);
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded.length).toBe(CONCURRENCY);

    // Verify the chain is still perfectly linear.
    const chain = await verifyChain(db, ORG_A);
    expect(chain.valid).toBe(true);
    expect(chain.rows).toBe(10 + CONCURRENCY); // 10 sequential + 50 concurrent
  });

  it('no duplicate prev_hash links exist', async () => {
    // Count how many events share each prev_hash. For a valid chain, each
    // prev_hash should appear at most once (except genesis, which appears
    // only for the first event).
    const dupCheck = await pool.query(`
      SELECT prev_hash, count(*) AS cnt
      FROM audit_events
      WHERE org_id = $1
      GROUP BY prev_hash
      HAVING count(*) > 1
    `, [ORG_A]);

    expect(dupCheck.rows.length).toBe(0);
  });

  it('cross-organization chains are independent', async () => {
    // Append to Org B concurrently with Org A still having data.
    const CONCURRENCY = 30;
    const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
      appendAudit(db, {
        orgId: ORG_B,
        actorType: 'system',
        actorId: null,
        action: `orgb.action_${i}`,
        outcome: 'success',
        occurredAt: new Date(),
      }),
    );

    const results = await Promise.allSettled(promises);
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded.length).toBe(CONCURRENCY);

    // Org B chain is valid and independent.
    const chainB = await verifyChain(db, ORG_B);
    expect(chainB.valid).toBe(true);
    expect(chainB.rows).toBe(CONCURRENCY);

    // Org A chain remains valid (not affected by Org B writes).
    const chainA = await verifyChain(db, ORG_A);
    expect(chainA.valid).toBe(true);
  });

  it('hashes do not cross organizations', async () => {
    // Every event in Org A should use the Org A genesis as its root.
    const orgAEvents = await pool.query(
      `SELECT prev_hash, hash FROM audit_events WHERE org_id = $1 ORDER BY id LIMIT 1`,
      [ORG_A],
    );
    const expectedGenesisA = genesisHash(ORG_A);
    expect(orgAEvents.rows[0].prev_hash).toBe(expectedGenesisA);

    const orgBEvents = await pool.query(
      `SELECT prev_hash, hash FROM audit_events WHERE org_id = $1 ORDER BY id LIMIT 1`,
      [ORG_B],
    );
    const expectedGenesisB = genesisHash(ORG_B);
    expect(orgBEvents.rows[0].prev_hash).toBe(expectedGenesisB);
  });

  it('concurrent appends DO NOT interleave hashes across organizations', async () => {
    // All Org A hashes should start with the Org A genesis chain.
    // All Org B hashes should start with the Org B genesis chain.
    // No Org A event should reference an Org B prev_hash and vice versa.
    const crossCheck = await pool.query(`
      SELECT ae1.id AS event_id, ae1.org_id, ae1.prev_hash,
             ae2.hash AS referenced_hash, ae2.org_id AS referenced_org
      FROM audit_events ae1
      JOIN audit_events ae2 ON ae2.hash = ae1.prev_hash
      WHERE ae1.org_id != ae2.org_id
        AND ae1.org_id IN ($1, $2)
    `, [ORG_A, ORG_B]);

    expect(crossCheck.rows.length).toBe(0);
  });

  it('failed transaction does not leave partial chain state', async () => {
    const countBefore = await pool.query(
      `SELECT count(*)::int AS cnt FROM audit_events WHERE org_id = $1`,
      [ORG_A],
    );
    const before = countBefore.rows[0].cnt;

    // Attempt an append with invalid data to force a DB error.
    try {
      await appendAudit(db, {
        orgId: ORG_A,
        actorType: 'user',
        action: 'should.fail',
        outcome: 'success',
        // Pass an invalid UUID for actorId to trigger a FK/type error.
        actorId: 'not-a-uuid' as any,
        occurredAt: new Date(),
      });
    } catch {
      // Expected to fail.
    }

    // Chain should not have grown — the failed transaction should be rolled back.
    const countAfter = await pool.query(
      `SELECT count(*)::int AS cnt FROM audit_events WHERE org_id = $1`,
      [ORG_A],
    );
    expect(countAfter.rows[0].cnt).toBe(before);
  });

  it('genesis hash is correct for each organization', () => {
    const hashA = genesisHash(ORG_A);
    const hashB = genesisHash(ORG_B);
    // Different orgs produce different genesis hashes.
    expect(hashA).not.toBe(hashB);
    // Genesis hashes are valid hex strings (64 chars).
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(hashB).toMatch(/^[0-9a-f]{64}$/);
  });
});
