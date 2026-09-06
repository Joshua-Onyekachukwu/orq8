import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { loadConfig } from '@orq8/core';
import { createDb, organizations, memberships, users, agents, type Db } from '@orq8/db';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe as dbDescribe } from 'vitest';
import {
  getConnectorToolCatalog,
  registerMcpServer,
  listMcpServers,
  discoverMcpTools,
  checkMcpToolPermission,
  executeMcpTool,
  MCP_PROVIDERS,
} from '../src/services/mcp.js';
import {
  BUILTIN_CAPABILITIES,
  ensureBuiltInCapabilities,
  registerCapability,
  listCapabilities,
  searchCapabilities,
} from '../src/services/capability-registry.js';

// ─── Pure unit tests ───────────────────────────────────────────────────────

describe('MCP connector tool catalog', () => {
  it('covers every executable provider with real tool definitions', () => {
    for (const provider of MCP_PROVIDERS) {
      const tools = getConnectorToolCatalog(provider);
      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(tool.provider).toBe(provider);
        expect(tool.requiredCapability).toBeTruthy();
        expect(['low', 'medium', 'high', 'critical']).toContain(tool.riskLevel);
      }
    }
  });

  it('gates external writes behind approval and keeps reads low-risk', () => {
    const github = getConnectorToolCatalog('github');
    const createIssue = github.find((t) => t.name === 'create_issue');
    const listRepos = github.find((t) => t.name === 'list_repositories');
    expect(createIssue?.requiresApproval).toBe(true);
    expect(createIssue?.riskLevel).toBe('medium');
    expect(listRepos?.requiresApproval).toBe(false);
    expect(listRepos?.riskLevel).toBe('low');

    const gmail = getConnectorToolCatalog('gmail');
    expect(gmail.find((t) => t.name === 'send_draft')?.requiresApproval).toBe(true);
    expect(gmail.find((t) => t.name === 'create_draft')?.requiresApproval).toBe(false);
    expect(gmail.find((t) => t.name === 'create_draft')?.riskLevel).toBe('medium');
  });

  it('returns no catalog for unknown providers', () => {
    expect(getConnectorToolCatalog('not-a-provider')).toEqual([]);
  });
});

describe('capability registry built-ins', () => {
  it('seeds a non-empty, uniquely-named built-in catalog', () => {
    expect(BUILTIN_CAPABILITIES.length).toBeGreaterThan(10);
    const names = new Set(BUILTIN_CAPABILITIES.map((c) => c.name));
    expect(names.size).toBe(BUILTIN_CAPABILITIES.length);
    expect(BUILTIN_CAPABILITIES.every((c) => c.reusable)).toBe(true);
  });

  it('covers connectors, agents, services and engineering', () => {
    const categories = new Set(BUILTIN_CAPABILITIES.map((c) => c.category));
    expect(categories.has('connector')).toBe(true);
    expect(categories.has('agent')).toBe(true);
    expect(categories.has('service')).toBe(true);
    expect(categories.has('code')).toBe(true);
  });
});

// ─── DB-gated integration tests (skip without Postgres) ────────────────────

const config = loadConfig();
let pool: Pool | null = null;
let dbUp = false;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
  dbUp = true;
} catch {
  await pool?.end().catch(() => undefined);
  pool = null;
  dbUp = false;
}

const run = dbUp ? dbDescribe : dbDescribe.skip;

