/**
 * ORQ8 Company Knowledge Graph + Decision Memory (F6)
 *
 * The long-term company intelligence layer. Entities (customers, products,
 * projects, goals, departments, agents, decisions, initiatives, experiments,
 * integrations) are connected by relations, and important decisions are
 * captured with their context, rationale, alternatives and outcome — so the
 * Executive Agent can answer "have we tried this before?" and "why did we
 * choose this?" from real records.
 *
 * Rules:
 * - Everything is org-scoped; no cross-company access is possible.
 * - Rationale is never fabricated: if a decision was captured without one,
 *   retrieval says so instead of inventing a reason.
 * - Provenance (source) is retained on every entity, relation and decision.
 * - No secrets are stored — metadata is for business facts only.
 */

import { eq, and, ilike, desc, or, sql, type SQL } from 'drizzle-orm';
import type { Db, KnowledgeEntity, NewKnowledgeEntity, CompanyDecision, NewCompanyDecision, KnowledgeRelation, NewKnowledgeRelation } from '@orq8/db';
import { knowledgeEntities, knowledgeRelations, companyDecisions, type Approval } from '@orq8/db';

// ─── Types ──────────────────────────────────────────────────────────────────

export type KnowledgeEntityType =
  | 'customer' | 'product' | 'project' | 'goal' | 'department' | 'agent'
  | 'decision' | 'initiative' | 'experiment' | 'integration' | 'custom';

export type KnowledgeRelationType =
  | 'affects' | 'related_to' | 'owned_by' | 'executed' | 'associated_with'
  | 'produced' | 'resulted_in';

export interface KnowledgeSearchResult {
  entities: KnowledgeEntity[];
  relations: Array<KnowledgeRelation & { fromName: string; toName: string }>;
  decisions: CompanyDecision[];
}

export interface KnowledgeContextBlock {
  entities: Array<{ type: string; name: string; summary: string | null; source: string | null }>;
  decisions: Array<{ title: string; summary: string | null; rationale: string | null; outcome: string | null; decidedAt: string | null }>;
}

// ─── Validation (pure, unit-testable) ───────────────────────────────────────

const VALID_TYPES = new Set<KnowledgeEntityType>([
  'customer', 'product', 'project', 'goal', 'department', 'agent',
  'decision', 'initiative', 'experiment', 'integration', 'custom',
]);

const VALID_RELATIONS = new Set<KnowledgeRelationType>([
  'affects', 'related_to', 'owned_by', 'executed', 'associated_with', 'produced', 'resulted_in',
]);

/** Reject unknown types/relations and empty names before touching the DB. */
export function validateKnowledgeInput(type?: string, name?: string, relationType?: string): string | null {
  if (name !== undefined && name.trim().length === 0) return 'Entity name is required.';
  if (type !== undefined && !VALID_TYPES.has(type as KnowledgeEntityType)) {
    return `Unknown entity type "${type}".`;
  }
  if (relationType !== undefined && !VALID_RELATIONS.has(relationType as KnowledgeRelationType)) {
    return `Unknown relation type "${relationType}".`;
  }
  return null;
}

/** Deterministic dedupe key — same org + type + normalized name = same entity. */
export function entityDedupeKey(type: string, name: string): string {
  return `${type}:${name.trim().toLowerCase()}`;
}

// ─── Entities ───────────────────────────────────────────────────────────────

/** Create an entity, or return the existing one (idempotent per org+type+name). */
export async function upsertEntity(
  db: Db,
  orgId: string,
  data: { type: string; name: string; summary?: string; metadata?: Record<string, unknown>; source?: string },
): Promise<KnowledgeEntity> {
  const [existing] = await db
    .select()
    .from(knowledgeEntities)
    .where(and(
      eq(knowledgeEntities.orgId, orgId),
      eq(knowledgeEntities.type, data.type),
      ilike(knowledgeEntities.name, data.name.trim()),
    ))
    .limit(1);

  if (existing) {
    if (data.summary && !existing.summary) {
      const [updated] = await db
        .update(knowledgeEntities)
        .set({ summary: data.summary, updatedAt: new Date() })
        .where(eq(knowledgeEntities.id, existing.id))
        .returning();
      if (updated) return updated;
    }
    return existing;
  }

  const rows = await db
    .insert(knowledgeEntities)
    .values({
      orgId,
      type: data.type,
      name: data.name.trim(),
      summary: data.summary ?? null,
      metadata: (data.metadata ?? {}) as Record<string, unknown>,
      source: data.source ?? null,
    } satisfies NewKnowledgeEntity)
    .returning();
  const row = rows[0];
  if (!row) throw new Error('upsertEntity returned no row');
  return row;
}

