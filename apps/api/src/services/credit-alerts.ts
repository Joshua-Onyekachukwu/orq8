import { eq, and, desc, gte, isNull, sql } from 'drizzle-orm';
import { creditAlerts, organizations, type Db } from '@orq8/db';
import type { CreditBalanceInfo } from './credits.js';
import { notifyWithPrefs } from './notification-preferences.js';

/**
 * Credit Usage Alerts Service
 *
 * Monitors credit balance thresholds and sends alerts when:
 * - Balance drops below 80% (warning)
 * - Balance drops below 20% (low)
 * - Balance drops below 5% (critical)
 * - Balance reaches 0% (exhausted)
 *
 * Prevents duplicate alerts within a cooldown window (4 hours).
 * Sends email notifications for low/critical/exhausted states.
 */

// ─── Alert Thresholds ───────────────────────────────────────────────────────

export const ALERT_THRESHOLDS = {
  /** Below this utilization %, send a warning */
  warning: 80,
  /** Below this utilization %, send a low balance alert */
  low: 95,
  /** Below this utilization %, send a critical alert */
  critical: 99,
  /** At this utilization %, send an exhausted alert */
  exhausted: 100,
} as const;

/** Cooldown between duplicate alerts of the same type (4 hours) */
const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000;

// ─── Types ──────────────────────────────────────────────────────────────────

export type AlertType = 'warning' | 'low' | 'critical' | 'exhausted';

export interface CreditAlertRecord {
  id: string;
  orgId: string;
  type: AlertType;
  threshold: number;
  message: string;
  sentAt: Date;
  readAt: Date | null;
  emailSent: boolean;
  metadata: Record<string, unknown>;
}

// ─── Threshold Detection ────────────────────────────────────────────────────

/**
 * Determine which alert type (if any) should be triggered based on current balance.
 */
export function detectAlertType(balance: CreditBalanceInfo): AlertType | null {
  if (balance.total === 0) return null;

  const utilizationPercent = Math.round((balance.used / balance.total) * 100);

  if (utilizationPercent >= ALERT_THRESHOLDS.exhausted) return 'exhausted';
  if (utilizationPercent >= ALERT_THRESHOLDS.critical) return 'critical';
  if (utilizationPercent >= ALERT_THRESHOLDS.low) return 'low';
  if (utilizationPercent >= ALERT_THRESHOLDS.warning) return 'warning';

  return null;
}

/**
 * Check if an alert was already sent recently (within cooldown window).
 */
async function hasRecentAlert(
  db: Db,
  orgId: string,
  alertType: AlertType,
): Promise<boolean> {
  const cooldownStart = new Date(Date.now() - ALERT_COOLDOWN_MS);

  const [recent] = await db
    .select({ id: creditAlerts.id })
    .from(creditAlerts)
    .where(
      and(
        eq(creditAlerts.orgId, orgId),
        eq(creditAlerts.type, alertType),
        gte(creditAlerts.sentAt, cooldownStart),
      ),
    )
    .limit(1);

  return !!recent;
}

// ─── Alert Creation ─────────────────────────────────────────────────────────

/**
 * Create an alert record in the database.
 */
async function createAlert(
  db: Db,
  orgId: string,
  alertType: AlertType,
  threshold: number,
  message: string,
  metadata: Record<string, unknown>,
): Promise<CreditAlertRecord> {
  const [created] = await db
    .insert(creditAlerts)
    .values({
      orgId,
      type: alertType,
      threshold,
      message,
      emailSent: false,
      metadata,
    })
    .returning();

  return created as CreditAlertRecord;
}

/**
 * Check credit balance and create alerts if thresholds are breached.
 * Returns the alert that was created, or null if no alert was needed.
 */
