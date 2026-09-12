/**
 * Briefing read routes — the scheduled briefing job (briefing.ts) persists
 * real generated output to the `briefings` table, but until now no read API
 * exposed it: the founder could see job-run health (/v1/jobs/status) yet never
 * the briefing content itself. Two endpoints, both org-scoped via requireAuth:
 *
 *   GET /v1/briefings            — paginated list (newest first), content included
 *   GET /v1/briefings/latest     — most recent non-quiet briefing (any kind)
 *
 * Pagination mirrors the agents/tasks contract: ?limit (≤200) & ?offset with a
 * { limit, offset, total } meta block.
 */

import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { briefings } from '@orq8/db';
import type { AppDeps } from '../types.js';

export function registerBriefingRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** GET /v1/briefings — list this org's generated briefings (paginated). */
  app.get('/v1/briefings', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const kind = url.searchParams.get('kind');
    if (kind && !['daily', 'weekly', 'monthly'].includes(kind)) {
      return { data: [], meta: { limit: 0, offset: 0, total: 0 } };
    }
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '10', 10) || 10, 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

    const conditions = [eq(briefings.orgId, ctx.orgId)];
    if (kind) conditions.push(eq(briefings.kind, kind));

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(briefings)
      .where(and(...conditions));

    const list = await db
      .select()
      .from(briefings)
      .where(and(...conditions))
      .orderBy(desc(briefings.periodStart))
      .limit(limit)
      .offset(offset);

    return { data: list, meta: { limit, offset, total: totalRow?.count ?? 0 } };
  });

  /** GET /v1/briefings/latest — most recent briefing that had real content. */
  app.get('/v1/briefings/latest', async (request) => {
    const ctx = await requireAuth(request, deps);
    const rows = await db
      .select()
      .from(briefings)
      .where(and(eq(briefings.orgId, ctx.orgId), ne(briefings.status, 'failed')))
      .orderBy(desc(briefings.periodStart))
      .limit(1);
    return { data: rows[0] ?? null };
  });
}
