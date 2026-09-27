import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { users as usersTable, type Db } from '@orq8/db';
import { AppError, conflict, type AppConfig } from '@orq8/core';
import { hashPassword, verifyPassword } from '@orq8/auth';
import type { Logger } from 'pino';
import * as orgs from './orgs.js';
import * as sessions from './sessions.js';
import * as users from './users.js';
import { appendAudit } from './audit.js';

// User-facing OAuth sign-in (GitHub, Google). Deliberately separate from
// services/oauth.ts, which handles the EMPLOYEE integration connectors
// (services/integrations.setCredentials). Here the provider exchange resolves
// to an ORQ8 session: the browser never sees a client secret or an access
// token, and the session token returned to the web proxy is the same opaque
// ADR-007 token used by password login.

export type OAuthProvider = 'github' | 'google';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === 'github' || value === 'google';
}

/**
 * Deterministic sentinel password for OAuth-only accounts.
 *
 * users.password_hash is NOT NULL (docs/34.1), so an account created through
 * OAuth gets a hash no human password can match. The sentinel input is an
 * HMAC of the session secret and the user id: stable across replicas and
 * restorable later (existing OAuth accounts can be re-recognized), and
 * unknowable to clients, so password login against an OAuth account is
 * impossible. verifyPassword() fails cleanly for any user-supplied password.
 */
function sentinelPasswordFor(config: AppConfig, userId: string): string {
  return createHmac('sha256', config.SESSION_SECRET)
    .update(`orq8-oauth-sentinel:${userId}`)
    .digest('base64');
}

/** True when the stored hash is the OAuth sentinel for this user. */
export async function isOAuthSentinelHash(
  config: AppConfig,
  userId: string,
  storedHash: string,
): Promise<boolean> {
  return verifyPassword(storedHash, sentinelPasswordFor(config, userId));
}

interface ProviderProfile {
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

// ── Provider profile fetch ──────────────────────────────────────────────────

async function fetchGithubProfile(accessToken: string): Promise<ProviderProfile> {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'ORQ8',
  };
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', { headers }),
    fetch('https://api.github.com/user/emails', { headers }),
  ]);
  if (!userRes.ok) {
    throw new AppError(
      502,
      'oauth_provider_error',
      'GitHub did not respond to the sign-in request. Try again, or sign in with your email.',
    );
  }
  const ghUser = (await userRes.json()) as { id: number; login: string; name: string | null; email: string | null };

  // GitHub exposes private emails only through the emails endpoint. The
  // primary verified address is the identity we sign in with; fall back to
  // the first verified address, then the profile email (rejected later if
  // it cannot be trusted as verified).
  let email = ghUser.email;
  let emailVerified = false;
  if (emailsRes.ok) {
    const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
    const chosen = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
    if (chosen) {
      email = chosen.email;
      emailVerified = chosen.verified;
    }
  }
  if (!email) {
    throw new AppError(
      401,
      'oauth_email_missing',
      'Your GitHub account has no email ORQ8 can use. Add a verified email on GitHub, then try again.',
    );
  }

  return {
    providerAccountId: String(ghUser.id),
    email: email.trim().toLowerCase(),
    emailVerified,
    name: ghUser.name ?? ghUser.login,
  };
}

async function fetchGoogleProfile(accessToken: string): Promise<ProviderProfile> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new AppError(
      502,
      'oauth_provider_error',
      'Google did not respond to the sign-in request. Try again, or sign in with your email.',
    );
  }
  const gUser = (await res.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string };
  if (!gUser.email) {
    throw new AppError(
      401,
      'oauth_email_missing',
      'Your Google account has no email ORQ8 can use. Sign in with your email instead.',
    );
  }
  return {
    providerAccountId: gUser.sub,
    email: gUser.email.trim().toLowerCase(),
    emailVerified: gUser.email_verified === true,
    name: gUser.name ?? null,
  };
}

// ── Signed state (CSRF protection for the redirect round trip) ─────────────
//
// Same pattern as the employee integration flow (services/oauth.ts): HMAC-SHA256
// over a JSON payload, keyed from ENCRYPTION_KEY and namespaced so a signature
// from one flow can never verify in the other. State is stateless: it survives
// API restarts, needs no cookie (the API never sets cookies, ADR-007), and
// binds the provider, the exact web callback, and the post-sign-in destination.

function stateKey(config: AppConfig): string {
  return config.ENCRYPTION_KEY || 'oauth-signin-state-dev-fallback-do-not-use-in-prod';
}

const STATE_NAMESPACE = 'auth-oauth-signin|';

export interface OAuthSignInState {
  provider: OAuthProvider;
  redirectUri: string;
  next: string | null;
  exp: number; // epoch ms
}

