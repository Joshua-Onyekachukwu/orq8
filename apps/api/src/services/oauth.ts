import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '@orq8/core';

/**
 * GitHub OAuth (Task 1) — server-side authorization-code flow.
 *
 * - State is stateless: HMAC-SHA256 over { providerId, orgId, exp } using a key
 *   derived from ENCRYPTION_KEY. Survives restarts, needs no Redis, and is
 *   bound to the org + provider so a stolen callback cannot swap targets.
 * - The authorization-code exchange happens HERE (server-side) with
 *   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET. Tokens are stored encrypted at
 *   rest via services/crypto.ts through services/integrations.setCredentials.
 * - Health check hits https://api.github.com/user with the stored token.
 */

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com/user';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface OAuthStatePayload {
  providerId: string;
  orgId: string;
  exp: number; // epoch ms
}

function stateKey(config: AppConfig): string {
  return config.ENCRYPTION_KEY || 'oauth-state-dev-fallback-do-not-use-in-prod';
}

/** Sign a state payload. Returns `${base64url(body)}.${base64url(hmac)}`. */
export function signOAuthState(config: AppConfig, payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', stateKey(config)).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** Verify + decode a state string. Returns null on tamper, wrong key, or expiry. */
export function verifyOAuthState(config: AppConfig, state: string): OAuthStatePayload | null {
  try {
    const [body, sig] = state.split('.');
    if (!body || !sig) return null;
    const expected = createHmac('sha256', stateKey(config)).update(body).digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (!payload.providerId || !payload.orgId) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Build the GitHub authorize URL. Requires GITHUB_CLIENT_ID to be configured.
 * `redirectUri` must be the exact same URI registered on the GitHub OAuth App
 * and passed back on the callback.
 */
export function buildGitHubAuthorizeUrl(
  config: AppConfig,
  providerId: string,
  orgId: string,
  redirectUri: string,
): string {
  if (!config.GITHUB_CLIENT_ID) {
    throw new Error('GitHub OAuth is not configured — set GITHUB_CLIENT_ID.');
  }
  const state = signOAuthState(config, {
    providerId,
    orgId,
    exp: Date.now() + STATE_TTL_MS,
  });
  const params = new URLSearchParams({
    client_id: config.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'repo read:user',
    state,
    allow_signup: 'false',
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Validate a redirect URI against APP_URL when configured (dev allows
 * loopback/localhost). Prevents open-redirect / callback injection.
 */
export function isValidRedirectUri(config: AppConfig, redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    if (config.APP_URL) {
      const expected = new URL(config.APP_URL);
      return url.protocol === expected.protocol && url.host === expected.host;
    }
    // Dev fallback: loopback or localhost only
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

export interface GitHubTokenResult {
  accessToken: string;
  tokenType: string;
  scope: string;
  expiresAt: Date | null;
}

/** Exchange the authorization code for tokens (server-side, credentials never leave). */
export async function exchangeGitHubCode(
  config: AppConfig,
  code: string,
  redirectUri: string,
): Promise<GitHubTokenResult> {
  if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
    throw new Error('GitHub OAuth is not configured — set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.');
  }
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.GITHUB_CLIENT_ID,
      client_secret: config.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (data.error) {
    const description = typeof data.error_description === 'string' ? data.error_description : String(data.error);
    throw new Error(`GitHub OAuth error: ${description}`);
  }
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('GitHub returned no access token');
  }
  return {
    accessToken: data.access_token,
    tokenType: typeof data.token_type === 'string' ? data.token_type : 'bearer',
    scope: typeof data.scope === 'string' ? data.scope : '',
    expiresAt: typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000) : null,
  };
}

export interface GitHubHealthResult {
  healthy: boolean;
  status: number;
  login?: string;
  scopes?: string;
  error?: string;
}

/** Verify the stored token against the GitHub API. Returns no secrets. */
export async function githubHealthCheck(accessToken: string): Promise<GitHubHealthResult> {
  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401 || res.status === 403) {
      return { healthy: false, status: res.status, error: 'Token invalid or revoked — reconnect required' };
    }
    if (!res.ok) {
      return { healthy: false, status: res.status, error: `GitHub API error: HTTP ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      healthy: true,
      status: res.status,
      login: typeof data.login === 'string' ? data.login : undefined,
      scopes: res.headers.get('x-oauth-scopes') ?? undefined,
    };
  } catch (err) {
    return { healthy: false, status: 0, error: err instanceof Error ? err.message : 'Network error' };
  }
}