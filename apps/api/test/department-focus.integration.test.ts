import { loadConfig } from '@orq8/core';
import {
  createDb,
  agents,
  departments,
  engineeringTasks,
  integrationProviders,
  organizations,
  repositories,
  repositoryPrs,
  sandboxRuns,
} from '@orq8/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findDetail } from '../src/services/departments.js';
import { deleteOrg } from './helpers/delete-org.js';

/**
 * Department focus read-model (docs/86 §6).
 *
 * The engineering focus is the one part of a department page that claims to
 * show "this department's actual work". These tests pin the two things that
 * make that claim honest:
 *   1. `work` / `reviews` are scoped to the department's members, so another
 *      department's engineering work cannot appear on this page.
 *   2. `repositories` / `sandbox` are workspace-wide, and only the department
 *      page of a template that HAS a focus model receives the block at all.
 */

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8',
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
const { db } = createDb(config.DATABASE_URL);

const orgId = randomUUID();
const engDeptId = randomUUID();
const marketingDeptId = randomUUID();
const inDeptAgentId = randomUUID();
const otherDeptAgentId = randomUUID();
const providerId = randomUUID();
const repoId = randomUUID();

run('department engineering focus', () => {
  beforeAll(async () => {
    await db.insert(organizations).values({
      id: orgId,
      name: `focus-test-${orgId.slice(0, 8)}`,
      slug: `focus-test-${orgId.slice(0, 8)}`,
    });

    await db.insert(departments).values([
      {
        id: engDeptId,
        orgId,
        name: 'Engineering',
        status: 'active',
        settings: { templateSlug: 'engineering', roles: ['engineering_lead'] },
      },
      { id: marketingDeptId, orgId, name: 'Marketing', status: 'active', settings: {} },
    ]);

    await db.insert(agents).values([
      {
        id: inDeptAgentId,
        orgId,
        name: 'Ada',
        role: 'engineering_lead',
        departmentId: engDeptId,
        status: 'active',
      },
      {
        id: otherDeptAgentId,
        orgId,
        name: 'Zed',
        role: 'engineering_lead',
        departmentId: marketingDeptId,
        status: 'active',
      },
    ]);

    await db.insert(integrationProviders).values({
      id: providerId,
      orgId,
      name: 'GitHub',
      provider: 'github',
      status: 'connected',
    });

    await db.insert(repositories).values({
      id: repoId,
      orgId,
      name: 'orq8',
      fullName: 'Joshua-Onyekachukwu/orq8',
      owner: 'Joshua-Onyekachukwu',
      defaultBranch: 'main',
      providerId,
    });

    // One engineering task per agent: only Ada's may surface on Engineering.
    await db.insert(engineeringTasks).values([
      {
        orgId,
        repositoryId: repoId,
        branch: 'feat/ada',
        title: "Ada's implementation",
        status: 'implemented',
        assigneeId: inDeptAgentId,
      },
      {
        orgId,
        repositoryId: repoId,
        branch: 'feat/zed',
        title: "Zed's implementation",
        status: 'implemented',
        assigneeId: otherDeptAgentId,
      },
    ]);

    // One open PR per agent.
    await db.insert(repositoryPrs).values([
      {
        repositoryId: repoId,
        title: 'Ada opens a PR',
        headBranch: 'feat/ada',
        baseBranch: 'main',
        state: 'open',
        status: 'pending_review',
        authorId: inDeptAgentId,
        authorType: 'agent',
      },
      {
        repositoryId: repoId,
        title: "Zed's unrelated PR",
        headBranch: 'feat/zed',
        baseBranch: 'main',
        state: 'open',
        status: 'pending_review',
        authorId: otherDeptAgentId,
        authorType: 'agent',
      },
    ]);

    await db.insert(sandboxRuns).values({
      orgId,
      repositoryId: repoId,
      branch: 'feat/ada',
      command: 'pnpm test',
      workingDir: '.',
      state: 'running',
    });
  });

  afterAll(async () => {
    if (pool) await deleteOrg(pool, orgId);
    await pool?.end();
  });

  it('scopes work and reviews to the department, and reports workspace repositories', async () => {
    const detail = await findDetail(db, orgId, engDeptId);
    expect(detail).toBeDefined();

    const focus = detail!.focus?.engineering;
    expect(focus).toBeDefined();

    // Member-scoped: Ada only, never Zed (the other department's employee).
    expect(focus!.work.map((w) => w.title)).toEqual(["Ada's implementation"]);
    expect(focus!.reviews.map((r) => r.title)).toEqual(["Ada opens a PR"]);

    // Workspace-wide, and labelled as such in the shape.
    expect(focus!.repositories.map((r) => r.name)).toEqual(["orq8"]);
    expect(focus!.sandbox).toHaveLength(1);

    // Counts agree with the rows that were returned.
    expect(focus!.counts.workOpen).toBe(1);
    expect(focus!.counts.workCompleted).toBe(0);
    expect(focus!.counts.reviewsOpen).toBe(1);
    expect(focus!.counts.sandboxRunning).toBe(1);
    expect(focus!.counts.repositories).toBe(1);
  });

  it('gives a template without a focus model no focus block at all', async () => {
    const detail = await findDetail(db, orgId, marketingDeptId);
    expect(detail).toBeDefined();
    // Absent, not empty — a page must be able to tell the two apart.
    expect(detail!.focus).toBeUndefined();
  });

  it('never leaks another org’s repositories into a focus model', async () => {
    const otherOrgId = randomUUID();
    await db.insert(organizations).values({
      id: otherOrgId,
      name: `focus-other-${otherOrgId.slice(0, 8)}`,
      slug: `focus-other-${otherOrgId.slice(0, 8)}`,
    });
    try {
      const otherDeptId = randomUUID();
      await db.insert(departments).values({
        id: otherDeptId,
        orgId: otherOrgId,
        name: 'Engineering',
        status: 'active',
        settings: { templateSlug: 'engineering' },
      });

      const detail = await findDetail(db, otherOrgId, otherDeptId);
      expect(detail!.focus?.engineering?.repositories).toEqual([]);
      expect(detail!.focus?.engineering?.sandbox).toEqual([]);
      expect(detail!.focus?.engineering?.work).toEqual([]);
    } finally {
      if (pool) await deleteOrg(pool, otherOrgId);
    }
  });
});
