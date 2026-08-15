import { createHash, randomBytes } from 'node:crypto';

// ADR-007 — server-side sessions: opaque random token given to the client;
// only its SHA-256 hash is stored (sessions table, docs/34.3 Identity).
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiry(now: number = Date.now()): Date {
  return new Date(now + SESSION_TTL_MS);
}

// docs/35.1 — Authorization: Bearer <session_token>
export function extractBearer(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1] ?? null;
}
