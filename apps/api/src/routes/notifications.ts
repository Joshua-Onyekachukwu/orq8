import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import type { AppDeps } from '../types.js';

/**
 * Notifications API
 *
 * Provides a lightweight notification system for the dashboard.
 * Notifications are created by services (approval gates, credit alerts, task completions)
 * and consumed by the frontend via polling or SSE.
 *
 * Uses a simple in-memory store for now — will move to DB table when schema migration is ready.
 */

interface Notification {
  id: string;
  orgId: string;
  type: 'approval' | 'task' | 'credit' | 'agent' | 'system';
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

// In-memory notification store (per-org)
// In production, this would be a DB table
const notifications = new Map<string, Notification[]>();

function getOrgNotifications(orgId: string): Notification[] {
  return notifications.get(orgId) ?? [];
}

export function createNotification(
  orgId: string,
  type: Notification['type'],
  title: string,
  message: string,
): Notification {
  const notif: Notification = {
    id: crypto.randomUUID(),
    orgId,
    type,
    title,
    message,
    read: false,
    createdAt: new Date(),
  };

  const existing = notifications.get(orgId) ?? [];
  existing.unshift(notif);
  // Keep only last 100 notifications per org
  if (existing.length > 100) existing.splice(100);
  notifications.set(orgId, existing);

  return notif;
}

export function registerNotificationRoutes(app: FastifyInstance, deps: AppDeps): void {
  /** List notifications for the current org, with optional filters. */
  app.get('/v1/notifications', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const unreadOnly = url.searchParams.get('unread') === 'true';
    const type = url.searchParams.get('type') as Notification['type'] | null;
    const readFilter = url.searchParams.get('read'); // 'true' | 'false' | null
    const search = url.searchParams.get('q')?.toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);

    let list = getOrgNotifications(ctx.orgId);

    // Apply filters
    if (unreadOnly) list = list.filter((n) => !n.read);
    if (type) list = list.filter((n) => n.type === type);
    if (readFilter === 'true') list = list.filter((n) => n.read);
    if (readFilter === 'false') list = list.filter((n) => !n.read);
    if (search) list = list.filter((n) =>
      n.title.toLowerCase().includes(search) ||
      n.message.toLowerCase().includes(search)
    );

    const total = list.length;
    const sliced = list.slice(offset, offset + limit);
    const allNotifications = getOrgNotifications(ctx.orgId);
    const unread = allNotifications.filter((n) => !n.read).length;

    return { data: sliced, meta: { total, unread, limit, offset } };
  });

  /** Get unread count. */
  app.get('/v1/notifications/unread', async (request) => {
    const ctx = await requireAuth(request, deps);
    const list = getOrgNotifications(ctx.orgId);
    const unread = list.filter((n) => !n.read).length;
    return { data: { count: unread } };
  });

  /** Mark a notification as read. */
  app.patch<{ Params: { id: string } }>('/v1/notifications/:id/read', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const list = getOrgNotifications(ctx.orgId);
    const notif = list.find((n) => n.id === request.params.id && n.orgId === ctx.orgId);
    if (!notif) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Notification not found' } };
    }
    notif.read = true;
    return { data: notif };
  });

  /** Mark all as read. */
  app.post('/v1/notifications/read-all', async (request) => {
    const ctx = await requireAuth(request, deps);
    const list = getOrgNotifications(ctx.orgId);
    let count = 0;
    for (const notif of list) {
      if (!notif.read) {
        notif.read = true;
        count++;
      }
    }
    return { data: { marked: count } };
  });

  /** Seed sample notifications for testing the notification bell. */
  app.post('/v1/notifications/seed', async (request) => {
    const ctx = await requireAuth(request, deps);

    const samples: Array<{ type: Notification['type']; title: string; message: string }> = [
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
      createNotification(ctx.orgId, sample.type, sample.title, sample.message);
      created++;
    }

    return { data: { seeded: created } };
  });
}
