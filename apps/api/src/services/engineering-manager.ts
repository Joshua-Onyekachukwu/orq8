/**
 * Engineering Manager loop.
 *
 * Turns an engineering request (from the Executive Agent or a founder) into an
 * organized plan: search the capability registry first (build-vs-buy), assemble
 * a team from the org's real seeded engineering positions, then create
 * executable tasks with acceptance criteria. Results are reported back in a
 * structured summary so the Executive Agent never has to read raw task rows.
 *
 * Idempotent: the same request (by explicit requestId or content fingerprint)
 * returns the existing plan instead of duplicating tasks.
 */
import { eq, desc, and, ilike } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { companyMemory, tasks, type Db } from '@orq8/db';
import { findByOrg } from './agents.js';
import { searchCapabilities } from './capability-registry.js';
import type { CapabilityEntry } from '@orq8/db';
import { createMemory } from './memory.js';
import { appendAudit } from './audit.js';

/** Engineering positions the Company Builder seeds (Startup full + lean teams). */
export const ENGINEERING_ROLE_HINTS = [
  'engineering manager',
  'software architect',
  'architect',
  'backend engineer',
  'frontend engineer',
  'full-stack engineer',
  'full stack engineer',
  'qa engineer',
  'devops',
  'security engineer',
] as const;

export interface EngineeringPlanRequest {
  objective: string;
  description?: string;
  constraints?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  requestId?: string;
}

export interface PlannedTask {
  title: string;
  description: string;
  assignedRole: string;
  agentId: string | null;
  agentName: string | null;
  priority: string;
}

export interface EngineeringPlan {
  requestId: string;
  objective: string;
  description: string | null;
  constraints: string | null;
  priority: string;
  alreadyPlanned: boolean;
  capabilitiesReused: Array<{ name: string; description: string | null; category: string }>;
  capabilityGaps: string[]; // keywords in the request with no registry match
  team: Array<{ agentId: string; name: string; role: string; department: string | null; capabilities: string[] }>;
  tasks: PlannedTask[];
  report: string;
}

/** Stable fingerprint for a request — the idempotency key. */
export function fingerprintRequest(orgId: string, input: EngineeringPlanRequest): string {
  const key = input.requestId?.trim() || `${input.objective.trim()}|${input.description?.trim() ?? ''}`;
  return createHash('sha256').update(`${orgId}:engineering:${key}`).digest('hex').slice(0, 24);
}

/**
 * Select the minimal engineering team from the org's real seeded positions.
 * Pure + deterministic: only roles matching the objective's intent are chosen,
 * falling back to the Engineering Manager + full-stack when unclear.
 */
export function selectEngineeringTeam(
  agents: Array<{ id: string; name: string; role: string; department: string | null; capabilities?: string[] }>,
  objective: string,
): Array<{ agentId: string; name: string; role: string; department: string | null; capabilities: string[] }> {
  const text = objective.toLowerCase();
  const engineering = agents.filter(
    (a) =>
      (a.department ?? '').toLowerCase().includes('engineer') ||
      ENGINEERING_ROLE_HINTS.some((h) => (a.role ?? '').toLowerCase().includes(h)),
  );
  if (engineering.length === 0) return [];

  const cap = (a: { capabilities?: string[] }) => (Array.isArray(a.capabilities) ? (a.capabilities as string[]) : []);

  const wants = (needles: string[]) => needles.some((n) => text.includes(n));
  const pick = (hint: string) => engineering.find((a) => (a.role ?? '').toLowerCase().includes(hint));

  const chosen: typeof engineering = [];
  const add = (a: (typeof engineering)[number] | undefined) => {
    if (a && !chosen.some((c) => c.id === a.id)) chosen.push(a);
  };

  const manager = pick('manager');
  add(manager ?? (engineering.find((a) => ENGINEERING_ROLE_HINTS.includes((a.role ?? '').toLowerCase() as never)) ?? engineering[0]));

  if (wants(['frontend', 'ui', 'interface', 'dashboard', 'page'])) add(pick('frontend'));
  if (wants(['backend', 'api', 'database', 'server', 'integration', 'webhook', 'rls', 'auth', 'schema', 'migration'])) add(pick('backend'));
  if (wants(['architecture', 'design', 'refactor', 'architecture plan'])) add(pick('architect'));
  if (wants(['qa', 'test', 'quality', 'verification', 'regression'])) add(pick('qa'));
  if (wants(['deploy', 'devops', 'infrastructure', 'ci', 'cd', 'monitoring', 'production'])) add(pick('devops') ?? pick('security'));
  if (wants(['security', 'oauth', 'permission', 'rls', 'secret'])) add(pick('security') ?? pick('backend'));
  if (chosen.length < 2 && !wants(['frontend', 'backend', 'api', 'database', 'ui'])) add(pick('full-stack') ?? engineering.find((a) => (a.role ?? '').toLowerCase().includes('full')));

  // Guarantee at least a doer beyond the manager when one exists.
  if (chosen.length === 1) {
    const others = engineering.filter((a) => a.id !== chosen[0]!.id);
    if (others.length > 0) chosen.push(others[0]!);
  }

  return chosen.map((a) => ({
    agentId: a.id,
    name: a.name,
    role: a.role,
    department: a.department,
    capabilities: cap(a),
  }));
}

