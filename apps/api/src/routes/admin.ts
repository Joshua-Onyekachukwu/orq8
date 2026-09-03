import { eq, desc, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { forbidden } from '@orq8/core';
import {
  users,
  organizations,
  memberships,
  agents,
  approvals,
  activityEvents,
  subscriptions,
  creditBalances,
  sessions,
  type Db,
} from '@orq8/db';
import type { AppDeps } from '../types.js';

/**
 * Admin API Routes
 *
 * Platform-level data for the Admin Dashboard.
 * All routes require authentication + admin/owner role.
 *
 * SECURITY: role is checked server-side from the session, never trusted from the client.
 */

/** Require authenticated user with admin or owner role. */
async function requireAdmin(request: any, deps: AppDeps) {
  const ctx = await requireAuth(request, deps);
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw forbidden('Admin access required');
  }
  return ctx;
}

export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** GET /v1/admin/users — List all users with their roles, paginated. */
  app.get('/v1/admin/users', async (request) => {
    await requireAdmin(request, deps);

    const params = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const offset = Math.max(Number(params.offset) || 0, 0);

    // Count total
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);

    // Fetch users with their membership role for the active org
    const list = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    // Fetch roles per user (may have multiple org memberships)
    const userIds = list.map((u) => u.id);
    const membershipsList =
      userIds.length > 0
        ? await db
            .select({
              userId: memberships.userId,
              role: memberships.role,
              orgId: memberships.orgId,
            })
            .from(memberships)
            .where(sql`${memberships.userId} IN ${userIds}`)
        : [];

    // Fetch org names
    const orgIds = [...new Set(membershipsList.map((m) => m.orgId))];
    const orgNames =
      orgIds.length > 0
        ? await db
            .select({ id: organizations.id, name: organizations.name })
            .from(organizations)
            .where(sql`${organizations.id} IN ${orgIds}`)
        : [];
    const orgNameMap = new Map(orgNames.map((o) => [o.id, o.name]));

    // Merge
    const enriched = list.map((u) => {
      const userMemberships = membershipsList
        .filter((m) => m.userId === u.id)
        .map((m) => ({
          role: m.role,
          orgId: m.orgId,
          orgName: orgNameMap.get(m.orgId) ?? 'Unknown',
        }));
      return {
        ...u,
        memberships: userMemberships,
        primaryRole: userMemberships[0]?.role ?? 'member',
      };
    });

    return {
      data: enriched,
      meta: { limit, offset, total: totalRow?.count ?? 0 },
    };
  });

  /** GET /v1/admin/organizations — List all orgs with member counts, paginated. */
  app.get('/v1/admin/organizations', async (request) => {
    await requireAdmin(request, deps);

    const params = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const offset = Math.max(Number(params.offset) || 0, 0);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizations);

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
      .orderBy(desc(organizations.createdAt))
      .limit(limit)
      .offset(offset);

    // Count members per org
    const orgIds = list.map((o) => o.id);
    const memberCounts =
      orgIds.length > 0
        ? await db
            .select({
              orgId: memberships.orgId,
              count: sql<number>`count(*)::int`,
            })
            .from(memberships)
            .where(sql`${memberships.orgId} IN ${orgIds}`)
            .groupBy(memberships.orgId)
        : [];
    const memberCountMap = new Map(memberCounts.map((m) => [m.orgId, m.count]));

    // Count agents per org
    const agentCounts =
      orgIds.length > 0
        ? await db
            .select({
              orgId: agents.orgId,
              count: sql<number>`count(*)::int`,
            })
            .from(agents)
            .where(sql`${agents.orgId} IN ${orgIds}`)
            .groupBy(agents.orgId)
        : [];
    const agentCountMap = new Map(agentCounts.map((a) => [a.orgId, a.count]));

    const enriched = list.map((o) => ({
      ...o,
      memberCount: memberCountMap.get(o.id) ?? 0,
      agentCount: agentCountMap.get(o.id) ?? 0,
    }));

    return {
      data: enriched,
      meta: { limit, offset, total: totalRow?.count ?? 0 },
    };
  });

  /** GET /v1/admin/health — System health with platform stats + subsystem status. */
  app.get('/v1/admin/health', async (request) => {
    await requireAdmin(request, deps);

    // Run all counts in parallel
    const [
      [totalUsers],
      [totalOrgs],
      [totalAgents],
      [activeAgents],
      [pendingApprovals],
      [totalActivity],
      [activeSubscriptions],
      [activeSessions],
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(organizations),
      db.select({ count: sql<number>`count(*)::int` }).from(agents),
      db.select({ count: sql<number>`count(*)::int` }).from(agents).where(eq(agents.status, 'active')),
      db.select({ count: sql<number>`count(*)::int` }).from(approvals).where(eq(approvals.status, 'pending')),
      db.select({ count: sql<number>`count(*)::int` }).from(activityEvents),
      db.select({ count: sql<number>`count(*)::int` }).from(subscriptions).where(eq(subscriptions.status, 'active')),
      db.select({ count: sql<number>`count(*)::int` }).from(sessions).where(sql`${sessions.revokedAt} IS NULL AND ${sessions.expiresAt} > NOW()`),
    ]);

    // Check database connectivity
    const dbHealthy = true; // If we got here, DB is working

    // Check Redis
    const redisHealthy = deps.redis?.isConnected?.() ?? false;

    // Aggregate subsystems
    const subsystems = [
      { name: 'Database', status: dbHealthy ? 'operational' : 'degraded', latencyMs: null },
      { name: 'Redis', status: redisHealthy ? 'operational' : 'degraded', latencyMs: null },
      { name: 'API', status: 'operational', latencyMs: null },
      { name: 'Auth', status: 'operational', latencyMs: null },
      { name: 'Agent Execution', status: 'operational', latencyMs: null },
      {
        name: 'AI Models (NVIDIA NIM)',
        status: process.env.NVIDIA_API_KEY ? 'operational' : process.env.LITELLM_BASE_URL ? 'configured' : 'not_configured',
        latencyMs: null,
      },
      { name: 'Email (SMTP)', status: process.env.SMTP_HOST ? 'operational' : 'not_configured', latencyMs: null },
      { name: 'Stripe Billing', status: process.env.STRIPE_SECRET_KEY ? 'operational' : 'not_configured', latencyMs: null },
      { name: 'File Storage (S3)', status: process.env.S3_ENDPOINT ? 'operational' : 'local_fallback', latencyMs: null },
    ];

    const allOperational = subsystems.every((s) => s.status === 'operational' || s.status === 'not_configured' || s.status === 'local_fallback');

    return {
      data: {
        status: allOperational ? 'operational' : 'degraded',
        timestamp: new Date().toISOString(),
        subsystems,
        stats: {
          users: totalUsers?.count ?? 0,
          organizations: totalOrgs?.count ?? 0,
          agents: totalAgents?.count ?? 0,
          activeAgents: activeAgents?.count ?? 0,
          pendingApprovals: pendingApprovals?.count ?? 0,
          totalActivity: totalActivity?.count ?? 0,
          activeSubscriptions: activeSubscriptions?.count ?? 0,
          activeSessions: activeSessions?.count ?? 0,
        },
      },
    };
  });

  /** GET /v1/admin/activity — Platform-wide activity log with pagination. */
  app.get('/v1/admin/activity', async (request) => {
    await requireAdmin(request, deps);

    const params = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const offset = Math.max(Number(params.offset) || 0, 0);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityEvents);

    const list = await db
      .select()
      .from(activityEvents)
      .orderBy(desc(activityEvents.occurredAt))
      .limit(limit)
      .offset(offset);

    return {
      data: list,
      meta: { limit, offset, total: totalRow?.count ?? 0 },
    };
  });
}