/** Sign `{ provider, redirectUri, next }` with a 10-minute expiry. */
export function signOAuthState(config: AppConfig, state: Omit<OAuthSignInState, 'exp'>): string {
  const payload: OAuthSignInState = { ...state, exp: Date.now() + OAUTH_STATE_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', stateKey(config)).update(STATE_NAMESPACE + body).digest('base64url');
  return `${body}.${sig}`;
}

/** Verify + decode a sign-in state string. Returns null on tamper, wrong provider, or expiry. */
export function verifyOAuthState(
  config: AppConfig,
  state: string | undefined,
  provider: OAuthProvider,
): OAuthSignInState | null {
  if (!state) return null;
  try {
    const [body, sig] = state.split('.');
    if (!body || !sig) return null;
    const expected = createHmac('sha256', stateKey(config)).update(STATE_NAMESPACE + body).digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthSignInState;
    if (payload.provider !== provider) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (typeof payload.redirectUri !== 'string' || payload.redirectUri.length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Only internal paths may travel through the round trip as the post-sign-in
 * destination; anything that could leave the app is dropped.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value.slice(0, 300);
}

/**
 * The redirect URI must be the web app's own sign-in callback: origin matching
 * APP_URL (loopback in local dev, the same rule as the integration flow) and
 * the exact callback path for this provider. Anything else is refused before a
 * provider redirect is built or a code is ever exchanged.
 */
export function isAllowedSignInRedirectUri(
  config: AppConfig,
  provider: OAuthProvider,
  redirectUri: string,
): boolean {
  try {
    const url = new URL(redirectUri);
    if (url.pathname !== `/api/auth/oauth/callback/${provider}`) return false;
    if (url.search || url.hash || url.username || url.password) return false;
    if (config.APP_URL) {
      const expected = new URL(config.APP_URL);
      return url.protocol === expected.protocol && url.host === expected.host;
    }
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

// ── Provision or log in ─────────────────────────────────────────────────────

export type OAuthLoginResult =
  | { outcome: 'signed_in'; token: string; expiresAt: Date; isNew: boolean }
  | { outcome: 'password_conflict' };

/**
 * Resolve an OAuth callback to a session:
 *  - no account with this email: create user + org + membership + session
 *    atomically (docs/34.6), email already provider-verified
 *  - account with a real password hash: password_conflict (no silent merge)
 *  - account with the OAuth sentinel hash: sign in directly
 *
 * Unverified provider emails are refused: ORQ8 keys accounts on email, so a
 * provider that has not verified the address cannot claim it.
 */
export async function oauthSignIn(
  db: Db,
  config: AppConfig,
  logger: Logger,
  input: { provider: OAuthProvider; accessToken: string; ip?: string; userAgent?: string | null },
): Promise<OAuthLoginResult> {
  const profile =
    input.provider === 'github'
      ? await fetchGithubProfile(input.accessToken)
      : await fetchGoogleProfile(input.accessToken);

  if (!profile.emailVerified) {
    throw new AppError(
      401,
      'oauth_email_unverified',
      input.provider === 'github'
        ? 'Your GitHub account has no verified email. Verify it on GitHub, then try again.'
        : 'Google has not verified this email address. Confirm it with Google, then try again.',
    );
  }

  const [existing] = await db
    .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.email, profile.email))
    .limit(1);

  if (existing) {
    const sentinel = await isOAuthSentinelHash(config, existing.id, existing.passwordHash);
    if (!sentinel) {
      // Registered with email and password. Never merge silently.
      return { outcome: 'password_conflict' };
    }

    // Returning OAuth user: mint a session in their current org.
    const memberships = await orgs.findMembershipsByUser(db, existing.id);
    const active = memberships[0];
    if (!active) throw conflict('Account has no organization');
    const { token, expiresAt } = await sessions.createSession(db, {
      userId: existing.id,
      orgId: active.org.id,
      ip: input.ip,
      userAgent: input.userAgent ?? null,
    });
    await appendAudit(db, {
      orgId: active.org.id,
      actorType: 'user',
      actorId: existing.id,
      action: 'auth.login_succeeded',
      outcome: 'success',
      resultRef: `oauth:${input.provider}`,
    });
    return { outcome: 'signed_in', token, expiresAt, isNew: false };
  }

  // New account: same atomic provisioning as password register (docs/34.6):
  // user + org + membership + session + audit events, one transaction. The id
  // is generated here so the sentinel password can be derived from it before
  // the insert. The provider has verified the email, so emailVerifiedAt is
  // set now and no confirmation round trip is needed.
  const userId = randomUUID();
  const passwordHash = await hashPassword(sentinelPasswordFor(config, userId));
  const result = await db.transaction(async (tx) => {
    const user = await users.createUser(tx, {
      id: userId,
      email: profile.email,
      passwordHash,
      name: profile.name ?? null,
      emailVerifiedAt: new Date(),
    });
    const org = await orgs.createOrg(tx, { name: deriveOrgName(profile) });
    await orgs.createMembership(tx, { orgId: org.id, userId: user.id, role: 'owner' });
    const { token, expiresAt } = await sessions.createSession(tx, {
      userId: user.id,
      orgId: org.id,
      ip: input.ip,
      userAgent: input.userAgent ?? null,
    });
    await appendAudit(tx, { orgId: org.id, actorType: 'user', actorId: user.id, action: 'user.registered', outcome: 'success' });
    await appendAudit(tx, { orgId: org.id, actorType: 'user', actorId: user.id, action: 'org.created', outcome: 'success' });
    await appendAudit(tx, { orgId: org.id, actorType: 'user', actorId: user.id, action: 'member.joined', outcome: 'success' });
    return { user, org, token, expiresAt };
  });

  logger.info({ email: result.user.email, provider: input.provider }, 'oauth: provisioned new account');
  return { outcome: 'signed_in', token: result.token, expiresAt: result.expiresAt, isNew: true };
}

function deriveOrgName(profile: ProviderProfile): string {
  const base = profile.name ?? profile.email.split('@')[0];
  return `${base}'s company`.slice(0, 120);
}