export async function checkAndAlert(
  db: Db,
  orgId: string,
  balance: CreditBalanceInfo,
  opts?: { email?: { transporter: import('../email/transport.js').EmailTransport; founderEmail: string; orgName: string } },
): Promise<CreditAlertRecord | null> {
  const alertType = detectAlertType(balance);
  if (!alertType) return null;

  // Don't send duplicate alerts within cooldown
  const alreadySent = await hasRecentAlert(db, orgId, alertType);
  if (alreadySent) return null;

  const utilizationPercent = balance.total > 0
    ? Math.round((balance.used / balance.total) * 100)
    : 0;

  // Build alert message
  const messages: Record<AlertType, string> = {
    warning: `Your Work Credits are at ${utilizationPercent}% utilization. ${balance.remaining} credits remaining of ${balance.total} this period.`,
    low: `Work Credits running low — ${balance.remaining} remaining of ${balance.total} (${utilizationPercent}% used). Consider topping up or upgrading your plan.`,
    critical: `Work Credits critically low — only ${balance.remaining} remaining. Your AI employees may not be able to complete tasks. Top up now or upgrade your plan.`,
    exhausted: `Work Credits exhausted. All AI employee operations are paused until you top up or upgrade your plan.`,
  };

  const alert = await createAlert(
    db,
    orgId,
    alertType,
    utilizationPercent,
    messages[alertType],
    {
      remaining: balance.remaining,
      total: balance.total,
      utilizationPercent,
      periodEnd: balance.periodEnd.toISOString(),
      daysRemaining: balance.daysRemaining,
    },
  );

  // Create in-app notification gated by user preferences
  try {
    await notifyWithPrefs({
      db,
      orgId,
      type: 'credit',
      inApp: {
        title: `Work Credits — ${alertType.charAt(0).toUpperCase() + alertType.slice(1)}`,
        message: messages[alertType],
        notificationType: 'credit',
      },
    });
  } catch { /* notification failure is non-fatal */ }

  // Send email if transport provided and user preferences allow
  if (opts?.email) {
    try {
      const { shouldNotify, getNotificationPrefs } = await import('./notification-preferences.js');
      const prefs = await getNotificationPrefs(db, orgId);
      if (shouldNotify(prefs, 'email', 'credit')) {
        const { creditAlertEmail } = await import('../email/transactional.js');
        const email = creditAlertEmail({
          orgName: opts.email.orgName,
          alertType,
          remaining: balance.remaining,
          total: balance.total,
          utilizationPercent,
          daysRemaining: balance.daysRemaining,
        });
        await opts.email.transporter.send({
          to: opts.email.founderEmail,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
        // Mark email as sent in the alert record
        await db
          .update(creditAlerts)
          .set({ emailSent: true })
          .where(eq(creditAlerts.id, alert.id));
      }
    } catch { /* email failure is non-fatal */ }
  }

  return alert;
}

// ─── Email Templates ────────────────────────────────────────────────────────

/**
 * Generate the HTML email for a credit alert.
 */
export function creditAlertEmailHtml(
  alertType: AlertType,
  orgName: string,
  balance: CreditBalanceInfo,
): { subject: string; text: string; html: string } {
  const utilizationPercent = balance.total > 0
    ? Math.round((balance.used / balance.total) * 100)
    : 0;

  const subjects: Record<AlertType, string> = {
    warning: `[ORQ8] Work Credits at ${utilizationPercent}% — ${balance.remaining} remaining`,
    low: `[ORQ8] Work Credits running low — ${balance.remaining} remaining`,
    critical: `[ORQ8] ⚠️ Work Credits critically low — only ${balance.remaining} left`,
    exhausted: `[ORQ8] 🚨 Work Credits exhausted — action required`,
  };

  const headlines: Record<AlertType, string> = {
    warning: 'Work Credits — usage update',
    low: 'Work Credits — running low',
    critical: 'Work Credits — critically low',
    exhausted: 'Work Credits — exhausted',
  };

  const bodyLines: Record<AlertType, string[]> = {
    warning: [
      `Your AI organization <strong>${orgName}</strong> has used ${utilizationPercent}% of its monthly Work Credits.`,
      `<strong>${balance.remaining}</strong> credits remain out of <strong>${balance.total}</strong> this period.`,
      `At current usage, you have approximately <strong>${balance.daysRemaining} days</strong> left in this billing cycle.`,
    ],
    low: [
      `Your AI organization <strong>${orgName}</strong> is running low on Work Credits.`,
      `Only <strong>${balance.remaining}</strong> credits remain out of <strong>${balance.total}</strong> (${utilizationPercent}% used).`,
      `Your AI employees may not be able to complete all assigned tasks if credits run out.`,
    ],
    critical: [
      `Your AI organization <strong>${orgName}</strong> has critically low Work Credits.`,
      `Only <strong>${balance.remaining}</strong> credits remain. AI employee operations may fail.`,
      `<strong>Top up credits or upgrade your plan</strong> to keep your AI workforce running.`,
    ],
    exhausted: [
      `Your AI organization <strong>${orgName}</strong> has <strong>exhausted all Work Credits</strong>.`,
      `All AI employee operations are currently paused.`,
      `<strong>Top up credits or upgrade your plan</strong> to resume operations.`,
    ],
  };

  const NAVY = '#0a1024';
  const INK = '#1c2540';
  const MUTED = '#5b6478';
  const HAIRLINE = '#e4e7ef';
  const LIME = '#b6e63d';
  const BG = '#f7f8fb';

  const accentColor: Record<AlertType, string> = {
    warning: '#f59e0b',
    low: '#f97316',
    critical: '#ef4444',
    exhausted: '#dc2626',
  };

  const bodyHtml = bodyLines[alertType]
    .map((line) => `<p style="margin:12px 0;font-size:15px;line-height:1.6;">${line}</p>`)
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${HAIRLINE};border-radius:12px;overflow:hidden;">
      <tr><td style="background:${NAVY};padding:20px 28px;">
        <span style="font-family:'JetBrains Mono',Consolas,Menlo,monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${accentColor[alertType]};">${headlines[alertType]}</span>
        <span style="float:right;color:#ffffff;font-weight:700;font-size:15px;letter-spacing:0.06em;">ORQ8</span>
      </td></tr>
      <tr><td style="padding:32px 28px;font-size:15px;line-height:1.6;">
        ${bodyHtml}
        <p style="margin:24px 0 8px;"><a href="${process.env.APP_URL ?? 'http://localhost:3000'}/app/budgets" style="display:inline-block;background:${LIME};color:${NAVY};font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;font-family:'JetBrains Mono',Consolas,Menlo,monospace;font-size:13px;">View Credits & Upgrade</a></p>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid ${HAIRLINE};color:${MUTED};font-size:12px;line-height:1.5;">
        ORQ8 — the AI organization operating system.<br />
        <span style="font-family:'JetBrains Mono',Consolas,Menlo,monospace;">manage alerts in Settings · founder@orq8.ai</span>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;

  const text = [
    headlines[alertType],
    '',
    ...bodyLines[alertType].map((line) => line.replace(/<[^>]+>/g, '')),
    '',
    `View Credits & Upgrade: ${process.env.APP_URL ?? 'http://localhost:3000'}/app/budgets`,
    '',
    'ORQ8 — the AI organization operating system.',
  ].join('\n');

  return {
    subject: subjects[alertType],
    text,
    html,
  };
}

// ─── Alert Queries ──────────────────────────────────────────────────────────

/**
 * Get all alerts for an organization, newest first.
 */
export async function getAlerts(
  db: Db,
  orgId: string,
  limit: number = 20,
  unreadOnly: boolean = false,
): Promise<CreditAlertRecord[]> {
  const conditions = [eq(creditAlerts.orgId, orgId)];
  if (unreadOnly) {
    conditions.push(isNull(creditAlerts.readAt));
  }

  const list = await db
    .select()
    .from(creditAlerts)
    .where(and(...conditions))
    .orderBy(desc(creditAlerts.sentAt))
    .limit(limit);

  return list as CreditAlertRecord[];
}

/**
 * Get unread alert count for an organization.
 */
export async function getUnreadCount(
  db: Db,
  orgId: string,
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creditAlerts)
    .where(
      and(
        eq(creditAlerts.orgId, orgId),
        isNull(creditAlerts.readAt),
      ),
    );

  return result?.count ?? 0;
}

/**
 * Mark an alert as read.
 */
export async function markAsRead(
  db: Db,
  alertId: string,
  orgId: string,
): Promise<boolean> {
  const result = await db
    .update(creditAlerts)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(creditAlerts.id, alertId),
        eq(creditAlerts.orgId, orgId),
      ),
    )
    .returning();

  return result.length > 0;
}

/**
 * Mark all alerts for an org as read.
 */
export async function markAllAsRead(
  db: Db,
  orgId: string,
): Promise<number> {
  const result = await db
    .update(creditAlerts)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(creditAlerts.orgId, orgId),
        isNull(creditAlerts.readAt),
      ),
    )
    .returning();

  return result.length;
}
