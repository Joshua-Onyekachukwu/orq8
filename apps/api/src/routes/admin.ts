import { eq, and, desc, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { buildProviderChain } from '../services/llm.js';
import * as userService from '../services/users.js';
import { forbidden, platformAdminEmails } from '@orq8/core';
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
  waitlistSignups,
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

/**
 * Require PLATFORM-admin access (users.platform_role = 'admin', or an email in
 * PLATFORM_ADMIN_EMAILS for bootstrap). The org membership role (owner|admin)
 * is deliberately NOT sufficient: those are org-scoped privileges and granting
 * them platform-wide reads leaks every tenant's users/activity (docs/34.x).
 * The platform_role is re-read from the DB so a promotion/demotion takes effect
 * immediately even for sessions cached in Redis.
 */
async function requirePlatformAdmin(request: any, deps: AppDeps) {
  const ctx = await requireAuth(request, deps);
  const user = await userService.findById(deps.db, ctx.userId);
  const dbAdmin = user?.platformRole === 'admin';
  const envAdmin = platformAdminEmails(deps.config).has(ctx.email.toLowerCase());
  if (!dbAdmin && !envAdmin) {
    throw forbidden('Platform admin access required');
  }
  return ctx;
}

export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** GET /v1/admin/users — List all users with their roles, paginated. */
  app.get('/v1/admin/users', async (request) => {
    await requirePlatformAdmin(request, deps);

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
    await requirePlatformAdmin(request, deps);

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
    await requirePlatformAdmin(request, deps);

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

    // LLM fallback chain (docs/22): NVIDIA NIM → LiteLLM → Ollama → structured fallback
    const llmChain = buildProviderChain(deps.config);

    // Aggregate subsystems
    const subsystems = [
      { name: 'Database', status: dbHealthy ? 'operational' : 'degraded', latencyMs: null },
      { name: 'Redis', status: redisHealthy ? 'operational' : 'degraded', latencyMs: null },
      { name: 'API', status: 'operational', latencyMs: null },
      { name: 'Auth', status: 'operational', latencyMs: null },
      { name: 'Agent Execution', status: 'operational', latencyMs: null },
      {
        // Multi-provider chain (docs/22): NVIDIA NIM → LiteLLM → Ollama → structured fallback
        name: 'AI Models',
        status: llmChain.length > 0 ? (llmChain[0]?.id === 'nvidia' ? 'operational' : 'configured') : 'not_configured',
        latencyMs: null,
        detail: llmChain.length > 0 ? llmChain.map((p) => p.label).join(' → ') : 'Set NVIDIA_API_KEY, LITELLM_BASE_URL, or OLLAMA_BASE_URL',
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
    await requirePlatformAdmin(request, deps);

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

  /**
   * GET /v1/admin/nvidia/diagnostics — Probe every configured NVIDIA key
   * against every configured model and report each key's scope/entitlement.
   * Surfaces the owning Account ID from 404 responses so the operator can
   * verify access on build.nvidia.com without leaving the app.
   *
   * Requires platform-admin role.
   */
  app.get('/v1/admin/nvidia/diagnostics', async (request) => {
    const ctx = await requirePlatformAdmin(request, deps);

    const chain = buildProviderChain(deps.config);
    const nvidiaProvider = chain.find((p) => p.id === 'nvidia');
    if (!nvidiaProvider) {
      return {
        data: {
          configured: false,
          message: 'No NVIDIA provider configured (NVIDIA_API_KEY / NVIDIA_API_KEYS not set).',
          keys: [],
          models: [],
          results: [],
          summary: null,
        },
      };
    }

    const models = [nvidiaProvider.defaultModel, ...(nvidiaProvider.modelFallbacks ?? [])];
    const endpoint = nvidiaProvider.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1/chat/completions';
    const results: Array<{
      keySuffix: string;
      model: string;
      status: number;
      ok: boolean;
      accountId?: string;
      nvidiaDetail?: string;
      hint?: string;
    }> = [];

    // Probe each key × model combination.
    const { parseNvidia404Body, buildNvidia404Hint } = await import('../services/llm.js');
    for (const key of nvidiaProvider.apiKeys) {
      for (const model of models) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12_000);
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (key) headers.Authorization = `Bearer ${key}`;
          const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: 'hi' }],
              max_tokens: 1,
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);

          const entry: (typeof results)[number] = {
            keySuffix: key.slice(-6),
            model,
            status: response.status,
            ok: response.ok,
          };

          if (response.status === 404) {
            const parsed = await parseNvidia404Body(response);
            entry.accountId = parsed?.accountId;
            entry.nvidiaDetail = parsed?.nvidiaDetail;
            entry.hint = buildNvidia404Hint(parsed?.accountId);
          }

          results.push(entry);
        } catch (err) {
          results.push({
            keySuffix: key.slice(-6),
            model,
            status: 0,
            ok: false,
            hint: `Probe failed: ${err instanceof Error ? err.message : 'network error'}`,
          });
        }
      }
    }

    // Build a per-key summary showing which models each key can serve.
    const keySummaries = nvidiaProvider.apiKeys.map((key) => {
      const suffix = key.slice(-6);
      const keyResults = results.filter((r) => r.keySuffix === suffix);
      const accessible = keyResults.filter((r) => r.ok).map((r) => r.model);
      const denied = keyResults.filter((r) => !r.ok).map((r) => ({
        model: r.model,
        status: r.status,
        accountId: r.accountId,
        hint: r.hint,
      }));
      return {
        keySuffix: suffix,
        accessibleModels: accessible,
        deniedModels: denied,
        allModelsWork: accessible.length === models.length,
      };
    });

    return {
      data: {
        configured: true,
        keyCount: nvidiaProvider.apiKeys.length,
        models,
        results,
        summary: {
          totalProbes: results.length,
          successful: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          keys: keySummaries,
        },
      },
    };
  });

  /** GET /v1/admin/waitlist — List all waitlist entries with pagination + search. */
  app.get('/v1/admin/waitlist', async (request) => {
    await requirePlatformAdmin(request, deps);

    const params = request.query as { limit?: string; offset?: string; status?: string; search?: string };
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const offset = Math.max(Number(params.offset) || 0, 0);
    const statusFilter = params.status || undefined;
    const search = params.search || undefined;

    // Build where conditions
    const conditions = [];
    if (statusFilter) conditions.push(eq(waitlistSignups.status, statusFilter));
    if (search) conditions.push(sql`${waitlistSignups.email} ILIKE ${'%' + search + '%'}`);

    const where = conditions.length > 0 ? sql`${conditions[0]} AND ${sql.join(conditions.slice(1).map(c => sql`${c}`), sql` AND `)}` : undefined;

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(waitlistSignups)
      .where(where);

    const list = await db
      .select()
      .from(waitlistSignups)
      .where(where)
      .orderBy(desc(waitlistSignups.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: list,
      meta: { limit, offset, total: totalRow?.count ?? 0 },
    };
  });

  /** GET /v1/admin/waitlist/:id — Get a single waitlist entry. */
  app.get<{ Params: { id: string } }>('/v1/admin/waitlist/:id', async (request, reply) => {
    await requirePlatformAdmin(request, deps);

    const rows = await db
      .select()
      .from(waitlistSignups)
      .where(eq(waitlistSignups.id, request.params.id))
      .limit(1);

    if (!rows[0]) {
      return reply.status(404).send({ error: { code: 'not_found', message: 'Waitlist entry not found' } });
    }
    return { data: rows[0] };
  });

  /** PATCH /v1/admin/waitlist/:id — Update status (approve/reject/invite). */
  app.patch<{ Params: { id: string }; Body: { status: string } }>('/v1/admin/waitlist/:id', async (request, reply) => {
    const ctx = await requirePlatformAdmin(request, deps);
    const { status } = request.body;
    if (!['pending', 'invited', 'signed_up', 'rejected'].includes(status)) {
      return reply.status(400).send({ error: { code: 'invalid_status', message: 'Status must be pending, invited, signed_up, or rejected' } });
    }

    const rows = await db
      .update(waitlistSignups)
      .set({ status })
      .where(eq(waitlistSignups.id, request.params.id))
      .returning();

    if (!rows[0]) {
      return reply.status(404).send({ error: { code: 'not_found', message: 'Waitlist entry not found' } });
    }

    await appendAudit(db, {
      orgId: "00000000-0000-0000-0000-000000000000",
      actorType: 'user',
      actorId: ctx.userId,
      action: `waitlist.${status}`,
      outcome: 'success',
    });

    return { data: rows[0] };
  });

  /** DELETE /v1/admin/waitlist/:id — Remove a waitlist entry. */
  app.delete<{ Params: { id: string } }>('/v1/admin/waitlist/:id', async (request, reply) => {
    const ctx = await requirePlatformAdmin(request, deps);

    const rows = await db
      .delete(waitlistSignups)
      .where(eq(waitlistSignups.id, request.params.id))
      .returning();

    if (!rows[0]) {
      return reply.status(404).send({ error: { code: 'not_found', message: 'Waitlist entry not found' } });
    }

    await appendAudit(db, {
      orgId: "00000000-0000-0000-0000-000000000000",
      actorType: 'user',
      actorId: ctx.userId,
      action: 'waitlist.deleted',
      outcome: 'success',
    });

    return { data: { deleted: true } };
  });

  /** GET /v1/admin/waitlist/stats — Summary statistics. */
  app.get('/v1/admin/waitlist/stats', async (request) => {
    await requirePlatformAdmin(request, deps);

    const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(waitlistSignups);
    const [pending] = await db.select({ count: sql<number>`count(*)::int` }).from(waitlistSignups).where(eq(waitlistSignups.status, 'pending'));
    const [invited] = await db.select({ count: sql<number>`count(*)::int` }).from(waitlistSignups).where(eq(waitlistSignups.status, 'invited'));
    const [signedUp] = await db.select({ count: sql<number>`count(*)::int` }).from(waitlistSignups).where(eq(waitlistSignups.status, 'signed_up'));

    return {
      data: {
        total: total?.count ?? 0,
        pending: pending?.count ?? 0,
        invited: invited?.count ?? 0,
        signedUp: signedUp?.count ?? 0,
      },
    };
  });

  // ── PLATFORM STATS ──

  /** GET /v1/admin/stats — Platform-wide aggregated metrics. */
  app.get('/v1/admin/stats', async (request) => {
    await requirePlatformAdmin(request, deps);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersWeek,
      totalOrgs,
      activeOrgs,
      totalAgents,
      activeAgents,
      pausedAgents,
      pendingApprovals,
      weeklyActivity,
      weeklySpend,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(sql`${users.createdAt} >= ${weekAgo}`),
      db.select({ count: sql<number>`count(*)::int` }).from(organizations),
      db.select({ count: sql<number>`count(*)::int` }).from(organizations).where(eq(organizations.status, 'active')),
      db.select({ count: sql<number>`count(*)::int` }).from(agents),
      db.select({ count: sql<number>`count(*)::int` }).from(agents).where(eq(agents.status, 'active')),
      db.select({ count: sql<number>`count(*)::int` }).from(agents).where(eq(agents.status, 'paused')),
      db.select({ count: sql<number>`count(*)::int` }).from(approvals).where(eq(approvals.status, 'pending')),
      db.select({ count: sql<number>`count(*)::int` }).from(activityEvents).where(sql`${activityEvents.occurredAt} >= ${weekAgo}`),
      db.select({ total: sql<number>`coalesce(sum(${activityEvents.cost}), 0)::int` }).from(activityEvents).where(sql`${activityEvents.occurredAt} >= ${weekAgo}`),
    ]);

    return {
      data: {
        users: { total: totalUsers[0]?.count ?? 0, newThisWeek: newUsersWeek[0]?.count ?? 0 },
        organizations: { total: totalOrgs[0]?.count ?? 0, active: activeOrgs[0]?.count ?? 0 },
        agents: { total: totalAgents[0]?.count ?? 0, active: activeAgents[0]?.count ?? 0, paused: pausedAgents[0]?.count ?? 0 },
        approvals: { pending: pendingApprovals[0]?.count ?? 0 },
        activity: { thisWeek: weeklyActivity[0]?.count ?? 0 },
        spend: { thisWeek: (weeklySpend[0]?.total ?? 0) / 100 },
      },
    };
  });

  /** GET /v1/admin/providers — Provider health and configuration status. */
  app.get('/v1/admin/providers', async (request) => {
    await requirePlatformAdmin(request, deps);

    const providers = [];
    const nvidiaKeys = (deps.config as any).nvidiaApiKeys ?? [];
    providers.push({ name: 'NVIDIA', slug: 'nvidia', configured: nvidiaKeys.length > 0, keyCount: nvidiaKeys.length, status: nvidiaKeys.length > 0 ? 'configured' : 'not_configured' });

    const openrouterKey = (deps.config as any).openrouterApiKey ?? '';
    providers.push({ name: 'OpenRouter', slug: 'openrouter', configured: !!openrouterKey, keyCount: openrouterKey ? 1 : 0, status: openrouterKey ? 'configured' : 'not_configured' });

    const ollamaUrl = (deps.config as any).ollamaBaseUrl ?? '';
    providers.push({ name: 'Ollama (Local)', slug: 'ollama', configured: !!ollamaUrl, keyCount: ollamaUrl ? 1 : 0, status: ollamaUrl ? 'configured' : 'not_configured' });

    return { data: providers };
  });

  /** GET /v1/admin/audit — Platform audit trail. */
  app.get('/v1/admin/audit', async (request) => {
    await requirePlatformAdmin(request, deps);
    const params = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const offset = Math.max(Number(params.offset) || 0, 0);

    const list = await db
      .select({
        id: sql<string>`ae.id::text`,
        orgId: sql<string>`ae.org_id::text`,
        actorType: sql<string>`ae.actor_type`,
        actorId: sql<string>`ae.actor_id::text`,
        action: sql<string>`ae.action`,
        outcome: sql<string>`ae.outcome`,
        occurredAt: sql<Date>`ae.occurred_at`,
        actorEmail: sql<string>`u.email`,
        actorName: sql<string>`u.name`,
      })
      .from(sql`audit_events ae LEFT JOIN users u ON ae.actor_id = u.id`)
      .orderBy(sql`ae.occurred_at DESC`)
      .limit(limit)
      .offset(offset)
      .catch(() => []);

    const [totalRow] = await db
      .select({ count: sql<number>`(SELECT count(*) FROM audit_events)::int` })
      .from(sql`(SELECT 1) AS _c`)
      .catch(() => [{ count: 0 }]);

    return { data: list, meta: { limit, offset, total: totalRow?.count ?? 0 } };
  });

  // ── USER MANAGEMENT ──

  /** PATCH /v1/admin/users/:id — Suspend or enable a user. */
  app.patch<{ Params: { id: string }; Body: { status: string } }>('/v1/admin/users/:id', async (request, reply) => {
    const ctx = await requirePlatformAdmin(request, deps);
    const { status } = request.body;
    if (!['active', 'suspended', 'disabled'].includes(status)) {
      return reply.status(400).send({ error: { code: 'validation', message: 'Status must be active, suspended, or disabled' } });
    }

    // Prevent self-suspension
    if (request.params.id === ctx.userId && status !== 'active') {
      return reply.status(400).send({ error: { code: 'validation', message: 'Cannot suspend or disable your own account' } });
    }

    // Get the target user first
    const [targetUser] = await db
      .select({ id: users.id, email: users.email, name: users.name, status: users.status })
      .from(users)
      .where(eq(users.id, request.params.id))
      .limit(1);

    if (!targetUser) {
      return reply.status(404).send({ error: { code: 'not_found', message: 'User not found' } });
    }

    // Update user status
    const result = await db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, request.params.id))
      .returning();

    // If suspending/disabling, revoke all active sessions
    if (status === 'suspended' || status === 'disabled') {
      const { sessions: sessionsTable } = await import('@orq8/db');
      await db
        .update(sessionsTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessionsTable.userId, request.params.id),
            sql`${sessionsTable.revokedAt} IS NULL`,
          ),
        );
    }

    // Audit the action with full context
    await appendAudit(db, {
      orgId: '00000000-0000-0000-0000-000000000000',
      actorType: 'user',
      actorId: ctx.userId,
      action: `admin.user.${status}`,
      inputRef: JSON.stringify({
        targetUserId: targetUser.id,
        targetEmail: targetUser.email,
        targetName: targetUser.name,
        previousStatus: targetUser.status,
        newStatus: status,
      }),
      outcome: 'success',
    });

    return {
      data: {
        id: result[0]?.id,
        email: result[0]?.email,
        name: result[0]?.name,
        status: result[0]?.status,
        updatedAt: result[0]?.updatedAt,
      },
    };
  });

  // ── MODEL ROUTER MONITORING ──

  /** GET /v1/admin/model-router — Provider routing stats. */
  app.get('/v1/admin/model-router', async (request) => {
    await requirePlatformAdmin(request, deps);
    const byDepartment = await db
      .select({
        department: sql<string>`COALESCE(${activityEvents.department}, 'unknown')`,
        count: sql<number>`count(*)::int`,
        totalCost: sql<number>`COALESCE(sum(${activityEvents.cost}), 0)::int`,
      })
      .from(activityEvents)
      .groupBy(activityEvents.department)
      .catch(() => []);
    const byType = await db
      .select({
        type: activityEvents.type,
        count: sql<number>`count(*)::int`,
        totalCost: sql<number>`COALESCE(sum(${activityEvents.cost}), 0)::int`,
      })
      .from(activityEvents)
      .groupBy(activityEvents.type)
      .catch(() => []);
    const [totals] = await db
      .select({ totalRequests: sql<number>`count(*)::int`, totalCost: sql<number>`COALESCE(sum(${activityEvents.cost}), 0)::int` })
      .from(activityEvents)
      .catch(() => [{ totalRequests: 0, totalCost: 0 }]);
    return { data: { totals: { requests: totals?.totalRequests ?? 0, costCents: totals?.totalCost ?? 0 }, byDepartment, byType } };
  });

  // ── AI USAGE & COST TRACKING ──

  /** GET /v1/admin/ai-usage — Platform-wide AI usage. */
  app.get('/v1/admin/ai-usage', async (request) => {
    await requirePlatformAdmin(request, deps);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [weekly, monthly, allTime] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int`, cost: sql<number>`COALESCE(sum(${activityEvents.cost}), 0)::int` }).from(activityEvents).where(sql`${activityEvents.occurredAt} >= ${weekAgo}`).catch(() => [{ count: 0, cost: 0 }]),
      db.select({ count: sql<number>`count(*)::int`, cost: sql<number>`COALESCE(sum(${activityEvents.cost}), 0)::int` }).from(activityEvents).where(sql`${activityEvents.occurredAt} >= ${monthAgo}`).catch(() => [{ count: 0, cost: 0 }]),
      db.select({ count: sql<number>`count(*)::int`, cost: sql<number>`COALESCE(sum(${activityEvents.cost}), 0)::int` }).from(activityEvents).catch(() => [{ count: 0, cost: 0 }]),
    ]);
    const [credits] = await db.select({ total: sql<number>`COALESCE(sum(${creditBalances.includedCredits} + ${creditBalances.purchasedCredits}), 0)::int`, used: sql<number>`COALESCE(sum(${creditBalances.usedCredits}), 0)::int` }).from(creditBalances).catch(() => [{ total: 0, used: 0 }]);
    const [agentStats] = await db.select({ total: sql<number>`count(*)::int`, active: sql<number>`count(*) filter (where ${agents.status} = 'active')::int` }).from(agents).catch(() => [{ total: 0, active: 0 }]);
    return { data: { weekly: { requests: weekly[0]?.count ?? 0, costCents: weekly[0]?.cost ?? 0 }, monthly: { requests: monthly[0]?.count ?? 0, costCents: monthly[0]?.cost ?? 0 }, allTime: { requests: allTime[0]?.count ?? 0, costCents: allTime[0]?.cost ?? 0 }, credits: { total: credits?.total ?? 0, used: credits?.used ?? 0 }, agents: { total: agentStats?.total ?? 0, active: agentStats?.active ?? 0 } } };
  });

  // ── SECURITY CENTER ──

  /** GET /v1/admin/security — Security signals. */
  app.get('/v1/admin/security', async (request) => {
    await requirePlatformAdmin(request, deps);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let failedLogins: any[] = [];
    try { failedLogins = await db.select({ email: sql<string>`email`, failedCount: sql<number>`failed_count`, lockedUntil: sql<Date>`locked_until` }).from(sql`login_lockouts`).where(sql`failed_count > 0`).orderBy(sql`last_failed_at DESC`).limit(20); } catch { /* */ }
    const [denied] = await db.select({ count: sql<number>`count(*)::int` }).from(sql`audit_events`).where(sql`outcome = 'denied' AND occurred_at >= ${dayAgo}`).catch(() => [{ count: 0 }]);
    const [adminActs] = await db.select({ count: sql<number>`count(*)::int` }).from(sql`audit_events`).where(sql`action LIKE 'admin.%' AND occurred_at >= ${dayAgo}`).catch(() => [{ count: 0 }]);
    return { data: { failedLogins: failedLogins.length, failedLoginDetails: failedLogins, deniedEvents: denied?.count ?? 0, adminActions: adminActs?.count ?? 0, status: (denied?.count ?? 0) > 10 ? 'elevated' : 'normal' } };
  });

  // ── BACKGROUND JOBS ──

  /** GET /v1/admin/jobs — Background job status. */
  app.get('/v1/admin/jobs', async (request) => {
    await requirePlatformAdmin(request, deps);
    let dripPending = 0, dripSent = 0, dripFailed = 0;
    try {
      const [p] = await db.select({ count: sql<number>`count(*)::int` }).from(sql`waitlist_emails`).where(sql`status = 'queued'`);
      const [s] = await db.select({ count: sql<number>`count(*)::int` }).from(sql`waitlist_emails`).where(sql`status = 'sent'`);
      const [f] = await db.select({ count: sql<number>`count(*)::int` }).from(sql`waitlist_emails`).where(sql`status = 'failed'`);
      dripPending = p?.count ?? 0; dripSent = s?.count ?? 0; dripFailed = f?.count ?? 0;
    } catch { /* */ }
    let waitlistPending = 0;
    try { const [wp] = await db.select({ count: sql<number>`count(*)::int` }).from(waitlistSignups).where(eq(waitlistSignups.status, 'pending')); waitlistPending = wp?.count ?? 0; } catch { /* */ }
    return { data: { dripQueue: { pending: dripPending, sent: dripSent, failed: dripFailed }, waitlist: { pending: waitlistPending }, jobs: [
      { name: 'Waitlist Drip Sequence', status: dripPending > 0 ? 'has_pending' : 'idle', pending: dripPending, sent: dripSent, failed: dripFailed },
      { name: 'Waitlist Processing', status: waitlistPending > 0 ? 'has_pending' : 'idle', pending: waitlistPending },
      { name: 'Weekly Report Generation', status: 'scheduled', nextRun: 'Sunday 00:00 UTC' },
      { name: 'Credit Reconciliation', status: 'scheduled', nextRun: 'Daily 00:00 UTC' },
    ] } };
  });
}
