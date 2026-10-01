/**
 * ORQ8 Org Audit Trail Routes (docs/34.4, docs/71 §K, mock `screen-audit`)
 *
 * GET /v1/audit         — this org's append-only trail, newest first
 * GET /v1/audit/verify  — walk the org's hash chain and report tampering
 *
 * The rows are `audit_events`, not activity: every one carries the actor, the
 * action, the outcome, the payload refs and the hash chain link (prev_hash →
 * hash). That is what makes the page's claim — "nothing here is editable, by
 * anyone" — true rather than decorative. The web page used to read
 * `/v1/activity`, whose rows have no `action` or `outcome` at all, so those
 * columns rendered empty on every page load.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { verifyChain } from '../services/audit.js';
import type { AppDeps } from '../types.js';
import { agents, auditEvents, users } from '@orq8/db';

export function registerAuditRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** The org's trail, newest first, filterable by action domain (`task`, `approval`…). */
  app.get('/v1/audit', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
    const domain = url.searchParams.get('domain') ?? undefined;

    const domainExpr = sql`split_part(${auditEvents.action}, '.', 1)`;
    const conditions = [eq(auditEvents.orgId, ctx.orgId)];
    if (domain) conditions.push(sql`${domainExpr} = ${domain}`);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditEvents)
      .where(and(...conditions));

    const rows = await db
      .select()
      .from(auditEvents)
      .where(and(...conditions))
      .orderBy(desc(auditEvents.id))
      .limit(limit)
      .offset(offset);

    // Domains are read from the org's own trail, so the filter chips on the
    // page can only ever name categories that actually exist there.
    const domainCounts = await db
      .select({ domain: sql<string>`${domainExpr}`, count: sql<number>`count(*)::int` })
      .from(auditEvents)
      .where(eq(auditEvents.orgId, ctx.orgId))
      .groupBy(domainExpr)
      .orderBy(desc(sql`count(*)`));

    // Resolve the actors the rows point at in two lookups instead of a join
    // (agentId and actorId are separate columns and may point at either table).
    const agentIds = [...new Set(rows.map((r) => r.agentId).filter((id): id is string => id !== null))];
    const userIds = [
      ...new Set(
        rows
          .map((r) => (r.actorType === 'user' ? r.actorId : null))
          .filter((id): id is string => id !== null),
      ),
    ];
    const [agentRows, userRows] = await Promise.all([
      agentIds.length
        ? db
            .select({ id: agents.id, name: agents.name, role: agents.role })
            .from(agents)
            .where(inArray(agents.id, agentIds))
        : Promise.resolve([]),
      userIds.length
        ? db
            .select({ id: users.id, name: users.name, email: users.email })
            .from(users)
            .where(inArray(users.id, userIds))
        : Promise.resolve([]),
    ]);
    const agentById = new Map(agentRows.map((a) => [a.id, a]));
    const userById = new Map(userRows.map((u) => [u.id, u]));

    const list = rows.map((row) => {
      const agent = row.agentId ? agentById.get(row.agentId) : undefined;
      const user = row.actorType === 'user' && row.actorId ? userById.get(row.actorId) : undefined;
      const actorName = agent?.name ?? user?.name ?? user?.email ?? null;
      const actorKind =
        row.actorType === 'agent' ? 'AI' : row.actorType === 'user' ? 'human' : 'system';
      return {
        id: row.id,
        actorType: row.actorType,
        actorId: row.actorId,
        actorName,
        actorKind,
        agentId: row.agentId,
        agentRole: agent?.role ?? null,
        action: row.action,
        tool: row.tool,
        inputRef: row.inputRef,
        resultRef: row.resultRef,
        authorization: row.authorization,
        approvalId: row.approvalId,
        policyRef: row.policyRef,
        cost: row.cost,
        outcome: row.outcome,
        departmentId: row.departmentId,
        taskId: row.taskId,
        occurredAt: row.occurredAt,
        prevHash: row.prevHash,
        hash: row.hash,
      };
    });

    return {
      data: list,
      meta: {
        limit,
        offset,
        total: totalRow?.count ?? 0,
        domains: domainCounts,
        hasMore: offset + list.length < (totalRow?.count ?? 0),
      },
    };
  });

  /**
   * Verify the org's chain end to end (docs/34.4). This walks every row in the
   * org, which is exactly what "tamper-evident" costs — the page shows the
   * result as a claim it can back up, and names the first broken row otherwise.
   */
  app.get('/v1/audit/verify', async (request) => {
    const ctx = await requireAuth(request, deps);
    return { data: await verifyChain(db, ctx.orgId) };
  });
}
