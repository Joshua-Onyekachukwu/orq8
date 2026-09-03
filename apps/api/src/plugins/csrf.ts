import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'node:crypto';

/**
 * Double-submit cookie CSRF protection for cookie-based sessions.
 *
 * Strategy: random token in cookie, echoed back in header.
 * On GET/HEAD requests, set a csrf_token cookie if missing.
 * On POST/PATCH/PUT/DELETE, verify the X-CSRF-Token header matches
 * the csrf_token cookie value exactly.
 *
 * Refresh mechanism:
 * - Token has a 24-hour lifetime (MAX_AGE).
 * - When the token is >50% through its lifetime (>12 hours old), the
 *   onSend hook automatically rotates it on the next GET/HEAD request.
 * - A dedicated POST /v1/csrf/refresh endpoint allows explicit refresh.
 * - The frontend can also force a refresh by calling the endpoint.
 *
 * Protection: cross-origin requests can't read cookies (SameSite policy)
 * so an attacker can't include the right token in the header.
 */

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_ISSUED_AT = 'csrf_issued_at'; // metadata cookie for refresh timing
const MAX_AGE = 60 * 60 * 24; // 24 hours in seconds
const REFRESH_THRESHOLD = 0.5; // refresh when >50% of lifetime has passed (12h)

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Check if the current CSRF token should be refreshed.
 * Returns true if the token is older than REFRESH_THRESHOLD * MAX_AGE.
 */
function shouldRefresh(issuedAtStr: string | undefined): boolean {
  if (!issuedAtStr) return true; // no issued-at → refresh
  const issuedAt = parseInt(issuedAtStr, 10);
  if (isNaN(issuedAt)) return true;
  const ageSeconds = (Date.now() - issuedAt) / 1000;
  return ageSeconds > MAX_AGE * REFRESH_THRESHOLD;
}

/**
 * Set the CSRF token cookie and its issued-at metadata cookie.
 */
function setCsrfCookie(reply: FastifyReply, token: string): void {
  const now = Date.now();

  reply.setCookie(CSRF_COOKIE, token, {
    path: '/',
    httpOnly: false, // JS must be able to read the cookie to echo it in the header
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
  });

  // Metadata cookie: tracks when the token was issued for refresh decisions
  reply.setCookie(CSRF_ISSUED_AT, String(now), {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
  });
}

// Methods that should be protected
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths that don't need CSRF (webhooks, health, auth flows, CSRF refresh itself)
const EXEMPT_PATHS = [
  '/v1/healthz',
  '/v1/webhooks',
  '/v1/waitlist',
  '/v1/auth/register',
  '/v1/auth/login',
  '/v1/auth/forgot-password',
  '/v1/auth/reset-password',
  '/v1/csrf', // CSRF refresh endpoint is exempt from validation
];

export function csrfPlugin(app: FastifyInstance): void {
  // ── Auto-refresh: rotate token on GET/HEAD when >50% lifetime passed ──
  app.addHook('onSend', async (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') return;

    const existing = request.cookies[CSRF_COOKIE] as string | undefined;
    const issuedAt = request.cookies[CSRF_ISSUED_AT] as string | undefined;

    // No token at all → set one
    if (!existing) {
      const token = generateToken();
      setCsrfCookie(reply, token);
      return;
    }

    // Token exists but is old → rotate it
    if (shouldRefresh(issuedAt)) {
      const newToken = generateToken();
      setCsrfCookie(reply, newToken);
      return;
    }

    // Token is fresh — do nothing, keep existing
  });

  // ── Explicit refresh endpoint: POST /v1/csrf/refresh ──
  app.post('/v1/csrf/refresh', async (_request, reply) => {
    const token = generateToken();
    setCsrfCookie(reply, token);
    return {
      data: {
        message: 'CSRF token refreshed',
        expiresIn: MAX_AGE,
        refreshThreshold: Math.floor(MAX_AGE * REFRESH_THRESHOLD),
      },
    };
  });

  // ── Token info endpoint: GET /v1/csrf/info ──
  app.get('/v1/csrf/info', async (request) => {
    const token = request.cookies[CSRF_COOKIE] as string | undefined;
    const issuedAt = request.cookies[CSRF_ISSUED_AT] as string | undefined;

    if (!token) {
      return {
        data: {
          hasToken: false,
          needsRefresh: true,
          ageSeconds: null,
          remainingSeconds: null,
        },
      };
    }

    const issuedAtMs = issuedAt ? parseInt(issuedAt, 10) : null;
    const ageSeconds = issuedAtMs ? Math.floor((Date.now() - issuedAtMs) / 1000) : null;
    const remainingSeconds = ageSeconds !== null ? Math.max(0, MAX_AGE - ageSeconds) : null;

    return {
      data: {
        hasToken: true,
        needsRefresh: shouldRefresh(issuedAt),
        ageSeconds,
        remainingSeconds,
        refreshThresholdSeconds: Math.floor(MAX_AGE * REFRESH_THRESHOLD),
        maxAgeSeconds: MAX_AGE,
      },
    };
  });

  // ── Validate CSRF on mutating requests ──
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!MUTATING_METHODS.has(request.method)) return;

    // Exempt paths
    const reqUrl: string = request.url || '';
    const urlPath = reqUrl.split('?')[0] ?? '';
    if (EXEMPT_PATHS.some(p => urlPath.startsWith(p))) return;

    // Exempt paths that use API-key/Bearer auth (not cookies)
    const apiKey = request.headers['authorization'];
    if (apiKey?.startsWith('Bearer ')) return;

    // No session cookie → unauthenticated request. There is no cookie-based
    // session to protect, so let the auth middleware return 401 instead of
    // blocking with 403 here. CSRF only matters for cookie-authenticated sessions.
    if (!request.cookies?.['orq8_session']) return;

    const cookieValue = request.cookies[CSRF_COOKIE] as string | undefined;
    const headerValue = request.headers[CSRF_HEADER] as string | undefined;

    if (!cookieValue || !headerValue || !constantTimeEqual(cookieValue, headerValue)) {
      reply.code(403).send({
        error: {
          code: 'csrf_failed',
          message: 'CSRF token validation failed. Please refresh the page and try again.',
        },
      });
      return reply;
    }
  });
}
