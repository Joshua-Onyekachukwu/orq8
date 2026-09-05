/**
 * Webhook ingestion service (Phases 6–8).
 *
 * Providers POST events to /v1/webhooks/:provider. The receiver:
 *   1. verifies the HMAC signature (timing-safe)
 *   2. resolves the org (repo full_name for GitHub, URL-embedded orgId for Linear)
 *   3. normalizes the event to a small, structured shape
 *   4. persists it idempotently (external_event_id → unique index)
 *   5. returns immediately — processing happens in a later pass
 *
 * The process-pending pass evaluates org-scoped event rules and creates
 * notifications, approval-gated tasks, or nothing. High-impact actions stay
 * behind the existing approvals table — never auto-executed from a webhook.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  approvals,
  eventRules,
  organizations,
  repositories,
  tasks,
  webhookEvents,
  type Db,
  type NewEventRule,
  type WebhookEvent,
} from '@orq8/db';
import { decryptSecret, encryptSecret } from './crypto.js';
import { appendAudit } from './audit.js';
import { createNotification } from '../routes/notifications.js';

// ─── Signature verification ─────────────────────────────────────────────────

/**
 * Verify an HMAC-SHA256 signature header against the raw body.
 * Accepts both bare hex ("abc…") and prefixed ("sha256=abc…", GitHub's format).
 * Timing-safe compare; never throws on malformed input.
 */
export function verifySignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  if (!secret || !signatureHeader) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const received = signatureHeader.replace(/^sha256=/, '').trim();
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Replay protection where the provider sends an event timestamp.
 * Returns true when the header is absent (providers like GitHub don't send one —
 * idempotency via external_event_id covers replays there) or within maxAgeMs
 * in either direction (tolerates clock skew, rejects stale AND implausibly
 * future timestamps).
 */
export function verifyTimestamp(
  timestampHeader: string | undefined,
  maxAgeMs = 300_000,
  now = Date.now(),
): boolean {
  if (!timestampHeader) return true;
  const t = Date.parse(timestampHeader);
  if (Number.isNaN(t)) return false;
  return Math.abs(now - t) <= maxAgeMs;
}

/** Generate a random webhook secret (returns plaintext exactly once). */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

// ─── Event normalization ────────────────────────────────────────────────────

export interface NormalizedEvent {
  eventType: string;
  externalEventId: string | null;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
}

function pickPayload(
  body: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = body[f];
    if (v !== undefined) out[f] = v;
  }
  return out;
}

/**
 * Normalize a provider webhook body into a small structured event.
 * Returns null for event shapes ORQ8 doesn't act on.
 */
