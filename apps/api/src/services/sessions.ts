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
  revokedAt: string | null;
  expiresAt: string;
}

// v2: includes platformRole. Bumped so pre-flag cache entries (no platformRole)
// are treated as misses and re-resolved from the DB instead of guessing 'user'.
const SESSION_CACHE_PREFIX = 'session:v2:';

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
  });

  return { token, expiresAt };
}

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
          },
          role: parsed.role,
          platformRole: parsed.platformRole ?? 'user',
        };
      }
    } catch {
      // Cache read failed — fall through to database
    }
  }

  // Cache miss — query the database
  const [row] = await db
    .select({
      session: sessions,
      user: { id: users.id, email: users.email, name: users.name, platformRole: users.platformRole },
      role: memberships.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(
      memberships,
      and(eq(memberships.orgId, sessions.orgId), eq(memberships.userId, sessions.userId)),
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
        revokedAt: (row.session.revokedAt as Date | null)?.toISOString() ?? null,
        expiresAt: row.session.expiresAt.toISOString(),
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

export async function revokeSession(
  db: Db,
  sessionId: string,
  redis?: RedisClient | null,
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
 * Invalidate all cached sessions for a user (e.g., on password change).
 */
export async function invalidateUserSessions(
  db: Db,
  userId: string,
  redis?: RedisClient | null,
): Promise<void> {
  if (!redis?.isConnected()) return;

  try {
    const userSessions = await db
      .select({ tokenHash: sessions.tokenHash })
      .from(sessions)
      .where(eq(sessions.userId, userId));

    if (userSessions.length > 0) {
      const keys = userSessions.map(s => `${SESSION_CACHE_PREFIX}${s.tokenHash}`);
      await redis.del(...keys);
    }
  } catch {
    // Cache invalidation failed — not critical
  }
}
