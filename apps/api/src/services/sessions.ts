import { and, eq } from 'drizzle-orm';
import { generateSessionToken, hashSessionToken, sessionExpiry } from '@orq8/auth';
import { memberships, sessions, users, type Db } from '@orq8/db';

export async function createSession(
  db: Db,
  input: { userId: string; orgId: string; ip?: string | null; userAgent?: string | null },
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

export async function findSessionByToken(db: Db, token: string) {
  const tokenHash = hashSessionToken(token);
  const [row] = await db
    .select({
      session: sessions,
      user: { id: users.id, email: users.email, name: users.name },
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
  return row ?? null;
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}