export function normalizeProviderEvent(
  provider: string,
  body: unknown,
): NormalizedEvent | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  if (provider === 'github') {
    const repo = (b.repository ?? {}) as Record<string, unknown>;
    const repoName = typeof repo.full_name === 'string' ? repo.full_name : 'unknown-repo';
    const actor =
      (typeof b.sender === 'object' && b.sender !== null && typeof (b.sender as Record<string, unknown>).login === 'string')
        ? ((b.sender as Record<string, unknown>).login as string)
        : 'unknown';

    if (b.pull_request && typeof b.pull_request === 'object') {
      const pr = b.pull_request as Record<string, unknown>;
      const action = typeof b.action === 'string' ? b.action : 'unknown';
      const eventType = `pr_${action}`;
      const number = pr.number ?? null;
      const title = typeof pr.title === 'string' ? pr.title : 'Untitled PR';
      return {
        eventType,
        externalEventId: typeof pr.id === 'number' || typeof pr.id === 'string' ? `pr_${pr.id}` : null,
        title,
        summary: `PR #${number} ${action} on ${repoName}: "${title}" (by ${actor})`,
        payload: {
          ...pickPayload(b, ['action', 'sender', 'repository']),
          number,
          title,
          html_url: pr.html_url ?? null,
          state: pr.state ?? null,
          user_login: actor,
          repository_full_name: repoName,
        },
      };
    }

    if (b.issue && typeof b.issue === 'object' && !b.pull_request) {
      const issue = b.issue as Record<string, unknown>;
      const action = typeof b.action === 'string' ? b.action : 'unknown';
      const eventType = `issue_${action}`;
      const number = issue.number ?? null;
      const title = typeof issue.title === 'string' ? issue.title : 'Untitled issue';
      return {
        eventType,
        externalEventId: typeof issue.id === 'number' || typeof issue.id === 'string' ? `issue_${issue.id}` : null,
        title,
        summary: `Issue #${number} ${action} on ${repoName}: "${title}" (by ${actor})`,
        payload: {
          ...pickPayload(b, ['action', 'sender', 'repository']),
          number,
          title,
          html_url: issue.html_url ?? null,
          state: issue.state ?? null,
          user_login: actor,
          repository_full_name: repoName,
        },
      };
    }

    if (b.comment && typeof b.comment === 'object') {
      const comment = b.comment as Record<string, unknown>;
      const subject = (b.issue ?? b.pull_request) as Record<string, unknown> | undefined;
      const action = typeof b.action === 'string' ? b.action : 'unknown';
      const eventType = `comment_${action}`;
      return {
        eventType,
        externalEventId: typeof comment.id === 'number' || typeof comment.id === 'string' ? `comment_${comment.id}` : null,
        title: 'Comment',
        summary: `Comment ${action} on ${subject ? `#${subject.number ?? ''} ` : ''}${repoName} (by ${actor})`,
        payload: {
          ...pickPayload(b, ['action', 'sender', 'repository']),
          comment_id: comment.id ?? null,
          user_login: actor,
          repository_full_name: repoName,
        },
      };
    }

    if (b.head_commit && typeof b.head_commit === 'object') {
      const commit = b.head_commit as Record<string, unknown>;
      const eventType = 'push';
      return {
        eventType,
        externalEventId: typeof commit.id === 'string' ? `commit_${commit.id}` : null,
        title: typeof commit.message === 'string' ? commit.message.split('\n')[0]! : 'Push',
        summary: `Push to ${repoName}: ${typeof commit.message === 'string' ? commit.message.split('\n')[0] : 'new commit'} (by ${actor})`,
        payload: {
          ...pickPayload(b, ['sender', 'repository', 'ref']),
          commit_sha: commit.id ?? null,
          user_login: actor,
          repository_full_name: repoName,
        },
      };
    }

    return null; // unsupported GitHub event shape
  }

  if (provider === 'linear') {
    const type = typeof b.type === 'string' ? b.type.toLowerCase() : null;
    const action = typeof b.action === 'string' ? b.action : null;
    const data = (b.data ?? {}) as Record<string, unknown>;
    const dataId = typeof data.id === 'string' ? data.id : null;
    if (!type || !action || !dataId) return null;

    const title =
      typeof data.title === 'string'
        ? data.title
        : `${type.charAt(0).toUpperCase() + type.slice(1)} ${action}`;
    const eventType = `${action}_${type}`;
    return {
      eventType,
      externalEventId: `${type}_${dataId}`,
      title,
      summary: `${type.charAt(0).toUpperCase() + type.slice(1)} ${action}: "${title}"`,
      payload: {
        ...pickPayload(b, ['type', 'action']),
        id: dataId,
        title,
        state: data.state ?? null,
        url: data.url ?? null,
      },
    };
  }

  // Unknown provider — reject rather than guess.
  return null;
}

// ─── Org-scoped webhook secrets (stored encrypted in org settings) ──────────

