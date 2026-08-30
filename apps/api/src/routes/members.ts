import { eq, desc, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { users, memberships, agents } from '@orq8/db';
import type { AppDeps } from '../types.js';

/**
 * Org Members API — lists human members and AI agents for the current organization.
 * Combined view for the Members & Roles page.
 */

export function registerMemberRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** GET /v1/members — List org members (humans) with roles, paginated. */
  app.get('/v1/members', async (request) => {
    const ctx = await requireAuth(request, deps);

    const params = request.query as { limit?: string; offset?: string; search?: string };
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const offset = Math.max(Number(params.offset) || 0, 0);
    const search = params.search?.trim().toLowerCase() ?? '';

    // Count total members for this org
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(eq(memberships.orgId, ctx.orgId));

    // Fetch members with user details
    const memberList = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        role: memberships.role,
        memberSince: memberships.createdAt,
        createdAt: users.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.orgId, ctx.orgId))
      .orderBy(desc(memberships.createdAt))
      .limit(limit)
      .offset(offset);

    // Apply search filter in-memory (small dataset)
    const filtered = search
      ? memberList.filter(
          (m) =>
            m.name?.toLowerCase().includes(search) ||
            m.email.toLowerCase().includes(search)
        )
      : memberList;

    return {
      data: filtered.map((m) => ({
        id: m.id,
        name: m.name ?? 'Unknown',
        email: m.email,
        role: m.role,
        type: 'human' as const,
        status: m.status,
        memberSince: m.memberSince,
        createdAt: m.createdAt,
      })),
      meta: { limit, offset, total: totalRow?.count ?? 0 },
    };
  });

  /** GET /v1/members/all — Combined list of humans + agents for the org. */
  app.get('/v1/members/all', async (request) => {
    const ctx = await requireAuth(request, deps);

    const params = request.query as { limit?: string; offset?: string; search?: string };
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const offset = Math.max(Number(params.offset) || 0, 0);
    const search = params.search?.trim().toLowerCase() ?? '';

    // Fetch humans
    const humanMembers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        role: memberships.role,
        memberSince: memberships.createdAt,
        createdAt: users.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.orgId, ctx.orgId))
      .orderBy(desc(memberships.createdAt));

    // Fetch agents
    const agentMembers = await db
      .select({
        id: agents.id,
        name: agents.name,
        role: agents.role,
        department: agents.department,
        status: agents.status,
        tasksCompleted: agents.tasksCompleted,
        weeklyCost: agents.weeklyCost,
        createdAt: agents.createdAt,
      })
      .from(agents)
      .where(eq(agents.orgId, ctx.orgId))
      .orderBy(desc(agents.createdAt));

    // Combine into unified list
    const allMembers = [
      ...humanMembers.map((m) => ({
        id: m.id,
        name: m.name ?? 'Unknown',
        email: m.email,
        role: m.role,
        type: 'human' as const,
        status: m.status,
        department: null as string | null,
        tasksCompleted: 0,
        weeklyCost: 0,
        memberSince: m.memberSince,
        createdAt: m.createdAt,
      })),
      ...agentMembers.map((a) => ({
        id: a.id,
        name: a.name,
        email: `${a.name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@orq8.internal`,
        role: 'agent',
        type: 'agent' as const,
        status: a.status,
        department: a.department,
        tasksCompleted: a.tasksCompleted,
        weeklyCost: a.weeklyCost,
        memberSince: a.createdAt,
        createdAt: a.createdAt,
      })),
    ];

    // Apply search filter
    const filtered = search
      ? allMembers.filter(
          (m) =>
            m.name.toLowerCase().includes(search) ||
            m.email.toLowerCase().includes(search)
        )
      : allMembers;

    // Paginate
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      data: paginated,
      meta: { limit, offset, total },
    };
  });
}
