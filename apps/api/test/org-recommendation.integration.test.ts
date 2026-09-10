import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships, departments, teams, subscriptions } from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activateDepartmentTemplate,
  getCatalog,
  getStageAppropriateCatalog,
  parseTemplateStage,
  recommendOrgForStage,
} from '../src/services/org-recommendation.js';
import type { AppDeps } from '../src/types.js';

/**
 * §13/§15 verification: the stage-appropriate organization comes from the ONE
 * Department Template Catalog (the same rows the seed migrations created and
 * the Departments page reads), activation is idempotent, and stage filtering
 * keeps the Stage-1 recommendation lean instead of dumping all 23 templates.
 */

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

let orgId: string;
let userId: string;

beforeAll(async () => {
  if (!dbUp) return;
  const [orgRow] = await deps.db
    .insert(organizations)
    .values({ name: `orgrec-${randomUUID()}`, slug: `orgrec-${randomUUID()}` })
    .returning();
  orgId = orgRow!.id;
  const [userRow] = await deps.db
    .insert(users)
    .values({ email: `orgrec-${randomUUID()}@example.com`, name: 'Owner', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userId = userRow!.id;
  await deps.db.insert(memberships).values({ orgId, userId, role: 'owner' });
  // Company plan: enough department/team capacity for multi-activation tests
  // (the trial default would exhaust after the first department).
  const period = new Date();
  await deps.db.insert(subscriptions).values({
    orgId,
    plan: 'company',
    billingCycle: 'monthly',
    status: 'active',
    includedCredits: 12000,
    maxAgents: 50,
    currentPeriodStart: period,
    currentPeriodEnd: new Date(period.getTime() + 30 * 86400000),
  });
});

afterAll(async () => {
  if (dbUp) {
    await deps.pool!.query('delete from subscriptions where org_id = $1', [orgId]);
    await deps.pool!.query('delete from audit_events where org_id = $1', [orgId]);
    await deps.pool!.query('delete from teams where org_id = $1', [orgId]);
    await deps.pool!.query('delete from departments where org_id = $1', [orgId]);
    await deps.pool!.query('delete from memberships where org_id = $1', [orgId]);
    await deps.pool!.query('delete from users where id = $1', [userId]);
    await deps.pool!.query('delete from organizations where id = $1', [orgId]);
    await pool!.end();
  }
});

run('org recommendation consumes the real catalog', () => {
  it('parses "Stage N+ (…)" org_size labels conservatively', () => {
    expect(parseTemplateStage('Stage 1+ (Idea stage: early demand generation)')).toBe(1);
    expect(parseTemplateStage('Stage 4+ (Scaling company: quality measurement needs its own function)')).toBe(4);
    expect(parseTemplateStage('Stage 5 (Enterprise: simulation pays for itself only at strategic scale)')).toBe(5);
    expect(parseTemplateStage(null)).toBe(3);
    expect(parseTemplateStage('unparseable')).toBe(3);
  });

  it('returns the full catalog with parsed stages (seed data present)', async () => {
    const catalog = await getCatalog(deps.db, orgId);
    expect(catalog.length).toBeGreaterThanOrEqual(23);
    const marketing = catalog.find((t) => t.slug === 'marketing');
    expect(marketing).toBeDefined();
    expect(marketing!.stage).toBe(1);
    const simulation = catalog.find((t) => t.slug === 'strategy_simulation');
    expect(simulation).toBeDefined();
    expect(simulation!.stage).toBe(5);
  });

  it('keeps the Stage-1 recommendation lean and explains the deferral', async () => {
    const rec = await recommendOrgForStage(deps.db, orgId, 1);
    expect(rec.stage).toBe(1);
    // The seed defines exactly five Stage-1 functions — the smallest useful
    // operating organization, NOT all 23 departments.
    expect(rec.recommended.map((t) => t.name).sort()).toEqual(
      ['Engineering', 'Executive / CEO Office', 'Marketing', 'Product', 'Sales'].sort(),
    );
    expect(rec.deferred.length).toBe(18);
    expect(rec.deferred.map((d) => d.name)).toContain('Quality & Assurance');
    expect(rec.rationale).toContain('without unnecessary organizational overhead');
  });

  it('grows the recommendation monotonically with stage', async () => {
    const s1 = await getStageAppropriateCatalog(deps.db, orgId, 1);
    const s3 = await getStageAppropriateCatalog(deps.db, orgId, 3);
    const s5 = await getStageAppropriateCatalog(deps.db, orgId, 5);
    expect(s1.length).toBe(5);
    expect(s1.length).toBeLessThan(s3.length);
    expect(s3.length).toBeLessThan(s5.length);
    expect(s5.length).toBe(23); // the whole catalog by enterprise stage
  });

  it('activates a template into real department + teams (idempotently)', async () => {
    const catalog = await getCatalog(deps.db, orgId);
    const marketing = catalog.find((t) => t.slug === 'marketing');
    expect(marketing).toBeDefined();

    const first = await activateDepartmentTemplate(deps.db, { orgId, userId }, marketing!.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.result.activated.departments).toEqual(['Marketing']);
    expect(first.result.activated.teams.length).toBeGreaterThan(0);

    // Persistence: rows really exist with the right orgId and links.
    const deptRow = await deps.db
      .select()
      .from(departments)
      .where(and(eq(departments.orgId, orgId), eq(departments.id, first.result.departmentId)));
    expect(deptRow).toHaveLength(1);
    const teamRows = await deps.db.select().from(teams).where(eq(teams.orgId, orgId));
    const deptTeamRows = teamRows.filter((t) => t.departmentId === first.result.departmentId);
    expect(deptTeamRows.length).toBe(first.result.activated.teams.length);

    // Re-activation: reuse, never duplicates.
    const second = await activateDepartmentTemplate(deps.db, { orgId, userId }, marketing!.id);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.result.activated.reused).toContain('Marketing');
    expect(second.result.activated.departments).toEqual([]);
    const teamRowsAfter = await deps.db.select().from(teams).where(eq(teams.orgId, orgId));
    expect(teamRowsAfter.filter((t) => t.departmentId === first.result.departmentId)).toHaveLength(
      first.result.activated.teams.length,
    );
  });

  it('rejects unknown templates and keeps audit trail', async () => {
    const missing = await activateDepartmentTemplate(deps.db, { orgId, userId }, '00000000-0000-0000-0000-000000000000');
    expect(missing.ok).toBe(false);

    const catalog = await getCatalog(deps.db, orgId);
    const finance = catalog.find((t) => t.slug === 'finance');
    expect(finance).toBeDefined();
    const act = await activateDepartmentTemplate(deps.db, { orgId, userId }, finance!.id);
    expect(act.ok).toBe(true);

    const auditRows = await deps.pool!.query(
      "select action, result_ref from audit_events where org_id = $1 and action = 'department.activated_from_template' order by occurred_at",
      [orgId],
    );
    expect(auditRows.rows.length).toBeGreaterThanOrEqual(2);
    const lastRef = JSON.parse(auditRows.rows.at(-1)!.result_ref as string);
    expect(lastRef.departments ?? lastRef.activated?.departments).toContain('Finance');
  });
});