interface WebhookSecretStore {
  secretEncrypted: string;
  secretHash: string;
  createdAt: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function readOrgSettings(db: Db, orgId: string): Promise<Record<string, unknown>> {
  const rows = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return ((rows[0]?.settings as Record<string, unknown>) ?? {}) as Record<string, unknown>;
}

async function writeOrgSettings(db: Db, orgId: string, settings: Record<string, unknown>): Promise<void> {
  await db
    .update(organizations)
    .set({ settings: settings as typeof organizations.$inferInsert.settings })
    .where(eq(organizations.id, orgId));
}

/**
 * Store a webhook secret for a provider (encrypted at rest; hash kept for
 * lookup/diagnostics). Returns the plaintext secret so the caller can show it
 * once (the standard provider setup flow).
 */
export async function storeWebhookSecret(
  db: Db,
  orgId: string,
  provider: string,
  secret: string,
): Promise<string> {
  const settings = await readOrgSettings(db, orgId);
  const webhooks = (settings.webhooks as Record<string, unknown>) ?? {};
  webhooks[provider] = {
    secretEncrypted: encryptSecret(secret),
    secretHash: sha256(secret),
    createdAt: new Date().toISOString(),
  };
  settings.webhooks = webhooks;
  await writeOrgSettings(db, orgId, settings);
  return secret;
}

/** Decrypt the stored webhook secret for an org+provider, or null. */
export async function getWebhookSecret(
  db: Db,
  orgId: string,
  provider: string,
): Promise<string | null> {
  const settings = await readOrgSettings(db, orgId);
  const webhooks = (settings.webhooks as Record<string, unknown>) ?? {};
  const store = webhooks[provider] as WebhookSecretStore | undefined;
  if (!store?.secretEncrypted) return null;
  return decryptSecret(store.secretEncrypted);
}

/** Whether a webhook secret exists for org+provider (no secret value). */
export async function hasWebhookSecret(db: Db, orgId: string, provider: string): Promise<boolean> {
  const settings = await readOrgSettings(db, orgId);
  const webhooks = (settings.webhooks as Record<string, unknown>) ?? {};
  const store = webhooks[provider] as WebhookSecretStore | undefined;
  return Boolean(store?.secretEncrypted);
}

/** Rotate: generate, store, and return the new plaintext secret. */
export async function rotateWebhookSecret(db: Db, orgId: string, provider: string): Promise<string> {
  const secret = generateWebhookSecret();
  await storeWebhookSecret(db, orgId, provider, secret);
  return secret;
}

// ─── Idempotent persistence ─────────────────────────────────────────────────

/**
 * Persist a normalized webhook event. Returns { inserted: true } on first
 * insert and { inserted: false } for a duplicate (provider redelivery) — the
 * caller still returns 200 so the provider stops retrying.
 */
export async function ingestWebhookEvent(
  db: Db,
  data: {
    orgId: string;
    provider: string;
    eventType: string;
    title?: string | null;
    externalEventId: string | null;
    payload: Record<string, unknown>;
    headers: Record<string, unknown>;
    correlationId?: string;
  },
): Promise<{ inserted: boolean; event?: WebhookEvent }> {
  if (data.externalEventId) {
    const [existing] = await db
      .select()
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.orgId, data.orgId),
          eq(webhookEvents.provider, data.provider),
          eq(webhookEvents.externalEventId, data.externalEventId),
        ),
      )
      .limit(1);
    if (existing) return { inserted: false, event: existing };
  }

  const rows = await db
    .insert(webhookEvents)
    .values({
      orgId: data.orgId,
      provider: data.provider,
      eventType: data.eventType,
      title: data.title ?? null,
      externalEventId: data.externalEventId,
      payload: data.payload as typeof webhookEvents.$inferInsert.payload,
      headers: data.headers as typeof webhookEvents.$inferInsert.headers,
      correlationId: data.correlationId ?? null,
    })
    .returning();
  const event = rows[0];
  if (!event) return { inserted: false };
  return { inserted: true, event };
}

// ─── Rule evaluation → notification / approval-gated task ───────────────────

export interface ProcessResult {
  scanned: number;
  processed: number;
  failed: number;
  dead: number;
  createdTasks: number;
  createdApprovals: number;
  notified: number;
  skippedNoRule: number;
}

const MAX_RETRIES = 5;

/** Interpolate {placeholders} in a task title template from the event payload. */
export function interpolateTemplate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const v = payload[key];
    if (v === undefined || v === null) return `{${key}}`;
    return String(v);
  });
}

async function applyRule(
  db: Db,
  event: WebhookEvent,
  rule: NewEventRule,
): Promise<'notified' | 'task' | 'approval' | 'ignored'> {
  if (rule.action === 'ignore') return 'ignored';

  const title = rule.taskTitleTemplate
    ? interpolateTemplate(rule.taskTitleTemplate, event.payload as Record<string, unknown>)
    : `${event.eventType}: ${event.title ?? ''}`;
  const summary = event.title ?? event.eventType;
  const agentId = rule.agentId ?? null;

  if (rule.action === 'notify') {
    await createNotification(db, event.orgId, 'system', title, summary);
    return 'notified';
  }

  // create_task — always goes through the approval gate when configured so.
  if (rule.requiresApproval) {
    const rows = await db
      .insert(approvals)
      .values({
        orgId: event.orgId,
        agentId,
        action: `event.${event.provider}.${event.eventType}`,
        description: summary,
        cost: 0,
        riskLevel: 'medium',
        status: 'pending',
      })
      .returning({ id: approvals.id });
    await createNotification(
      db,
      event.orgId,
      'approval',
      'Approval Required',
      `${summary} — from ${event.provider} webhook (${event.eventType}).`,
    );
    await appendAudit(db, {
      orgId: event.orgId,
      actorType: 'system',
      action: 'event.rule.approval_created',
      approvalId: rows[0]?.id ?? null,
      outcome: 'success',
      inputRef: event.id,
    });
    return 'approval';
  }

  const rows = await db
    .insert(tasks)
    .values({
      orgId: event.orgId,
      agentId,
      title,
      description: summary,
      status: 'pending',
    })
    .returning({ id: tasks.id });
  await createNotification(db, event.orgId, 'task', 'New Task from Event', title);
  await appendAudit(db, {
    orgId: event.orgId,
    actorType: 'system',
    action: 'event.rule.task_created',
    taskId: rows[0]?.id ?? null,
    outcome: 'success',
    inputRef: event.id,
  });
  return 'task';
}

/**
 * Process pending webhook events (one pass). Bounded batch; per-event
 * try/catch so a single bad event never halts the queue. Failed events are
 * retried (status 'failed'), then dead-lettered after MAX_RETRIES.
 */
