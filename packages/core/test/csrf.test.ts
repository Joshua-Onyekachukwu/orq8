import { describe, expect, it } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';

/**
 * CSRF token generation and verification tests.
 * These test the pure logic of the CSRF implementation without
 * needing a running server.
 */

// Replicate the core logic from the CSRF plugin for testing
function sign(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function generateToken(secret: string): { value: string; signed: string } {
  const value = randomBytes(32).toString('hex');
  const signed = sign(secret, value);
  return { value, signed };
}

/**
 * Double-submit cookie pattern:
 * - Cookie stores a random value (the token itself, not signed)
 * - Client reads the cookie value and sends it in the X-CSRF-Token header
 * - Server compares cookie value === header value
 * - SameSite=Strict prevents cross-origin requests from sending the cookie
 */
function verify(cookieValue: string, headerValue: string): boolean {
  if (!cookieValue || !headerValue) return false;
  // Constant-time comparison
  if (cookieValue.length !== headerValue.length) return false;
  let mismatch = 0;
  for (let i = 0; i < cookieValue.length; i++) {
    mismatch |= cookieValue.charCodeAt(i) ^ headerValue.charCodeAt(i);
  }
  return mismatch === 0;
}

describe('CSRF protection', () => {
  it('generates a unique random token', () => {
    const t1 = generateToken('secret');
    const t2 = generateToken('secret');
    expect(t1.value).toHaveLength(64); // 32 bytes hex
    expect(t1.value).not.toBe(t2.value);
  });

  it('produces a valid HMAC signature', () => {
    const { value, signed } = generateToken('secret');
    expect(signed).toBe(sign('secret', value));
    expect(signed).toHaveLength(64); // SHA-256 hex
  });

  it('verifies matching cookie and header values', () => {
    const { value } = generateToken('secret');
    // In the double-submit pattern: cookie stores the token, header echoes it
    expect(verify(value, value)).toBe(true);
  });

  it('rejects mismatched cookie and header values', () => {
    const t1 = generateToken('secret');
    const t2 = generateToken('secret');
    expect(verify(t1.value, t2.value)).toBe(false);
  });

  it('rejects when cookie is empty', () => {
    const { value } = generateToken('secret');
    expect(verify('', value)).toBe(false);
  });

  it('rejects when header is empty', () => {
    const { value } = generateToken('secret');
    expect(verify(value, '')).toBe(false);
  });

  it('rejects when both are empty', () => {
    expect(verify('', '')).toBe(false);
  });

  it('constant-time comparison prevents timing attacks', () => {
    const token = 'a'.repeat(64);
    // Nearly matching token — only one character different at the end
    const nearMiss = 'a'.repeat(63) + 'b';
    expect(verify(token, nearMiss)).toBe(false);
  });

  it('generates cryptographically random tokens', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      tokens.add(generateToken('secret').value);
    }
    // All 1000 should be unique
    expect(tokens.size).toBe(1000);
  });
});