/** Derive per-role task drafts from the request — deterministic, testable. */
export function draftPlanTasks(
  team: Array<{ agentId: string; name: string; role: string }>,
  input: EngineeringPlanRequest,
  priority: string,
): PlannedTask[] {
  const base = input.objective.trim();
  const detail = input.description?.trim() ? ` ${input.description.trim()}` : '';
  const constraints = input.constraints?.trim();

  const roleTask = (role: string, verb: string): PlannedTask => {
    const member = team.find((m) => (m.role ?? '').toLowerCase().includes(role.toLowerCase()));
    const fallback = team.find((m) => !(m.role ?? '').toLowerCase().includes('manager'));
    const assignee = member ?? fallback;
    return {
      title: `${verb}: ${base}`,
      description: [
        `Objective: ${base}.${detail}`,
        `Acceptance criteria: the ${role.toLowerCase()} completes "${base}" to the definition described above; work is verified with typecheck and tests before a PR is opened; the PR includes a risk assessment and diff summary.`,
        constraints ? `Constraints: ${constraints}` : undefined,
        `Assigned role: ${role}.`,
      ].filter(Boolean).join(' '),
      assignedRole: role,
      agentId: assignee?.agentId ?? null,
      agentName: assignee?.name ?? null,
      priority,
    };
  };

  const tasks: PlannedTask[] = [];
  const lower = input.objective.toLowerCase();
  const wants = (needles: string[]) => needles.some((n) => lower.includes(n));
  const roles = team.map((t) => t.role.toLowerCase());

  if (roles.some((r) => r.includes('architect'))) tasks.push(roleTask('architect', 'Architecture plan'));
  if (wants(['database', 'schema', 'migration', 'rls', 'api', 'backend', 'webhook', 'integration'])) {
    if (roles.some((r) => r.includes('backend'))) tasks.push(roleTask('backend', 'Backend implementation'));
  } else if (roles.some((r) => r.includes('full-stack')) || roles.some((r) => r.includes('frontend'))) {
    tasks.push(roleTask(roles.some((r) => r.includes('frontend')) ? 'frontend' : 'full-stack', 'Implementation'));
  } else if (roles.some((r) => r.includes('full'))) {
    tasks.push(roleTask('full-stack', 'Implementation'));
  }
  if (roles.some((r) => r.includes('qa'))) tasks.push(roleTask('qa', 'QA verification'));
  if (roles.some((r) => r.includes('security'))) tasks.push(roleTask('security', 'Security review'));
  if (roles.some((r) => r.includes('devops'))) tasks.push(roleTask('devops', 'Deployment preparation'));

  if (tasks.length === 0) tasks.push(roleTask('full-stack', 'Implementation'));
  return tasks;
}

