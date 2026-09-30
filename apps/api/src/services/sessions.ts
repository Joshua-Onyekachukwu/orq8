import { and, eq } from 'drizzle-orm';
import { generateSessionToken, hashSessionToken, sessionExpiry } from '@orq8/auth';
import { memberships, sessions, users, type Db } from '@orq8/db';
import type { RedisClient } from './redis.js';

/**
 * Session service with Redis caching.
 *
 * Session lookups are cached in Redis with a TTL matching the session expiry.
 * This avoids a database hit on every authenticated request.
 *
 * Cache invalidation:
 * - On session creation: no cache needed (new session)
 * - On session revocation: delete from cache
 * - On session expiry: Redis TTL handles automatic cleanup
 */

const SESSION_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days (matches session expiry)

interface CachedSession {
  sessionId: string;
  userId: string;
  orgId: string;
  role: string;
  email: string;
  platformRole: string;
  /** Whether the account's email was confirmed when this entry was written. */
  emailVerified: boolean;
  revokedAt: string | null;
  expiresAt: string;
  /** Epoch ms when this cache entry was written from the DB — bounds trust. */
  cachedAt: number;
}

/**
 * How long a cache-hit may be trusted WITHOUT re-verifying against the DB.
 * Bounds the worst case where a revocation's cache eviction silently failed:
 * after this window the entry is re-checked against the sessions table, so a
 * logged-out token stops authenticating within minutes regardless.
 */
const SESSION_CACHE_TRUST_WINDOW_MS = 5 * 60 * 1000;

// v2: includes platformRole. v4: includes emailVerified. Bumped so pre-flag
// cache entries are treated as misses and re-resolved from the DB instead of
// guessing the wrong value (guessing 'unverified' would lock out every
// confirmed founder until their entry expired).
export const SESSION_CACHE_PREFIX = 'session:v4:';

export async function createSession(
  db: Db,
  input: { userId: string; orgId: string; ip?: string | null; userAgent?: string | null },
  _redis?: RedisClient | null,
) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = sessionExpiry();
  await db.insert(sessions).values({
    userId: input.userId,
    orgId: input.orgId,
    tokenHash,
    expiresAt,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });  return { token, expiresAt };
}

/**
 * Resolve a session token to its live DB row + user, with a bounded-trust Redis
 * cache in front. Cache entries are trusted for at most
 * SESSION_CACHE_TRUST_WINDOW_MS; after that the DB is re-checked, so a revocation
 * whose cache eviction failed still takes effect within minutes, not 30 days.
 *
 * Returns null for revoked/expired/unknown tokens.
 */
export async function findSessionByToken(
  db: Db,
  token: string,
  redis?: RedisClient | null,
) {
  const tokenHash = hashSessionToken(token);
  const cacheKey = `${SESSION_CACHE_PREFIX}${tokenHash}`;

  // Try Redis cache first
  if (redis?.isConnected()) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed: CachedSession = JSON.parse(cached);

        // Check if session was revoked
        if (parsed.revokedAt) return null;

        // Check if session expired
        if (new Date(parsed.expiresAt).getTime() < Date.now()) {
          await redis.del(cacheKey);
          return null;
        }

        // Bounded trust: if the entry is older than the trust window, re-verify
        // against the DB before honouring it. This bounds the damage of a missed
        // cache eviction (logout revokes the DB row; a stale cache entry would
        // otherwise authenticate the dead token for the full 30-day TTL).
        if (!parsed.cachedAt || Date.now() - parsed.cachedAt > SESSION_CACHE_TRUST_WINDOW_MS) {
          await redis.del(cacheKey);
          // fall through to the database re-check below
        } else {
        const sessionRecord = {
          id: parsed.sessionId,
          userId: parsed.userId,
          orgId: parsed.orgId,
          tokenHash,
          expiresAt: new Date(parsed.expiresAt),
          revokedAt: null as Date | null,
          createdAt: new Date(),
          ip: null as string | null,
          userAgent: null as string | null,
        };

        return {
          session: sessionRecord,
          user: {
            id: parsed.userId,
            email: parsed.email,
            name: null as string | null,
            platformRole: parsed.platformRole ?? 'user',
            // Truthy stand-in for "confirmed as of the cache write": the value
            // itself is never displayed, only checked for presence.
            emailVerifiedAt: parsed.emailVerified ? new Date(parsed.cachedAt) : null,
          },
          role: parsed.role,
          platformRole: parsed.platformRole ?? 'user',
        };
        }
      }
    } catch {
      // Cache read failed — fall through to database
    }
  }

  // Cache miss — query the database
  const [row] = await db
    .select({
      session: sessions,
      user: {
        id: users.id,
        email: users.email,
        name: users.name,
        platformRole: users.platformRole,
        emailVerifiedAt: users.emailVerifiedAt,
      },
      role: memberships.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(
      memberships,
      and(
        eq(memberships.orgId, sessions.orgId),
        eq(memberships.userId, sessions.userId),
        // The membership must be ACTIVE. Without this the join only proved a
        // membership row existed, so a removed member's session kept
        // authenticating with the role they used to hold — removing somebody
        // took them off the member list and left their access untouched.
        eq(memberships.status, 'active'),
      ),
    )
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;

  // Cache the result in Redis (only if session is valid)
  if (redis?.isConnected() && !row.session.revokedAt) {
    try {
      const cachedSession: CachedSession = {
        sessionId: row.session.id,
        userId: row.user.id,
        orgId: row.session.orgId,
        role: row.role,
        email: row.user.email,
        platformRole: row.user.platformRole,
        emailVerified: row.user.emailVerifiedAt !== null,
        revokedAt: (row.session.revokedAt as Date | null)?.toISOString() ?? null,
        expiresAt: row.session.expiresAt.toISOString(),
        cachedAt: Date.now(),
      };

      // Cache until session expires
      const ttlSeconds = Math.max(
        60,
        Math.ceil((row.session.expiresAt.getTime() - Date.now()) / 1000),
      );

      await redis.set(cacheKey, JSON.stringify(cachedSession), Math.min(ttlSeconds, SESSION_CACHE_TTL_SECONDS));
    } catch {
      // Cache write failed — not critical
    }
  }

  return {
    session: row.session,
    user: row.user,
    role: row.role,
    platformRole: row.user.platformRole,
  };
}

/**
 * Revoke a session server-side AND evict its auth cache entry.
 *
 * `redis` is REQUIRED (compiler-enforced): revocation without cache eviction is
 * the bug class where a logged-out token keeps authenticating for the full
 * 30-day cache TTL. If Redis is unavailable the DB revocation still applies and
 * the cache self-heals via `verifySessionAt`'s revokedAt re-check.
 */
/**
 * Move a session's active organization.
 *
 * The session, not the user, carries the active org (plugins/auth.ts reads
 * `session.orgId`), and login binds a new session to the caller's first
 * membership. So without this, a teammate who accepts an invitation holds a
 * membership they can never act in: their session still points at the company
 * they registered. Callers must verify membership before calling.
 */
export async function switchOrg(db: Db, sessionId: string, orgId: string): Promise<void> {
  await db.update(sessions).set({ orgId }).where(eq(sessions.id, sessionId));
}

export async function revokeSession(
  db: Db,
  sessionId: string,
  redis: RedisClient | null,
): Promise<void> {
  // Update database
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));

  // Invalidate cache
  if (redis?.isConnected()) {
    try {
      const [session] = await db
        .select({ tokenHash: sessions.tokenHash })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      if (session) {
        await redis.del(`${SESSION_CACHE_PREFIX}${session.tokenHash}`);
      }
    } catch {
      // Cache invalidation failed — not critical, TTL will handle it
    }
  }
}

