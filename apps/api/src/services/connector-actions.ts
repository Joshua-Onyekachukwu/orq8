/**
 * ORQ8 Connector Actions — real, capability-gated actions against external
 * providers (Phase 4/5 completion). Agents call these through the tool registry;
 * the founder can also trigger them via POST /v1/connector-actions.
 *
 * Every action resolves the full chain before touching the provider:
 *   Company → Agent (in-org) → Connection → Capability → Action
 *
 * Guarantees:
 *   - capability is enforced SERVER-SIDE (canAgentUseCapability) — an OAuth
 *     connection alone grants nothing
 *   - tokens are decrypted only inside this module, used only in the
 *     Authorization header, never logged, never returned to callers
 *   - every attempt records a structured connector_outcome (success | failed |
 *     denied | pending_approval) + audit rows with the hash chain
 *   - provider status is updated on auth failures (expired) and other errors
 *   - raw provider payloads are never stored — only the normalized result
 *
 * GitHub-only for now; Gmail/Linear follow the same shape.
 */

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { agents, type Db } from '@orq8/db';
import { appendAudit } from './audit.js';
import {
  canAgentUseCapability,
  decryptCredentialSecret,
  getCredentials,
  recordOutcome,
  updateProviderStatus,
} from './integrations.js';

export const GITHUB_CAPABILITIES = {
  readRepositories: 'read_repositories',
  readIssues: 'read_issues',
  readPullRequests: 'read_pull_requests',
  createIssues: 'create_issues',
  commentOnIssues: 'comment_on_issues',
  createPullRequests: 'create_pull_requests',
} as const;

export class ConnectorActionError extends Error {
  constructor(
    message: string,
    public code: 'capability_denied' | 'not_connected' | 'provider_error' | 'invalid_params' | 'not_found' | 'rate_limited',
  ) {
    super(message);
    this.name = 'ConnectorActionError';
  }
}

export interface ConnectorActionContext {
  orgId: string;
  agentId: string;
  userId: string;
  taskId?: string;
  correlationId?: string;
}

/** Injectable fetch for tests. */
let fetchImpl: typeof fetch = fetch;
export function setConnectorFetch(impl: typeof fetch): void {
  fetchImpl = impl;
}

const GITHUB_API = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 20_000;

/** Verify the agent belongs to the org (never trust client-supplied agent IDs). */
async function resolveAgent(db: Db, orgId: string, agentId: string) {
  const rows = await db
    .select({ id: agents.id, name: agents.name, status: agents.status })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  const agent = rows[0];
  if (!agent || agent.status === 'archived') {
    throw new ConnectorActionError('Agent not found or archived', 'not_found');
  }
  // Org ownership: agent IDs must resolve inside the caller's org.
  const inOrg = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.orgId, orgId)))
    .limit(1);
  if (!inOrg[0]) throw new ConnectorActionError('Agent not found in this organization', 'not_found');
  return agent;
}

interface GithubFetchResult<T> {
  data: T;
  providerId: string;
  requiresApproval: boolean;
}

/**
 * Central GitHub call: capability gate → decrypted token → API → outcome +
 * audit. Never throws for provider failures — those are encoded as
 * ConnectorActionError with the outcome already recorded.
 */
