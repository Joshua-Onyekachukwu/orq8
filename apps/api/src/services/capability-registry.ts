/**
 * Capability Registry — the "search before building" layer.
 *
 * Answers "do we already have something that can do this?" for the Executive
 * Agent and Engineering Manager. Every company gets built-in entries seeded
 * from the connector actions and agent roles it actually has; engineering
 * completions register new reusable capabilities (source: engineering) so the
 * registry compounds as the company operates.
 */
import { eq, and, or, ilike } from 'drizzle-orm';
import { capabilityRegistry, type Db, type CapabilityEntry, type NewCapabilityEntry } from '@orq8/db';
import { appendAudit } from './audit.js';

/** Built-in capabilities every org starts with (connector-backed + core agents). */
export const BUILTIN_CAPABILITIES: Array<Omit<NewCapabilityEntry, 'orgId'>> = [
  { name: 'github.read_repositories', description: 'List GitHub repositories the account can access.', category: 'connector', provider: 'github', capability: 'read_repositories', location: 'connector-actions', reusable: true, status: 'available', source: 'builtin' },
  { name: 'github.read_issues', description: 'Read GitHub issues.', category: 'connector', provider: 'github', capability: 'read_issues', location: 'connector-actions', reusable: true, status: 'available', source: 'builtin' },
  { name: 'github.create_issues', description: 'Create GitHub issues (approval-gated).', category: 'connector', provider: 'github', capability: 'create_issues', location: 'connector-actions', reusable: true, status: 'available', source: 'builtin' },
  { name: 'github.create_pull_requests', description: 'Open GitHub pull requests (approval-gated).', category: 'connector', provider: 'github', capability: 'create_pull_requests', location: 'connector-actions', reusable: true, status: 'available', source: 'builtin' },
  { name: 'gmail.search', description: 'Search connected Gmail.', category: 'connector', provider: 'gmail', capability: 'gmail.search', location: 'connector-gmail', reusable: true, status: 'available', source: 'builtin' },
  { name: 'gmail.create_draft', description: 'Create Gmail drafts (never sends).', category: 'connector', provider: 'gmail', capability: 'gmail.create_draft', location: 'connector-gmail', reusable: true, status: 'available', source: 'builtin' },
  { name: 'gmail.send', description: 'Send Gmail drafts (approval-gated, high risk).', category: 'connector', provider: 'gmail', capability: 'gmail.send', location: 'connector-gmail', reusable: true, status: 'available', source: 'builtin' },
  { name: 'linear.manage_issues', description: 'Read/create/update Linear issues (writes approval-gated).', category: 'connector', provider: 'linear', capability: 'linear.create', location: 'connector-linear', reusable: true, status: 'available', source: 'builtin' },
  { name: 'agent.execution', description: 'AI employees execute tasks through the task executor.', category: 'agent', provider: 'internal', location: 'task-executor', reusable: true, status: 'available', source: 'builtin' },
  { name: 'agent.delegation', description: 'Executive Agent delegates work across AI employees and squads.', category: 'agent', provider: 'internal', location: 'delegation-orchestrator', reusable: true, status: 'available', source: 'builtin' },
  { name: 'memory.semantic', description: 'Semantic company memory retrieval for agent context.', category: 'service', provider: 'internal', location: 'memory', reusable: true, status: 'available', source: 'builtin' },
  { name: 'memory.knowledge_graph', description: 'Knowledge graph entities, relations and decision history.', category: 'service', provider: 'internal', location: 'knowledge-graph', reusable: true, status: 'available', source: 'builtin' },
  { name: 'simulation.what_if', description: 'Live-baseline what-if simulation of the organization.', category: 'service', provider: 'internal', location: 'simulation', reusable: true, status: 'available', source: 'builtin' },
  { name: 'anomaly.detection', description: 'Scheduled anomaly detection over goals, tasks and spend.', category: 'service', provider: 'internal', location: 'anomaly-detector', reusable: true, status: 'available', source: 'builtin' },
  { name: 'engineering.workspace', description: 'Repository import, sandbox runs, PRs and engineering tasks.', category: 'code', provider: 'internal', location: 'engineering', reusable: true, status: 'available', source: 'builtin' },
];

/** Idempotent: seed built-ins for an org without clobbering entries added later. */
export async function ensureBuiltInCapabilities(db: Db, orgId: string): Promise<number> {
  const existing = await db
    .select({ name: capabilityRegistry.name })
    .from(capabilityRegistry)
    .where(eq(capabilityRegistry.orgId, orgId));
  const have = new Set(existing.map((e) => e.name));

  const missing = BUILTIN_CAPABILITIES.filter((c) => !have.has(c.name));
  if (missing.length > 0) {
    await db.insert(capabilityRegistry).values(missing.map((c) => ({ ...c, orgId })));
  }
  return missing.length;
}

export async function listCapabilities(db: Db, orgId: string): Promise<CapabilityEntry[]> {
  return db
    .select()
    .from(capabilityRegistry)
    .where(eq(capabilityRegistry.orgId, orgId))
    .orderBy(capabilityRegistry.category, capabilityRegistry.name);
}

export async function getCapabilityByName(db: Db, orgId: string, name: string): Promise<CapabilityEntry | undefined> {
  const rows = await db
    .select()
    .from(capabilityRegistry)
    .where(and(eq(capabilityRegistry.orgId, orgId), eq(capabilityRegistry.name, name)))
    .limit(1);
  return rows[0];
}

/** Register a reusable capability (e.g. after engineering completes a feature). */
export async function registerCapability(db: Db, orgId: string, data: Omit<NewCapabilityEntry, 'orgId'>): Promise<CapabilityEntry> {
  const existing = await getCapabilityByName(db, orgId, data.name);
  if (existing) return existing;

  const rows = await db.insert(capabilityRegistry).values({ ...data, orgId }).returning();
  const row = rows[0];
  if (!row) throw new Error('registerCapability returned no row');

  await appendAudit(db, {
    orgId,
    actorType: 'agent',
    actorId: data.ownerAgentId ?? undefined,
    action: 'capability.registered',
    outcome: 'success',
    resultRef: JSON.stringify({ name: data.name, category: data.category }),
  });
  return row;
}

/** Search capabilities by name/description — the build-vs-buy query. */
export async function searchCapabilities(db: Db, orgId: string, query: string, category?: string): Promise<CapabilityEntry[]> {
  const conditions = [eq(capabilityRegistry.orgId, orgId)];
  const q = `%${query.trim()}%`;
  const nameOrDesc = or(ilike(capabilityRegistry.name, q), ilike(capabilityRegistry.description, q));
  if (nameOrDesc) conditions.push(nameOrDesc);
  if (category) conditions.push(eq(capabilityRegistry.category, category));

  return db
    .select()
    .from(capabilityRegistry)
    .where(and(...conditions))
    .orderBy(capabilityRegistry.name)
    .limit(50);
}