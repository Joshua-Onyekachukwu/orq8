import { and, eq, gte, sql } from 'drizzle-orm';
import { auditEvents } from '@orq8/db';
import type { Db } from '@orq8/db';

/**
 * Security monitoring over the audit trail (Phase 7, risk R-009).
 *
 * Failed logins, lockouts, tool denials, and approval rejections are all
 * audited per-event — but per-event rows are invisible as campaigns. This
 * scanner aggregates the recent window into typed signals the scheduled job
 * surfaces. Thresholds are deliberately conservative: ordinary user stumbles
 * (a few bad passwords, one refused tool) stay silent; a campaign does not.
 *
 * Read-only by design: it never writes, not even its own audit row (a
 * monitor that appends to the ledger it scans would feed itself).
 */

export type SignalSeverity = 'high' | 'medium';

export interface SecuritySignal {
  type: 'failed_login_spike' | 'account_lockout' | 'tool_denial_spike' | 'approval_rejection_spike';
  severity: SignalSeverity;
  count: number;
  summary: string;
}

export interface ScanOptions {
  windowMinutes?: number;
  failedLoginThreshold?: number;
  toolDenialThreshold?: number;
  approvalRejectionThreshold?: number;
}

const DEFAULTS = {
  windowMinutes: 60,
  failedLoginThreshold: 5,
  toolDenialThreshold: 5,
  approvalRejectionThreshold: 3,
};

async function countAction(db: Db, orgId: string, action: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(and(eq(auditEvents.orgId, orgId), eq(auditEvents.action, action), gte(auditEvents.occurredAt, since)));
  return row?.n ?? 0;
}

export async function scanSecuritySignals(db: Db, orgId: string, opts: ScanOptions = {}): Promise<SecuritySignal[]> {
  const o = { ...DEFAULTS, ...opts };
  const since = new Date(Date.now() - o.windowMinutes * 60_000);
  const signals: SecuritySignal[] = [];

  const failed = await countAction(db, orgId, 'auth.login_failed', since);
  if (failed >= o.failedLoginThreshold) {
    signals.push({
      type: 'failed_login_spike',
      severity: 'high',
      count: failed,
      summary: `${failed} failed logins in the last ${o.windowMinutes} minutes — possible brute-force campaign.`,
    });
  }

  const lockouts = await countAction(db, orgId, 'auth.account_locked', since);
  if (lockouts >= 1) {
    signals.push({
      type: 'account_lockout',
      severity: 'high',
      count: lockouts,
      summary: `${lockouts} brute-force lockout(s) engaged in the last ${o.windowMinutes} minutes.`,
    });
  }

  const denials = await countAction(db, orgId, 'tool.denied', since);
  if (denials >= o.toolDenialThreshold) {
    signals.push({
      type: 'tool_denial_spike',
      severity: 'medium',
      count: denials,
      summary: `${denials} agent tool denials in the last ${o.windowMinutes} minutes — possible permission probing.`,
    });
  }

  const rejections = await countAction(db, orgId, 'approval.rejected', since);
  if (rejections >= o.approvalRejectionThreshold) {
    signals.push({
      type: 'approval_rejection_spike',
      severity: 'medium',
      count: rejections,
      summary: `${rejections} founder approval rejections in the last ${o.windowMinutes} minutes — agent requests may be misaligned.`,
    });
  }

  return signals;
}
