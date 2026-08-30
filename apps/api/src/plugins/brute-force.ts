import { eq, gt, and } from 'drizzle-orm';
import { loginLockouts } from '@orq8/db';
import type { RedisClient } from '../services/redis.js';


/**
 * Brute-force protection for login attempts.
 *
 * Strategy:
 * - Track failed login attempts per email in PostgreSQL (persists across restarts).
 * - Use Redis as a fast cache when available (avoids DB hit on every request).
 * - After MAX_ATTEMPTS failures within LOCKOUT_WINDOW, the account is locked
 *   for LOCKOUT_DURATION.
 * - On successful login, the counter is reset.
 *
 * Constants: 10 attempts, 15-minute cooldown (docs/37 security architecture).
 */

const MAX_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_S = 15 * 60; // 15 minutes in seconds
const LOCKOUT_DURATION_MS = LOCKOUT_DURATION_S * 1000;

export interface BruteForceResult {
  allowed: boolean;
  remainingAttempts: number;
  lockedUntil?: Date;
}

// ─── Redis cache helpers ────────────────────────────────────────────────────

function redisKey(email: string): string {
  return `bf:login:${email}`;
}

async function readFromRedis(
  redis: RedisClient | null,
  email: string,
): Promise<{ count: number; lockedUntil?: number } | null> {
  if (!redis?.isConnected()) return null;
  try {
    const key = redisKey(email);
    const count = parseInt((await redis.get(`${key}:count`)) ?? '-1', 10);
    if (count < 0) return null; // Not cached
    const lockedStr = await redis.get(`${key}:locked`);
    return {
      count,
      lockedUntil: lockedStr ? parseInt(lockedStr, 10) : undefined,
    };
  } catch {
    return null;
  }
}

async function writeToRedis(
  redis: RedisClient | null,
  email: string,
  count: number,
  lockExpiry?: number,
): Promise<void> {
  if (!redis?.isConnected()) return;
  try {
    const key = redisKey(email);
    await redis.set(`${key}:count`, String(count), LOCKOUT_WINDOW_MS / 1000);
    if (lockExpiry) {
      await redis.set(`${key}:locked`, String(lockExpiry), LOCKOUT_DURATION_S);
    }
  } catch {
    // Silent failure — DB is source of truth
  }
}

async function clearRedis(redis: RedisClient | null, email: string): Promise<void> {
  if (!redis?.isConnected()) return;
  try {
    const key = redisKey(email);
    await redis.del(`${key}:count`, `${key}:locked`);
  } catch {
    // Silent failure
  }
}

// ─── Database helpers ────────────────────────────────────────────────────────

async function readFromDb(
  db: any,
  email: string,
): Promise<{ count: number; lockedUntil?: Date } | null> {
  try {
    const [row] = await db
      .select()
      .from(loginLockouts)
      .where(eq(loginLockouts.email, email))
      .limit(1);
    if (!row) return null;
    return {
      count: row.failedCount,
      lockedUntil: row.lockedUntil ?? undefined,
    };
  } catch {
    return null;
  }
}

async function upsertDb(
  db: any,
  email: string,
  count: number,
  lockExpiry: Date | null,
): Promise<void> {
  try {
    const existing = await db
      .select({ email: loginLockouts.email })
      .from(loginLockouts)
      .where(eq(loginLockouts.email, email))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(loginLockouts)
        .set({
          failedCount: count,
          lockedUntil: lockExpiry,
          lastFailedAt: new Date(),
        })
        .where(eq(loginLockouts.email, email));
    } else {
      await db.insert(loginLockouts).values({
        email,
        failedCount: count,
        lockedUntil: lockExpiry,
        lastFailedAt: new Date(),
      });
    }
  } catch {
    // Database failure should not block login — degrade gracefully
  }
}

