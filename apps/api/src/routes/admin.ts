import { eq, desc, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
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
}