export async function processPendingEvents(
  db: Db,
  opts: { limit?: number } = {},
): Promise<ProcessResult> {
  const limit = opts.limit ?? 50;
  const result: ProcessResult = {
    scanned: 0,
    processed: 0,
    failed: 0,
    dead: 0,
    createdTasks: 0,
    createdApprovals: 0,
    notified: 0,
    skippedNoRule: 0,
  };

  const pending = await db
    .select()
    .from(webhookEvents)
    // pending rows have retry_count 0; failed rows get retried up to the cap.
    .where(inArray(webhookEvents.status, ['pending', 'failed']))
    .orderBy(asc(webhookEvents.receivedAt))
    .limit(limit);

  for (const event of pending) {
    result.scanned++;
    try {
      const rules = await db
        .select()
        .from(eventRules)
        .where(
          and(
            eq(eventRules.orgId, event.orgId),
            eq(eventRules.provider, event.provider),
            eq(eventRules.eventType, event.eventType),
            eq(eventRules.enabled, true),
          ),
        )
        .limit(5);

      if (rules.length === 0) {
        result.skippedNoRule++;
        await db
          .update(webhookEvents)
          .set({ status: 'processed', processedAt: new Date() })
          .where(eq(webhookEvents.id, event.id));
        continue;
      }

      for (const rule of rules) {
        const outcome = await applyRule(db, event, rule);
        if (outcome === 'task') result.createdTasks++;
        if (outcome === 'approval') result.createdApprovals++;
        if (outcome === 'notified') result.notified++;
      }

      await db
        .update(webhookEvents)
        .set({ status: 'processed', processedAt: new Date(), lastError: null })
        .where(eq(webhookEvents.id, event.id));
      result.processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      const retryCount = event.retryCount + 1;
      const dead = retryCount >= MAX_RETRIES;
      await db
        .update(webhookEvents)
        .set({
          status: dead ? 'dead' : 'failed',
          retryCount,
          lastError: message.slice(0, 500),
        })
        .where(eq(webhookEvents.id, event.id));
      if (dead) result.dead++;
      else result.failed++;
    }
  }

  return result;
}

// ─── Rule CRUD (org-scoped, upsert per provider+eventType) ──────────────────

export async function listRules(db: Db, orgId: string) {
  return db
    .select()
    .from(eventRules)
    .where(eq(eventRules.orgId, orgId))
    .orderBy(asc(eventRules.provider), asc(eventRules.eventType));
}

export async function upsertRule(
  db: Db,
  orgId: string,
  data: Omit<NewEventRule, 'orgId'>,
): Promise<unknown> {
  const [existing] = await db
    .select({ id: eventRules.id })
    .from(eventRules)
    .where(
      and(
        eq(eventRules.orgId, orgId),
        eq(eventRules.provider, data.provider),
        eq(eventRules.eventType, data.eventType),
      ),
    )
    .limit(1);

  if (existing) {
    const rows = await db
      .update(eventRules)
      .set({
        action: data.action,
        agentId: data.agentId ?? null,
        taskTitleTemplate: data.taskTitleTemplate ?? null,
        requiresApproval: data.requiresApproval ?? false,
        enabled: data.enabled ?? true,
        updatedAt: new Date(),
      })
      .where(eq(eventRules.id, existing.id))
      .returning();
    return rows[0];
  }

  const rows = await db
    .insert(eventRules)
    .values({
      orgId,
      provider: data.provider,
      eventType: data.eventType,
      action: data.action,
      agentId: data.agentId ?? null,
      taskTitleTemplate: data.taskTitleTemplate ?? null,
      requiresApproval: data.requiresApproval ?? false,
      enabled: data.enabled ?? true,
    })
    .returning();
  return rows[0];
}

export async function deleteRule(db: Db, orgId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(eventRules)
    .where(and(eq(eventRules.id, id), eq(eventRules.orgId, orgId)))
    .returning({ id: eventRules.id });
  return rows.length > 0;
}

// ─── Org resolution for receivers ───────────────────────────────────────────

/**
 * Resolve the org owning a GitHub repository by full_name ("owner/repo").
 * Used by the GitHub webhook receiver before signature verification (the
 * repo → org mapping is itself authorization — an event for an unknown repo
 * is rejected).
 */
export async function resolveOrgByRepoFullName(
  db: Db,
  fullName: string,
): Promise<{ orgId: string; repositoryId: string } | null> {
  const rows = await db
    .select({ orgId: repositories.orgId, repositoryId: repositories.id })
    .from(repositories)
    .where(eq(repositories.fullName, fullName))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { orgId: row.orgId, repositoryId: row.repositoryId };
}