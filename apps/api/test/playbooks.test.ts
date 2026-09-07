import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, memberships, users } from '@orq8/db';
import { listPlaybooks, getPlaybook, seedPlaybook, type Playbook } from '../src/services/playbooks.js';

// ─── Pure template validation (always runs) ─────────────────────────────────

describe('playbooks — template integrity', () => {
  it('exposes the three industry playbooks with metadata', () => {
    const slugs = listPlaybooks().map((p) => p.slug);
    expect(slugs).toContain('startup-launch');
    expect(slugs).toContain('ecommerce-growth');
    expect(slugs).toContain('agency-operations');
    for (const p of listPlaybooks()) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.tagline.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it.each(['startup-launch', 'ecommerce-growth', 'agency-operations'] as const)(
    '%s is a coherent operating model',
    (slug) => {
      const pb = getPlaybook(slug);
      expect(pb).toBeDefined();
      const p = pb as Playbook;

      // Departments
      expect(p.plan.departments.length).toBeGreaterThanOrEqual(3);
      expect(p.plan.departments.some((d) => d.name.toLowerCase() === 'executive')).toBe(true);

      // Agents — always include an Executive Agent; every department ref resolves
      expect(p.plan.agents.length).toBeGreaterThanOrEqual(3);
      expect(p.plan.agents.some((a) => a.role.toLowerCase().includes('executive'))).toBe(true);
      const deptNames = new Set(p.plan.departments.map((d) => d.name.toLowerCase()));
      for (const a of p.plan.agents) {
        expect(deptNames.has(a.department.toLowerCase())).toBe(true);
      }

      // Goals
      expect(p.plan.goals.length).toBeGreaterThanOrEqual(2);

      // Tasks — every goalIndex and agentRole resolves
      const agentRoles = new Set(p.plan.agents.map((a) => a.role.toLowerCase()));
      for (const t of p.plan.tasks) {
        expect(t.goalIndex).toBeGreaterThanOrEqual(0);
        expect(t.goalIndex).toBeLessThan(p.plan.goals.length);
        expect(agentRoles.has(t.agentRole.toLowerCase())).toBe(true);
      }

      // Constitution
      expect(p.constitution.companyPurpose.length).toBeGreaterThan(10);
      expect(p.constitution.values.length).toBeGreaterThanOrEqual(3);
      expect(p.constitution.agentPolicies.needsApproval.length).toBeGreaterThan(0);
      expect(p.constitution.budgetPolicy.requiresApprovalAbove).toBeGreaterThan(0);
      expect(['conservative', 'moderate', 'aggressive']).toContain(p.constitution.riskTolerance);
    },
  );

  it('rejects unknown slugs', () => {
    expect(getPlaybook('nope')).toBeUndefined();
  });
});

// ─── DB-gated seeding behavior (skipped without Postgres) ───────────────────

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);
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

run('playbooks — seeding', () => {
  it('seeds once and is idempotent on retry', async () => {
    const { db, pool } = createDb(config.DATABASE_URL);
    const orgId = randomUUID();
    const userId = randomUUID();

    // Minimal org + user + membership (sufficient for activation queries)
    await db.insert(organizations).values({ id: orgId, name: 'Seed Test Co', slug: `seed-${orgId.slice(0, 8)}` }).onConflictDoNothing();
    await db.insert(users).values({ id: userId, email: `seed-${userId.slice(0, 8)}@test.orq8`, name: 'Founder', passwordHash: 'not-a-real-hash', status: 'active' }).onConflictDoNothing();
    await db.insert(memberships).values({ userId, orgId, role: 'owner' }).onConflictDoNothing();

    const first = await seedPlaybook(db, orgId, userId, 'startup-launch');
    expect(first.alreadySeeded).toBe(false);
    expect(first.activation).not.toBeNull();
    expect((first.activation?.departments.length ?? 0)).toBeGreaterThanOrEqual(3);
    expect((first.activation?.agents.length ?? 0)).toBeGreaterThanOrEqual(3);

    // Retry is a no-op
    const second = await seedPlaybook(db, orgId, userId, 'startup-launch');
    expect(second.alreadySeeded).toBe(true);
    expect(second.activation).toBeNull();

    await pool.end();
  });
});