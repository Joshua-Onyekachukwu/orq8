/**
 * Email verification lifecycle (migration 0023).
 *
 * Security model (mirrors the password-reset token architecture, docs/37):
 *   • Only the SHA-256 hash of the token is stored — a database leak cannot
 *     be replayed against the verify endpoint.
 *   • Tokens expire after 24 hours.
 *   • One-time use — consumption sets consumed_at transactionally.
 *   • Resend rate limiting — max 3 sends per user per hour, enforced from
 *     real token rows (no in-memory state, safe across restarts/replicas).
 *
 * Policy: verification is enforced as UX gating, not a hard login wall.
 * Unverified users keep dashboard access (signup → value first, docs/02
 * onboarding flow); sensitive outbound surfaces (briefing emails, connector
 * sends) can consult `isEmailVerified` and the UI shows a persistent
 * verify banner until confirmed.
 */

import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomBytes, createHash } from 'node:crypto';
import { emailVerificationTokens, users, type Db } from '@orq8/db';

export const VERIFICATION_TOKEN_TTL_HOURS = 24;
export const RESEND_WINDOW_MINUTES = 60;
export const RESEND_MAX_PER_WINDOW = 3;

export function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export type IssueResult =
  | { ok: true; plaintextToken: string; expiresAt: Date }
  | { ok: false; reason: 'already_verified' | 'rate_limited' | 'issue_failed'; retryAfterMinutes?: number };

/**
 * Issue a verification token for a user and persist only its hash.
 * Returns the plaintext token for email delivery — it is never stored.
 * Rate-limited by recent unconsumed issues (3 / user / hour).
 */
export async function issueVerificationToken(
  db: Db,
  userId: string,
  email: string,
): Promise<IssueResult> {
  const [user] = await db.select({ emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
  if (user?.emailVerifiedAt) {
    return { ok: false, reason: 'already_verified' };
  }

  // Rate limit: count tokens issued for this user inside the resend window.
  const windowStart = new Date(Date.now() - RESEND_WINDOW_MINUTES * 60_000);
  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.userId, userId), gt(emailVerificationTokens.createdAt, windowStart)));
  if ((recent?.count ?? 0) >= RESEND_MAX_PER_WINDOW) {
    const oldest = await db
      .select({ createdAt: emailVerificationTokens.createdAt })
      .from(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.userId, userId), gt(emailVerificationTokens.createdAt, windowStart)))
      .orderBy(emailVerificationTokens.createdAt)
      .limit(1);
    const oldestAt = oldest[0]?.createdAt;
    const retryAfterMinutes = oldestAt
      ? Math.max(1, Math.ceil(RESEND_WINDOW_MINUTES - (Date.now() - oldestAt.getTime()) / 60_000))
      : RESEND_WINDOW_MINUTES;
    return { ok: false, reason: 'rate_limited', retryAfterMinutes };
  }

  const plaintextToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 3_600_000);
  const rows = await db
    .insert(emailVerificationTokens)
    .values({ userId, tokenHash: sha256hex(plaintextToken), expiresAt })
    .returning({ id: emailVerificationTokens.id });
  if (!rows[0]) return { ok: false, reason: 'issue_failed' };

  return { ok: true, plaintextToken, expiresAt };
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'already_used' | 'already_verified' };

/**
 * Consume a verification token one-time and stamp users.email_verified_at.
 * Returns a structured reason so the route can show actionable messaging
 * without leaking whether an unknown token ever existed.
 */
export async function consumeVerificationToken(db: Db, plaintextToken: string): Promise<ConsumeResult> {
  if (!plaintextToken || plaintextToken.length < 32 || !/^[0-9a-f]+$/i.test(plaintextToken)) {
    return { ok: false, reason: 'invalid' };
  }
  const tokenHash = sha256hex(plaintextToken);

  const [row] = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.consumedAt) return { ok: false, reason: 'already_used' };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  const consumed = await db.transaction(async (tx) => {
    // One-time guard: only an unconsumed row can flip consumed_at.
    const updated = await tx
      .update(emailVerificationTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(emailVerificationTokens.id, row.id), isNull(emailVerificationTokens.consumedAt)))
      .returning({ id: emailVerificationTokens.id });
    if (!updated[0]) return false;

    await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(users.id, row.userId), isNull(users.emailVerifiedAt)));
    return true;
  });

  if (!consumed) return { ok: false, reason: 'already_used' };
  return { ok: true, userId: row.userId };
}

/** Whether a user has verified their email. Unknown users are unverified. */
export async function isEmailVerified(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ v: users.emailVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
  return !!row?.v;
}

/** Count of unconsumed tokens issued for a user inside the resend window. */
export async function recentIssuedCount(db: Db, userId: string): Promise<number> {
  const windowStart = new Date(Date.now() - RESEND_WINDOW_MINUTES * 60_000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.userId, userId), gt(emailVerificationTokens.createdAt, windowStart)));
  return row?.count ?? 0;
}
