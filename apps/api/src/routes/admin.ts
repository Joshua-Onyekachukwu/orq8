import { createHash } from 'node:crypto';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { buildProviderChain } from '../services/llm.js';
import * as userService from '../services/users.js';
import { forbidden, platformAdminEmails } from '@orq8/core';
import {
  deadLetterJobs,
  jobsHealth,
  jobsOverview,
  recentJobsDetailed,
  retryJob,
} from '../services/jobs.js';
import {
  users,
  organizations,
  memberships,
  agents,
  approvals,
  activityEvents,
  subscriptions,
  creditBalances,
  creditTransactions,
  llmPerformance,
  sessions,
  waitlistSignups,
  departments,
  tasks,
  goals,
  companyMemory,
  decisions,
  auditEvents,
  onboardingStates,
  businessImports,
  type Db,
} from '@orq8/db';
import { computeMargin, CREDIT_RATE_BASIS, USD_PER_CREDIT_REFERENCE } from '../services/economics.js';
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
 *
 * Phase 2: denied attempts are recorded server-side in the audit trail with
 * the reason category, actor identity, route and request id — never tokens,
 * secrets or credentials.
 */
async function requirePlatformAdmin(request: any, deps: AppDeps) {
  const ctx = await requireAuth(request, deps);
  const user = await userService.findById(deps.db, ctx.userId);
  const dbAdmin = user?.platformRole === 'admin';
  const envAdmin = platformAdminEmails(deps.config).has(ctx.email.toLowerCase());
  if (!dbAdmin && !envAdmin) {
    await appendAudit(deps.db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'admin.access_denied',
      outcome: 'denied',
      inputRef: JSON.stringify({
        route: request.raw?.url ?? request.url,
        method: request.raw?.method ?? request.method,
        reason: 'not_platform_admin',
        requestId: request.id,
        userAgent: request.headers['user-agent']?.slice(0, 200),
        ipHash: hashForAudit(request.ip ?? request.raw?.socket?.remoteAddress ?? ''),
      }),
    }).catch(() => {}); // audit must never block the denial response
    throw forbidden('Platform admin access required');
  }
  return ctx;
}

