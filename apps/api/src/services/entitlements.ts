/**
 * Central Entitlement Engine
 *
 * Every resource creation limit reads from ONE source: the plan config in
 * services/billing (PLANS / TRIAL_CAPS), resolved against the org's stored
 * subscription row (stored max_agents is an override, so legacy subscriptions
 * keep their granted capacity). Counts are computed server-side here; the UI,
 * agents, departments, teams, integrations and MCP all call this engine —
 * limits are never a frontend concern.
 *
 * Resources: agents | departments | teams | connectors | mcp
 * Semantic: limit 0 = unlimited. Archived agents do not consume the agent
 * quota; archived teams/departments do not consume theirs.
 */
import { eq, and, notInArray, sql } from 'drizzle-orm';
import { agents, departments, teams, integrationProviders, mcpServers, subscriptions, type Db } from '@orq8/db';
import { forbidden } from '@orq8/core';
import { PLANS, TRIAL_CAPS } from './billing.js';

/** Providers whose MCP rows are connector catalogs, not custom MCP servers. */
const CONNECTOR_PROVIDERS = ['github', 'gmail', 'linear'] as const;

export type EntitlementResource = 'agents' | 'departments' | 'teams' | 'connectors' | 'mcp';

export interface ResourceUsage {
  resource: EntitlementResource;
  label: string;
  limit: number; // 0 = unlimited
  used: number;
  remaining: number | null; // null when unlimited
  reached: boolean;
}

export interface Entitlements {
  plan: string;
  planName: string;
  trial: boolean;
  maxAgents: number;
  autonomy: string;
  resources: ResourceUsage[];
}

export interface ResolvedCaps {
  maxAgents: number;
  departments: number;
  teams: number;
  connectors: number;
  mcpServers: number;
  autonomy: string;
}

const PLAN_CAPS = new Map<string, { departments: number; teams: number; connectors: number; mcpServers: number; autonomy: string }>();
for (const [planId, cfg] of Object.entries(PLANS)) {
  PLAN_CAPS.set(planId, {
    departments: cfg.departments,
    teams: cfg.teams,
    connectors: cfg.connectors,
    mcpServers: cfg.mcpServers,
    autonomy: cfg.autonomy,
  });
}

/**
 * Caps for an org. Known plans use their table; a stored subscription
 * maxAgents is honored as an override (legacy rows keep their grant). Unknown
 * plans (e.g. enterprise/custom) are treated as effectively unlimited for the
 * structured resources while honoring any stored agent cap.
 */
export function resolveCaps(plan: string | undefined, storedMaxAgents: number | null | undefined): ResolvedCaps {
  const configured = plan ? PLAN_CAPS.get(plan) : undefined;
  if (configured) {
    return {
      maxAgents: storedMaxAgents ?? PLANS[plan!]!.maxAgents,
      departments: configured.departments,
      teams: configured.teams,
      connectors: configured.connectors,
      mcpServers: configured.mcpServers,
      autonomy: configured.autonomy,
    };
  }
  if (plan === 'enterprise') {
    // Enterprise/custom: no hard structured caps unless a stored agent cap exists.
    return {
      maxAgents: storedMaxAgents ?? 250,
      departments: 0,
      teams: 0,
      connectors: 0,
      mcpServers: 0,
      autonomy: 'autonomous',
    };
  }
  // Trial / no subscription.
  return {
    maxAgents: storedMaxAgents ?? TRIAL_CAPS.maxAgents,
    departments: TRIAL_CAPS.departments,
    teams: TRIAL_CAPS.teams,
    connectors: TRIAL_CAPS.connectors,
    mcpServers: TRIAL_CAPS.mcpServers,
    autonomy: TRIAL_CAPS.autonomy,
  };
}

/** Find the org's subscription row (mirrors billing.getPlanLimits behavior). */
export async function resolvePlanRow(db: Db, orgId: string): Promise<{ plan: string; storedMaxAgents: number | null; planName: string }> {
  try {
    const rows = await db
      .select({ plan: subscriptions.plan, maxAgents: subscriptions.maxAgents })
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .limit(1);
    const sub = rows[0];
    if (!sub) return { plan: 'trial', storedMaxAgents: null, planName: 'Trial' };
    return {
      plan: sub.plan,
      storedMaxAgents: sub.maxAgents ?? null,
      planName: PLANS[sub.plan]?.name ?? 'Custom',
    };
  } catch {
    return { plan: 'trial', storedMaxAgents: null, planName: 'Trial' };
  }
}