/** Keywords that produced no registry hit — reported as capability gaps. */
export function capabilityGapKeywords(objective: string, matches: CapabilityEntry[]): string[] {
  const words = (objective ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const haystack = matches.map((m) => `${m.name} ${m.description ?? ''}`.toLowerCase());
  return [...new Set(words)].filter((w) => !haystack.some((h) => h.includes(w))).slice(0, 6);
}

/**
 * Plan an engineering request end-to-end. Idempotent per request fingerprint —
 * a retried request returns the existing plan instead of creating new tasks.
 */
export async function planEngineeringRequest(
  db: Db,
  orgId: string,
  userId: string,
  input: EngineeringPlanRequest,
): Promise<EngineeringPlan> {
  const requestId = fingerprintRequest(orgId, input);
  const priority = input.priority ?? 'normal';

  // Idempotency guard: look up the plan marker written on success.
  const [existing] = await db
    .select({ content: companyMemory.content, createdAt: companyMemory.createdAt })
    .from(companyMemory)
    .where(and(eq(companyMemory.orgId, orgId), eq(companyMemory.source, `engineering_manager:${requestId}`)))
    .limit(1);

  if (existing) {
    try {
      return { ...(JSON.parse(existing.content) as Omit<EngineeringPlan, 'alreadyPlanned'>), alreadyPlanned: true };
    } catch {
      // Corrupt marker — fall through and re-plan.
    }
  }

  // 1. Search the capability registry (build-vs-buy) before creating work.
  const registryMatches: CapabilityEntry[] = [];
  const queries = [input.objective, input.description ?? ''].map((q) => q.trim()).filter((q) => q.length > 0);
  for (const q of queries.slice(0, 2)) {
    const found = await searchCapabilities(db, orgId, q);
    for (const entry of found) {
      if (!registryMatches.some((m) => m.id === entry.id)) registryMatches.push(entry);
      if (registryMatches.length >= 8) break;
    }
    if (registryMatches.length >= 8) break;
  }
  const gaps = capabilityGapKeywords(input.objective, registryMatches);

  // 2. Assemble the team from the org's real engineering positions.
  const allAgents = await findByOrg(db, orgId, { limit: 500 });
  const typedAgents = allAgents.map((a) => ({
    id: String(a.id),
    name: String(a.name),
    role: String(a.role),
    department: a.department ? String(a.department) : null,
    capabilities: Array.isArray(a.capabilities) ? (a.capabilities as string[]) : [],
  }));
  const team = selectEngineeringTeam(typedAgents, input.objective);

  // 3. Create executable tasks with acceptance criteria.
  const drafts = draftPlanTasks(team, input, priority);
  const plannedTasks: PlannedTask[] = [];
  for (const draft of drafts) {
    if (!draft.agentId) continue;
    const inserted = await db
      .insert(tasks)
      .values({
        orgId,
        agentId: draft.agentId,
        title: draft.title.slice(0, 200),
        description: draft.description,
        status: 'pending',
        priority,
      })
      .returning({ id: tasks.id });
    plannedTasks.push({ ...draft, description: draft.description, agentId: inserted[0]?.id ? draft.agentId : draft.agentId });
    void inserted;
  }

  const report = [
    `Engineering request received: "${input.objective}" (priority: ${priority}).`,
    `Capability registry: ${registryMatches.length > 0 ? `${registryMatches.length} reusable capability/capabilities found (${registryMatches.slice(0, 4).map((m) => m.name).join(', ')})` : 'no reusable capability found'}.`,
    gaps.length > 0 ? `Capability gaps to build: ${gaps.join(', ')}.` : 'No obvious capability gaps — check the registry before starting.',
    team.length > 0 ? `Team assembled: ${team.map((t) => `${t.name} (${t.role})`).join(', ')}.` : 'No engineering AI employees exist yet — seed a playbook or hire engineering roles first.',
    `Tasks created: ${plannedTasks.length}. Each task carries acceptance criteria and is assigned to a role.`,
    plannedTasks.length === 0 ? 'BLOCKER: no tasks could be created (no engineering agent available to assign).' : 'Awaiting execution; Engineering Manager will coordinate and report after completion.',
  ].join('\n');

  const plan: EngineeringPlan = {
    requestId,
    objective: input.objective,
    description: input.description ?? null,
    constraints: input.constraints ?? null,
    priority,
    alreadyPlanned: false,
    capabilitiesReused: registryMatches.map((m) => ({ name: m.name, description: m.description, category: m.category })),
    capabilityGaps: gaps,
    team: team.map((t) => ({ agentId: t.agentId, name: t.name, role: t.role, department: t.department, capabilities: t.capabilities })),
    tasks: plannedTasks.map((t) => ({ ...t })),
    report,
  };

  // Persist the plan marker (idempotency + observability) on success.
  try {
    // JSON marker doubles as the idempotency record.
    await createMemory(db, {
      orgId,
      category: 'context',
      content: JSON.stringify(plan),
      importance: 7,
      source: `engineering_manager:${requestId}`,
    });
    await createMemory(db, {
      orgId,
      category: 'workflow',
      content: `Engineering plan: ${input.objective} — ${plannedTasks.length} tasks, team: ${team.map((t) => t.name).join(', ') || 'none'}, capabilities reused: ${registryMatches.length}, gaps: ${gaps.join(', ') || 'none'}.`,
      importance: 7,
      source: `em_workflow:${requestId}`,
      agentId: team[0]?.agentId ?? null,
    });
  } catch {
    // Non-fatal: plan is still returned to the caller.
  }

  try {
    await appendAudit(db, {
      orgId,
      actorType: 'user',
      actorId: userId,
      action: 'engineering_manager.planned',
      outcome: 'success',
      resultRef: `${requestId} — tasks:${plannedTasks.length};team:${team.length};capabilities:${registryMatches.length}`,
    });
  } catch {
    // Non-fatal.
  }

  return plan;
}

/** Recent engineering plans for founder visibility (from plan markers). */
export async function recentPlans(db: Db, orgId: string, limit = 10): Promise<Array<{ requestId: string; objective: string; createdAt: Date; summary: string }>> {
  const rows = await db
    .select({ source: companyMemory.source, content: companyMemory.content, createdAt: companyMemory.createdAt })
    .from(companyMemory)
    .where(and(eq(companyMemory.orgId, orgId), ilike(companyMemory.source, 'engineering_manager:%')))
    .orderBy(desc(companyMemory.createdAt))
    .limit(limit);
  return rows.map((r) => {
    try {
      const parsed = JSON.parse(r.content) as EngineeringPlan;
      return { requestId: parsed.requestId, objective: parsed.objective, createdAt: r.createdAt, summary: parsed.report.split('\n')[0] ?? '' };
    } catch {
      return { requestId: (r.source ?? '').replace('engineering_manager:', ''), objective: r.content.slice(0, 120), createdAt: r.createdAt, summary: '' };
    }
  });
}