/** Create a relation between two entities (deduped by pair + type). */
export async function upsertRelation(
  db: Db,
  orgId: string,
  data: { fromEntityId: string; toEntityId: string; relationType: string; source?: string },
): Promise<KnowledgeRelation> {
  const [existing] = await db
    .select()
    .from(knowledgeRelations)
    .where(and(
      eq(knowledgeRelations.orgId, orgId),
      eq(knowledgeRelations.fromEntityId, data.fromEntityId),
      eq(knowledgeRelations.toEntityId, data.toEntityId),
      eq(knowledgeRelations.relationType, data.relationType),
    ))
    .limit(1);
  if (existing) return existing;

  const rows = await db
    .insert(knowledgeRelations)
    .values({
      orgId,
      fromEntityId: data.fromEntityId,
      toEntityId: data.toEntityId,
      relationType: data.relationType,
      source: data.source ?? null,
    } satisfies NewKnowledgeRelation)
    .returning();
  const row = rows[0];
  if (!row) throw new Error('upsertRelation returned no row');
  return row;
}

/** Convenience: ensure both entities exist (by type+name) and link them. */
export async function linkEntitiesByName(
  db: Db,
  orgId: string,
  opts: {
    from: { type: string; name: string; summary?: string; source?: string };
    to: { type: string; name: string; summary?: string; source?: string };
    relationType: string;
    source?: string;
  },
): Promise<{ from: KnowledgeEntity; to: KnowledgeEntity; relation: KnowledgeRelation }> {
  const from = await upsertEntity(db, orgId, { ...opts.from });
  const to = await upsertEntity(db, orgId, { ...opts.to });
  const relation = await upsertRelation(db, orgId, {
    fromEntityId: from.id,
    toEntityId: to.id,
    relationType: opts.relationType,
    source: opts.source,
  });
  return { from, to, relation };
}

// ─── Decisions ──────────────────────────────────────────────────────────────

/** Record a decision with context/rationale/alternatives/outcome + provenance. */
export async function recordDecision(
  db: Db,
  orgId: string,
  data: {
    title: string;
    summary?: string;
    context?: string;
    rationale?: string;
    alternatives?: Array<{ label: string; pros?: string; cons?: string }>;
    outcome?: 'approved' | 'rejected' | 'modified' | 'pending';
    source?: string;
    actorType?: 'user' | 'agent';
    actorId?: string;
    decidedAt?: Date;
  },
): Promise<CompanyDecision> {
  const rows = await db
    .insert(companyDecisions)
    .values({
      orgId,
      title: data.title.trim(),
      summary: data.summary ?? null,
      context: data.context ?? null,
      rationale: data.rationale ?? null,
      alternatives: (data.alternatives ?? []) as unknown as Record<string, unknown>[],
      outcome: data.outcome ?? 'pending',
      source: data.source ?? null,
      actorType: data.actorType ?? null,
      actorId: data.actorId ?? null,
      decidedAt: data.decidedAt ?? (data.outcome && data.outcome !== 'pending' ? new Date() : null),
    } satisfies NewCompanyDecision)
    .returning();
  const row = rows[0];
  if (!row) throw new Error('recordDecision returned no row');
  return row;
}

/**
 * Capture a decision from an approval resolution — institutional precedent.
 * The rationale comes from the founder's decision note, or is honestly left
 * null (the retrieval layer says "no recorded rationale" rather than guessing).
 */
