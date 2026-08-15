import { extractBearer } from '@orq8/auth';
import { sessionExpired, unauthorized } from '@orq8/core';
import type { FastifyRequest } from 'fastify';
import { findSessionByToken } from '../services/sessions.js';
import type { AppDeps, AuthContext } from '../types.js';

// docs/35.1 — Authorization: Bearer <session_token> (server-side sessions, ADR-007).
// The httpOnly cookie is accepted as a convenience for the web app (same token).
export async function requireAuth(request: FastifyRequest, deps: AppDeps): Promise<AuthContext> {
  const token =
    extractBearer(request.headers.authorization) ?? request.cookies?.orq8_session ?? null;
  if (!token) throw unauthorized();

  const found = await findSessionByToken(deps.db, token);
  if (!found) throw unauthorized('Invalid session');

  const { session, user, role } = found;
  if (session.revokedAt) throw unauthorized('Session has been revoked');
  if (session.expiresAt.getTime() < Date.now()) throw sessionExpired();

  return { userId: user.id, orgId: session.orgId, sessionId: session.id, role, email: user.email };
}
