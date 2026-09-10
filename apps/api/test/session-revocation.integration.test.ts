import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships, sessions } from '@orq8/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSession, findSessionByToken, revokeSession, invalidateUserSessions } from '../src/services/sessions.js';
import type { AppDeps } from '../src/types.js';

/**
 * Production P0 regression: a logged-out token kept authenticating for the full
 * 30-day session-cache TTL because `revokeSession` was called without the redis
 * client. These tests pin the fixed contract against a real database:
 *
 *   1. logout → revokeSession (WITH redis) → the token fails immediately.
 *   2. logout with redis DOWN → bounded cache trust self-heals (DB re-check).
 *   3. password change → invalidateUserSessions kills every live session.
 *
 * DB-gated: skipped when no local Postgres is reachable.
 */

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

let dbUp = false;
let pool: Pool | undefined;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
  dbUp = true;
} catch {
  dbUp = false;
}
const run = dbUp ? describe : describe.skip;

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

// In-memory Redis double with the exact surface the session service uses.
function makeFakeRedis() {
  const store = new Map<string, string>();
  return {
    isConnected: () => true,
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string, _ttl?: number) => {
      store.set(k, v);
    },
    del: async (...keys: string[]) => {
      for (const k of keys) store.delete(k);
      return keys.length;
    },
    __store: store,
  };
}

const userIds: string[] = [];
const orgIds: string[] = [];

/**
 * The plugin-level rejection contract (requireAuth):
 *   no row  → unauthorized
 *   revokedAt set → 'Session has been revoked'
 * The cache path may return null early for known-revoked tokens (optimization);
 * the DB path returns the row with revokedAt set and the plugin rejects it.
 * Either way, auth MUST reject.
 */
function authWouldReject(found: Awaited<ReturnType<typeof findSessionByToken>>): boolean {
  return !found || found.session.revokedAt !== null;
}

async function seedUser(): Promise<{ userId: string; orgId: string }> {
  const userId = randomUUID();
  const orgId = randomUUID();
  await deps.db.insert(organizations).values({ id: orgId, name: 'Revoke Test Org', slug: 'revoke-' + randomUUID().slice(0, 8) });
  await deps.db.insert(users).values({
    id: userId,
    email: `revoke-${randomUUID()}@orq8.test`,
    passwordHash: 'x',
  });
  await deps.db.insert(memberships).values({ orgId, userId, role: 'owner' });
  userIds.push(userId);
  orgIds.push(orgId);
  return { userId, orgId };
}

async function cleanup() {
  for (const orgId of orgIds) {
    await deps.db.delete(sessions).where(eq(sessions.orgId, orgId));
    await deps.db.delete(memberships).where(eq(memberships.orgId, orgId));
    await deps.db.delete(organizations).where(eq(organizations.id, orgId));
  }
  for (const userId of userIds) {
    await deps.db.delete(users).where(eq(users.id, userId));
  }
}

run('session revocation contract (P0 regression)', () => {
  beforeAll(async () => {});

  afterAll(async () => {
    if (dbUp) await cleanup();
    await pool?.end();
  });

  it('logout revokes DB row AND evicts cache — old token fails immediately', async () => {
    const { userId, orgId } = await seedUser();
    const redis = makeFakeRedis();

    const { token } = await createSession(deps.db, { userId, orgId });

    // Sanity: token resolves before logout.
    const before = await findSessionByToken(deps.db, token, redis as any);
    expect(before).not.toBeNull();

    // Revoke via the session's id (exactly what the logout route does).
    const resolved = await findSessionByToken(deps.db, token, redis as any);
    await revokeSession(deps.db, resolved!.session.id, redis as any);

    // DB row is revoked…
    const [row] = await deps.db.select().from(sessions).where(eq(sessions.orgId, orgId));
    expect(row.revokedAt).not.toBeNull();

    // …and the token no longer authenticates: cache evicted, DB says revoked.
    expect(redis.__store.get('session:v3:' + (await import('@orq8/auth')).hashSessionToken(token))).toBeUndefined();
    expect(authWouldReject(await findSessionByToken(deps.db, token, redis as any))).toBe(true);
  });

  it('revocation survives a stale cache entry (bounded trust self-heal)', async () => {
    const { userId, orgId } = await seedUser();
    const redis = makeFakeRedis();

    const { token } = await createSession(deps.db, { userId, orgId });

    // Warm the cache…
    const resolved = await findSessionByToken(deps.db, token, redis as any);
    expect(resolved).not.toBeNull();

    // …then simulate the OLD bug: revoke the DB row WITHOUT evicting cache.
    const { hashSessionToken } = await import('@orq8/auth');
    const tokenHash = hashSessionToken(token);
    const key = 'session:v3:' + tokenHash;
    expect(redis.__store.get(key)).toBeTruthy();

    await deps.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash));

    // Rewind cachedAt beyond the trust window → the next lookup must drop the
    // stale entry, re-check the DB, and surface the revocation to the plugin.
    const entry = JSON.parse(redis.__store.get(key)!);
    entry.cachedAt = Date.now() - 6 * 60 * 1000; // > 5-minute trust window
    redis.__store.set(key, JSON.stringify(entry));

    expect(authWouldReject(await findSessionByToken(deps.db, token, redis as any))).toBe(true);
  });

  it('invalidateUserSessions revokes every live session for the user', async () => {
    const { userId, orgId } = await seedUser();
    const redis = makeFakeRedis();

    const s1 = await createSession(deps.db, { userId, orgId });
    const s2 = await createSession(deps.db, { userId, orgId });

    const revoked = await invalidateUserSessions(deps.db, userId, redis as any);
    expect(revoked).toBe(2);

    for (const token of [s1.token, s2.token]) {
      expect(authWouldReject(await findSessionByToken(deps.db, token, redis as any))).toBe(true);
    }
  });

  it('invalidateUserSessions is safe when redis is unavailable (DB revocation still applies)', async () => {
    const { userId, orgId } = await seedUser();
    const s1 = await createSession(deps.db, { userId, orgId });

    const revoked = await invalidateUserSessions(deps.db, userId, null);
    expect(revoked).toBe(1);

    // With redis=null the lookup path skips cache entirely and consults the DB,
    // which must surface the revocation the plugin enforces.
    expect(authWouldReject(await findSessionByToken(deps.db, s1.token, null))).toBe(true);
  });
});
