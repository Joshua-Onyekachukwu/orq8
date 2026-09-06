/**
 * ORQ8 Linear Connector Actions — issue CRUD through the Linear GraphQL API.
 *
 * Follows the same capability-gated chain as GitHub/Gmail connector actions:
 *   Org → Agent (in-org) → Connection → canAgentUseCapability → Linear GraphQL
 *   → structured outcome + audit. Team/project identifiers are resolved from
 *   the connected account (never hard-coded) or validated from user input.
 */

import { randomUUID } from 'node:crypto';
import type { Db } from '@orq8/db';
import { appendAudit } from './audit.js';
import {
  canAgentUseCapability,
  decryptCredentialSecret,
  getCredentials,
  recordOutcome,
  updateProviderStatus,
} from './integrations.js';
import { ConnectorActionError, type ConnectorActionContext, type ConnectorActionResult } from './connector-actions.js';

export const LINEAR_CAPABILITIES = {
  readIssues: 'linear.issue.read',
  createIssues: 'linear.issue.create',
  updateIssues: 'linear.issue.update',
  deleteIssues: 'linear.issue.delete',
} as const;

const LINEAR_API = 'https://api.linear.app/graphql';
const REQUEST_TIMEOUT_MS = 20_000;

let fetchImpl: typeof fetch = fetch;
export function setLinearConnectorFetch(impl: typeof fetch): void {
  fetchImpl = impl;
}

