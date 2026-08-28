import type { RedisClient } from '../services/redis.js';

/**
 * Brute-force protection for login attempts.
 *
 * Strategy: track failed login attempts per email using Redis.
 * After MAX_ATTEMPTS failures within LOCKOUT_WINDOW, the account is locked
 * for LOCKOUT_DURATION. Subsequent login attempts are rejected immediately.
 *
 * On successful login, the counter is reset.
 *
 * Falls back to in-memory tracking when Redis is unavailable.
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_S = 15 * 60; // 15 minutes in seconds

// In-memory fallback
const failedAttempts = new Map<string, { count: number; windowStart: number; lockedUntil?: number }>();

export interface BruteForceResult {
  allowed: boolean;
  remainingAttempts: number;
  lockedUntil?: Date;
}

/**
 * Check if a login attempt is allowed for the given email.
 */
export async function checkLoginAllowed(
  redis: RedisClient | null,
  email: string,
): Promise<BruteForceResult> {
  const normalizedEmail = email.toLowerCase().trim();

  if (redis?.isConnected()) {
    const key = `bf:login:${normalizedEmail}`;
    const attempts = parseInt((await redis.get(`${key}:count`)) ?? '0', 10);
    const lockedUntil = await redis.get(`${key}:locked`);

    if (lockedUntil) {
      const lockExpiry = parseInt(lockedUntil, 10);
      if (Date.now() < lockExpiry) {
        return {
          allowed: false,
          remainingAttempts: 0,
          lockedUntil: new Date(lockExpiry),
        };
      }
      // Lock expired — reset
      await redis.del(`${key}:count`, `${key}:locked`);
      return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
    }

    if (attempts >= MAX_ATTEMPTS) {
      const lockExpiry = Date.now() + LOCKOUT_DURATION_S * 1000;
      await redis.set(`${key}:locked`, String(lockExpiry), LOCKOUT_DURATION_S);
      return {
        allowed: false,
        remainingAttempts: 0,
        lockedUntil: new Date(lockExpiry),
      };
    }

    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - attempts,
    };
  }

  // In-memory fallback
  const entry = failedAttempts.get(normalizedEmail);
  if (entry?.lockedUntil && Date.now() < entry.lockedUntil) {
    return {
      allowed: false,
      remainingAttempts: 0,
      lockedUntil: new Date(entry.lockedUntil),
    };
  }

  return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
}

/**
 * Record a failed login attempt.
 */
export async function recordFailedLogin(
  redis: RedisClient | null,
  email: string,
): Promise<BruteForceResult> {
  const normalizedEmail = email.toLowerCase().trim();

  if (redis?.isConnected()) {
    const key = `bf:login:${normalizedEmail}`;

    // Increment counter
    const count = await redis.incr(`${key}:count`);

    // Set window TTL
    if (count === 1) {
      await redis.expire(`${key}:count`, Math.ceil(LOCKOUT_WINDOW_MS / 1000));
    }

    if (count >= MAX_ATTEMPTS) {
      const lockExpiry = Date.now() + LOCKOUT_DURATION_S * 1000;
      await redis.set(`${key}:locked`, String(lockExpiry), LOCKOUT_DURATION_S);
      return {
        allowed: false,
        remainingAttempts: 0,
        lockedUntil: new Date(lockExpiry),
      };
    }

    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - count,
    };
  }

  // In-memory fallback
  const now = Date.now();
  let entry = failedAttempts.get(normalizedEmail);
  if (!entry || now - entry.windowStart > LOCKOUT_WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    failedAttempts.set(normalizedEmail, entry);
  }

  entry.count++;

  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION_S * 1000;
    return {
      allowed: false,
      remainingAttempts: 0,
      lockedUntil: new Date(entry.lockedUntil),
    };
  }

  return {
    allowed: true,
    remainingAttempts: MAX_ATTEMPTS - entry.count,
  };
}

/**
 * Reset failed login attempts on successful login.
 */
export async function resetFailedLogins(
  redis: RedisClient | null,
  email: string,
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  if (redis?.isConnected()) {
    const key = `bf:login:${normalizedEmail}`;
    await redis.del(`${key}:count`, `${key}:locked`);
    return;
  }

  failedAttempts.delete(normalizedEmail);
}