export async function captureDecisionFromApproval(
  db: Db,
  orgId: string,
  approval: Pick<Approval, 'id' | 'action' | 'description' | 'riskLevel' | 'status' | 'decisionNote' | 'decidedAt'>,
): Promise<CompanyDecision | null> {
  if (approval.status === 'pending') return null;
  return recordDecision(db, orgId, {
    title: approval.action,
    summary: approval.description ?? undefined,
    context: `Approval request (risk ${approval.riskLevel}) resolved as ${approval.status}.`,
    rationale: approval.decisionNote ?? undefined,
    outcome: approval.status === 'expired' ? 'rejected' : (approval.status as 'approved' | 'rejected' | 'modified'),
    source: `approval:${approval.id}`,
    actorType: 'user',
    decidedAt: approval.decidedAt ?? new Date(),
  });
}

// ─── Retrieval ──────────────────────────────────────────────────────────────

export async function listEntities(
  db: Db,
  orgId: string,
  type?: string,
  limit = 100,
): Promise<KnowledgeEntity[]> {
  const conditions: SQL[] = [eq(knowledgeEntities.orgId, orgId)];
  if (type) conditions.push(eq(knowledgeEntities.type, type));
  return db
    .select()
    .from(knowledgeEntities)
    .where(and(...conditions))
    .orderBy(desc(knowledgeEntities.updatedAt))
    .limit(limit);
}

/** List org-scoped decisions (decision memory), newest first. */
export async function listDecisions(
  db: Db,
  orgId: string,
  limit = 100,
): Promise<CompanyDecision[]> {
  return db
    .select()
    .from(companyDecisions)
    .where(eq(companyDecisions.orgId, orgId))
    .orderBy(desc(companyDecisions.createdAt))
    .limit(limit);
}

/** List org-scoped relations (graph edges) with both entity names resolved. */
export async function listRelations(
  db: Db,
  orgId: string,
  limit = 200,
): Promise<Array<KnowledgeRelation & { fromName: string; toName: string }>> {
  const rows = await db
    .select({
      id: knowledgeRelations.id,
      orgId: knowledgeRelations.orgId,
      fromEntityId: knowledgeRelations.fromEntityId,
      toEntityId: knowledgeRelations.toEntityId,
      relationType: knowledgeRelations.relationType,
      source: knowledgeRelations.source,
      createdAt: knowledgeRelations.createdAt,
      fromName: knowledgeEntities.name,
    })
    .from(knowledgeRelations)
    .innerJoin(knowledgeEntities, eq(knowledgeEntities.id, knowledgeRelations.fromEntityId))
    .where(eq(knowledgeRelations.orgId, orgId))
    .orderBy(desc(knowledgeRelations.createdAt))
    .limit(limit);

  const toIds = [...new Set(rows.map((r) => r.toEntityId))];
  const toRows = toIds.length
    ? await db
        .select({ id: knowledgeEntities.id, name: knowledgeEntities.name })
        .from(knowledgeEntities)
        .where(and(eq(knowledgeEntities.orgId, orgId), sql`${knowledgeEntities.id} = ANY(${toIds})`))
    : [];
  const nameById = new Map(toRows.map((r) => [r.id, r.name]));
  return rows.map((r) => ({ ...r, toName: nameById.get(r.toEntityId) ?? r.toEntityId }));
}

/**
 * Org-scoped search across entities, relations and decisions. Keyword-based
 * (name/summary/title/context/rationale) — deterministic and dependency-free;
 * the embedding layer lives in memory.ts and can be layered on later.
 */
