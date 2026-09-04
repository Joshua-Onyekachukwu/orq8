import { z } from 'zod';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  notifications as notificationsTable,
  type Db,
  type Notification as NotificationRow,
} from '@orq8/db';
import type { AppDeps } from '../types.js';

/**
 * Notifications API
 *
 * Notifications are created by services (approval gates, credit alerts, task
 * completions, agent hires) and consumed by the frontend via polling or SSE.
 *
 * Storage is the `notifications` table (migration 0012) — previously this was
 * an in-memory Map, which lost history on every restart/deploy and was
 * inconsistent across API instances. SSE fan-out (services/realtime) remains
 * ephemeral; the persisted feed lives here.
 *
 * The in-memory Map was also the org-scoping boundary. With a DB table, every
 * query must filter by org_id from the authenticated session (ctx.orgId) —
 * never from the client.
 */

export type NotificationType = 'approval' | 'task' | 'credit' | 'agent' | 'system';

/** Per-org cap on retained notifications (matches the old in-memory store). */
const MAX_PER_ORG = 100;

/**
 * Create and persist a notification for an org, trimming the org's retained
 * history to the latest MAX_PER_ORG rows. Non-fatal on failure (a notification
 * must never break the action that produced it).
 */
export async function createNotification(
  db: Db,
  orgId: string,
  type: NotificationType,
  title: string,
  message: string,
): Promise<NotificationRow | null> {
  try {
    const [row] = await db
      .insert(notificationsTable)
      .values({ orgId, type, title, message })
      .returning();
    if (!row) return null;

    // Trim: delete rows beyond the newest MAX_PER_ORG for this org.
    const excess = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(eq(notificationsTable.orgId, orgId))
      .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id))
      .offset(MAX_PER_ORG)
      .limit(500);
    if (excess.length > 0) {
      await db
        .delete(notificationsTable)
        .where(inArray(notificationsTable.id, excess.map((e) => e.id)));
    }
    return row;
  } catch {
    // Notification persistence is best-effort
    return null;
  }
}

export function registerNotificationRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** List notifications for the current org, with optional filters. */
  app.get('/v1/notifications', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const unreadOnly = url.searchParams.get('unread') === 'true';
    const type = url.searchParams.get('type') as NotificationType | null;
    const readFilter = url.searchParams.get('read'); // 'true' | 'false' | null
    const search = url.searchParams.get('q')?.toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);

    const conditions = [eq(notificationsTable.orgId, ctx.orgId)];
    if (unreadOnly) conditions.push(eq(notificationsTable.read, false));
    if (type) conditions.push(eq(notificationsTable.type, type));
    if (readFilter === 'true') conditions.push(eq(notificationsTable.read, true));
    if (readFilter === 'false') conditions.push(eq(notificationsTable.read, false));
    if (search) {
      conditions.push(
        or(
          ilike(notificationsTable.title, `%${search}%`),
          ilike(notificationsTable.message, `%${search}%`),
        )!,
      );
    }

    const where = and(...conditions);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(where);
    const [unreadRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.orgId, ctx.orgId), eq(notificationsTable.read, false)));

    const list = await db
      .select()
      .from(notificationsTable)
      .where(where)
      .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id))
      .limit(limit)
      .offset(offset);

    return {
      data: list,
      meta: { total: totalRow?.count ?? 0, unread: unreadRow?.count ?? 0, limit, offset },
    };
  });

  /** Get unread count. */
  app.get('/v1/notifications/unread', async (request) => {
    const ctx = await requireAuth(request, deps);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.orgId, ctx.orgId), eq(notificationsTable.read, false)));
    return { data: { count: row?.count ?? 0 } };
  });

  /** Mark a notification as read. */
  app.patch<{ Params: { id: string } }>('/v1/notifications/:id/read', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const [updated] = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, request.params.id), eq(notificationsTable.orgId, ctx.orgId)))
      .returning();
    if (!updated) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Notification not found' } };
    }
    return { data: updated };
  });

  /** Mark all as read. */
  app.post('/v1/notifications/read-all', async (request) => {
    const ctx = await requireAuth(request, deps);
    const updated = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.orgId, ctx.orgId), eq(notificationsTable.read, false)))
      .returning({ id: notificationsTable.id });
    return { data: { marked: updated.length } };
  });

  /** Seed sample notifications for testing the notification bell. */
  app.post('/v1/notifications/seed', async (request) => {
    const ctx = await requireAuth(request, deps);

    const samples: Array<{ type: NotificationType; title: string; message: string }> = [
      { type: 'approval', title: 'Approval Required', message: 'Your Researcher wants to publish a market analysis report to the public dashboard. Review and approve before it goes live.' },
      { type: 'task', title: 'Task Completed', message: 'The Content Writer completed "Draft Q4 investor update" in 12.3s (5 credits).' },
      { type: 'agent', title: 'AI Employee Hired', message: 'Data Analyst has joined your organization and is now active.' },
      { type: 'credit', title: 'Work Credits — Low', message: 'Work Credits running low — 45 remaining of 500 (91% used). Consider topping up or upgrading your plan.' },
      { type: 'system', title: 'Weekly Report Ready', message: 'Your executive summary for this week is available. 3 tasks completed, 2 approvals processed, 12 credits used.' },
      { type: 'task', title: 'Task Completed', message: 'The Operations Manager completed "Optimize API response times" in 8.7s (3 credits).' },
      { type: 'approval', title: 'Approval Decision Recorded', message: 'Your approval of "Deploy marketing campaign" has been recorded and the task is now executing.' },
      { type: 'agent', title: 'Agent Error', message: 'The Financial Analyzer could not reach the LLM after 2 attempts for "Revenue forecast update". Using fallback execution.' },
    ];

    let created = 0;
    for (const sample of samples) {
      const row = await createNotification(db, ctx.orgId, sample.type, sample.title, sample.message);
      if (row) created++;
    }

    return { data: { seeded: created } };
  });
}
