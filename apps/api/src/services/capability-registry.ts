/**
 * Capability Registry — the "search before building" layer.
 *
 * Answers "do we already have something that can do this?" for the Executive
 * Agent and Engineering Manager. Every company gets built-in entries seeded
 * from the connector actions and agent roles it actually has; engineering
 * completions register new reusable capabilities (source: engineering) so the
 * registry compounds as the company operates.
 */
import { eq, and, or, ilike, desc } from 'drizzle-orm';
import { capabilityRegistry, agents, companyMemory, type Db, type CapabilityEntry, type NewCapabilityEntry } from '@orq8/db';
import { appendAudit } from './audit.js';

/** Words that carry no capability meaning — stripped from derived slugs. */
const SLUG_STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'from', 'into', 'onto', 'our', 'your', 'their',
  'add', 'adding', 'support', 'supports', 'to', 'of', 'on', 'at', 'in', 'by', 'new', 'update',
  'updated', 'updating', 'fix', 'fixes', 'fixed', 'bug', 'change', 'changes', 'changed',
  'implement', 'implementing', 'create', 'created', 'creating', 'build', 'building', 'make', 'making',
  'feature', 'component', 'file', 'files', 'improve', 'improving', 'make', 'work', 'working', 'be', 'is', 'are',
]);

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

/**
 * Derive a reusable, searchable capability name from an engineering task
 * title. Strips filler words so "Add Supabase RLS verification for
 * organization-scoped agent data" → "supabase-rls-verification-organization".
 * Never returns empty: falls back to a sanitized full slug.
 */
export function deriveCapabilitySlug(title: string): string {
  const cleaned = (title ?? '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const words = cleaned.split(/[\s-]+/).filter((w) => w.length > 1 && !SLUG_STOP_WORDS.has(w));
  let slug = words.slice(0, 5).join('-');
  if (slug.length < 4) {
    slug = cleaned.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  if (!slug) slug = 'engineering-capability';
  return slug.slice(0, 64);
}

/**
 * Auto-register a reusable capability when an engineering PR passes its gate
 * and merges. Idempotent per PR: the capability name embeds a short PR id, and
 * registerCapability dedupes on (orgId, name), so reprocessing the same merge
 * event can never create duplicates.
 */
export async function registerCapabilityForMergedPr(
  db: Db,
  orgId: string,
  input: {
    pr: { id: string; title: string; headBranch: string; baseBranch: string; providerPrUrl?: string | null; providerPrNumber?: number | null };
    task: { id: string; title: string; description?: string | null; branch?: string | null; assigneeId?: string | null };
    testsSummary?: { passed?: number; failed?: number; total?: number } | null;
    diffSummary?: { filesChanged?: number; additions?: number; deletions?: number; majorAreas?: string[] } | null;
  },
): Promise<CapabilityEntry> {
  const base = deriveCapabilitySlug(input.task.title);
  const prHash = input.pr.id.replace(/-/g, '').slice(0, 8);
  const name = `${base}-${prHash}`;

  const diff = input.diffSummary ?? {};
  const tests = input.testsSummary ?? {};
  const description = [
    `Engineering capability: ${input.task.title}`,
    input.task.description?.trim() ? input.task.description.trim().slice(0, 400) : undefined,
    `Merged via PR "${input.pr.title}" (${input.pr.headBranch} → ${input.pr.baseBranch})${input.pr.providerPrNumber ? ` · #${input.pr.providerPrNumber}` : ''}${input.pr.providerPrUrl ? ` · ${input.pr.providerPrUrl}` : ''}.`,
    diff.filesChanged ? `Files changed: ${diff.filesChanged}; +${diff.additions ?? 0}/-${diff.deletions ?? 0} lines.` : undefined,
    diff.majorAreas && diff.majorAreas.length > 0 ? `Areas: ${diff.majorAreas.slice(0, 5).join(', ')}.` : undefined,
    tests.total !== undefined ? `Tests: ${tests.passed ?? 0}/${tests.total} passed${tests.failed ? ` (${tests.failed} failed)` : ''}.` : undefined,
    'Reusable by future engineering work — search the capability registry before building.',
  ].filter(Boolean).join(' ');

  const existing = await getCapabilityByName(db, orgId, name);
  if (existing) return existing;

  return registerCapability(db, orgId, {
    name,
    description,
    category: 'code',
    provider: 'internal',
    location: input.pr.providerPrUrl ?? `pr:${input.pr.id}`,
    ownerAgentId: input.task.assigneeId ?? null,
    reusable: true,
    status: 'available',
    source: 'engineering',
  });
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

// ─── Reuse-vs-build resolution (Phase 11: build-vs-buy → Executive Agent) ────

const RESOLVE_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'our', 'your', 'their', 'that', 'this', 'can', 'could', 'would',
  'should', 'have', 'has', 'had', 'are', 'was', 'were', 'been', 'being', 'will', 'shall', 'what',
  'which', 'who', 'how', 'where', 'when', 'why', 'from', 'into', 'onto', 'about', 'them', 'they',
  'we', 'you', 'us', 'do', 'does', 'did', 'not', 'no', 'yes', 'if', 'then', 'else', 'also', 'just',
  'like', 'get', 'got', 'make', 'need', 'wants', 'want', 'help', 'helping', 'please', 'some', 'more',
]);

/** Meaningful lowercase tokens from free text (3+ chars, stop words removed). */
export function capabilityTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of (text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 3 && !RESOLVE_STOP_WORDS.has(raw)) tokens.add(raw);
  }
  return tokens;
}

