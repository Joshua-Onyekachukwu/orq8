import { eq } from 'drizzle-orm';
import { organizations } from '@orq8/db';
import { forbidden } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { isOrgEmpty, seedDemoCompany } from '../services/demo-seed.js';
import * as orgs from '../services/orgs.js';
import * as sessions from '../services/sessions.js';
import type { AppDeps } from '../types.js';

/**
 * POST /v1/demo-company — one-click demo company (MVP-020).
 *
 * Seeds the caller's org with the Northwind Labs sample company and flags it
 * `isDemo` (every screen badges demo orgs). Guards, in order:
 *
 *   1. authenticated session (requireAuth);
 *   2. owner or admin — a member cannot rewrite the company's content;
 *   3. org is not already a demo org — one seed per org, no re-seeding;
 *   4. org is EMPTY (no agents, tasks, goals or departments) — the seed can
 *      never touch, mix with, or overwrite real company data;
 *   5. the global rate-limit hooks cover this route like every other write.
 *
 * The seed itself writes sample records only: no money movement, no model
 * execution, no privilege changes (see services/demo-seed.ts). Both outcomes
 * are audited (`demo.seeded` / `demo.seed_denied`).
 */
export function registerDemoCompanyRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.post('/v1/demo-company', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    if (ctx.role !== 'owner' && ctx.role !== 'admin') {
      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'demo.seed_denied',
        outcome: 'denied',
      });
      throw forbidden('Only owners and admins can seed a demo company.');
    }

    const [org] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId));
    const settings = (org?.settings as { isDemo?: boolean } | null) ?? null;
    if (settings?.isDemo === true) {
      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'demo.seed_denied',
        outcome: 'denied',
      });
      reply.code(409);
      return { error: { code: 'already_demo', message: 'This company is already a demo company.' } };
    }

    if (!(await isOrgEmpty(db, ctx.orgId))) {
      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'demo.seed_denied',
        outcome: 'denied',
      });
      reply.code(409);
      return {
        error: {
          code: 'org_not_empty',
          message: 'Demo data can only seed an empty company — this one already has content.',
        },
      };
    }

    const summary = await seedDemoCompany(db, ctx.orgId, ctx.userId);
    reply.code(201);
    return { data: { demo: true, ...summary } };
  });

  /**
   * POST /v1/demo-company/isolated — first-run demo in its OWN org (C-03/C-04).
   *
   * Unlike POST /v1/demo-company (which seeds the caller's current org and
   * therefore requires it to be empty), this creates a brand-new organization
   * — "Northwind Labs (Demo)" — makes the caller its owner, seeds the sample
   * company there, flags it `isDemo`, and moves the session into it. The
   * caller's real org is never written to, so demo exploration can never mix
   * with, touch, or overwrite real company data.
   *
   * Guards, in order:
   *   1. authenticated session (requireAuth);
   *   2. the caller has no other live demo org (one demo at a time — a 409
   *      returns the existing demo org id so the client can switch back to
   *      it instead of minting duplicates);
   *   3. the global rate-limit hooks cover this route like every other write.
   *
   * The seed writes sample records only: no money movement, no model
   * execution, no privilege changes (see services/demo-seed.ts). Both
   * outcomes are audited (`demo.isolated_created` / `demo.isolated_denied`).
   */
  app.post('/v1/demo-company/isolated', async (request, reply) => {
    const ctx = await requireAuth(request, deps);

    const owned = await orgs.findMembershipsByUser(db, ctx.userId);
    const liveDemo = owned.find(
      (m) =>
        (m.membership.status ?? 'active') === 'active' &&
        ((m.org.settings as { isDemo?: boolean } | null)?.isDemo === true),
    );
    if (liveDemo) {
      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'demo.isolated_denied',
        outcome: 'denied',
      });
      reply.code(409);
      return {
        error: {
          code: 'demo_exists',
          message: 'You already have a demo company — switch back to it instead of creating another.',
        },
        data: { orgId: liveDemo.org.id },
      };
    }

    const org = await orgs.createOrg(db, { name: 'Northwind Labs (Demo)' });
    await orgs.createMembership(db, { orgId: org.id, userId: ctx.userId, role: 'owner' });
    const summary = await seedDemoCompany(db, org.id, ctx.userId);
    await sessions.switchOrg(db, ctx.sessionId, org.id);
    await appendAudit(db, {
      orgId: org.id,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'demo.isolated_created',
      outcome: 'success',
    });
    reply.code(201);
    return { data: { demo: true, isolated: true, orgId: org.id, ...summary } };
  });
}
