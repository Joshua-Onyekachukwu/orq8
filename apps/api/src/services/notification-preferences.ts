import { eq } from 'drizzle-orm';
import { organizations, type Db } from '@orq8/db';
import type { createNotification } from '../routes/notifications.js';
import { creditAlertEmailHtml, type AlertType } from './credit-alerts.js';

/**
 * Notification Preferences Service
 *
 * Reads notification preferences from the organization's settings JSONB column
 * and gates both in-app notification creation and email sending.
 *
 * Usage:
 *   const prefs = await getNotificationPrefs(db, orgId);
 *   if (shouldNotify(prefs, 'email', 'approval')) { ... }
 *   if (shouldNotify(prefs, 'inApp', 'task')) { ... }
 */

// ─── Preference Types ──────────────────────────────────────────────────────

export interface NotificationPreferences {
  emailOnApproval: boolean;
  emailOnTaskComplete: boolean;
  emailOnAgentError: boolean;
  emailOnLowCredits: boolean;
  emailOnWeeklyReport: boolean;
  browserNotifications: boolean;
  soundEnabled: boolean;
}

export type NotificationChannel = 'email' | 'inApp';
export type NotificationType = 'approval' | 'task' | 'agent' | 'credit' | 'system' | 'report';

const DEFAULT_PREFS: NotificationPreferences = {
  emailOnApproval: true,
  emailOnTaskComplete: true,
  emailOnAgentError: true,
  emailOnLowCredits: true,
  emailOnWeeklyReport: true,
  browserNotifications: true,
  soundEnabled: true,
};

// ─── Map notification types to preference keys ─────────────────────────────

const EMAIL_PREF_MAP: Record<string, keyof NotificationPreferences> = {
  approval: 'emailOnApproval',
  task: 'emailOnTaskComplete',
  agent: 'emailOnAgentError',
  credit: 'emailOnLowCredits',
  report: 'emailOnWeeklyReport',
};

// ─── Preferences Reader ────────────────────────────────────────────────────

/**
 * Read notification preferences for an organization from the DB.
 * Falls back to defaults if no preferences are stored.
 */
export async function getNotificationPrefs(
  db: Db,
  orgId: string,
): Promise<NotificationPreferences> {
  const [row] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const settings = (row?.settings as Record<string, unknown>) ?? {};
  const stored = (settings.notifications as Record<string, unknown>) ?? {};

  return {
    emailOnApproval: typeof stored.emailOnApproval === 'boolean' ? stored.emailOnApproval : DEFAULT_PREFS.emailOnApproval,
    emailOnTaskComplete: typeof stored.emailOnTaskComplete === 'boolean' ? stored.emailOnTaskComplete : DEFAULT_PREFS.emailOnTaskComplete,
    emailOnAgentError: typeof stored.emailOnAgentError === 'boolean' ? stored.emailOnAgentError : DEFAULT_PREFS.emailOnAgentError,
    emailOnLowCredits: typeof stored.emailOnLowCredits === 'boolean' ? stored.emailOnLowCredits : DEFAULT_PREFS.emailOnLowCredits,
    emailOnWeeklyReport: typeof stored.emailOnWeeklyReport === 'boolean' ? stored.emailOnWeeklyReport : DEFAULT_PREFS.emailOnWeeklyReport,
    browserNotifications: typeof stored.browserNotifications === 'boolean' ? stored.browserNotifications : DEFAULT_PREFS.browserNotifications,
    soundEnabled: typeof stored.soundEnabled === 'boolean' ? stored.soundEnabled : DEFAULT_PREFS.soundEnabled,
  };
}

// ─── Preference Guards ─────────────────────────────────────────────────────

/**
 * Check if a notification should be sent on a given channel.
 *
 * @param prefs - The org's notification preferences
 * @param channel - 'email' or 'inApp'
 * @param type - The notification type
 * @returns true if the notification should proceed
 */
export function shouldNotify(
  prefs: NotificationPreferences,
  channel: NotificationChannel,
  type: NotificationType,
): boolean {
  if (channel === 'inApp') {
    // In-app notifications respect browserNotifications toggle for non-critical types.
    // Credit alerts and approvals always show in-app regardless of the toggle.
    if (type === 'credit' || type === 'approval') return true;
    return prefs.browserNotifications;
  }

  if (channel === 'email') {
    const prefKey = EMAIL_PREF_MAP[type];
    if (!prefKey) return false; // Unknown type — don't email
    return prefs[prefKey];
  }

  return false;
}

// ─── Convenience: Pref-Gated Notification + Email ──────────────────────────

export interface NotifyOptions {
  db: Db;
  orgId: string;
  type: NotificationType;
  /** In-app notification data */
  inApp?: {
    title: string;
    message: string;
    notificationType: 'approval' | 'task' | 'credit' | 'agent' | 'system';
  };
  /** Email data (only sent if prefs allow) */
  email?: {
    alertType: AlertType;
    orgName: string;
    balance: { total: number; used: number; remaining: number; daysRemaining: number; periodEnd: Date };
  };
}

/**
 * Create an in-app notification and optionally send an email,
 * both gated by the org's notification preferences.
 *
 * Returns { inAppCreated, emailQueued } so callers know what happened.
 */
export async function notifyWithPrefs(
  options: NotifyOptions,
): Promise<{ inAppCreated: boolean; emailQueued: boolean }> {
  const { db, orgId, type, inApp, email } = options;
  const prefs = await getNotificationPrefs(db, orgId);

  let inAppCreated = false;
  let emailQueued = false;

  // In-app notification
  if (inApp && shouldNotify(prefs, 'inApp', type)) {
    // Dynamic import to avoid circular dependency
    const { createNotification } = await import('../routes/notifications.js');
    createNotification(orgId, inApp.notificationType, inApp.title, inApp.message);
    inAppCreated = true;
  }

  // Email notification
  if (email && shouldNotify(prefs, 'email', type)) {
    const emailContent = creditAlertEmailHtml(
      email.alertType,
      email.orgName,
      {
        total: email.balance.total,
        used: email.balance.used,
        remaining: email.balance.remaining,
        daysRemaining: email.balance.daysRemaining,
        periodEnd: email.balance.periodEnd,
      } as any,
    );

    // Queue email for sending (for now, just log — SMTP integration is on hold)
    const { createNotification } = await import('../routes/notifications.js');
    createNotification(
      orgId,
      'credit',
      `Email: ${emailContent.subject}`,
      `Email queued: ${emailContent.text.slice(0, 200)}...`,
    );
    emailQueued = true;
  }

  return { inAppCreated, emailQueued };
}
