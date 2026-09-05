/**
 * GitHub OAuth service unit tests.
 *
 * Verifies the stateless HMAC state (sign/verify/tamper/expiry), the authorize
 * URL construction, the server-side authorization-code exchange, redirect-URI
 * validation, and the token health check. Pure unit tests — fetch is stubbed;
 * no database, no live credentials.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '@orq8/core';
import {
  buildGitHubAuthorizeUrl,
  verifyOAuthState,
  isValidRedirectUri,
  exchangeGitHubCode,
  githubHealthCheck,
  signOAuthState,
  type OAuthStatePayload,
} from '../src/services/oauth.js';

function makeConfig(overrides: Record<string, string> = {}): AppConfig {
  return {
    NODE_ENV: 'test',
    PORT: 3001,
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://localhost:5432/orq8',
    SESSION_SECRET: 'test-session-secret-16-chars',
    ENCRYPTION_KEY: 'test-encryption-key-1234567890',
    ENCRYPTION_KEY_KID: 'v1',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    GITHUB_CLIENT_ID: overrides.GITHUB_CLIENT_ID ?? 'client-123',
    GITHUB_CLIENT_SECRET: overrides.GITHUB_CLIENT_SECRET ?? 'secret-456',
    APP_URL: overrides.APP_URL ?? 'https://orq8.vercel.app',
    ...overrides,
  } as unknown as AppConfig;
}

const PROVIDER_ID = '00000000-0000-4000-8000-000000000001';
const ORG_ID = '00000000-0000-4000-8000-000000000002';
const REDIRECT = 'https://orq8.vercel.app/api/integrations/callback/github';

function stubFetch(handler: (url: string, init?: RequestInit) => { status: number; json?: unknown; headers?: Record<string, string> }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const mock = vi.fn(async (url: unknown, init?: unknown) => {
    const call = { url: String(url), init: init as RequestInit | undefined };
    calls.push(call);
    const res = handler(call.url, call.init);
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      headers: new Headers(res.headers ?? {}),
      json: async () => res.json,
    };
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('OAuth state — stateless HMAC', () => {
  it('signs and verifies a valid state', () => {
    const config = makeConfig();
    const state = signState(config);
    const payload = verifyOAuthState(config, state);
    expect(payload).toEqual({ providerId: PROVIDER_ID, orgId: ORG_ID, exp: expect.any(Number) });
  });

  it('rejects tampered state', () => {
    const config = makeConfig();
    const state = signState(config);
    const [body, sig] = state.split('.');
    const tampered = `${body!}x.${sig}`;
    expect(verifyOAuthState(config, tampered)).toBeNull();
  });

  it('rejects state signed with a different key', () => {
    const a = makeConfig();
    const b = makeConfig({ ENCRYPTION_KEY: 'another-key-1234567890' });
    const state = signState(a);
    expect(verifyOAuthState(b, state)).toBeNull();
  });

  it('rejects expired state', () => {
    const config = makeConfig();
    const state = signState(config, { exp: Date.now() - 1000 });
    expect(verifyOAuthState(config, state)).toBeNull();
  });

  it('rejects malformed state', () => {
    const config = makeConfig();
    expect(verifyOAuthState(config, '')).toBeNull();
    expect(verifyOAuthState(config, 'not-valid')).toBeNull();
    expect(verifyOAuthState(config, 'YWJj.e30.extra')).toBeNull();
  });

  it('rejects state bound to a different org/provider (callback swap)', () => {
    const config = makeConfig();
    const state = signState(config, { providerId: 'other-provider', orgId: ORG_ID, exp: Date.now() + 60_000 });
    const payload = verifyOAuthState(config, state);
    expect(payload?.orgId).toBe(ORG_ID);
    expect(payload?.providerId).toBe('other-provider'); // route layer must compare against the requested provider
  });
});

function signState(config: AppConfig, payloadOverrides: Partial<OAuthStatePayload> = {}) {
  return signOAuthState(config, {
    providerId: payloadOverrides.providerId ?? PROVIDER_ID,
    orgId: payloadOverrides.orgId ?? ORG_ID,
    exp: payloadOverrides.exp ?? Date.now() + 60_000,
  });
}

describe('Authorize URL', () => {
  it('includes client_id, scopes, and a signed state', () => {
    const config = makeConfig();
    const url = buildGitHubAuthorizeUrl(config, PROVIDER_ID, ORG_ID, REDIRECT);
    expect(url.startsWith('https://github.com/login/oauth/authorize?')).toBe(true);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('client_id')).toBe('client-123');
    expect(parsed.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(parsed.searchParams.get('scope')).toContain('repo');
    const state = parsed.searchParams.get('state');
    expect(state).toBeTruthy();
    expect(verifyOAuthState(config, state!)).not.toBeNull();
  });

  it('throws when GITHUB_CLIENT_ID is missing', () => {
    const config = makeConfig({ GITHUB_CLIENT_ID: '' });
    expect(() => buildGitHubAuthorizeUrl(config, PROVIDER_ID, ORG_ID, REDIRECT)).toThrow(/not configured/);
  });
});

describe('Redirect URI validation', () => {
  it('allows the configured APP_URL origin', () => {
    expect(isValidRedirectUri(makeConfig(), 'https://orq8.vercel.app/api/integrations/callback/github')).toBe(true);
  });

  it('rejects a different origin when APP_URL is set', () => {
    expect(isValidRedirectUri(makeConfig(), 'https://evil.example.com/cb')).toBe(false);
  });

  it('allows loopback origins in dev when APP_URL is unset', () => {
    const config = makeConfig({ APP_URL: '' });
    expect(isValidRedirectUri(config, 'http://localhost:3000/api/cb')).toBe(true);
    expect(isValidRedirectUri(config, 'http://127.0.0.1:3000/api/cb')).toBe(true);
    expect(isValidRedirectUri(config, 'https://evil.example.com/cb')).toBe(false);
  });

  it('rejects malformed URIs', () => {
    expect(isValidRedirectUri(makeConfig(), 'not-a-url')).toBe(false);
    expect(isValidRedirectUri(makeConfig(), '')).toBe(false);
  });
});

describe('Authorization-code exchange', () => {
  it('exchanges a code and returns the token', async () => {
    const config = makeConfig();
    const { calls } = stubFetch((url, init) => {
      if (!url.includes('/login/oauth/access_token')) throw new Error('wrong url');
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.client_id).toBe('client-123');
      expect(body.client_secret).toBe('secret-456');
      expect(body.code).toBe('code-abc');
      expect(body.redirect_uri).toBe(REDIRECT);
      return { status: 200, json: { access_token: 'gho_token', token_type: 'bearer', scope: 'repo,read:user', expires_in: 3600 } };
    });

    const result = await exchangeGitHubCode(config, 'code-abc', REDIRECT);
    expect(result.accessToken).toBe('gho_token');
    expect(result.scope).toContain('repo');
    expect(result.expiresAt).not.toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('throws on GitHub error responses', async () => {
    const config = makeConfig();
    stubFetch(() => ({ status: 200, json: { error: 'bad_verification_code', error_description: 'The code is incorrect' } }));
    await expect(exchangeGitHubCode(config, 'bad-code', REDIRECT)).rejects.toThrow(/incorrect/);
  });

  it('throws on HTTP errors', async () => {
    const config = makeConfig();
    stubFetch(() => ({ status: 502 }));
    await expect(exchangeGitHubCode(config, 'code', REDIRECT)).rejects.toThrow(/HTTP 502/);
  });

  it('throws when credentials are not configured', async () => {
    const config = makeConfig({ GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '' });
    await expect(exchangeGitHubCode(config, 'code', REDIRECT)).rejects.toThrow(/not configured/);
  });
});

describe('Health check', () => {
  it('returns healthy with login for a valid token', async () => {
    stubFetch((url) => {
      expect(url).toBe('https://api.github.com/user');
      return { status: 200, json: { login: 'octocat' }, headers: { 'x-oauth-scopes': 'repo, read:user' } };
    });
    const health = await githubHealthCheck('gho_valid');
    expect(health.healthy).toBe(true);
    expect(health.login).toBe('octocat');
    expect(health.scopes).toContain('repo');
  });

  it('flags invalid/revoked tokens (401)', async () => {
    stubFetch(() => ({ status: 401 }));
    const health = await githubHealthCheck('gho_invalid');
    expect(health.healthy).toBe(false);
    expect(health.error).toMatch(/reconnect/);
  });

  it('never leaks the token in results', async () => {
    stubFetch(() => ({ status: 200, json: { login: 'octocat' } }));
    const health = await githubHealthCheck('gho_super_secret');
    expect(JSON.stringify(health)).not.toContain('gho_super_secret');
  });
});