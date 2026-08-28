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
 * Protection: cross-origin requests can't read cookies (SameSite policy)
 * so an attacker can't include the right token in the header.
 */

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const MAX_AGE = 60 * 60 * 24; // 24 hours

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

// Methods that should be protected
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths that don't need CSRF (webhooks, health, etc.)
const EXEMPT_PATHS = ['/v1/healthz', '/v1/webhooks', '/v1/waitlist'];

export function csrfPlugin(app: FastifyInstance): void {
  // Set CSRF cookie on safe (GET) requests if missing
  app.addHook('onSend', async (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') return;

    const existing = request.cookies[CSRF_COOKIE];
    if (!existing) {
      const token = generateToken();
      reply.setCookie(CSRF_COOKIE, token, {
        path: '/',
        httpOnly: false, // JS must be able to read the cookie to echo it in the header
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: MAX_AGE,
      });
    }
  });

  // Validate CSRF on mutating requests
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!MUTATING_METHODS.has(request.method)) return;

    // Exempt webhook and health paths
    const reqUrl: string = request.url || '';
    const urlPath = reqUrl.split('?')[0] ?? '';
    if (EXEMPT_PATHS.some(p => urlPath.startsWith(p))) return;

    // Exempt paths that use API-key auth (not cookies)
    const apiKey = request.headers['authorization'];
    if (apiKey?.startsWith('Bearer ')) return;

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