async function deleteFromDb(db: any, email: string): Promise<void> {
  try {
    await db.delete(loginLockouts).where(eq(loginLockouts.email, email));
  } catch {
    // Silent failure
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check if a login attempt is allowed for the given email.
 *
 * Reads from Redis cache first (fast path), falls back to database.
 * If the lockout has expired, clears it automatically.
 */
export async function checkLoginAllowed(
  redis: RedisClient | null,
  email: string,
  db?: any,
): Promise<BruteForceResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // Fast path: check Redis cache
  const cached = await readFromRedis(redis, normalizedEmail);
  if (cached) {
    // Check if locked
    if (cached.lockedUntil) {
      if (Date.now() < cached.lockedUntil) {
        return {
          allowed: false,
          remainingAttempts: 0,
          lockedUntil: new Date(cached.lockedUntil),
        };
      }
      // Lock expired in cache — clear it
      await clearRedis(redis, normalizedEmail);
      if (db) await deleteFromDb(db, normalizedEmail);
      return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
    }

    // Not locked — check attempt count
    if (cached.count >= MAX_ATTEMPTS) {
      // Should have been locked but wasn't — lock now
      const lockExpiry = Date.now() + LOCKOUT_DURATION_MS;
      await writeToRedis(redis, normalizedEmail, cached.count, lockExpiry);
      if (db) await upsertDb(db, normalizedEmail, cached.count, new Date(lockExpiry));
      return {
        allowed: false,
        remainingAttempts: 0,
        lockedUntil: new Date(lockExpiry),
      };
    }

    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - cached.count,
    };
  }

  // Cache miss: read from database (persistent across restarts)
  if (db) {
    const dbRow = await readFromDb(db, normalizedEmail);
    if (dbRow) {
      // Check if locked
      if (dbRow.lockedUntil) {
        if (new Date() < dbRow.lockedUntil) {
          // Re-populate Redis cache
          const remainingMs = dbRow.lockedUntil.getTime() - Date.now();
          await writeToRedis(
            redis,
            normalizedEmail,
            dbRow.count,
            dbRow.lockedUntil.getTime(),
          );
          return {
            allowed: false,
            remainingAttempts: 0,
            lockedUntil: dbRow.lockedUntil,
          };
        }
        // Lock expired in DB — clear it
        await deleteFromDb(db, normalizedEmail);
        return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
      }

      // Not locked — check attempt count
      if (dbRow.count >= MAX_ATTEMPTS) {
        const lockExpiry = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await upsertDb(db, normalizedEmail, dbRow.count, lockExpiry);
        await writeToRedis(redis, normalizedEmail, dbRow.count, lockExpiry.getTime());
        return {
          allowed: false,
          remainingAttempts: 0,
          lockedUntil: lockExpiry,
        };
      }

      // Re-populate Redis cache
      await writeToRedis(redis, normalizedEmail, dbRow.count);
      return {
        allowed: true,
        remainingAttempts: MAX_ATTEMPTS - dbRow.count,
      };
    }
  }

  // No record at all — first attempt
  return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
}

/**
 * Record a failed login attempt for the given email.
 *
 * Writes to both database (persistent) and Redis (fast cache).
 */
export async function recordFailedLogin(
  redis: RedisClient | null,
  email: string,
  db?: any,
): Promise<BruteForceResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // Read current state from cache or DB
  let currentCount = 0;
  const cached = await readFromRedis(redis, normalizedEmail);
  if (cached) {
    currentCount = cached.count;
  } else if (db) {
    const dbRow = await readFromDb(db, normalizedEmail);
    if (dbRow) currentCount = dbRow.count;
  }

  const newCount = currentCount + 1;
  const now = new Date();
  let lockExpiry: Date | null = null;
  let lockExpiryMs: number | undefined;

  if (newCount >= MAX_ATTEMPTS) {
    lockExpiry = new Date(now.getTime() + LOCKOUT_DURATION_MS);
    lockExpiryMs = lockExpiry.getTime();
  }

  // Persist to database (source of truth)
  if (db) {
    await upsertDb(db, normalizedEmail, newCount, lockExpiry);
  }

  // Write to Redis cache (fast path)
  await writeToRedis(redis, normalizedEmail, newCount, lockExpiryMs);

  if (newCount >= MAX_ATTEMPTS && lockExpiry) {
    return {
      allowed: false,
      remainingAttempts: 0,
      lockedUntil: lockExpiry,
    };
  }

  return {
    allowed: true,
    remainingAttempts: MAX_ATTEMPTS - newCount,
  };
}

/**
 * Reset failed login attempts on successful login.
 *
 * Clears from both database and Redis.
 */
export async function resetFailedLogins(
  redis: RedisClient | null,
  email: string,
  db?: any,
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  // Clear from database
  if (db) {
    await deleteFromDb(db, normalizedEmail);
  }

  // Clear from Redis cache
  await clearRedis(redis, normalizedEmail);
}
