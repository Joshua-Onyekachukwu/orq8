/**
 * ORQ8 Gmail Connector Actions — draft-by-default email handling.
 *
 * Safety model (docs/48 risk P6): agents NEVER send email silently. The only
 * action that touches outbound mail is `create_draft` (safe by construction);
 * `send_draft` requires BOTH the capability grant AND no approval gate on the
 * capability — otherwise the action records `approval_required` and creates a
 * pending approval instead of sending.
 *
 * Every action follows the same chain as GitHub actions (connector-actions.ts):
 *   Org → Agent (in-org) → Connection → canAgentUseCapability → Gmail API →
 *   structured outcome + audit. Tokens are decrypted only in memory.
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
import { createApproval } from './approvals.js';
import { ConnectorActionError, type ConnectorActionContext, type ConnectorActionResult } from './connector-actions.js';

export const GMAIL_CAPABILITIES = {
  draftEmail: 'gmail.email.draft',
  sendEmail: 'gmail.email.send',
} as const;

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const REQUEST_TIMEOUT_MS = 20_000;

/** Injectable fetch for tests. */
let fetchImpl: typeof fetch = fetch;
export function setGmailConnectorFetch(impl: typeof fetch): void {
  fetchImpl = impl;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailValid(email: string): boolean {
  return typeof email === 'string' && email.length <= 320 && EMAIL_RE.test(email);
}

/** Build a base64url RFC-5322 message from validated fields. */
export function buildMimeMessage(params: {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  inReplyToMessageId?: string;
}): string {
  const lines = [
    `To: ${params.to.join(', ')}`,
    params.cc?.length ? `Cc: ${params.cc.join(', ')}` : null,
    `Subject: ${params.subject}`,
    params.inReplyToMessageId ? `In-Reply-To: <${params.inReplyToMessageId}@mail.gmail.com>` : null,
    `References: ${params.inReplyToMessageId ? `<${params.inReplyToMessageId}@mail.gmail.com>` : ''}`.trim(),
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    params.body,
  ].filter((l): l is string => l !== null && l !== '');
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

async function gmailFetch(
  db: Db,
  ctx: ConnectorActionContext,
  capability: string,
  method: string,
  path: string,
  json?: Record<string, unknown>,
): Promise<{ data: Record<string, unknown>; providerId: string; requiresApproval: boolean }> {
  const correlationId = ctx.correlationId ?? randomUUID();
  const { allowed, requiresApproval, provider } = await canAgentUseCapability(
    db, ctx.orgId, ctx.agentId, 'gmail', capability,
  );

  const action = path.split('/').filter(Boolean).pop() ?? capability;
  const baseOutcome = {
    orgId: ctx.orgId,
    agentId: ctx.agentId,
    taskId: ctx.taskId ?? null,
    provider: 'gmail',
    capability,
    action,
    correlationId,
    requiresApproval,
  };

  if (!provider) throw new ConnectorActionError('Gmail is not connected for this organization', 'not_connected');
  if (!allowed) {
    await recordOutcome(db, { ...baseOutcome, providerId: provider.id, status: 'denied', summary: `Denied: agent lacks capability ${capability} for Gmail` });
    await appendAudit(db, {
      orgId: ctx.orgId, actorType: 'agent', actorId: ctx.agentId,
      action: 'connector.action.denied', outcome: 'denied',
      resultRef: JSON.stringify({ provider: 'gmail', capability, action }),
    });
    throw new ConnectorActionError(`Agent is not authorized for Gmail capability "${capability}".`, 'capability_denied');
  }

  const credential = await getCredentials(db, provider.id);
  const decrypted = decryptCredentialSecret(credential);
  // Google OAuth stores { accessToken, refreshToken } as JSON in the encrypted
  // blob; a plain token is the legacy form. Either way only the access token
  // leaves the decrypted scope — the refresh token never enters a request.
  let token: string | null = null;
  if (decrypted) {
    try {
      const parsed = JSON.parse(decrypted) as { accessToken?: string };
      token = parsed.accessToken ?? null;
    } catch {
      token = decrypted;
    }
  }
  if (!token) {
    await updateProviderStatus(db, provider.id, 'expired', 'Missing credentials');
    await recordOutcome(db, { ...baseOutcome, providerId: provider.id, status: 'failed', error: 'no_token', summary: 'Failed: no usable Gmail token' });
    throw new ConnectorActionError('Gmail connection has no usable token — reconnect required', 'not_connected');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(`${GMAIL_API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: json ? JSON.stringify(json) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const message = error instanceof Error ? error.message : 'Network error';
    await updateProviderStatus(db, provider.id, 'degraded', message);
    await recordOutcome(db, { ...baseOutcome, providerId: provider.id, status: 'failed', error: message.slice(0, 300), summary: `Failed: Gmail request error (${action})` });
    throw new ConnectorActionError(`Gmail request failed: ${message}`, 'provider_error');
  }
  clearTimeout(timer);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const message = `${response.status} ${text.slice(0, 200)}`.trim();
    if (response.status === 401 || response.status === 403) await updateProviderStatus(db, provider.id, 'expired', message);
    else if (response.status === 429) await updateProviderStatus(db, provider.id, 'degraded', 'Rate limited');
    else await updateProviderStatus(db, provider.id, 'degraded', message);
    await recordOutcome(db, { ...baseOutcome, providerId: provider.id, status: 'failed', error: message.slice(0, 300), summary: `Failed: Gmail rejected ${action} (${response.status})` });
    await appendAudit(db, {
      orgId: ctx.orgId, actorType: 'agent', actorId: ctx.agentId,
      action: 'connector.action.failed', outcome: 'failure',
      resultRef: JSON.stringify({ provider: 'gmail', capability, action, status: response.status }),
    });
    throw new ConnectorActionError(response.status === 429 ? 'Gmail rate limit reached — retry later' : `Gmail rejected the request: ${message}`, response.status === 429 ? 'rate_limited' : 'provider_error');
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  await updateProviderStatus(db, provider.id, 'connected');
  await recordOutcome(db, { ...baseOutcome, providerId: provider.id, status: 'success', summary: `Gmail ${action} completed`, result: data });
  await appendAudit(db, {
    orgId: ctx.orgId, actorType: 'agent', actorId: ctx.agentId,
    action: `connector.action.${action}`, outcome: 'success',
    resultRef: JSON.stringify({ provider: 'gmail', capability, correlationId }),
  });
  return { data, providerId: provider.id, requiresApproval };
}

interface EmailInput {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  inReplyToMessageId?: string;
}

function validateEmailInput(params: EmailInput): void {
  if (!Array.isArray(params.to) || params.to.length === 0 || params.to.some((t) => !isEmailValid(t))) {
    throw new ConnectorActionError('At least one valid recipient is required', 'invalid_params');
  }
  if (params.cc && params.cc.some((c) => !isEmailValid(c))) {
    throw new ConnectorActionError('Invalid cc recipient', 'invalid_params');
  }
  if (!params.subject?.trim()) throw new ConnectorActionError('subject is required', 'invalid_params');
  if (!params.body?.trim()) throw new ConnectorActionError('body is required', 'invalid_params');
}

/**
 * Draft an email (safe by default — nothing is sent). Returns the draft id.
 */
export async function gmailCreateDraft(
  db: Db,
  ctx: ConnectorActionContext,
  params: EmailInput,
): Promise<ConnectorActionResult<unknown>> {
  validateEmailInput(params);
  const { data } = await gmailFetch(db, ctx, GMAIL_CAPABILITIES.draftEmail, 'POST', '/drafts', {
    message: { raw: buildMimeMessage(params) },
  });
  const id = typeof data.id === 'string' ? data.id : null;
  return {
    capability: GMAIL_CAPABILITIES.draftEmail,
    action: 'create_draft',
    providerResourceId: id,
    providerUrl: null,
    status: 'success',
    result: { draftId: id, message: `Draft created (id: ${id ?? 'unknown'}) — nothing was sent.` },
  };
}

/**
 * Send a previously created draft. Guards:
 *   - capability must be granted
 *   - the capability must NOT be approval-gated — if it is, a pending approval
 *     is created and the outcome is `pending_approval`; nothing is sent.
 * Sending silently is never the default.
 */
export async function gmailSendDraft(
  db: Db,
  ctx: ConnectorActionContext,
  params: { draftId: string },
): Promise<ConnectorActionResult<unknown>> {
  if (!params.draftId?.trim()) throw new ConnectorActionError('draftId is required', 'invalid_params');

  const { allowed, requiresApproval, provider } = await canAgentUseCapability(
    db, ctx.orgId, ctx.agentId, 'gmail', GMAIL_CAPABILITIES.sendEmail,
  );
  if (!provider) throw new ConnectorActionError('Gmail is not connected for this organization', 'not_connected');
  if (!allowed) {
    await recordOutcome(db, {
      orgId: ctx.orgId, agentId: ctx.agentId, taskId: ctx.taskId ?? null, provider: 'gmail',
      providerId: provider.id, capability: GMAIL_CAPABILITIES.sendEmail, action: 'send_draft',
      status: 'denied', summary: 'Denied: agent lacks gmail.email.send capability',
      correlationId: ctx.correlationId ?? randomUUID(),
    });
    throw new ConnectorActionError('Agent is not authorized to send Gmail.', 'capability_denied');
  }
  if (requiresApproval) {
    const approval = await createApproval(db, {
      orgId: ctx.orgId,
      agentId: ctx.agentId,
      action: 'Gmail: send draft',
      description: `AI employee wants to SEND a Gmail draft (${params.draftId}). Approval is required before anything is transmitted.`,
      cost: 0,
      riskLevel: 'high',
      status: 'pending',
    });
    await recordOutcome(db, {
      orgId: ctx.orgId, agentId: ctx.agentId, taskId: ctx.taskId ?? null, provider: 'gmail',
      providerId: provider.id, capability: GMAIL_CAPABILITIES.sendEmail, action: 'send_draft',
      status: 'pending_approval', requiresApproval: true, approvalId: approval.id,
      summary: `Send queued for founder approval (${approval.id}). Nothing was sent.`,
      correlationId: ctx.correlationId ?? randomUUID(),
    });
    await appendAudit(db, {
      orgId: ctx.orgId, actorType: 'agent', actorId: ctx.agentId,
      action: 'connector.action.approval_required', outcome: 'success',
      resultRef: JSON.stringify({ provider: 'gmail', capability: GMAIL_CAPABILITIES.sendEmail, approvalId: approval.id }),
    });
    return {
      capability: GMAIL_CAPABILITIES.sendEmail,
      action: 'send_draft',
      providerResourceId: null,
      providerUrl: null,
      status: 'success',
      result: { mode: 'pending_approval', approvalId: approval.id, message: 'Send requires founder approval. Nothing was sent.' },
    };
  }

  const { data } = await gmailFetch(db, ctx, GMAIL_CAPABILITIES.sendEmail, 'POST', '/drafts/send', {
    id: params.draftId,
  });
  const msg = data.message as { id?: string } | undefined;
  const id = msg?.id ?? (typeof data.id === 'string' ? data.id : null);
  return {
    capability: GMAIL_CAPABILITIES.sendEmail,
    action: 'send_draft',
    providerResourceId: id,
    providerUrl: null,
    status: 'success',
    result: { messageId: id, message: `Draft sent (message id: ${id ?? 'unknown'}).` },
  };
}

/** List recent threads/messages (read-only). */
export async function gmailSearch(
  db: Db,
  ctx: ConnectorActionContext,
  params: { query?: string; maxResults?: number },
): Promise<ConnectorActionResult<unknown>> {
  const max = Math.min(params.maxResults && params.maxResults > 0 ? params.maxResults : 10, 50);
  const query = params.query?.trim() ? `?q=${encodeURIComponent(params.query.trim())}&maxResults=${max}` : `?maxResults=${max}`;
  const { data } = await gmailFetch(db, ctx, GMAIL_CAPABILITIES.draftEmail, 'GET', `/messages${query}`);
  return {
    capability: GMAIL_CAPABILITIES.draftEmail,
    action: 'search',
    providerResourceId: null,
    providerUrl: null,
    status: 'success',
    result: data,
  };
}

export async function dispatchGmailAction(
  db: Db,
  ctx: ConnectorActionContext,
  action: 'create_draft' | 'send_draft' | 'search',
  params: Record<string, unknown>,
): Promise<ConnectorActionResult<unknown>> {
  switch (action) {
    case 'create_draft':
      return gmailCreateDraft(db, ctx, {
        to: Array.isArray(params.to) ? params.to.map(String) : [],
        cc: Array.isArray(params.cc) ? params.cc.map(String) : undefined,
        subject: String(params.subject ?? ''),
        body: String(params.body ?? ''),
        inReplyToMessageId: params.inReplyToMessageId ? String(params.inReplyToMessageId) : undefined,
      });
    case 'send_draft':
      return gmailSendDraft(db, ctx, { draftId: String(params.draftId ?? '') });
    case 'search':
      return gmailSearch(db, ctx, {
        query: params.query ? String(params.query) : undefined,
        maxResults: Number(params.maxResults ?? 10),
      });
    default:
      throw new ConnectorActionError(`Unknown Gmail action: ${String(action)}`, 'invalid_params');
  }
}
