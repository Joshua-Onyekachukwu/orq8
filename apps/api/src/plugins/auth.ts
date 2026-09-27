import { extractBearer } from '@orq8/auth';
import { AppError, sessionExpired, unauthorized } from '@orq8/core';
import type { FastifyRequest } from 'fastify';
import { findSessionByToken } from '../services/sessions.js';
import type { AppDeps, AuthContext } from '../types.js';

// Registration mints a session before the email is confirmed, so an
// unconfirmed session is real but incomplete. These are the only endpoints it
// may reach: read its own state, leave, and work the confirmation flow. Every
// other route answers 403 email_not_verified.
const UNCONFIRMED_ALLOWED_PATHS = [
  '/v1/auth/me',
  '/v1/auth/logout',
  '/v1/auth/verify-email',
  // Account-only maintenance: it touches no company data and requires the
  // current password, so an unconfirmed founder may still rotate it.
  '/v1/auth/change-password',
];

function isUnconfirmedAllowed(url: string): boolean {
  const path = url.split('?')[0] ?? '';
  return UNCONFIRMED_ALLOWED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

// docs/35.1 — Authorization: Bearer <session_token> (server-side sessions, ADR-007).
// The httpOnly cookie is accepted as a convenience for the web app (same token).
export async function requireAuth(request: FastifyRequest, deps: AppDeps): Promise<AuthContext> {
  const token =
    extractBearer(request.headers.authorization) ?? request.cookies?.orq8_session ?? null;
  if (!token) throw unauthorized();

  const found = await findSessionByToken(deps.db, token, deps.redis);
  if (!found) throw unauthorized('Invalid session');

  const { session, user, role, platformRole } = found;
  if (session.revokedAt) throw unauthorized('Session has been revoked');
  if (session.expiresAt.getTime() < Date.now()) throw sessionExpired();

  // Email confirmation enforcement: a page-level gate would leave every data
  // API reachable with the registration cookie, so the check lives here too.
  if (!user.emailVerifiedAt && !isUnconfirmedAllowed(request.url)) {
    throw new AppError(
      403,
      'email_not_verified',
      'Confirm your email address to continue. Open the link we emailed you, or request a new one.',
    );
  }

  return {
    userId: user.id,
    orgId: session.orgId,
    sessionId: session.id,
    role,
    email: user.email,
    platformRole: platformRole ?? 'user',
  };
}
