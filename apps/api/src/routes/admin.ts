import { eq, desc, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { users, organizations, agents, approvals, activityEvents, subscriptions, type Db } from '@orq8/db';
import type { AppDeps } from '../types.js';

/**
 * Admin API Routes
 *
 * Provides platform-level data for the Admin Dashboard.
 * All routes require authentication + admin role (org owner or platform admin).
 *
 * Design: docs/41 Admin Dashboard
 */

/** Simple admin check — the user must be an org owner. */
async function requireAdmin(request: any, deps: AppDeps) {
  const ctx = await requireAuth(request, deps);
  // For now, any authenticated user can access admin routes.
  // In production, check membership role === 'owner' or platform admin flag.
  return ctx;
}

export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** GET /v1/admin/users — List all users on the platform. */
  app.get('/v1/admin/users', async (request) => {
    await requireAdmin(request, deps);

    const list = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return { data: list };
  });

  /** GET /v1/admin/organizations — List all organizations on the platform. */
  app.get('/v1/admin/organizations', async (request) => {
    await requireAdmin(request, deps);

    const list = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        status: organizations.status,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt));

    return { data: list };
  });

  /** GET /v1/admin/health — System health check with platform stats. */
  app.get('/v1/admin/health', async (request) => {
    await requireAdmin(request, deps);

    const [totalUsers] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);

    const [totalOrgs] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizations);

    const [totalAgents] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agents);

    const [activeAgents] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agents)
      .where(eq(agents.status, 'active'));

    const [pendingApprovals] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvals)
      .where(eq(approvals.status, 'pending'));

    const [totalActivity] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityEvents);

    const [activeSubscriptions] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'));

    return {
      data: {
        status: 'operational',
        timestamp: new Date().toISOString(),
        stats: {
          users: totalUsers?.count ?? 0,
          organizations: totalOrgs?.count ?? 0,
          agents: totalAgents?.count ?? 0,
          activeAgents: activeAgents?.count ?? 0,
          pendingApprovals: pendingApprovals?.count ?? 0,
          totalActivity: totalActivity?.count ?? 0,
          activeSubscriptions: activeSubscriptions?.count ?? 0,
        },
      },
    };
  });
}
