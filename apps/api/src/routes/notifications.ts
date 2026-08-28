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
  /** List notifications for the current org. */
  app.get('/v1/notifications', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const unreadOnly = url.searchParams.get('unread') === 'true';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);

    let list = getOrgNotifications(ctx.orgId);
    if (unreadOnly) list = list.filter((n) => !n.read);
    const sliced = list.slice(0, limit);

    return { data: sliced, meta: { total: list.length, unread: list.filter((n) => !n.read).length } };
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
}