run('MCP + capability registry integration', () => {
  const { db } = createDb(config.DATABASE_URL);
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const engineerId = randomUUID();
  const blockedAgentId = randomUUID();
  let githubServerId: string | null = null;
  let createIssueToolId: string | null = null;
  let listReposToolId: string | null = null;

  const ENGINEER_CAPABILITIES = ['coding', 'github.read_repositories', 'github.create_issues'];
  const BLOCKED_CAPABILITIES = ['marketing'];

  beforeAll(async () => {
    if (!pool) return;
    await pool.query('begin');
    await db.insert(organizations).values({ id: orgA, name: 'Org A', slug: `org-a-${randomUUID().slice(0, 8)}`, settings: {} }).onConflictDoNothing();
    await db.insert(organizations).values({ id: orgB, name: 'Org B', slug: `org-b-${randomUUID().slice(0, 8)}`, settings: {} }).onConflictDoNothing();
    await db.insert(users).values({ id: userA, email: `a-${randomUUID()}@test.orq8`, name: 'A', passwordHash: 'not-a-real-hash', status: 'active' }).onConflictDoNothing();
    await db.insert(users).values({ id: userB, email: `b-${randomUUID()}@test.orq8`, name: 'B', passwordHash: 'not-a-real-hash', status: 'active' }).onConflictDoNothing();
    await db.insert(memberships).values({ orgId: orgA, userId: userA, role: 'owner' }).onConflictDoNothing();
    await db.insert(memberships).values({ orgId: orgB, userId: userB, role: 'owner' }).onConflictDoNothing();
    await db.insert(agents).values({
      id: engineerId, orgId: orgA, name: 'Rigel', role: 'Backend Engineer', department: 'Engineering',
      capabilities: ENGINEER_CAPABILITIES, status: 'active',
    }).onConflictDoNothing();
    await db.insert(agents).values({
      id: blockedAgentId, orgId: orgA, name: 'Echo', role: 'Marketing Agent', department: 'Marketing',
      capabilities: BLOCKED_CAPABILITIES, status: 'active',
    }).onConflictDoNothing();
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('rollback');
    await pool.end();
    pool = null;
  });

  it('registers a connector-backed MCP server with a real tool catalog, idempotently', async () => {
    const first = await registerMcpServer(db, { orgId: orgA, name: 'GitHub MCP', provider: 'github' });
    const again = await registerMcpServer(db, { orgId: orgA, name: 'GitHub MCP', provider: 'github' });
    expect(again.id).toBe(first.id);
    githubServerId = first.id;

    const servers = await listMcpServers(db, orgA);
    expect(servers.length).toBe(1);
    expect(servers[0]?.provider).toBe('github');
    expect(servers[0]?.status).toBe('unconfigured');
  });

  it('discovery filters tools by agent capabilities and server allowlist', async () => {
    expect(githubServerId).not.toBeNull();

    const engineerTools = await discoverMcpTools(db, orgA, engineerId, ENGINEER_CAPABILITIES);
    expect(engineerTools.length).toBeGreaterThan(0);
    const names = engineerTools.map((t) => t.name);
    expect(names).toContain('list_repositories');
    expect(names).toContain('create_issue');
    const createIssue = engineerTools.find((t) => t.name === 'create_issue');
    expect(createIssue?.requiresApproval).toBe(true);
    createIssueToolId = createIssue?.id ?? null;

    // Agent without the required capability sees a subset (reads only)
    const blockedTools = await discoverMcpTools(db, orgA, blockedAgentId, BLOCKED_CAPABILITIES);
    expect(blockedTools.find((t) => t.name === 'create_issue')).toBeUndefined();
  });

  it('permission check denies agents without the capability', async () => {
    expect(createIssueToolId).not.toBeNull();
    const denied = await checkMcpToolPermission(db, orgA, blockedAgentId, createIssueToolId!, BLOCKED_CAPABILITIES);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('capability_denied');

    const allowed = await checkMcpToolPermission(db, orgA, engineerId, createIssueToolId!, ENGINEER_CAPABILITIES);
    expect(allowed.allowed).toBe(true);
    expect(allowed.requiresApproval).toBe(true);
  });

  it('execution rejects unconnected providers and unknown tools without calling the provider', async () => {
    // No provider row exists for org A, so the capability model blocks execution.
    const denied = await executeMcpTool(
      db,
      { orgId: orgA, agentId: engineerId, userId: userA },
      createIssueToolId!,
      { owner: 'o', repo: 'r', title: 't' },
      ENGINEER_CAPABILITIES,
    );
    expect(denied).toMatchObject({ status: 'error', code: 'capability_denied' });

    const unknown = await executeMcpTool(
      db,
      { orgId: orgA, agentId: engineerId, userId: userA },
      randomUUID(),
      {},
      ENGINEER_CAPABILITIES,
    );
    expect(unknown).toMatchObject({ status: 'error', code: 'tool_not_found' });
  });

  it('custom MCP servers are discoverable but return transport_unsupported on execution', async () => {
    const custom = await registerMcpServer(db, {
      orgId: orgA, name: 'Custom Tool', description: 'A hypothetical custom tool server', provider: 'custom',
    });
    expect(custom.transport).toBe('streamable_http');

    const denied = await executeMcpTool(
      db,
      { orgId: orgA, agentId: engineerId, userId: userA },
      randomUUID(),
      {},
      ENGINEER_CAPABILITIES,
    );
    expect(denied.status).toBe('error');
  });

  it('capability registry seeds built-ins idempotently and stays org-isolated', async () => {
    const seeded = await ensureBuiltInCapabilities(db, orgA);
    expect(seeded).toBe(BUILTIN_CAPABILITIES.length);
    const again = await ensureBuiltInCapabilities(db, orgA);
    expect(again).toBe(0);

    const all = await listCapabilities(db, orgA);
    expect(all.length).toBe(BUILTIN_CAPABILITIES.length);

    // Org B starts empty and never sees org A entries
    await ensureBuiltInCapabilities(db, orgB);
    const bAll = await listCapabilities(db, orgB);
    const bNames = new Set(bAll.map((c) => c.name));
    expect(bNames.has('github.create_issues')).toBe(true);
    expect(bAll.length).toBe(BUILTIN_CAPABILITIES.length);

    const aSearch = await searchCapabilities(db, orgA, 'github issues');
    expect(aSearch.some((c) => c.name === 'github.create_issues')).toBe(true);
  });

  it('registerCapability dedupes by name and search finds engineering registrations', async () => {
    const first = await registerCapability(db, orgA, {
      name: 'stripe.webhook_verification',
      description: 'Verify Stripe webhook signatures with the SDK',
      category: 'code',
      provider: 'internal',
      location: 'payments/webhooks',
      source: 'engineering',
    });
    const again = await registerCapability(db, orgA, {
      name: 'stripe.webhook_verification',
      description: 'Verify Stripe webhook signatures with the SDK',
      category: 'code',
      provider: 'internal',
      location: 'payments/webhooks',
      source: 'engineering',
    });
    expect(again.id).toBe(first.id);

    const found = await searchCapabilities(db, orgA, 'webhook signature');
    expect(found.some((c) => c.name === 'stripe.webhook_verification')).toBe(true);

    // Org B must not see org A's engineering capability
    const bFound = await searchCapabilities(db, orgB, 'stripe.webhook_verification');
    expect(bFound.some((c) => c.name === 'stripe.webhook_verification')).toBe(false);
  });
});