async function linearGraphql(
  db: Db,
  ctx: ConnectorActionContext,
  capability: string,
  action: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data: Record<string, unknown>; providerId: string }> {
  const correlationId = ctx.correlationId ?? randomUUID();
  const { allowed, provider } = await canAgentUseCapability(db, ctx.orgId, ctx.agentId, 'linear', capability);
  const baseOutcome = {
    orgId: ctx.orgId,
    agentId: ctx.agentId,
    taskId: ctx.taskId ?? null,
    provider: 'linear',
    capability,
    action,
    correlationId,
    requiresApproval: false,
  };

  if (!provider) throw new ConnectorActionError('Linear is not connected for this organization', 'not_connected');
  if (!allowed) {
    await recordOutcome(db, { ...baseOutcome, providerId: provider.id, status: 'denied', summary: `Denied: agent lacks capability ${capability} for Linear` });
    await appendAudit(db, {
      orgId: ctx.orgId, actorType: 'agent', actorId: ctx.agentId,
      action: 'connector.action.denied', outcome: 'denied',
      resultRef: JSON.stringify({ provider: 'linear', capability, action }),
    });
    throw new ConnectorActionError(`Agent is not authorized for Linear capability "${capability}".`, 'capability_denied');
  }

  const credential = await getCredentials(db, provider.id);
  const token = decryptCredentialSecret(credential);
  if (!token) {
    await updateProviderStatus(db, provider.id, 'expired', 'Missing credentials');
    await recordOutcome(db, { ...baseOutcome, providerId: provider.id, status: 'failed', error: 'no_token', summary: 'Failed: no usable Linear token' });
    throw new ConnectorActionError('Linear connection has no usable token — reconnect required', 'not_connected');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(LINEAR_API, {
      method: 'POST',
      headers: {
        authorization: token.startsWith('lin_api_') ? token : `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const message = error instanceof Error ? error.message : 'Network error';
    await updateProviderStatus(db, provider.id, 'degraded', message);
    await recordOutcome(db, { ...baseOutcome, providerId: provider.id, status: 'failed', error: message.slice(0, 300), summary: `Failed: Linear request error (${action})` });
    throw new ConnectorActionError(`Linear request failed: ${message}`, 'provider_error');
  }
  clearTimeout(timer);

  const body = (await response.json().catch(() => ({}))) as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> };
  if (!response.ok || body.errors?.length) {
    const message = body.errors?.[0]?.message ?? `${response.status}`;
    if (response.status === 401 || response.status === 403) await updateProviderStatus(db, provider.id, 'expired', message);
    else if (response.status === 429) await updateProviderStatus(db, provider.id, 'degraded', 'Rate limited');
    else await updateProviderStatus(db, provider.id, 'degraded', message.slice(0, 300));
    await recordOutcome(db, { ...baseOutcome, providerId: provider.id, status: 'failed', error: message.slice(0, 300), summary: `Failed: Linear rejected ${action} (${response.status})` });
    await appendAudit(db, {
      orgId: ctx.orgId, actorType: 'agent', actorId: ctx.agentId,
      action: 'connector.action.failed', outcome: 'failure',
      resultRef: JSON.stringify({ provider: 'linear', capability, action, status: response.status }),
    });
    throw new ConnectorActionError(response.status === 429 ? 'Linear rate limit reached — retry later' : `Linear rejected the request: ${message}`, response.status === 429 ? 'rate_limited' : 'provider_error');
  }

  await updateProviderStatus(db, provider.id, 'connected');
  await recordOutcome(db, { ...baseOutcome, providerId: provider.id, status: 'success', summary: `Linear ${action} completed`, result: (body.data ?? {}) as Record<string, unknown> });
  await appendAudit(db, {
    orgId: ctx.orgId, actorType: 'agent', actorId: ctx.agentId,
    action: `connector.action.${action}`, outcome: 'success',
    resultRef: JSON.stringify({ provider: 'linear', capability, correlationId }),
  });
  return { data: body.data ?? {}, providerId: provider.id };
}

const ISSUE_FRAGMENT = `
  id
  identifier
  title
  description
  priority
  state { name }
  url
  createdAt
  updatedAt
`;

// ─── Actions ────────────────────────────────────────────────────────────────

/** Create an issue. teamId OR teamName resolves the target team. */
export async function linearCreateIssue(
  db: Db,
  ctx: ConnectorActionContext,
  params: { teamId?: string; teamName?: string; title: string; description?: string; priority?: number },
): Promise<ConnectorActionResult<unknown>> {
  if (!params.title?.trim()) throw new ConnectorActionError('title is required', 'invalid_params');
  if (!params.teamId && !params.teamName?.trim()) throw new ConnectorActionError('teamId or teamName is required', 'invalid_params');

  let teamId = params.teamId;
  if (!teamId && params.teamName) {
    const { data } = await linearGraphql(db, ctx, LINEAR_CAPABILITIES.createIssues, 'create_issue',
      `query { teams(first: 50) { nodes { id name } } }`, {});
    const teams = (data.teams as { nodes?: Array<{ id: string; name: string }> } | undefined)?.nodes ?? [];
    const match = teams.find((t) => t.name.toLowerCase() === params.teamName!.toLowerCase());
    if (!match) throw new ConnectorActionError(`No Linear team named "${params.teamName}" on the connected account`, 'not_found');
    teamId = match.id;
  }

  const { data } = await linearGraphql(db, ctx, LINEAR_CAPABILITIES.createIssues, 'create_issue',
    `mutation($teamId: String!, $title: String!, $description: String, $priority: Int) {
       issueCreate(input: { teamId: $teamId, title: $title, description: $description, priority: $priority }) {
         success
         issue { ${ISSUE_FRAGMENT} }
       }
     }`,
    { teamId, title: params.title, description: params.description ?? undefined, priority: params.priority ?? undefined },
  );
  const issue = (data.issueCreate as { issue?: Record<string, unknown> } | undefined)?.issue ?? data;
  const url = typeof issue.url === 'string' ? issue.url : null;
  return {
    capability: LINEAR_CAPABILITIES.createIssues,
    action: 'create_issue',
    providerResourceId: typeof issue.id === 'string' ? issue.id : null,
    providerUrl: url,
    status: 'success',
    result: issue,
  };
}

/** Get an issue by id or identifier (e.g. ENG-12). */
export async function linearGetIssue(
  db: Db,
  ctx: ConnectorActionContext,
  params: { issueId: string },
): Promise<ConnectorActionResult<unknown>> {
  if (!params.issueId?.trim()) throw new ConnectorActionError('issueId is required', 'invalid_params');
  const { data } = await linearGraphql(db, ctx, LINEAR_CAPABILITIES.readIssues, 'get_issue',
    `query($id: String!) { issue(id: $id) { ${ISSUE_FRAGMENT} } }`,
    { id: params.issueId },
  );
  const issue = data.issue as Record<string, unknown>;
  if (!issue) throw new ConnectorActionError('Linear issue not found', 'not_found');
  return {
    capability: LINEAR_CAPABILITIES.readIssues,
    action: 'get_issue',
    providerResourceId: typeof issue.id === 'string' ? issue.id : null,
    providerUrl: typeof issue.url === 'string' ? issue.url : null,
    status: 'success',
    result: issue,
  };
}

/** Update an issue's title/description/priority/state. */
export async function linearUpdateIssue(
  db: Db,
  ctx: ConnectorActionContext,
  params: { issueId: string; title?: string; description?: string; priority?: number; stateId?: string },
): Promise<ConnectorActionResult<unknown>> {
  if (!params.issueId?.trim()) throw new ConnectorActionError('issueId is required', 'invalid_params');
  const input: Record<string, unknown> = {};
  if (params.title !== undefined) input.title = params.title;
  if (params.description !== undefined) input.description = params.description;
  if (params.priority !== undefined) input.priority = params.priority;
  if (params.stateId !== undefined) input.stateId = params.stateId;
  if (Object.keys(input).length === 0) throw new ConnectorActionError('At least one field to update is required', 'invalid_params');

  const { data } = await linearGraphql(db, ctx, LINEAR_CAPABILITIES.updateIssues, 'update_issue',
    `mutation($id: String!, $input: IssueUpdateInput!) {
       issueUpdate(id: $id, input: $input) { success issue { ${ISSUE_FRAGMENT} } }
     }`,
    { id: params.issueId, input },
  );
  const issue = (data.issueUpdate as { issue?: Record<string, unknown> } | undefined)?.issue ?? {};
  return {
    capability: LINEAR_CAPABILITIES.updateIssues,
    action: 'update_issue',
    providerResourceId: typeof issue.id === 'string' ? issue.id : null,
    providerUrl: typeof issue.url === 'string' ? issue.url : null,
    status: 'success',
    result: issue,
  };
}

/** Archive (soft-delete) an issue. */
export async function linearArchiveIssue(
  db: Db,
  ctx: ConnectorActionContext,
  params: { issueId: string },
): Promise<ConnectorActionResult<unknown>> {
  if (!params.issueId?.trim()) throw new ConnectorActionError('issueId is required', 'invalid_params');
  const { data } = await linearGraphql(db, ctx, LINEAR_CAPABILITIES.deleteIssues, 'archive_issue',
    `mutation($id: String!) { issueArchive(id: $id) { success } }`,
    { id: params.issueId },
  );
  const success = (data.issueArchive as { success?: boolean } | undefined)?.success ?? false;
  if (!success) throw new ConnectorActionError('Linear archive did not report success', 'provider_error');
  return {
    capability: LINEAR_CAPABILITIES.deleteIssues,
    action: 'archive_issue',
    providerResourceId: params.issueId,
    providerUrl: null,
    status: 'success',
    result: { archived: true, issueId: params.issueId },
  };
}

/** List/search issues (optionally within a team). */
export async function linearListIssues(
  db: Db,
  ctx: ConnectorActionContext,
  params: { teamId?: string; limit?: number },
): Promise<ConnectorActionResult<unknown>> {
  const limit = Math.min(params.limit && params.limit > 0 ? params.limit : 10, 50);
  const where = params.teamId ? `filter: { team: { id: { eq: "${params.teamId}" } } }` : '';
  const { data } = await linearGraphql(db, ctx, LINEAR_CAPABILITIES.readIssues, 'list_issues',
    `query($limit: Int!) { issues(first: $limit ${where}) { nodes { ${ISSUE_FRAGMENT} } } }`,
    { limit },
  );
  return {
    capability: LINEAR_CAPABILITIES.readIssues,
    action: 'list_issues',
    providerResourceId: null,
    providerUrl: null,
    status: 'success',
    result: data,
  };
}

export type LinearActionName = 'create_issue' | 'get_issue' | 'update_issue' | 'archive_issue' | 'list_issues';

export async function dispatchLinearAction(
  db: Db,
  ctx: ConnectorActionContext,
  action: LinearActionName,
  params: Record<string, unknown>,
): Promise<ConnectorActionResult<unknown>> {
  switch (action) {
    case 'create_issue':
      return linearCreateIssue(db, ctx, {
        teamId: params.teamId ? String(params.teamId) : undefined,
        teamName: params.teamName ? String(params.teamName) : undefined,
        title: String(params.title ?? ''),
        description: params.description ? String(params.description) : undefined,
        priority: params.priority !== undefined ? Number(params.priority) : undefined,
      });
    case 'get_issue':
      return linearGetIssue(db, ctx, { issueId: String(params.issueId ?? '') });
    case 'update_issue':
      return linearUpdateIssue(db, ctx, {
        issueId: String(params.issueId ?? ''),
        title: params.title !== undefined ? String(params.title) : undefined,
        description: params.description !== undefined ? String(params.description) : undefined,
        priority: params.priority !== undefined ? Number(params.priority) : undefined,
        stateId: params.stateId !== undefined ? String(params.stateId) : undefined,
      });
    case 'archive_issue':
      return linearArchiveIssue(db, ctx, { issueId: String(params.issueId ?? '') });
    case 'list_issues':
      return linearListIssues(db, ctx, {
        teamId: params.teamId ? String(params.teamId) : undefined,
        limit: params.limit !== undefined ? Number(params.limit) : undefined,
      });
    default:
      throw new ConnectorActionError(`Unknown Linear action: ${String(action)}`, 'invalid_params');
  }
}