/** One-way hash for audit metadata — identifiable for correlation, not reversible. */
function hashForAudit(value: string): string {
  if (!value) return '';
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
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

  /**
   * GET /v1/admin/users/:id/detail — everything the platform knows about one
   * account, for support and trust-and-safety work (docs/82 §admin-accounts):
   * profile and status, org memberships, session footprint, credit balance,
   * agent/task/goal counts per company they belong to, and their most recent
   * audit events.
   *
   * Privacy posture: account-level metadata and operational records only.
   * Company memory CONTENT is deliberately not exposed here — it is business
   * data owned by the org, readable by the org-intel endpoint under its own
   * audit trail when there is a specific, logged reason. This endpoint answers
   * "who is this account and what are they doing", not "read their company's
   * knowledge". Every view is audited (admin.user_detail_viewed).
   */
  app.get<{ Params: { id: string } }>('/v1/admin/users/:id/detail', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, deps);
    const userId = (request.params as { id: string }).id;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'User not found' } };
    }

    const userMemberships = await db
      .select({
        orgId: memberships.orgId,
        role: memberships.role,
        status: memberships.status,
        createdAt: memberships.createdAt,
        orgName: organizations.name,
        orgPlan: organizations.plan,
        orgStatus: organizations.status,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, userId));

    const orgIds = userMemberships.map((m) => m.orgId);

    const [activeSessions, recentAudit] = await Promise.all([
      db
        .select({
          id: sessions.id,
          createdAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
          ip: sessions.ip,
          userAgent: sessions.userAgent,
        })
        .from(sessions)
        .where(and(eq(sessions.userId, userId), sql`${sessions.revokedAt} is null`))
        .orderBy(desc(sessions.createdAt))
        .limit(10),
      db
        .select({
          action: auditEvents.action,
          outcome: auditEvents.outcome,
          occurredAt: auditEvents.occurredAt,
        })
        .from(auditEvents)
        .where(eq(auditEvents.actorId, userId))
        .orderBy(desc(auditEvents.occurredAt))
        .limit(20),
    ]);

    // Per-org footprint: agents, task counts, goal counts — orientation on
    // what each company this account belongs to is doing, per org.
    // The `building` block adds the business's OWN declared profile (onboarding
    // answers, constitution, imports) and memory composition as COUNTS — the
    // things the business told the platform about itself. Raw company-memory
    // content, task descriptions/results and message bodies stay org-owned.
    const orgFootprint = await Promise.all(
      orgIds.map(async (orgId) => {
        const [agentCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(agents)
          .where(eq(agents.orgId, orgId));
        const [taskCount] = await db
          .select({
            total: sql<number>`count(*)::int`,
            completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
          })
          .from(tasks)
          .where(eq(tasks.orgId, orgId));
        const [goalCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(goals)
          .where(eq(goals.orgId, orgId));
        const [balance] = await db
          .select({
            included: creditBalances.includedCredits,
            purchased: creditBalances.purchasedCredits,
            used: creditBalances.usedCredits,
          })
          .from(creditBalances)
          .where(eq(creditBalances.orgId, orgId))
          .limit(1);
        return {
          orgId,
          agents: agentCount?.count ?? 0,
          tasks: taskCount ?? { total: 0, completed: 0 },
          goals: goalCount?.count ?? 0,
          credits: balance ?? null,
        };
      }),
    );

    // What they're building, in the business's own declared words.
    const building = await Promise.all(
      orgIds.map(async (orgId) => {
        const [onboarding] = await db
          .select({
            step: onboardingStates.step,
            organization: onboardingStates.organization,
            constitution: onboardingStates.constitution,
            completedAt: onboardingStates.completedAt,
          })
          .from(onboardingStates)
          .where(and(eq(onboardingStates.orgId, orgId), eq(onboardingStates.userId, userId)))
          .limit(1);

        const imports = await db
          .select({
            id: businessImports.id,
            websiteUrl: businessImports.websiteUrl,
            websiteTitle: businessImports.websiteTitle,
            websiteSummary: businessImports.websiteSummary,
            description: businessImports.description,
            status: businessImports.status,
            createdAt: businessImports.createdAt,
          })
          .from(businessImports)
          .where(eq(businessImports.orgId, orgId))
          .orderBy(desc(businessImports.createdAt))
          .limit(5);

        const byCategory = await db
          .select({
            category: companyMemory.category,
            count: sql<number>`count(*)::int`,
          })
          .from(companyMemory)
          .where(eq(companyMemory.orgId, orgId))
          .groupBy(companyMemory.category);

        return {
          orgId,
          onboarding: onboarding ?? null,
          imports,
          memory: { byCategory, total: byCategory.reduce((a, m) => a + m.count, 0) },
        };
      }),
    );

    await appendAudit(deps.db, {
      orgId: userMemberships[0]?.orgId ?? admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'admin.user_detail_viewed',
      outcome: 'success',
      resultRef: `admin:${admin.email} → user:${userId}`,
    });

    return {
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          status: user.status,
          platformRole: user.platformRole,
          jobTitle: user.jobTitle,
          timezone: user.timezone,
          emailVerifiedAt: user.emailVerifiedAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        memberships: userMemberships,
        orgFootprint,
        building,
        activeSessions,
        recentAudit,
      },
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

  /**
   * GET /v1/admin/organizations/:id/intel — Organization intelligence snapshot.
   *
   * What the platform operator needs to understand one customer: who they are,
   * what they are building (departments, employees, goals, work volumes), how
   * much of the platform they use (credits, LLM spend), and their recent
   * lifecycle. Counts, structures and metadata only — NEVER memory content,
   * task results or other tenant work product: the operator must be able to
   * operate the platform without reading customers' private material (privacy
   * by design; access is audited either way).
   */
  app.get('/v1/admin/organizations/:id/intel', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, deps);
    const orgId = (request.params as { id: string }).id;

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Organization not found' } };
    }

    const [
      members,
      orgAgents,
      departmentsCount,
      taskStats,
      recentTasks,
      orgGoals,
      activitySamples,
      memoryCounts,
      [credits],
      llmUsage,
      recentAudit,
      decisionsCount,
      sessionsCount,
    ] = await Promise.all([
      db
        .select({
          userId: memberships.userId,
          email: users.email,
          name: users.name,
          role: memberships.role,
          joinedAt: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.orgId, orgId)),
      db
        .select({
          id: agents.id,
          name: agents.name,
          role: agents.role,
          status: agents.status,
          autonomyLevel: agents.autonomyLevel,
          tasksCompleted: agents.tasksCompleted,
          tasksFailed: agents.tasksFailed,
          creditsUsed: agents.creditsUsed,
        })
        .from(agents)
        .where(eq(agents.orgId, orgId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(departments)
        .where(eq(departments.orgId, orgId)),
      db
        .select({
          total: sql<number>`count(*)::int`,
          completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
          failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
          active: sql<number>`count(*) filter (where ${tasks.status} in ('pending','in_progress','awaiting_approval'))::int`,
        })
        .from(tasks)
        .where(eq(tasks.orgId, orgId)),
      // What this company is actually building: the newest task titles.
      // Titles only — descriptions/results can carry private content, and the
      // admin surface needs orientation, not surveillance.
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .where(eq(tasks.orgId, orgId))
        .orderBy(desc(tasks.updatedAt))
        .limit(10),
      // The founder's stated direction: active goals with progress.
      db
        .select({
          id: goals.id,
          title: goals.title,
          status: goals.status,
          progress: goals.progress,
          updatedAt: goals.updatedAt,
        })
        .from(goals)
        .where(eq(goals.orgId, orgId))
        .orderBy(desc(goals.updatedAt))
        .limit(10),
      // How work actually moves: the newest activity-event summaries. These
      // are the system's own one-line records of what agents did.
      db
        .select({
          id: activityEvents.id,
          type: activityEvents.type,
          summary: activityEvents.summary,
          occurredAt: activityEvents.occurredAt,
        })
        .from(activityEvents)
        .where(eq(activityEvents.orgId, orgId))
        .orderBy(desc(activityEvents.occurredAt))
        .limit(10),
      // Category counts only — never content.
      db
        .select({
          category: companyMemory.category,
          count: sql<number>`count(*)::int`,
        })
        .from(companyMemory)
        .where(eq(companyMemory.orgId, orgId))
        .groupBy(companyMemory.category),
      db
        .select()
        .from(creditBalances)
        .where(eq(creditBalances.orgId, orgId))
        .limit(1),
      db
        .select({
          calls: sql<number>`count(*)::int`,
          tokens: sql<number>`coalesce(sum(${llmPerformance.totalTokens}),0)::int`,
          costUsd: sql<number>`coalesce(sum(${llmPerformance.providerCostUsd}),0)::float`,
        })
        .from(llmPerformance)
        .where(eq(llmPerformance.orgId, orgId)),
      db
        .select({
          action: auditEvents.action,
          occurredAt: auditEvents.occurredAt,
          outcome: auditEvents.outcome,
        })
        .from(auditEvents)
        .where(eq(auditEvents.orgId, orgId))
        .orderBy(desc(auditEvents.occurredAt))
        .limit(15),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(decisions)
        .where(eq(decisions.orgId, orgId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sessions)
        .where(and(eq(sessions.orgId, orgId), sql`${sessions.revokedAt} is null`)),
    ]);

    await appendAudit(deps.db, {
      orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'admin.org_intel_viewed',
      outcome: 'success',
      resultRef: `admin:${admin.email} → org:${orgId}`,
    });

    return {
      data: {
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          status: org.status,
          createdAt: org.createdAt,
        },
        members,
        agents: orgAgents,
        departments: departmentsCount[0]?.count ?? 0,
        tasks: taskStats[0] ?? { total: 0, completed: 0, failed: 0, active: 0 },
        recentTasks: recentTasks,
        goals: orgGoals,
        activity: activitySamples,
        memory: {
          byCategory: memoryCounts,
          total: memoryCounts.reduce((a, m) => a + m.count, 0),
        },
        credits: credits
          ? {
              included: credits.includedCredits,
              purchased: credits.purchasedCredits,
              used: credits.usedCredits,
              reserved: credits.reservedCredits,
              remaining: Math.max(0, credits.includedCredits + credits.purchasedCredits - credits.usedCredits),
            }
          : null,
        aiUsage: llmUsage[0] ?? { calls: 0, tokens: 0, costUsd: 0 },
        decisions: decisionsCount[0]?.count ?? 0,
        activeSessions: sessionsCount[0]?.count ?? 0,
        recentAudit: recentAudit,
      },
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

    // LLM fallback chain (docs/22 §22.9): OpenRouter → NVIDIA NIM → LiteLLM → Ollama → structured fallback
    const llmChain = buildProviderChain(deps.config);

    // Aggregate subsystems
    const subsystems = [
      { name: 'Database', status: dbHealthy ? 'operational' : 'degraded', latencyMs: null },
      { name: 'Redis', status: redisHealthy ? 'operational' : 'degraded', latencyMs: null },
      { name: 'API', status: 'operational', latencyMs: null },
      { name: 'Auth', status: 'operational', latencyMs: null },
      { name: 'Agent Execution', status: 'operational', latencyMs: null },
      {
        // Multi-provider chain (docs/22 §22.9): OpenRouter → NVIDIA NIM → LiteLLM → Ollama
        name: 'AI Models',
        status: llmChain.length > 0 ? (llmChain[0]?.id === 'openrouter' ? 'operational' : 'configured') : 'not_configured',
        latencyMs: null,
        detail: llmChain.length > 0 ? llmChain.map((p) => p.label).join(' → ') : 'Set OPENROUTER_API_KEY, NVIDIA_API_KEY, LITELLM_BASE_URL, or OLLAMA_BASE_URL',
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
      weeklyCredits,
      weeklyProviderCost,
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
      // docs/77 P1 §5 — the dashboard's "weekly spend" card read credits and
      // printed them as dollars. `activityEvents.cost` is credits; the USD figure
      // the card claims lives in llm_performance now. Both are returned so the
      // card can show cost and the credits it was earned with.
      db
        .select({ total: sql<number>`coalesce(sum(${llmPerformance.providerCostUsd}), 0)::float8` })
        .from(llmPerformance)
        .where(sql`${llmPerformance.createdAt} >= ${weekAgo}`)
        .catch(() => [{ total: 0 }]),
    ]);

    return {
      data: {
        users: { total: totalUsers[0]?.count ?? 0, newThisWeek: newUsersWeek[0]?.count ?? 0 },
        organizations: { total: totalOrgs[0]?.count ?? 0, active: activeOrgs[0]?.count ?? 0 },
        agents: { total: totalAgents[0]?.count ?? 0, active: activeAgents[0]?.count ?? 0, paused: pausedAgents[0]?.count ?? 0 },
        approvals: { pending: pendingApprovals[0]?.count ?? 0 },
        activity: { thisWeek: weeklyActivity[0]?.count ?? 0 },
        spend: {
          /** Provider spend this week, in USD — the number the card labels. */
          providerCostUsdThisWeek: weeklyProviderCost[0]?.total ?? 0,
          /** Work credits consumed this week (the charge, not the cost). */
          creditsThisWeek: weeklyCredits[0]?.total ?? 0,
        },
      },
    };
  });

  /** GET /v1/admin/providers — Provider health and configuration status with real-time probing. */
  app.get('/v1/admin/providers', async (request) => {
    await requirePlatformAdmin(request, deps);

    const { probeAllProviders } = await import('../services/provider-health.js');
    const healthResult = await probeAllProviders(deps.config);

    // Also get circuit breaker states
    const { getAllCircuitStates } = await import('../services/circuit-breaker.js');
    const circuits = getAllCircuitStates();

    // Merge circuit breaker state into provider results
    const providers = healthResult.providers.map((p) => {
      const circuit = circuits.find((c) => c.providerId === p.slug);
      return {
        ...p,
        circuitBreaker: circuit ? {
          state: circuit.state,
          failureCount: circuit.failureCount,
          cooldownRemainingMs: circuit.cooldownRemainingMs,
        } : null,
      };
    });

    return {
      data: providers,
      summary: healthResult.summary,
    };
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

  /**
   * GET /v1/admin/ai-usage — Platform-wide AI usage, in the units that exist.
   *
   * Rewritten for docs/77 P1 §5. The previous version summed
   * `activity_events.cost` — a **credits** column — and returned it as `costCents`,
   * so the console displayed credits with a dollar sign and no margin was
   * computable. The numbers here come from two different tables on purpose,
   * because they answer two different questions:
   *
   *   spend  (llm_performance) — every call the platform made, including the ones
   *          that failed or were never billed. This is what we paid providers.
   *   billed (credit_transactions) — the credits actually charged for settled
   *          work, and the provider cost those charges carried.
   *
   * Margin needs both: revenue comes from billed credits, and the cost of earning
   * them is what those charges attributed. Spend that never became a charge
   * (infrastructure failures) is reported separately as `unbilled`, never netted
   * into the margin as if it were free.
   */
  app.get('/v1/admin/ai-usage', async (request) => {
    await requirePlatformAdmin(request, deps);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Every LLM call, with its real USD cost. `unknownPricing` counts calls whose
    // model the registry cannot price: their cost is 0 in the sum, and the count
    // is reported beside it so a margin is never read as complete when it is not.
    const callWindow = (since?: Date) =>
      db
        .select({
          calls: sql<number>`count(*)::int`,
          tokens: sql<number>`COALESCE(sum(${llmPerformance.totalTokens}), 0)::int`,
          providerCostUsd: sql<number>`COALESCE(sum(${llmPerformance.providerCostUsd}), 0)::float8`,
          unknownPricingCalls: sql<number>`count(*) filter (where ${llmPerformance.pricingSource} = 'unknown')::int`,
          failedCalls: sql<number>`count(*) filter (where not ${llmPerformance.success})::int`,
        })
        .from(llmPerformance)
        .where(since ? sql`${llmPerformance.createdAt} >= ${since}` : undefined)
        .catch(() => [{ calls: 0, tokens: 0, providerCostUsd: 0, unknownPricingCalls: 0, failedCalls: 0 }]);

    // Settled usage: credits charged and the provider cost those charges carried.
    const billedWindow = (since?: Date) =>
      db
        .select({
          creditsCharged: sql<number>`COALESCE(sum(case when ${creditTransactions.amount} < 0 then -${creditTransactions.amount} else 0 end), 0)::int`,
          providerCostUsd: sql<number>`COALESCE(sum(${creditTransactions.providerCostUsd}), 0)::float8`,
          charges: sql<number>`count(*)::int`,
        })
        .from(creditTransactions)
        .where(
          since
            ? and(eq(creditTransactions.type, 'usage'), sql`${creditTransactions.createdAt} >= ${since}`)
            : eq(creditTransactions.type, 'usage'),
        )
        .catch(() => [{ creditsCharged: 0, providerCostUsd: 0, charges: 0 }]);

    const [weeklyCalls, monthlyCalls, allCalls, weeklyBilled, monthlyBilled, allBilled] = await Promise.all([
      callWindow(weekAgo),
      callWindow(monthAgo),
      callWindow(),
      billedWindow(weekAgo),
      billedWindow(monthAgo),
      billedWindow(),
    ]);

    const byProvider = await db
      .select({
        provider: llmPerformance.provider,
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`COALESCE(sum(${llmPerformance.totalTokens}), 0)::int`,
        providerCostUsd: sql<number>`COALESCE(sum(${llmPerformance.providerCostUsd}), 0)::float8`,
      })
      .from(llmPerformance)
      .where(sql`${llmPerformance.createdAt} >= ${monthAgo}`)
      .groupBy(llmPerformance.provider)
      .orderBy(sql`COALESCE(sum(${llmPerformance.providerCostUsd}), 0) DESC`)
      .limit(12)
      .catch(() => []);

    const byModel = await db
      .select({
        model: llmPerformance.model,
        provider: llmPerformance.provider,
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`COALESCE(sum(${llmPerformance.totalTokens}), 0)::int`,
        providerCostUsd: sql<number>`COALESCE(sum(${llmPerformance.providerCostUsd}), 0)::float8`,
        unknownPricingCalls: sql<number>`count(*) filter (where ${llmPerformance.pricingSource} = 'unknown')::int`,
      })
      .from(llmPerformance)
      .where(sql`${llmPerformance.createdAt} >= ${monthAgo}`)
      .groupBy(llmPerformance.model, llmPerformance.provider)
      .orderBy(sql`COALESCE(sum(${llmPerformance.providerCostUsd}), 0) DESC`)
      .limit(15)
      .catch(() => []);

    const [credits] = await db.select({ total: sql<number>`COALESCE(sum(${creditBalances.includedCredits} + ${creditBalances.purchasedCredits}), 0)::int`, used: sql<number>`COALESCE(sum(${creditBalances.usedCredits}), 0)::int` }).from(creditBalances).catch(() => [{ total: 0, used: 0 }]);
    const [agentStats] = await db.select({ total: sql<number>`count(*)::int`, active: sql<number>`count(*) filter (where ${agents.status} = 'active')::int` }).from(agents).catch(() => [{ total: 0, active: 0 }]);

    const monthlyMargin = computeMargin(monthlyBilled[0]?.creditsCharged ?? 0, monthlyBilled[0]?.providerCostUsd ?? 0);
    const allTimeMargin = computeMargin(allBilled[0]?.creditsCharged ?? 0, allBilled[0]?.providerCostUsd ?? 0);
    const monthlySpend = monthlyCalls[0]?.providerCostUsd ?? 0;

    return {
      data: {
        // Calls, tokens and USD spend — what the platform did and what it cost.
        weekly: {
          calls: weeklyCalls[0]?.calls ?? 0,
          tokens: weeklyCalls[0]?.tokens ?? 0,
          providerCostUsd: weeklyCalls[0]?.providerCostUsd ?? 0,
          creditsCharged: weeklyBilled[0]?.creditsCharged ?? 0,
        },
        monthly: {
          calls: monthlyCalls[0]?.calls ?? 0,
          tokens: monthlyCalls[0]?.tokens ?? 0,
          providerCostUsd: monthlySpend,
          creditsCharged: monthlyBilled[0]?.creditsCharged ?? 0,
        },
        allTime: {
          calls: allCalls[0]?.calls ?? 0,
          tokens: allCalls[0]?.tokens ?? 0,
          providerCostUsd: allCalls[0]?.providerCostUsd ?? 0,
          creditsCharged: allBilled[0]?.creditsCharged ?? 0,
        },
        /** Honesty markers: how much of the cost above is unknown or wasted. */
        spend: {
          providerCostUsd: allCalls[0]?.providerCostUsd ?? 0,
          unknownPricingCalls: allCalls[0]?.unknownPricingCalls ?? 0,
          failedCalls: allCalls[0]?.failedCalls ?? 0,
        },
        /** Revenue basis for the margin below — the rate is stated, not implied. */
        billing: {
          usdPerCredit: USD_PER_CREDIT_REFERENCE,
          rateBasis: CREDIT_RATE_BASIS,
        },
        /** Margin over the last 30 days (the operating view) and all time. */
        margin: {
          monthly: monthlyMargin,
          allTime: allTimeMargin,
          /** Provider spend that never became a charge (failed/unbilled work). */
          monthlyUnbilledProviderCostUsd: Math.max(0, Math.round((monthlySpend - monthlyMargin.providerCostUsd) * 1e8) / 1e8),
        },
        credits: { total: credits?.total ?? 0, used: credits?.used ?? 0 },
        agents: { total: agentStats?.total ?? 0, active: agentStats?.active ?? 0 },
        byProvider,
        byModel,
      },
    };
  });

  /**
   * GET /v1/admin/credits/reconcile — ledger vs balance drift (docs/77 P0).
   *
   * The ledger is the source of truth; `drift` is how far the cached balance has
   * wandered. Non-zero drift means a charge was lost or double-applied — the
   * failure mode that used to be invisible. Without `orgId` it reports every org
   * that currently drifts.
   */
  app.get('/v1/admin/credits/reconcile', async (request) => {
    await requirePlatformAdmin(request, deps);
    const params = request.query as { orgId?: string; limit?: string };
    const { reconcileLedger } = await import('../services/credits.js');

    if (params.orgId) {
      return { data: await reconcileLedger(db, params.orgId) };
    }

    const limit = Math.min(Math.max(Number(params.limit) || 200, 1), 1000);
    const orgs = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .limit(limit);

    const results = [];
    for (const org of orgs) {
      results.push({ name: org.name, ...(await reconcileLedger(db, org.id)) });
    }
    const drifting = results.filter((r) => !r.balanced);
    return {
      data: { checked: results.length, drifting: drifting.length, orgs: drifting },
    };
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

  /** GET /v1/admin/jobs — Background job status, including the agent_jobs
   *  queue (docs/75): counts by status plus recent rows. Platform-admin
   *  gated because the rows span every tenant. */
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
    const agentQueue = await jobsOverview(db, 20).catch(() => ({
      counts: {},
      health: null,
      recent: [],
    }));
    // The fabricated ``jobs`` list this used to return ("Weekly Report
    // Generation — Sunday 00:00 UTC") described schedulers that do not exist.
    // The real queue is what the Commands tab reads, so only real rows are
    // reported from here on.
    return {
      data: {
        dripQueue: { pending: dripPending, sent: dripSent, failed: dripFailed },
        waitlist: { pending: waitlistPending },
        queueMode: deps.config.JOB_QUEUE_MODE,
        agentQueue,
      },
    };
  });

  /**
   * GET /v1/admin/jobs/health — queue depth and worker liveness.
   *
   * Liveness is derived from the queue itself (a running job with a fresh
   * lock), so an idle-but-alive worker and a dead worker are told apart by the
   * last completed job rather than by a heartbeat nothing writes.
   */
  app.get('/v1/admin/jobs/health', async (request) => {
    await requirePlatformAdmin(request, deps);
    const health = await jobsHealth(db);
    return { data: { mode: deps.config.JOB_QUEUE_MODE, ...health } };
  });

  /** GET /v1/admin/jobs/recent — recent jobs with their real task and employee. */
  app.get('/v1/admin/jobs/recent', async (request) => {
    await requirePlatformAdmin(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const jobs = await recentJobsDetailed(db, {
      status: url.searchParams.get('status') ?? undefined,
      type: url.searchParams.get('type') ?? undefined,
      limit: Number(url.searchParams.get('limit') ?? 50),
    });
    return { data: jobs };
  });

  /** GET /v1/admin/jobs/dead-letter — jobs that will not run again on their own. */
  app.get('/v1/admin/jobs/dead-letter', async (request) => {
    await requirePlatformAdmin(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const jobs = await deadLetterJobs(db, Number(url.searchParams.get('limit') ?? 50));
    return { data: jobs };
  });

  /**
   * POST /v1/admin/jobs/:id/retry — requeue a dead-lettered job.
   *
   * The retry is audited with the job's prior state so the trail answers "who
   * asked for this to run again, and what was it the first time".
   */
  app.post<{ Params: { id: string } }>('/v1/admin/jobs/:id/retry', async (request, reply) => {
    const ctx = await requirePlatformAdmin(request, deps);
    const outcome = await retryJob(db, request.params.id);

    if (!outcome.ok) {
      reply.code(outcome.status);
      return {
        error: {
          code: outcome.status === 404 ? 'job.not_found' : 'job.not_retryable',
          message: outcome.reason,
        },
      };
    }

    await appendAudit(db, {
      orgId: outcome.job.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'job.retry_requested',
      tool: 'admin-commands',
      outcome: 'success',
      inputRef: JSON.stringify({
        jobId: outcome.job.id,
        jobType: outcome.job.type,
        taskId: outcome.job.taskId,
        previousStatus: outcome.previous.status,
        previousAttempts: outcome.previous.attempts,
        previousError: outcome.previous.lastError?.slice(0, 500) ?? null,
      }),
    }).catch(() => undefined);

    return {
      data: {
        job: outcome.job,
        previous: {
          status: outcome.previous.status,
          attempts: outcome.previous.attempts,
        },
        requeued: true,
      },
    };
  });

  // ── ADMIN EXECUTIVE AGENT (read-only) ──
  //
  // The founder's admin console needs its own Executive Agent: it answers
  // questions about the platform and its customers from live platform data —
  // account metadata, declared business profile, operational counters, audit
  // trail. Design boundary: it is STRICTLY read-only, every intent is
  // deterministic (explainable, testable, no model in the loop, no cost), and
  // it never exposes customer memory content, task results or message bodies.
  // Every command is audited.

  /** Shared platform snapshot for both the brief endpoint and the `stats` intent. */
  async function adminPlatformSnapshot() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      [usersTotal],
      [usersActive],
      [orgsTotal],
      [agentsTotal],
      [agentsActive],
      [pendingApprovals],
      [sessionsActive],
      [aiCalls24h],
      [cost24h],
      [denied24h],
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.status, 'active')),
      db.select({ count: sql<number>`count(*)::int` }).from(organizations),
      db.select({ count: sql<number>`count(*)::int` }).from(agents),
      db.select({ count: sql<number>`count(*)::int` }).from(agents).where(eq(agents.status, 'active')),
      db.select({ count: sql<number>`count(*)::int` }).from(approvals).where(eq(approvals.status, 'pending')),
      db.select({ count: sql<number>`count(*)::int` }).from(sessions).where(sql`${sessions.revokedAt} IS NULL AND ${sessions.expiresAt} > NOW()`),
      db.select({ count: sql<number>`count(*)::int` }).from(llmPerformance).where(sql`${llmPerformance.createdAt} >= ${dayAgo}`),
      db.select({ cost: sql<number>`coalesce(sum(${llmPerformance.providerCostUsd}),0)::float` }).from(llmPerformance).where(sql`${llmPerformance.createdAt} >= ${dayAgo}`),
      db.select({ count: sql<number>`count(*)::int` }).from(auditEvents).where(sql`${auditEvents.outcome} = 'denied' AND ${auditEvents.occurredAt} >= ${dayAgo}`),
    ]);
    return {
      users: { total: usersTotal?.count ?? 0, active: usersActive?.count ?? 0 },
      orgs: orgsTotal?.count ?? 0,
      agents: { total: agentsTotal?.count ?? 0, active: agentsActive?.count ?? 0 },
      pendingApprovals: pendingApprovals?.count ?? 0,
      activeSessions: sessionsActive?.count ?? 0,
      last24h: { aiCalls: aiCalls24h?.count ?? 0, providerCostUsd: cost24h?.cost ?? 0, deniedEvents: denied24h?.count ?? 0 },
    };
  }

  /** GET /v1/admin/ea/brief — the admin EA's one-call platform snapshot. */
  app.get('/v1/admin/ea/brief', async (request) => {
    await requirePlatformAdmin(request, deps);
    return { data: await adminPlatformSnapshot() };
  });

  /**
   * POST /v1/admin/ea/command — the admin EA. Deterministic, read-only intents:
   *   `stats` — platform totals + last-24h activity
   *   `user <email or name fragment>` — account summary
   *   `org <name or slug fragment>` — organization summary
   *   `recent` — the latest audit actions across tenants
   * Anything else returns the capability list.
   */
  app.post('/v1/admin/ea/command', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, deps);
    const parsed = z.object({ command: z.string().trim().min(1).max(300) }).safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: 'validation', message: 'command is required (max 300 chars)' } };
    }
    const command = parsed.data.command;

    let intent = 'help';
    let answer = '';
    const facts: Record<string, string | number> = {};

    const lower = command.toLowerCase();
    if (/^(stats|brief|platform stats|overview)\b/.test(lower)) {
      intent = 'stats';
      const s = await adminPlatformSnapshot();
      answer =
        `${s.users.total} account(s) (${s.users.active} active), ${s.orgs} organization(s), ` +
        `${s.agents.total} AI employee(s) (${s.agents.active} active). ` +
        `${s.pendingApprovals} approval(s) waiting, ${s.activeSessions} active session(s). ` +
        `Last 24h: ${s.last24h.aiCalls} AI calls ($${s.last24h.providerCostUsd.toFixed(4)} provider cost), ` +
        `${s.last24h.deniedEvents} denied events.`;
      facts.usersTotal = s.users.total;
      facts.usersActive = s.users.active;
      facts.orgs = s.orgs;
      facts.agentsTotal = s.agents.total;
      facts.agentsActive = s.agents.active;
      facts.pendingApprovals = s.pendingApprovals;
      facts.aiCalls24h = s.last24h.aiCalls;
      facts.providerCost24h = Number(s.last24h.providerCostUsd.toFixed(4));
      facts.deniedEvents24h = s.last24h.deniedEvents;
    } else if (/^user\b/.test(lower)) {
      intent = 'user';
      const q = command.replace(/^user\s*/i, '').trim();
      if (q.length === 0) {
        answer = 'Give me an email or a name fragment: "user demo@orq8.test".';
      } else {
        const frag = `%${q}%`;
        const [user] = await db
          .select({ id: users.id, email: users.email, name: users.name, status: users.status, platformRole: users.platformRole, createdAt: users.createdAt })
          .from(users)
          .where(sql`${users.email} ILIKE ${frag} OR ${users.name} ILIKE ${frag}`)
          .orderBy(desc(users.createdAt))
          .limit(1);
        if (!user) {
          answer = `No account matches "${q}".`;
        } else {
          const mems = await db
            .select({ orgName: organizations.name, role: memberships.role, orgPlan: organizations.plan })
            .from(memberships)
            .innerJoin(organizations, eq(organizations.id, memberships.orgId))
            .where(eq(memberships.userId, user.id));
          answer =
            `${user.name || user.email} (${user.email}) — status ${user.status}, ` +
            `platform role ${user.platformRole ?? 'user'}, registered ${user.createdAt.toISOString().slice(0, 10)}. ` +
            (mems.length > 0
              ? `Organizations: ${mems.map((m) => `${m.orgName} (${m.role}, ${m.orgPlan})`).join('; ')}.`
              : 'No organization memberships.');
          facts.email = user.email;
          facts.status = user.status;
          facts.platformRole = user.platformRole ?? 'user';
          facts.orgs = mems.length;
        }
      }
    } else if (/^org(anization)?\b/.test(lower)) {
      intent = 'org';
      const q = command.replace(/^organization?\s*/i, '').trim();
      if (q.length === 0) {
        answer = 'Give me an organization name or slug: "org oddly".';
      } else {
        const frag = `%${q}%`;
        const [org] = await db
          .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, plan: organizations.plan, status: organizations.status, createdAt: organizations.createdAt })
          .from(organizations)
          .where(sql`${organizations.name} ILIKE ${frag} OR ${organizations.slug} ILIKE ${frag}`)
          .orderBy(desc(organizations.createdAt))
          .limit(1);
        if (!org) {
          answer = `No organization matches "${q}".`;
        } else {
          const [agentCount] = await db.select({ count: sql<number>`count(*)::int` }).from(agents).where(eq(agents.orgId, org.id));
          const [taskStats] = await db
            .select({
              total: sql<number>`count(*)::int`,
              completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
            })
            .from(tasks)
            .where(eq(tasks.orgId, org.id));
          const [credits] = await db
            .select({ used: creditBalances.usedCredits })
            .from(creditBalances)
            .where(eq(creditBalances.orgId, org.id))
            .limit(1);
          answer =
            `${org.name} (${org.slug}) — plan ${org.plan}, status ${org.status}, created ${org.createdAt.toISOString().slice(0, 10)}. ` +
            `${agentCount?.count ?? 0} AI employee(s); ${taskStats?.total ?? 0} tasks (${taskStats?.completed ?? 0} completed); ` +
            `${credits?.used ?? 0} credits used.`;
          facts.name = org.name;
          facts.plan = org.plan;
          facts.agents = agentCount?.count ?? 0;
          facts.tasks = taskStats?.total ?? 0;
          facts.creditsUsed = credits?.used ?? 0;
        }
      }
    } else if (/^recent\b/.test(lower)) {
      intent = 'recent';
      const rows = await db
        .select({ action: auditEvents.action, outcome: auditEvents.outcome, occurredAt: auditEvents.occurredAt, orgId: auditEvents.orgId })
        .from(auditEvents)
        .orderBy(desc(auditEvents.occurredAt))
        .limit(15);
      answer = rows.length > 0
        ? `Latest ${rows.length} audit actions: ${rows.map((r) => `${r.action} (${r.outcome})`).join(', ')}.`
        : 'No audit events yet.';
      facts.count = rows.length;
    } else {
      answer =
        'I can answer from live platform data: "stats" (platform snapshot), ' +
        '"user <email or name>" (account summary), "org <name or slug>" (organization summary), ' +
        '"recent" (latest audit actions). I am read-only and every command is audited.';
    }

    await appendAudit(deps.db, {
      orgId: admin.orgId,
      actorType: 'user',
      actorId: admin.userId,
      action: 'admin.ea_command',
      tool: 'admin-assistant',
      outcome: 'success',
      inputRef: command.slice(0, 300),
      resultRef: `intent:${intent}`,
    }).catch(() => undefined);

    return { data: { intent, answer, facts } };
  });
}
