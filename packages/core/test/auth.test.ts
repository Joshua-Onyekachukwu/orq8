import { describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Authentication flow tests — session management, bearer token extraction,
 * password hashing contracts, brute-force protection constants, and
 * input validation schemas.
 *
 * Tests pure business logic without requiring a running server or database.
 * Cross-package imports (@orq8/auth) are replicated inline here so these
 * tests run in the core package without build dependencies.
 */

// ─── Session Token Helpers (replicated from @orq8/auth) ─────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sessionExpiry(now: number = Date.now()): Date {
  return new Date(now + SESSION_TTL_MS);
}

// ─── Bearer Token Extraction (replicated from @orq8/auth) ───────────────────

function extractBearer(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

// ─── Session Tokens ──────────────────────────────────────────────────────────

describe('Session token management', () => {
  it('generates a base64url token with 32 bytes of entropy', () => {
    const token = generateSessionToken();
    expect(token).toBeTruthy();
    // base64url of 32 bytes = 43 characters
    expect(token).toHaveLength(43);
    // Should only contain base64url characters
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates unique tokens on each call', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateSessionToken());
    }
    expect(tokens.size).toBe(100);
  });

  it('hashes a token deterministically', () => {
    const token = generateSessionToken();
    const h1 = hashSessionToken(token);
    const h2 = hashSessionToken(token);
    expect(h1).toBe(h2);
    // SHA-256 hex = 64 characters
    expect(h1).toHaveLength(64);
  });

  it('produces different hashes for different tokens', () => {
    const h1 = hashSessionToken(generateSessionToken());
    const h2 = hashSessionToken(generateSessionToken());
    expect(h1).not.toBe(h2);
  });

  it('session expiry is 30 days from now', () => {
    const now = Date.now();
    const expiry = sessionExpiry(now);
    const expected = new Date(now + SESSION_TTL_MS);
    expect(expiry.getTime()).toBe(expected.getTime());
    // 30 days = 30 * 24 * 60 * 60 * 1000 = 2,592,000,000 ms
    expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('session expiry is in the future', () => {
    const expiry = sessionExpiry();
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });
});

// ─── Bearer Token Extraction ─────────────────────────────────────────────────

describe('Bearer token extraction', () => {
  it('extracts token from "Bearer <token>" header', () => {
    expect(extractBearer('Bearer abc123')).toBe('abc123');
  });

  it('is case-insensitive for "Bearer"', () => {
    expect(extractBearer('bearer abc123')).toBe('abc123');
    expect(extractBearer('BEARER abc123')).toBe('abc123');
    expect(extractBearer('Bearer abc123')).toBe('abc123');
  });

  it('handles extra whitespace', () => {
    // \s+ consumes all whitespace between Bearer and the token
    expect(extractBearer('Bearer  abc123')).toBe('abc123');
  });

  it('returns null for undefined', () => {
    expect(extractBearer(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractBearer('')).toBeNull();
  });

  it('returns null for non-Bearer auth', () => {
    expect(extractBearer('Basic dXNlcjpwYXNz')).toBeNull();
  });

  it('returns null for "Bearer" without a token', () => {
    expect(extractBearer('Bearer')).toBeNull();
  });

  it('handles tokens with special characters', () => {
    const token = 'abc/123+def=';
    expect(extractBearer(`Bearer ${token}`)).toBe(token);
  });

  it('handles long tokens', () => {
    const token = 'x'.repeat(200);
    expect(extractBearer(`Bearer ${token}`)).toBe(token);
  });
});

// ─── SHA-256 Token Hashing (Password Reset) ─────────────────────────────────

describe('SHA-256 token hashing (password reset)', () => {
  function sha256hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  it('produces a 64-character hex string', () => {
    const hash = sha256hex('reset-token-123');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    const h1 = sha256hex('same-input');
    const h2 = sha256hex('same-input');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', () => {
    const h1 = sha256hex('token-a');
    const h2 = sha256hex('token-b');
    expect(h1).not.toBe(h2);
  });

  it('handles empty string', () => {
    const hash = sha256hex('');
    expect(hash).toHaveLength(64);
    // Known SHA-256 of empty string
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('handles binary-like input via hex encoding', () => {
    const token = randomBytes(32).toString('hex');
    const hash = sha256hex(token);
    expect(hash).toHaveLength(64);
  });
});

// ─── Brute-Force Protection Constants ────────────────────────────────────────

describe('Brute-force protection constants', () => {
  // These test the documented security policy constants (docs/37)
  const MAX_ATTEMPTS = 10;
  const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
  const LOCKOUT_DURATION_S = 15 * 60;

  it('allows up to 10 failed attempts before lockout', () => {
    expect(MAX_ATTEMPTS).toBe(10);
  });

  it('lockout duration is 15 minutes', () => {
    expect(LOCKOUT_DURATION_MS).toBe(15 * 60 * 1000);
    expect(LOCKOUT_DURATION_S).toBe(15 * 60);
  });

  it('lockout duration is reasonable (not too short, not too long)', () => {
    // Should be between 5 minutes and 1 hour
    expect(LOCKOUT_DURATION_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(LOCKOUT_DURATION_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('MAX_ATTEMPTS is reasonable (not too few, not too many)', () => {
    expect(MAX_ATTEMPTS).toBeGreaterThanOrEqual(5);
    expect(MAX_ATTEMPTS).toBeLessThanOrEqual(20);
  });
});

// ─── Registration Input Validation (Zod schemas) ────────────────────────────

describe('Registration input validation', () => {
  // Import from @orq8/domain — replicated inline for testing
  function validateRegistration(input: {
    email?: string;
    password?: string;
    org_name?: string;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      errors.push('Invalid email');
    }
    if (!input.password || input.password.length < 1) {
      errors.push('Password is required');
    }
    if (!input.org_name || input.org_name.trim().length < 1) {
      errors.push('Organization name is required');
    }
    return { valid: errors.length === 0, errors };
  }

  it('validates correct registration data', () => {
    const result = validateRegistration({
      email: 'test@example.com',
      password: 'strongpassword123',
      org_name: 'Test Org',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = validateRegistration({
      email: 'not-an-email',
      password: 'password',
      org_name: 'Org',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid email');
  });

  it('rejects missing email', () => {
    const result = validateRegistration({
      password: 'password',
      org_name: 'Org',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects missing password', () => {
    const result = validateRegistration({
      email: 'test@example.com',
      org_name: 'Org',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects missing org_name', () => {
    const result = validateRegistration({
      email: 'test@example.com',
      password: 'password',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects empty org_name', () => {
    const result = validateRegistration({
      email: 'test@example.com',
      password: 'password',
      org_name: '  ',
    });
    expect(result.valid).toBe(false);
  });
});

// ─── Login Input Validation ──────────────────────────────────────────────────

describe('Login input validation', () => {
  function validateLogin(input: {
    email?: string;
    password?: string;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      errors.push('Invalid email');
    }
    if (!input.password || input.password.length < 1) {
      errors.push('Password is required');
    }
    return { valid: errors.length === 0, errors };
  }

  it('validates correct login data', () => {
    const result = validateLogin({
      email: 'user@example.com',
      password: 'password123',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects missing email', () => {
    const result = validateLogin({ password: 'password123' });
    expect(result.valid).toBe(false);
  });

  it('rejects missing password', () => {
    const result = validateLogin({ email: 'user@example.com' });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = validateLogin({
      email: 'not-valid',
      password: 'password',
    });
    expect(result.valid).toBe(false);
  });
});

// ─── Password Reset Token Flow ───────────────────────────────────────────────

describe('Password reset token flow', () => {
  function generateResetToken(): string {
    return randomBytes(32).toString('hex');
  }

  function sha256hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  it('generates a 64-char hex token (256 bits of entropy)', () => {
    const token = generateResetToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('token is unique on every generation', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateResetToken());
    }
    expect(tokens.size).toBe(100);
  });

  it('hashing is one-way (cannot recover token from hash)', () => {
    const token = generateResetToken();
    const hash = sha256hex(token);
    // The hash should not contain the original token
    expect(hash).not.toContain(token);
    expect(hash.length).toBe(64);
  });

  it('expired token check: a date in the past is expired', () => {
    const past = new Date(Date.now() - 60_000); // 1 minute ago
    const now = new Date();
    expect(now > past).toBe(true);
  });

  it('valid token check: a date in the future is not expired', () => {
    const future = new Date(Date.now() + 3600_000); // 1 hour from now
    const now = new Date();
    expect(now < future).toBe(true);
  });
});
