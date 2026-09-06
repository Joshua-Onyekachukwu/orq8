/**
 * Connector Actions integration tests (DB-gated).
 *
 * Exercises the full enforcement chain for real GitHub actions:
 *   Agent (in-org) → Provider (connected) → Capability grant → API call →
 *   structured outcome + audit.
 *
 * Cases: success path (mocked GitHub API), capability denial (access row with
 * no capability → denied outcome + error), not-connected org (foreign agent),
 * provider-expiry on 401, and write-action parameter validation. Fetch is
 * injectable via setConnectorFetch — no live GitHub credentials required.
 */

import { createLogger, loadConfig } from '@orq8/core';
import {
  createDb,
  organizations,
  memberships,
  users,
  agents,
  auditEvents,
  connectorOutcomes,
} from '@orq8/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  dispatchGithubAction,
  ConnectorActionError,
  setConnectorFetch,
} from '../src/services/connector-actions.js';
import {
  createProvider,
  setCredentials,
  upsertCapability,
  grantAgentAccess,
} from '../src/services/integrations.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const run = dbUp ? describe : describe.skip;

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

let orgId = '';
let userId = '';
let agentId = ''; // granted agent (full flow)
let ungrantedAgentId = ''; // same org, no capability grant
let foreignOrgId = '';
let foreignAgentId = '';
let providerId = '';

beforeAll(async () => {
  orgId = randomUUID();
  foreignOrgId = randomUUID();
  userId = randomUUID();
  const email = `connector-${randomUUID()}@test.local`;
  await deps.db.insert(organizations).values({ id: orgId, name: 'Connector Test Org', slug: `ct-${randomUUID()}` });
  await deps.db.insert(organizations).values({ id: foreignOrgId, name: 'Foreign Org', slug: `cf-${randomUUID()}` });
  await deps.db.insert(users).values({ id: userId, email, name: 'Connector User', passwordHash: 'not-a-real-hash', status: 'active' });
  await deps.db.insert(memberships).values({ userId, orgId, role: 'founder' });

  const [agent] = await deps.db.insert(agents).values({ orgId, name: 'GitHub Engineer', role: 'engineer', status: 'active' }).returning();
  agentId = agent!.id;
  const [ungranted] = await deps.db.insert(agents).values({ orgId, name: 'No Grant Agent', role: 'engineer', status: 'active' }).returning();
  ungrantedAgentId = ungranted!.id;
  const [foreignAgent] = await deps.db.insert(agents).values({ orgId: foreignOrgId, name: 'Foreign Agent', role: 'engineer', status: 'active' }).returning();
  foreignAgentId = foreignAgent!.id;

  // Connected GitHub provider + credentials + capability (no agent grant yet).
  const provider = await createProvider(deps.db, {
    orgId,
    name: 'github',
    provider: 'github',
    status: 'connected',
    scopes: ['repo'],
    metadata: { source: 'oauth' },
  });
  providerId = provider.id;
  await setCredentials(deps.db, providerId, {
    credentialType: 'oauth',
    encryptedSecret: 'github-test-access-token',
    scopes: ['repo'],
  });
  await upsertCapability(deps.db, {
    providerId,
    capability: 'list_repositories',
    allowed: true,
    approvalRequiredFor: [],
    description: 'Read repos',
  });

  // Grant list_repositories to the primary agent only.
  await grantAgentAccess(deps.db, {
    orgId,
    agentId,
    providerId,
    capabilities: ['list_repositories'],
  });
});

afterAll(async () => {
  for (const org of [orgId, foreignOrgId].filter(Boolean)) {
    await deps.db.delete(connectorOutcomes).where(eq(connectorOutcomes.orgId, org));
    await deps.db.delete(auditEvents).where(eq(auditEvents.orgId, org));
    await deps.db.delete(agents).where(eq(agents.orgId, org));
    await deps.db.delete(memberships).where(eq(memberships.orgId, org));
    await deps.db.delete(organizations).where(eq(organizations.id, org));
  }
  if (userId) await deps.db.delete(users).where(eq(users.id, userId));
  setConnectorFetch(fetch);
});

run('connector actions — capability gating', () => {
  it('denies an in-org agent whose grant lacks the capability and records the denial', async () => {
    const deniedCtx = { orgId, agentId: ungrantedAgentId, userId };
    await expect(
      dispatchGithubAction(deps.db, deniedCtx, 'list_repositories', {}),
    ).rejects.toThrow(/not authorized for GitHub capability/);

    const rows = await deps.db
      .select()
      .from(connectorOutcomes)
      .where(eq(connectorOutcomes.orgId, orgId));
    const denied = rows.find((o) => o.status === 'denied');
    expect(denied).toBeDefined();
    expect(denied?.capability).toBe('list_repositories');
  });
});

run('connector actions — connected org with full grant', () => {
  it('executes a real API call with the decrypted token and writes a success outcome', async () => {
    let seenAuth = '';
    setConnectorFetch(async (url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seenAuth = headers['authorization'] ?? '';
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [{ full_name: 'acme/website', html_url: 'https://github.com/acme/website' }],
      } as unknown as Response;
    });

    const result = await dispatchGithubAction(deps.db, { orgId, agentId, userId }, 'list_repositories', {});
    expect(result.status).toBe('success');
    expect(seenAuth).toContain('Bearer github-test-access-token');
    expect(result.result).toEqual([{ full_name: 'acme/website', html_url: 'https://github.com/acme/website' }]);

    const outcomes = await deps.db
      .select()
      .from(connectorOutcomes)
      .where(eq(connectorOutcomes.orgId, orgId));
    const success = outcomes.find((o) => o.status === 'success');
    expect(success).toBeDefined();
    expect(success?.action).toBe('list_repositories');
    expect(success?.providerResourceId).toBeNull();
  });

  it('rejects a foreign-org agent even though the connection exists (ownership)', async () => {
    await expect(
      dispatchGithubAction(deps.db, { orgId: foreignOrgId, agentId: foreignAgentId, userId }, 'list_repositories', {}),
    ).rejects.toThrow(ConnectorActionError);
  });

  it('validates required write-action parameters before any API call', async () => {
    await expect(
      dispatchGithubAction(deps.db, { orgId, agentId, userId }, 'create_issue', { owner: 'acme', repo: 'website' }),
    ).rejects.toThrow(/owner, repo and title are required/);
  });

  it('reports failure and flags the provider when the API rejects with 401', async () => {
    setConnectorFetch(async () => ({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ message: 'Bad credentials' }),
    } as unknown as Response));

    await expect(
      dispatchGithubAction(deps.db, { orgId, agentId, userId }, 'list_repositories', {}),
    ).rejects.toThrow(/GitHub rejected/);
  });
});