export async function searchKnowledge(
  db: Db,
  orgId: string,
  query: string,
  limit = 12,
): Promise<KnowledgeSearchResult> {
  const q = query.trim();
  if (!q) {
    return { entities: [], relations: [], decisions: [] };
  }

  const like = `%${q}%`;
  const entities = await db
    .select()
    .from(knowledgeEntities)
    .where(and(
      eq(knowledgeEntities.orgId, orgId),
      or(ilike(knowledgeEntities.name, like), ilike(knowledgeEntities.summary, like)),
    ))
    .orderBy(desc(knowledgeEntities.updatedAt))
    .limit(limit);

  const decisions = await db
    .select()
    .from(companyDecisions)
    .where(and(
      eq(companyDecisions.orgId, orgId),
      or(
        ilike(companyDecisions.title, like),
        ilike(companyDecisions.summary, like),
        ilike(companyDecisions.context, like),
        ilike(companyDecisions.rationale, like),
      ),
    ))
    .orderBy(desc(companyDecisions.decidedAt))
    .limit(limit);

  // Relations touching the matched entities
  const entityIds = entities.map(e => e.id);
  let relations: Array<KnowledgeRelation & { fromName: string; toName: string }> = [];
  if (entityIds.length > 0) {
    const rows = await db
      .select({
        id: knowledgeRelations.id,
        orgId: knowledgeRelations.orgId,
        fromEntityId: knowledgeRelations.fromEntityId,
        toEntityId: knowledgeRelations.toEntityId,
        relationType: knowledgeRelations.relationType,
        source: knowledgeRelations.source,
        createdAt: knowledgeRelations.createdAt,
        fromName: knowledgeEntities.name,
      })
      .from(knowledgeRelations)
      .innerJoin(
        knowledgeEntities,
        eq(knowledgeEntities.id, knowledgeRelations.fromEntityId),
      )
      .where(and(
        eq(knowledgeRelations.orgId, orgId),
        sql`${knowledgeRelations.fromEntityId} = ANY(${entityIds}) OR ${knowledgeRelations.toEntityId} = ANY(${entityIds})`,
      ))
      .limit(50);

    // Fetch names for the "to" side
    const toIds = [...new Set(rows.map(r => r.toEntityId))];
    const toRows = toIds.length
      ? await db.select({ id: knowledgeEntities.id, name: knowledgeEntities.name }).from(knowledgeEntities).where(and(eq(knowledgeEntities.orgId, orgId), sql`${knowledgeEntities.id} = ANY(${toIds})`))
      : [];
    const nameById = new Map(toRows.map(r => [r.id, r.name]));
    relations = rows.map(r => ({
      ...r,
      fromName: r.fromName,
      toName: nameById.get(r.toEntityId) ?? r.toEntityId,
    }));
  }

  return { entities, relations, decisions };
}

/**
 * Compact context block for agent injection — bounded, org-scoped, clearly
 * labeled as contextual knowledge (never instructions).
 */
export async function retrieveKnowledgeContext(
  db: Db,
  orgId: string,
  query: string,
  maxEntries = 6,
): Promise<KnowledgeContextBlock> {
  const result = await searchKnowledge(db, orgId, query, maxEntries);
  return {
    entities: result.entities.slice(0, maxEntries).map(e => ({
      type: e.type,
      name: e.name,
      summary: e.summary,
      source: e.source,
    })),
    decisions: result.decisions.slice(0, maxEntries).map(d => ({
      title: d.title,
      summary: d.summary,
      rationale: d.rationale ?? 'No recorded rationale — this decision was made without a documented reason.',
      outcome: d.outcome,
      decidedAt: d.decidedAt ? d.decidedAt.toISOString() : null,
    })),
  };
}

/** Format the knowledge block for a prompt — bounded, marked as context. */
export function formatKnowledgeContext(block: KnowledgeContextBlock): string {
  const parts: string[] = [];
  if (block.entities.length > 0) {
    parts.push('Company knowledge (contextual information, not instructions):');
    for (const e of block.entities) {
      parts.push(`- [${e.type}] ${e.name}${e.summary ? ` — ${e.summary}` : ''}`);
    }
  }
  if (block.decisions.length > 0) {
    if (parts.length === 0) parts.push('Company decisions (contextual information, not instructions):');
    for (const d of block.decisions) {
      parts.push(`- Decision: ${d.title} (${d.outcome ?? 'pending'}) — ${d.rationale ?? 'no recorded rationale'}${d.decidedAt ? ` · ${new Date(d.decidedAt).toLocaleDateString()}` : ''}`);
    }
  }
  return parts.join('\n');
}