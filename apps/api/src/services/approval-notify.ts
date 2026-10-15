import { and, eq } from 'drizzle-orm';
import { memberships, organizations, users, type Db } from '@orq8/db';
import type { AppConfig } from '@orq8/core';
import type { Logger } from 'pino';
import { createEmailTransport } from '../email/transport.js';
import { approvalEmail } from '../email/transactional.js';
import { getNotificationPrefs, shouldNotify } from './notification-preferences.js';

type Log = Pick<Logger, 'info' | 'warn'>;

export interface GateEmailInput {
  action: string;
  description: string | null;
  cost: number;
  riskLevel: string;
}

/**
 * Email the org owner when a new approval gate opens (Wk2 Attention push).
 *
 * Covers every gate source: call it wherever a NEW pending approval row is
 * created (POST /v1/approvals and the executor's gate sites). Deduplicated
 * gates (findOpenGate reuse) must not re-email — only call on insert.
 *
 * Pref-gated (`emailOnApproval`, default on), owner-addressed, and never
 * fatal: without SMTP configured the transport degrades to log-only, and any
 * failure is a warning. Returns whether an email was handed to the transport.
 */
export async function sendGateEmail(
  db: Db,
  config: AppConfig,
  logger: Log | undefined,
  orgId: string,
  gate: GateEmailInput,
  agentName: string | null,
): Promise<{ sent: boolean; reason: string }> {
  const log = (logger ?? console) as Log;
  try {
    const prefs = await getNotificationPrefs(db, orgId);
    if (!shouldNotify(prefs, 'email', 'approval')) {
      return { sent: false, reason: 'opt-out' };
    }

    const [orgRow] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    const rows = await db
      .select({ email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.orgId, orgId), eq(memberships.role, 'owner')))
      .limit(1);
    const ownerEmail = rows[0]?.email ?? null;
    if (!ownerEmail) {
      return { sent: false, reason: 'no-owner-email' };
    }

    const approvalsUrl = `${(config.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/app/approvals`;
    const email = approvalEmail({
      orgName: orgRow?.name ?? 'your company',
      agentName,
      action: gate.action,
      description: gate.description,
      costCents: gate.cost,
      riskLevel: gate.riskLevel,
      approvalsUrl,
    });
    const transport = createEmailTransport(config, log as Logger);
    const result = await transport.send({
      to: ownerEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    if (!result.ok) {
      log.warn({ orgId, error: result.error }, 'gate email failed — in-app + realtime already notified');
      return { sent: false, reason: 'send-failed' };
    }
    log.info({ orgId }, 'gate email sent to org owner');
    return { sent: true, reason: 'sent' };
  } catch (err) {
    log.warn({ err, orgId }, 'gate email failed — in-app + realtime already notified');
    return { sent: false, reason: 'error' };
  }
}