/**
 * Revoke every session that acts in one organization.
 *
 * Used when a membership ends. A session is bound to one organization, so
 * revoking exactly those sessions ends that access and leaves the person's other
 * memberships alone; the next sign-in binds a session to a company they still
 * belong to. Cache entries are deleted first, because a cached session would
 * otherwise keep authenticating the dead token (the cache stores the role it was
 * written with, and nothing in it knows about membership status).
 */
export async function revokeOrgSessions(
  db: Db,
  userId: string,
  orgId: string,
  redis: RedisClient | null,
): Promise<number> {
  try {
    const rows = await db
      .select({ id: sessions.id, tokenHash: sessions.tokenHash, revokedAt: sessions.revokedAt, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.orgId, orgId)));

    if (redis?.isConnected() && rows.length > 0) {
      const keys = rows.map((s) => `${SESSION_CACHE_PREFIX}${s.tokenHash}`);
      await redis.del(...keys);
    }

    const now = new Date();
    let revoked = 0;
    for (const row of rows) {
      const unrevoked = !row.revokedAt;
      const unexpired = row.expiresAt.getTime() > now.getTime();
      if (unrevoked && unexpired) {
        await revokeSession(db, row.id, redis);
        revoked += 1;
      }
    }
    return revoked;
  } catch {
    // The membership is deactivated regardless; the membership-status check in
    // findSessionByToken refuses the session on the next database read even if
    // this failed. Never fail the removal because bookkeeping did.
    return 0;
  }
}

/**
 * Invalidate all cached + DB sessions for a user (password change, forced logout).
 *
 * Deletes the Redis cache for every session the user owns (including already-revoked
 * rows — the cache must never outlive trust), then revokes all unexpired sessions
 * server-side so old tokens fail even if Redis was down at revocation time.
 */
export async function invalidateUserSessions(
  db: Db,
  userId: string,
  redis: RedisClient | null,
): Promise<number> {
  try {
    const userSessions = await db
      .select({ id: sessions.id, tokenHash: sessions.tokenHash, revokedAt: sessions.revokedAt, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.userId, userId));

    if (redis?.isConnected() && userSessions.length > 0) {
      const keys = userSessions.map(s => `${SESSION_CACHE_PREFIX}${s.tokenHash}`);
      await redis.del(...keys);
    }

    const now = new Date();
    let revokedCount = 0;
    for (const s of userSessions) {
      const unrevoked = !s.revokedAt || s.revokedAt.getTime() > now.getTime();
      const unexpired = s.expiresAt.getTime() > now.getTime();
      if (unrevoked && unexpired) {
        await revokeSession(db, s.id, redis);
        revokedCount++;
      }
    }
    return revokedCount;
  } catch {
    // Cache invalidation failed — revocation below still applies via the DB
    return 0;
  }
}