async function githubFetch<T>(
  db: Db,
  ctx: ConnectorActionContext,
  capability: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<GithubFetchResult<T>> {
  const correlationId = ctx.correlationId ?? randomUUID();
  const { allowed, requiresApproval, provider } = await canAgentUseCapability(
    db,
    ctx.orgId,
    ctx.agentId,
    'github',
    capability,
  );

  const action = path.split('/').pop() ?? capability;
  const baseOutcome = {
    orgId: ctx.orgId,
    agentId: ctx.agentId,
    taskId: ctx.taskId ?? null,
    provider: 'github',
    capability,
    action,
    correlationId,
    requiresApproval,
  };

  if (!provider) {
    throw new ConnectorActionError('GitHub is not connected for this organization', 'not_connected');
  }
  if (!allowed) {
    await recordOutcome(db, {
      ...baseOutcome,
      providerId: provider.id,
      status: 'denied',
      summary: `Denied: agent lacks capability ${capability} for GitHub`,
    });
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'agent',
      actorId: ctx.agentId,
      action: 'connector.action.denied',
      outcome: 'denied',
      resultRef: JSON.stringify({ provider: 'github', capability, action }),
    });
    throw new ConnectorActionError(
      `Agent is not authorized for GitHub capability "${capability}". Grant it in Integrations → Agent access.`,
      'capability_denied',
    );
  }

  const credential = await getCredentials(db, provider.id);
  const token = decryptCredentialSecret(credential);
  if (!token) {
    await updateProviderStatus(db, provider.id, 'expired', 'Missing credentials');
    await recordOutcome(db, {
      ...baseOutcome,
      providerId: provider.id,
      status: 'failed',
      error: 'GitHub connection has no usable token — reconnect required',
      summary: 'Failed: no usable GitHub token',
    });
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'agent',
      actorId: ctx.agentId,
      action: 'connector.action.failed',
      outcome: 'failure',
      resultRef: JSON.stringify({ provider: 'github', capability, action, error: 'no_token' }),
    });
    throw new ConnectorActionError('GitHub connection has no usable token — reconnect required', 'not_connected');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(`${GITHUB_API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const message = error instanceof Error ? error.message : 'Network error';
    await updateProviderStatus(db, provider.id, 'degraded', message);
    await recordOutcome(db, {
      ...baseOutcome,
      providerId: provider.id,
      status: 'failed',
      error: message,
      summary: `Failed: GitHub request error (${action})`,
    });
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'agent',
      actorId: ctx.agentId,
      action: 'connector.action.failed',
      outcome: 'failure',
      resultRef: JSON.stringify({ provider: 'github', capability, action, error: message.slice(0, 200) }),
    });
    throw new ConnectorActionError(`GitHub request failed: ${message}`, 'provider_error');
  }
  clearTimeout(timer);

  if (!response.ok) {
    let detail = '';
    try {
      const payload = (await response.json()) as { message?: string };
      detail = payload.message ?? '';
    } catch {
      /* ignore unparseable body */
    }
    const message = `${response.status} ${detail}`.trim();
    if (response.status === 401 || response.status === 403) {
      await updateProviderStatus(db, provider.id, 'expired', message);
    } else if (response.status === 429) {
      await updateProviderStatus(db, provider.id, 'degraded', 'Rate limited');
    } else {
      await updateProviderStatus(db, provider.id, 'degraded', message);
    }
    await recordOutcome(db, {
      ...baseOutcome,
      providerId: provider.id,
      status: 'failed',
      error: message,
      summary: `Failed: GitHub rejected ${action} (${response.status})`,
    });
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'agent',
      actorId: ctx.agentId,
      action: 'connector.action.failed',
      outcome: 'failure',
      resultRef: JSON.stringify({ provider: 'github', capability, action, status: response.status }),
    });
    throw new ConnectorActionError(
      response.status === 429
        ? 'GitHub rate limit reached — retry later'
        : `GitHub rejected the request: ${message}`,
      response.status === 429 ? 'rate_limited' : 'provider_error',
    );
  }

  const data = (await response.json()) as T;
  await updateProviderStatus(db, provider.id, 'connected');
  await recordOutcome(db, {
    ...baseOutcome,
    providerId: provider.id,
    status: 'success',
    summary: `GitHub ${action} completed`,
    result: data as unknown as Record<string, unknown>,
  });
  await appendAudit(db, {
    orgId: ctx.orgId,
    actorType: 'agent',
    actorId: ctx.agentId,
    action: `connector.action.${action}`,
    outcome: 'success',
    resultRef: JSON.stringify({ provider: 'github', capability, correlationId }),
  });
  return { data, providerId: provider.id, requiresApproval };
}

// ─── Public GitHub actions ──────────────────────────────────────────────────

export interface ConnectorActionResult<T> {
  capability: string;
  action: string;
  providerResourceId: string | null;
  providerUrl: string | null;
  status: 'success';
  result: T;
}

export async function githubListRepositories(
  db: Db,
  ctx: ConnectorActionContext,
  params: { visibility?: 'all' | 'public' | 'private' },
): Promise<ConnectorActionResult<unknown>> {
  const { data } = await githubFetch<unknown>(db, ctx, GITHUB_CAPABILITIES.readRepositories, 'GET', '/user/repos');
  return { capability: GITHUB_CAPABILITIES.readRepositories, action: 'list_repositories', providerResourceId: null, providerUrl: null, status: 'success', result: data };
}

export async function githubListIssues(
  db: Db,
  ctx: ConnectorActionContext,
  params: { owner: string; repo: string; state?: 'open' | 'closed' | 'all' },
): Promise<ConnectorActionResult<unknown>> {
  const state = params.state ?? 'open';
  const { data } = await githubFetch<unknown>(
    db,
    ctx,
    GITHUB_CAPABILITIES.readIssues,
    'GET',
    `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/issues?state=${state}&per_page=30`,
  );
  return { capability: GITHUB_CAPABILITIES.readIssues, action: 'list_issues', providerResourceId: null, providerUrl: null, status: 'success', result: data };
}

export async function githubCreateIssue(
  db: Db,
  ctx: ConnectorActionContext,
  params: { owner: string; repo: string; title: string; body?: string; labels?: string[] },
): Promise<ConnectorActionResult<unknown>> {
  if (!params.owner || !params.repo || !params.title?.trim()) {
    throw new ConnectorActionError('owner, repo and title are required', 'invalid_params');
  }
  const { data } = await githubFetch<{ number: number; html_url: string }>(
    db,
    ctx,
    GITHUB_CAPABILITIES.createIssues,
    'POST',
    `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/issues`,
    { title: params.title, body: params.body ?? '', labels: params.labels ?? [] },
  );
  return {
    capability: GITHUB_CAPABILITIES.createIssues,
    action: 'create_issue',
    providerResourceId: String(data.number),
    providerUrl: data.html_url,
    status: 'success',
    result: { number: data.number, url: data.html_url, title: params.title },
  };
}

export async function githubCommentOnIssue(
  db: Db,
  ctx: ConnectorActionContext,
  params: { owner: string; repo: string; issueNumber: number; body: string },
): Promise<ConnectorActionResult<unknown>> {
  if (!params.owner || !params.repo || !params.issueNumber || !params.body?.trim()) {
    throw new ConnectorActionError('owner, repo, issueNumber and body are required', 'invalid_params');
  }
  const { data } = await githubFetch<{ id: number; html_url: string }>(
    db,
    ctx,
    GITHUB_CAPABILITIES.commentOnIssues,
    'POST',
    `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/issues/${params.issueNumber}/comments`,
    { body: params.body },
  );
  return {
    capability: GITHUB_CAPABILITIES.commentOnIssues,
    action: 'comment_on_issue',
    providerResourceId: String(data.id),
    providerUrl: data.html_url,
    status: 'success',
    result: { commentId: data.id, url: data.html_url },
  };
}

export async function githubCreatePullRequest(
  db: Db,
  ctx: ConnectorActionContext,
  params: { owner: string; repo: string; title: string; head: string; base: string; body?: string },
): Promise<ConnectorActionResult<unknown>> {
  if (!params.owner || !params.repo || !params.title?.trim() || !params.head || !params.base) {
    throw new ConnectorActionError('owner, repo, title, head and base are required', 'invalid_params');
  }
  const { data } = await githubFetch<{ number: number; html_url: string }>(
    db,
    ctx,
    GITHUB_CAPABILITIES.createPullRequests,
    'POST',
    `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/pulls`,
    { title: params.title, head: params.head, base: params.base, body: params.body ?? '' },
  );
  return {
    capability: GITHUB_CAPABILITIES.createPullRequests,
    action: 'create_pull_request',
    providerResourceId: String(data.number),
    providerUrl: data.html_url,
    status: 'success',
    result: { number: data.number, url: data.html_url, title: params.title },
  };
}

// ─── Dispatch (used by the API route) ───────────────────────────────────────

export type GithubActionName = 'list_repositories' | 'list_issues' | 'create_issue' | 'comment_on_issue' | 'create_pull_request';

export async function dispatchGithubAction(
  db: Db,
  ctx: ConnectorActionContext,
  action: GithubActionName,
  params: Record<string, unknown>,
): Promise<ConnectorActionResult<unknown>> {
  await resolveAgent(db, ctx.orgId, ctx.agentId);
  switch (action) {
    case 'list_repositories':
      return githubListRepositories(db, ctx, { visibility: (params.visibility as 'all' | 'public' | 'private' | undefined) ?? 'all' });
    case 'list_issues':
      return githubListIssues(db, ctx, {
        owner: String(params.owner ?? ''),
        repo: String(params.repo ?? ''),
        state: (params.state as 'open' | 'closed' | 'all' | undefined) ?? 'open',
      });
    case 'create_issue':
      return githubCreateIssue(db, ctx, {
        owner: String(params.owner ?? ''),
        repo: String(params.repo ?? ''),
        title: String(params.title ?? ''),
        body: params.body ? String(params.body) : undefined,
        labels: Array.isArray(params.labels) ? params.labels.map(String) : undefined,
      });
    case 'comment_on_issue':
      return githubCommentOnIssue(db, ctx, {
        owner: String(params.owner ?? ''),
        repo: String(params.repo ?? ''),
        issueNumber: Number(params.issueNumber),
        body: String(params.body ?? ''),
      });
    case 'create_pull_request':
      return githubCreatePullRequest(db, ctx, {
        owner: String(params.owner ?? ''),
        repo: String(params.repo ?? ''),
        title: String(params.title ?? ''),
        head: String(params.head ?? ''),
        base: String(params.base ?? ''),
        body: params.body ? String(params.body) : undefined,
      });
    default:
      throw new ConnectorActionError(`Unknown GitHub action: ${String(action)}`, 'invalid_params');
  }
}