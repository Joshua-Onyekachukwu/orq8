// Waitlist drip queue (docs/00 GTM). DB-as-queue: rows carry scheduled_at +
// status; a process-due pass sends what's ready. Works locally (inline timer or
// script) and on serverless (POST /v1/internal/waitlist/process-due via cron).

import { and, eq, lte } from 'drizzle-orm';
import { waitlistEmails, type Db } from '@orq8/db';
import { DRIP_DELAYS, dripEmailsFor } from './templates.js';
import type { EmailTransport } from './transport.js';

const DUE_BATCH = 50;

/** Schedule the 3-stage drip (welcome now, day 2, day 7) for a new signup. */
export async function enqueueDrip(
  db: Db,
  signup: { id: string; email: string; name: string | null },
  now: Date = new Date(),
): Promise<number> {
  const emails = dripEmailsFor({ name: signup.name, email: signup.email });
  const rows = emails.map((e) => ({
    signupId: signup.id,
    kind: e.kind,
    subject: e.subject,
    bodyText: e.bodyText,
    bodyHtml: e.bodyHtml,
    toEmail: signup.email,
    toName: signup.name,
    scheduledAt: new Date(now.getTime() + DRIP_DELAYS[e.kind]),
  }));
  const inserted = await db.insert(waitlistEmails).values(rows);
  return inserted.rowCount ?? rows.length;
}

export interface ProcessResult {
  sent: number;
  failed: number;
}

/** Send every queued email whose scheduled_at has passed. Row-locked + batch-limited. */
export async function processDueWaitlistEmails(
  db: Db,
  transport: EmailTransport,
  now: Date = new Date(),
): Promise<ProcessResult> {
  const due = await db
    .select()
    .from(waitlistEmails)
    .where(and(eq(waitlistEmails.status, 'queued'), lte(waitlistEmails.scheduledAt, now)))
    .orderBy(waitlistEmails.scheduledAt)
    .limit(DUE_BATCH)
    .for('update', { skipLocked: true });

  let sent = 0;
  let failed = 0;
  for (const row of due) {
    const result = await transport.send({
      to: row.toEmail,
      subject: row.subject,
      text: row.bodyText,
      html: row.bodyHtml,
    });
    if (result.ok) {
      sent += 1;
      await db
        .update(waitlistEmails)
        .set({ status: 'sent', sentAt: now, attempts: row.attempts + 1, lastError: null })
        .where(eq(waitlistEmails.id, row.id));
    } else {
      failed += 1;
      await db
        .update(waitlistEmails)
        .set({ status: 'failed', attempts: row.attempts + 1, lastError: result.error ?? null })
        .where(eq(waitlistEmails.id, row.id));
    }
  }
  return { sent, failed };
}
