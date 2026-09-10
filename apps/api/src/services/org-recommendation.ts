/**
 * Stage-appropriate organization from the Department Template Catalog
 * (§13 stage-appropriate org, §15 single catalog).
 *
 * ONE source of truth used by the Departments page, the onboarding company
 * builder, and the Executive Agent. The catalog's `org_size` column already
 * encodes the workforce maturity model ("Stage 1+ (Idea stage: …)"); this
 * module makes that machine-readable instead of duplicating definitions.
 *
 * Honesty rules: recommendations only ever reference real catalog rows, and
 * activation only creates entities the architecture supports (department,
 * teams, audit). Nothing is invented to populate the org chart.
 */

import { and, eq, isNull, or } from 'drizzle-orm';
import { departmentTemplates } from '@orq8/db';
import type { Db } from '@orq8/db';
import * as deptService from './departments.js';
import * as teamService from './teams.js';
import { enforceResourceLimit } from './entitlements.js';
import { appendAudit } from './audit.js';

/** Stage of the workforce maturity model (1 = idea stage … 5 = enterprise). */
export type OrgStage = 1 | 2 | 3 | 4 | 5;

/**
 * Parse "Stage N+ (…)" from a template's org_size. Returns the minimum stage
 * at which the template becomes appropriate. Unparseable/absent values are
 * treated as Stage 3 — conservative: they never pollute the lean Stage-1
 * recommendation, and they appear from mid-stage onward.
 */
export function parseTemplateStage(orgSize: string | null | undefined): OrgStage {
  const m = (orgSize ?? '').match(/Stage\s+(\d)/i);
  if (!m) return 3;
  const n = Number.parseInt(m[1] ?? '', 10);
  if (!Number.isFinite(n) || n < 1 || n > 5) return 3;
  return n as OrgStage;
}

export interface CatalogTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  mission: string | null;
  teams: Array<{ name: string; description?: string }>;
  stage: OrgStage;
  stageLabel: string | null;
  isSystem: boolean;
}

/** All catalog templates visible to the org, with their parsed stage. */
export async function getCatalog(db: Db, orgId: string): Promise<CatalogTemplate[]> {
  const rows = await db
    .select()
    .from(departmentTemplates)
    .where(
      or(
        eq(departmentTemplates.isSystem, true),
        and(eq(departmentTemplates.orgId, orgId), eq(departmentTemplates.isSystem, false)),
        and(isNull(departmentTemplates.orgId), eq(departmentTemplates.isSystem, true)),
      ),
    );

  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    mission: t.mission,
    teams: Array.isArray(t.teams) ? (t.teams as CatalogTemplate['teams']) : [],
    stage: parseTemplateStage(t.orgSize),
    stageLabel: t.orgSize,
    isSystem: t.isSystem,
  }));
}

/**
 * Templates appropriate for the given stage: everything whose minimum stage
 * is at or below the org's stage (Stage 2 orgs still see Stage-1 departments —
 * an org never outgrows a function it already needs).
 */
export async function getStageAppropriateCatalog(
  db: Db,
  orgId: string,
  stage: OrgStage,
): Promise<CatalogTemplate[]> {
  const catalog = await getCatalog(db, orgId);
  return catalog.filter((t) => t.stage <= stage);
}

export interface StageRecommendation {
  stage: OrgStage;
  recommended: CatalogTemplate[];
  deferred: Array<{ name: string; stage: OrgStage; stageLabel: string | null }>;
  rationale: string;
}

/**
 * The stage-appropriate organization: smallest useful operating set.
 * Stage 1 does NOT get 23 departments — it gets the functions a company
 * cannot operate without, and the explanation of why.
 */
export async function recommendOrgForStage(
  db: Db,
  orgId: string,
  stage: OrgStage,
): Promise<StageRecommendation> {
  const catalog = await getCatalog(db, orgId);
  const recommended = catalog.filter((t) => t.stage <= stage).sort((a, b) => a.stage - b.stage);
  const deferred = catalog
    .filter((t) => t.stage > stage)
    .map((t) => ({ name: t.name, stage: t.stage, stageLabel: t.stageLabel }))
    .sort((a, b) => a.stage - b.stage);

  const stageNames: Record<OrgStage, string> = {
    1: 'idea stage',
    2: 'early startup',
    3: 'growing company',
    4: 'scaling company',
    5: 'enterprise',
  };
  const rationale =
    stage === 1
      ? `These ${recommended.length} departments are recommended now because they cover the company's current operating requirements without unnecessary organizational overhead: core delivery (engineering), product definition, early demand generation, the first revenue motion, and lean executive support. The remaining ${deferred.length} functions arrive as the company reaches their stage — adding them now would create empty structure, not capability.`
      : `For the ${stageNames[stage]} stage, these ${recommended.length} departments match the company's current operating requirements. ${deferred.length} further functions are deferred until their stage arrives.`;

  return { stage, recommended, deferred, rationale };
}

export interface ActivationResult {
  departmentId: string;
  activated: { departments: string[]; teams: string[]; reused: string[] };
}

/**
 * Activate one department template into the live org: reuse-or-create the
 * department, create its teams, audit the event. Idempotent — re-activation
 * reuses existing records and reports them, never duplicates.
 *
 * Shared by the workforce route, the onboarding company builder, and the
 * Executive Agent's activate_department tool (§15: one catalog, one behavior).
 */
export async function activateDepartmentTemplate(
  db: Db,
  ctx: { orgId: string; userId: string },
  templateId: string,
): Promise<{ ok: true; result: ActivationResult } | { ok: false; reason: 'not_found' }> {
  const [template] = await db
    .select()
    .from(departmentTemplates)
    .where(
      and(
        eq(departmentTemplates.id, templateId),
        or(eq(departmentTemplates.isSystem, true), eq(departmentTemplates.orgId, ctx.orgId)),
      ),
    )
    .limit(1);
  if (!template) return { ok: false, reason: 'not_found' };

  const activated: ActivationResult['activated'] = { departments: [], teams: [], reused: [] };

  // 1. Department — reuse by name so re-activation never duplicates.
  const existingDept = await deptService.findByName(db, ctx.orgId, template.name);
  let departmentId: string;
  if (existingDept) {
    departmentId = existingDept.id;
    activated.reused.push(template.name);
  } else {
    await enforceResourceLimit(db, ctx.orgId, 'departments');
    const created = await deptService.createDepartment(db, {
      orgId: ctx.orgId,
      name: template.name,
      description: template.mission ?? template.description ?? undefined,
    });
    departmentId = created.id;
    activated.departments.push(template.name);
  }

  // 2. Teams from the template's embedded team definitions.
  const teamDefs = Array.isArray(template.teams)
    ? (template.teams as Array<{ name: string; description?: string }>)
    : [];
  for (const t of teamDefs) {
    if (!t?.name) continue;
    const existingTeam = await teamService.findByName(db, ctx.orgId, t.name);
    if (existingTeam) {
      activated.reused.push(t.name);
      continue;
    }
    await enforceResourceLimit(db, ctx.orgId, 'teams');
    const team = await teamService.createTeam(db, {
      orgId: ctx.orgId,
      name: t.name,
      description: t.description,
      departmentId,
    });
    activated.teams.push(team.name);
  }

  await appendAudit(db, {
    orgId: ctx.orgId,
    actorType: 'user',
    actorId: ctx.userId,
    action: 'department.activated_from_template',
    inputRef: JSON.stringify({ templateId: template.id, templateSlug: template.slug }),
    resultRef: JSON.stringify({ departmentId, ...activated }),
    outcome: 'success',
  });

  return { ok: true, result: { departmentId, activated } };
}