export interface CapabilityResolveMatch {
  id: string;
  name: string;
  description: string | null;
  kind: 'agent' | 'tool' | 'workflow' | 'service' | 'code' | 'knowledge';
  category: string;
  location: string | null;
  status: string;
  score: number; // 0..1 token-overlap confidence
}

export interface CapabilityResolveResult {
  request: string;
  decision: 'reuse' | 'extend' | 'build';
  reason: string;
  matches: CapabilityResolveMatch[];
  matchedAt: string;
}

function scoreTokenOverlap(query: Set<string>, textTokens: string[]): number {
  if (query.size === 0 || textTokens.length === 0) return 0;
  const hay = new Set(textTokens);
  let matched = 0;
  for (const t of query) if (hay.has(t)) matched += 1;
  return matched / query.size;
}

/**
 * Build-vs-buy resolution: given a founder/agent request, search what the
 * company ALREADY has (registered capabilities, AI employee roles, company
 * knowledge) and recommend reuse, extend or build. Bounded and company-scoped:
 * org A can never see org B's capabilities, agents or memory. Records an audit
 * event (request truncated — never a full prompt dump).
 */
export async function resolveCapabilityRequest(
  db: Db,
  orgId: string,
  request: string,
  opts: { limit?: number; actorId?: string } = {},
): Promise<CapabilityResolveResult> {
  const limit = opts.limit ?? 5;
  const query = capabilityTokens(request);
  const matches: CapabilityResolveMatch[] = [];

  // 1. Registered capabilities (agents/tools/workflows/services that exist as
  //    first-class registry entries).
  try {
    const registry = await db
      .select()
      .from(capabilityRegistry)
      .where(and(eq(capabilityRegistry.orgId, orgId), eq(capabilityRegistry.status, 'available')))
      .orderBy(desc(capabilityRegistry.updatedAt))
      .limit(200);
    for (const c of registry) {
      const nameTokens = capabilityTokens(c.name.replace(/[-_.]/g, ' '));
      const descTokens = capabilityTokens(c.description ?? '');
      const nameScore = scoreTokenOverlap(query, [...nameTokens]);
      const descScore = scoreTokenOverlap(query, [...descTokens]);
      const score = Math.max(nameScore, descScore * 0.75);
      if (score > 0) {
        const kind = (c.category === 'agent' ? 'agent' : c.category === 'workflow' ? 'workflow' : c.category === 'connector' || c.category === 'tool' ? 'tool' : c.category === 'code' ? 'code' : 'service') as CapabilityResolveMatch['kind'];
        matches.push({ id: c.id, name: c.name, description: c.description, kind, category: c.category, location: c.location, status: c.status, score });
      }
    }
  } catch {
    // Registry table missing (migrations pending) — resolution degrades to the
    // remaining sources instead of failing the request.
  }

  // 2. AI employees the company already has (name/role/capabilities).
  try {
    const orgAgents = await db
      .select({ id: agents.id, name: agents.name, role: agents.role, capabilities: agents.capabilities })
      .from(agents)
      .where(and(eq(agents.orgId, orgId), eq(agents.status, 'active')))
      .limit(200);
    for (const a of orgAgents) {
      const roleTokens = capabilityTokens(`${a.name} ${a.role}`);
      const caps = Array.isArray(a.capabilities) ? (a.capabilities as string[]).join(' ') : '';
      const allTokens = capabilityTokens(caps);
      for (const t of allTokens) roleTokens.add(t);
      const score = scoreTokenOverlap(query, [...roleTokens]);
      if (score >= 0.25) {
        matches.push({
          id: a.id,
          name: a.name,
          description: `${a.role} — AI employee already in the organization.`,
          kind: 'agent',
          category: 'agent',
          location: null,
          status: 'active',
          score,
        });
      }
    }
  } catch {
    // Agents table always exists; best-effort anyway.
  }

  // 3. Company knowledge — recent memory entries (workflows/lessons/facts) with
  //    token overlap. Bounded: only the most recent entries are scanned.
  try {
    const recent = await db
      .select({ id: companyMemory.id, category: companyMemory.category, content: companyMemory.content })
      .from(companyMemory)
      .where(and(eq(companyMemory.orgId, orgId), eq(companyMemory.category, 'workflow')))
      .orderBy(desc(companyMemory.createdAt))
      .limit(40);
    for (const m of recent) {
      const score = scoreTokenOverlap(query, [...capabilityTokens(m.content)]);
      if (score >= 0.4) {
        matches.push({
          id: m.id,
          name: m.content.slice(0, 80),
          description: m.content.slice(0, 400),
          kind: 'knowledge',
          category: 'workflow',
          location: null,
          status: 'available',
          score,
        });
      }
    }
  } catch {
    // Best-effort.
  }

  // Dedupe by name (agent may appear both via registry and via employees scan)
  // and drop token-overlap noise below the "extend" threshold — a one-word
  // coincidence (e.g. "simulation" in an unrelated request) must not surface
  // as a match. The decision thresholds below then classify the survivors.
  const seen = new Set<string>();
  const unique = matches
    .filter((m) => {
      if (m.score < 0.3) return false;
      const key = `${m.kind}:${m.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const best = unique[0];
  let decision: CapabilityResolveResult['decision'] = 'build';
  let reason = 'No existing capability matches this request closely enough — a new capability is justified.';
  if (best && best.score >= 0.55) {
    decision = 'reuse';
    reason = `The company already has a strong match: “${best.name}” (${best.kind}, ${Math.round(best.score * 100)}% confidence). Reuse it before building anything new.`;
  } else if (best && best.score >= 0.3) {
    decision = 'extend';
    reason = `A partial match exists (“${best.name}”, ${Math.round(best.score * 100)}% confidence) — prefer extending the existing capability over building a parallel one.`;
  }

  const requestTruncated = request.trim().slice(0, 200);
  try {
    await appendAudit(db, {
      orgId,
      actorType: opts.actorId ? 'user' : 'agent',
      actorId: opts.actorId,
      action: 'capability.resolve',
      outcome: 'success',
      resultRef: JSON.stringify({ request: requestTruncated, decision, topMatch: best?.name ?? null }),
    });
  } catch {
    // Observability is best-effort — never fail a resolution on audit failure.
  }

  return { request: requestTruncated, decision, reason, matches: unique, matchedAt: new Date().toISOString() };
}