export async function getCaps(db: Db, orgId: string): Promise<ResolvedCaps> {
  const row = await resolvePlanRow(db, orgId);
  return resolveCaps(row.plan, row.storedMaxAgents);
}

async function countRows(
  db: Db,
  orgId: string,
  kind: EntitlementResource,
): Promise<number> {
  if (kind === 'agents') {
    const r = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(agents)
      .where(and(eq(agents.orgId, orgId), notInArray(agents.status, ['archived'])));
    return r[0]?.c ?? 0;
  }
  if (kind === 'departments') {
    const r = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(departments)
      .where(and(eq(departments.orgId, orgId), eq(departments.status, 'active')));
    return r[0]?.c ?? 0;
  }
  if (kind === 'teams') {
    const r = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(teams)
      .where(and(eq(teams.orgId, orgId), eq(teams.status, 'active')));
    return r[0]?.c ?? 0;
  }
  if (kind === 'connectors') {
    // Anything that has left the pristine disconnected state occupies a slot.
    const r = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(integrationProviders)
      .where(and(eq(integrationProviders.orgId, orgId), sql`${integrationProviders.status} <> 'disconnected'`));
    return r[0]?.c ?? 0;
  }
  // mcp — custom (non-connector) servers consume the MCP quota; the three
  // connector catalogs are bounded by the connectors cap instead.
  const r = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(mcpServers)
    .where(and(eq(mcpServers.orgId, orgId), sql`${mcpServers.provider} NOT IN ('github','gmail','linear')`));
  return r[0]?.c ?? 0;
}

const RESOURCE_LABELS: Record<EntitlementResource, string> = {
  agents: 'AI employees',
  departments: 'departments',
  teams: 'teams',
  connectors: 'connector integrations',
  mcp: 'custom MCP servers',
};

function capValue(caps: ResolvedCaps, resource: EntitlementResource): number {
  switch (resource) {
    case 'agents': return caps.maxAgents;
    case 'departments': return caps.departments;
    case 'teams': return caps.teams;
    case 'connectors': return caps.connectors;
    case 'mcp': return caps.mcpServers;
  }
}

/** Full usage + limit matrix for an org — powers /v1/entitlements and the UI. */
export async function getEntitlements(db: Db, orgId: string): Promise<Entitlements> {
  const row = await resolvePlanRow(db, orgId);
  const caps = resolveCaps(row.plan, row.storedMaxAgents);
  const kinds: EntitlementResource[] = ['agents', 'departments', 'teams', 'connectors', 'mcp'];
  const counts = await Promise.all(kinds.map((k) => countRows(db, orgId, k)));
  const resources: ResourceUsage[] = kinds.map((k, i) => {
    const limit = capValue(caps, k);
    const used = counts[i]!;
    return {
      resource: k,
      label: RESOURCE_LABELS[k],
      limit,
      used,
      remaining: limit === 0 ? null : Math.max(0, limit - used),
      reached: limit > 0 && used >= limit,
    };
  });
  return {
    plan: row.plan,
    planName: row.planName,
    trial: row.plan === 'trial',
    maxAgents: caps.maxAgents,
    autonomy: caps.autonomy,
    resources,
  };
}

/**
 * Server-side enforcement: throw a clear 403 (with usage + upgrade path) when
 * the org has no capacity for another resource. Used by agents, departments,
 * teams, integrations and MCP creation — never only the frontend.
 */
export async function enforceResourceLimit(db: Db, orgId: string, resource: EntitlementResource): Promise<void> {
  const caps = await getCaps(db, orgId);
  const limit = capValue(caps, resource);
  if (limit <= 0) return; // unlimited
  const used = await countRows(db, orgId, resource);
  if (used >= limit) {
    const row = await resolvePlanRow(db, orgId);
    const label = RESOURCE_LABELS[resource];
    throw forbidden(
      `Your ${row.planName} plan allows ${limit} ${label} and you currently have ${used}. ` +
        `Archive inactive ${label} to free capacity, or upgrade your plan.`,
    );
  }
}

/** Helper for route handlers that build a usage payload from a plan label. */
export async function usageForResource(db: Db, orgId: string, resource: EntitlementResource): Promise<{ used: number; limit: number }> {
  const caps = await getCaps(db, orgId);
  const limit = capValue(caps, resource);
  return { used: await countRows(db, orgId, resource), limit };
}
