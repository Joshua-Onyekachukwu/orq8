import type { FastifyInstance } from 'fastify';
import { AppError, type AppConfig } from '@orq8/core';
import * as oauth from '../services/oauth-signin.js';
import type { AppDeps } from '../types.js';

// User-facing OAuth sign-in: GitHub and Google. Deliberately separate from the
// employee integration connectors under /v1/integrations (which share the same
// provider credentials but connect a repository/mailbox to an existing org).
//
//   GET  /v1/auth/oauth/providers             → which providers are configured
//   GET  /v1/auth/oauth/:provider/start       → { url } for the consent screen
//   POST /v1/auth/oauth/:provider/callback    → { token, isNew, next }
//
// The API owns the whole server-side exchange: client secrets stay here, and
// the browser only ever sees a provider redirect plus (on success) the session
// cookie the WEB app sets. The API itself never sets cookies, so the flow
// works unchanged across origins (Vercel web ↔ Railway API) and local dev.
//
// State is stateless HMAC (services/oauth-signin.ts), mirroring the
// integration flow: it binds provider + exact web callback + destination, so a
// forged or replayed callback cannot swap any of them.

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  label: string;
}

function providerConfig(config: AppConfig, provider: oauth.OAuthProvider): ProviderConfig | null {
  if (provider === 'github') {
    if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) return null;
    return {
      clientId: config.GITHUB_CLIENT_ID,
      clientSecret: config.GITHUB_CLIENT_SECRET,
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scope: 'read:user user:email',
      label: 'GitHub',
    };
  }
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) return null;
  return {
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    label: 'Google',
  };
}

/** Exchange an authorization code for an access token (server-side only). */
async function exchangeCode(
  pc: ProviderConfig,
  code: string,
  redirectUri: string,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(pc.tokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: pc.clientId,
        client_secret: pc.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AppError(
      502,
      'oauth_exchange_failed',
      `${pc.label} did not respond to the sign-in request. Try again, or sign in with your email.`,
    );
  }
  const json = (await res.json().catch(() => null)) as { access_token?: string } | null;
  if (!res.ok || !json?.access_token) {
    throw new AppError(
      502,
      'oauth_exchange_failed',
      `The ${pc.label} sign-in could not be completed. Start again from the sign-in page, or sign in with your email.`,
    );
  }
  return json.access_token;
}

export function registerOAuthRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { config, db, logger } = deps;

  // OAuth is enabled only when at least one provider is fully configured. The
  // web app calls this to render buttons only for flows that can actually work.
  app.get('/v1/auth/oauth/providers', async () => {
    return {
      data: {
        github: providerConfig(config, 'github') !== null,
        google: providerConfig(config, 'google') !== null,
      },
    };
  });

  app.get('/v1/auth/oauth/:provider/start', async (request) => {
    const params = request.params as { provider: string };
    if (!oauth.isOAuthProvider(params.provider)) {
      throw new AppError(404, 'not_found', 'Unknown sign-in provider');
    }
    const provider = params.provider;
    const pc = providerConfig(config, provider);
    if (!pc) {
      throw new AppError(
        503,
        'oauth_not_configured',
        `${provider === 'github' ? 'GitHub' : 'Google'} sign-in is not configured on this deployment. Sign in with your email instead.`,
      );
    }

    const query = request.query as { redirect_uri?: string; next?: string };
    const redirectUri = typeof query.redirect_uri === 'string' ? query.redirect_uri : '';
    if (!oauth.isAllowedSignInRedirectUri(config, provider, redirectUri)) {
      throw new AppError(
        400,
        'oauth_redirect_invalid',
        'Sign-in could not start because the return address was not recognized. Reload the sign-in page and try again.',
      );
    }

    const state = oauth.signOAuthState(config, {
      provider,
      redirectUri,
      next: oauth.safeNextPath(query.next),
    });

    const url = new URL(pc.authorizeUrl);
    url.searchParams.set('client_id', pc.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', pc.scope);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    if (provider === 'google') {
      url.searchParams.set('access_type', 'online');
      url.searchParams.set('prompt', 'select_account');
    }

    return { data: { url: url.toString() } };
  });

  app.post('/v1/auth/oauth/:provider/callback', async (request) => {
    const params = request.params as { provider: string };
    if (!oauth.isOAuthProvider(params.provider)) {
      throw new AppError(404, 'not_found', 'Unknown sign-in provider');
    }
    const provider = params.provider;
    const pc = providerConfig(config, provider);
    if (!pc) {
      throw new AppError(
        503,
        'oauth_not_configured',
        `${provider === 'github' ? 'GitHub' : 'Google'} sign-in is not configured on this deployment. Sign in with your email instead.`,
      );
    }

    const body = (request.body ?? {}) as { code?: string; state?: string; redirectUri?: string };
    const verified = oauth.verifyOAuthState(config, body.state, provider);
    if (!verified) {
      throw new AppError(
        400,
        'oauth_state_invalid',
        'This sign-in link has expired or was already used. Start again from the sign-in page.',
      );
    }
    // The callback must present the exact redirect URI that was signed into the
    // state; a swapped destination fails before any exchange runs.
    if (
      body.redirectUri !== verified.redirectUri ||
      !oauth.isAllowedSignInRedirectUri(config, provider, verified.redirectUri)
    ) {
      throw new AppError(
        400,
        'oauth_state_invalid',
        'This sign-in link has expired or was already used. Start again from the sign-in page.',
      );
    }
    if (!body.code) {
      throw new AppError(
        400,
        'oauth_code_missing',
        `The ${pc.label} sign-in did not return a code. Start again from the sign-in page.`,
      );
    }

    const accessToken = await exchangeCode(pc, body.code, verified.redirectUri);
    const result = await oauth.oauthSignIn(db, config, logger, {
      provider,
      accessToken,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });

    if (result.outcome === 'password_conflict') {
      throw new AppError(
        409,
        'oauth_password_conflict',
        `An ORQ8 company already uses this email with a password. Sign in with your email and password instead.`,
      );
    }

    return {
      data: {
        token: result.token,
        expiresAt: result.expiresAt,
        isNew: result.isNew,
        next: verified.next,
      },
    };
  });
}
