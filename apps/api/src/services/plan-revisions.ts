/**
 * ORQ8 Plan Revisions Service — the Plan page as a living document
 *
 * docs/71 §R item 4: the team drafts plan revisions; the founder ratifies one
 * to make it direction. Until ratified, the previous ratified revision stays
 * direction — an unratified draft never silently takes over. All writes are
 * org-scoped and audited (plan.revised / plan.ratified).
 */

import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { planRevisions, type Db, type PlanRevision } from '@orq8/db';
import { AppError } from '@orq8/core';
import { appendAudit } from './audit.js';

// The five plan sections the mock's plan doc renders (docs/71 §W item 4 /
// headquarters-mock-v2 screen-plan). Sections are free-form text; unknown keys
// are preserved as-is so the model never loses content it drafted.
export const PLAN_SECTIONS = [
  'whatWereBuilding',
  'whoItsFor',
  'howItMakesMoney',
  'currentFocus',
  'kpis',
] as const;

export type PlanContent = Record<string, unknown>;

export interface ListPlanRevisionsResult {
  revisions: PlanRevision[];
  current: PlanRevision | null;
  pending: PlanRevision | null;
}

export async function listPlanRevisions(
  db: Db,
  orgId: string,
): Promise<ListPlanRevisionsResult> {
  const revisions = await db
    .select()
    .from(planRevisions)
    .where(eq(planRevisions.orgId, orgId))
    .orderBy(desc(planRevisions.rev));

  const current =
    revisions.find((r) => r.status === 'ratified' && r.ratifiedAt != null) ?? null;
  const pending = revisions.find((r) => r.status === 'draft') ?? null;

  return { revisions, current, pending };
}

export interface CreatePlanRevisionInput {
  title: string;
  summary?: string | null;
  content?: PlanContent | null;
  authorType?: 'user' | 'agent';
  authorId?: string | null;
  authorName?: string | null;
}

export async function createPlanRevision(
  db: Db,
  orgId: string,
  input: CreatePlanRevisionInput,
): Promise<PlanRevision> {
  return db.transaction(async (tx) => {
    // Rev numbers are per-org monotonic. The unique (org_id, rev) index is the
    // real guard under concurrency; the retry re-reads max(rev) after a tie.
    for (let attempt = 0; attempt < 3; attempt++) {
      const [maxRow] = await tx
        .select({ maxRev: sql<number | null>`max(${planRevisions.rev})` })
        .from(planRevisions)
        .where(eq(planRevisions.orgId, orgId));
      const rev = (maxRow?.maxRev ?? 0) + 1;

      try {
        const [row] = await tx
          .insert(planRevisions)
          .values({
            orgId,
            rev,
            status: 'draft',
            title: input.title,
            summary: input.summary ?? null,
            content: input.content ?? {},
            authorType: input.authorType ?? 'agent',
            authorId: input.authorId ?? null,
            authorName: input.authorName ?? 'Atlas',
            createdAt: new Date(),
          })
          .returning();
        const created = row!;
        await appendAudit(tx, {
          orgId,
          actorType: input.authorType ?? 'agent',
          actorId: input.authorId ?? null,
          action: 'plan.revised',
          outcome: 'success',
          resultRef: JSON.stringify({
            revision: created.rev,
            revision_id: created.id,
            ratified: false,
          }),
        });
        return created;
      } catch (err) {
        // 23505 = unique_violation: another transaction claimed the rev first.
        if (
          attempt < 2 &&
          typeof err === 'object' &&
          err !== null &&
          (err as { code?: string }).code === '23505'
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new AppError(503, 'contention', 'Too much contention creating plan revision');
  });
}

export async function ratifyPlanRevision(
  db: Db,
  orgId: string,
  id: string,
  ratifier: { type: 'user' | 'agent'; id?: string | null; name: string },
): Promise<PlanRevision> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(planRevisions)
      .where(and(eq(planRevisions.orgId, orgId), eq(planRevisions.id, id)))
      .limit(1);
    if (!target) {
      throw new AppError(404, 'not_found', 'Plan revision not found');
    }
    if (target.status === 'ratified') {
      // Idempotent ratify: returning the already-direction revision is the
      // honest answer and keeps double-clicks from re-auditing.
      return target;
    }
    if (target.status !== 'draft') {
      throw new AppError(
        409,
        'not_ratifiable',
        `Revision ${target.rev} was rejected and cannot be ratified`,
      );
    }

    // Only one direction at a time: the previously ratified revision steps
    // down to 'superseded' so the rail still shows it as past direction.
    await tx
      .update(planRevisions)
      .set({ status: 'superseded' })
      .where(
        and(
          eq(planRevisions.orgId, orgId),
          eq(planRevisions.status, 'ratified'),
          ne(planRevisions.id, id),
        ),
      );

    const [row] = await tx
      .update(planRevisions)
      .set({
        status: 'ratified',
        ratifiedAt: new Date(),
        ratifiedBy: ratifier.name,
      })
      .where(eq(planRevisions.id, id))
      .returning();
    const ratified = row!;

    await appendAudit(tx, {
      orgId,
      actorType: ratifier.type,
      actorId: ratifier.id ?? null,
      action: 'plan.ratified',
      outcome: 'success',
      resultRef: JSON.stringify({
        revision: ratified.rev,
        revision_id: ratified.id,
        ratified_by: ratifier.name,
      }),
    });
    return ratified;
  });
}

export async function rejectPlanRevision(
  db: Db,
  orgId: string,
  id: string,
  rejector: { type: 'user' | 'agent'; id?: string | null; name: string },
): Promise<PlanRevision> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(planRevisions)
      .where(and(eq(planRevisions.orgId, orgId), eq(planRevisions.id, id)))
      .limit(1);
    if (!target) {
      throw new AppError(404, 'not_found', 'Plan revision not found');
    }
    if (target.status !== 'draft') {
      throw new AppError(
        409,
        'not_rejectable',
        `Only unratified drafts can be rejected (revision ${target.rev} is ${target.status})`,
      );
    }

    const [row] = await tx
      .update(planRevisions)
      .set({ status: 'rejected' })
      .where(eq(planRevisions.id, id))
      .returning();
    const rejected = row!;

    await appendAudit(tx, {
      orgId,
      actorType: rejector.type,
      actorId: rejector.id ?? null,
      action: 'plan.revision_rejected',
      outcome: 'success',
      resultRef: JSON.stringify({
        revision: rejected.rev,
        revision_id: rejected.id,
        rejected_by: rejector.name,
      }),
    });
    return rejected;
  });
}

// History order for the rail: newest first (listPlanRevisions) vs oldest first
// (rendering a "Rev 1 → today" rail reads top-down). Kept tiny on purpose.
export async function listPlanRevisionsAsc(db: Db, orgId: string): Promise<PlanRevision[]> {
  return db
    .select()
    .from(planRevisions)
    .where(eq(planRevisions.orgId, orgId))
    .orderBy(asc(planRevisions.rev));
}
