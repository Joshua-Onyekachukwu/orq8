import { describe, it, expect } from 'vitest';
import {
  sha256hex,
  VERIFICATION_TOKEN_TTL_HOURS,
  RESEND_MAX_PER_WINDOW,
  RESEND_WINDOW_MINUTES,
} from '../src/services/email-verification.js';
import type { ConsumeResult, IssueResult } from '../src/services/email-verification.js';

/**
 * Pure-logic tests for the email verification primitives (no DB). The
 * DB-backed paths (issue/consume transactions) are exercised by the
 * integration suites against a live database.
 */
describe('token hashing', () => {
  it('produces a stable 64-char hex digest (SHA-256)', () => {
    const h1 = sha256hex('token-abc');
    const h2 = sha256hex('token-abc');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different tokens', () => {
    expect(sha256hex('token-abc')).not.toBe(sha256hex('token-abd'));
  });
});

describe('policy constants', () => {
  it('uses a 24-hour token lifetime', () => {
    expect(VERIFICATION_TOKEN_TTL_HOURS).toBe(24);
  });

  it('rate-limits resends to 3 per hour', () => {
    expect(RESEND_MAX_PER_WINDOW).toBe(3);
    expect(RESEND_WINDOW_MINUTES).toBe(60);
  });
});

describe('result-shape contracts', () => {
  it('issue failures carry a structured reason and optional retry hint', () => {
    const rateLimited: IssueResult = { ok: false, reason: 'rate_limited', retryAfterMinutes: 37 };
    expect(rateLimited.ok).toBe(false);
    if (!rateLimited.ok) {
      expect(rateLimited.retryAfterMinutes).toBe(37);
    }
  });

  it('consume failures distinguish invalid/expired/already_used', () => {
    const reasons: Array<Extract<ConsumeResult, { ok: false }>['reason']> = [
      'invalid',
      'expired',
      'already_used',
      'already_verified',
    ];
    for (const reason of reasons) {
      const r: ConsumeResult = { ok: false, reason };
      expect(r.ok).toBe(false);
    }
  });
});
