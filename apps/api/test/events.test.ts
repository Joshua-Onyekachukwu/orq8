/**
 * Webhook event pipeline unit tests (Phases 6–8).
 *
 * Pure unit tests — no database, no live provider:
 *   - HMAC signature verification (timing-safe, GitHub prefix format)
 *   - replay-window timestamp validation
 *   - GitHub/Linear event normalization
 *   - task-title template interpolation
 */

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  interpolateTemplate,
  normalizeProviderEvent,
  verifySignature,
  verifyTimestamp,
} from '../src/services/webhooks.js';

function sign(secret: string, body: string, prefix = 'sha256='): string {
  const digest = createHmac('sha256', secret).update(body).digest('hex');
  return `${prefix}${digest}`;
}

describe('verifySignature — HMAC-SHA256', () => {
  const secret = 'whsec_test_secret';
  const body = JSON.stringify({ action: 'opened', number: 1 });

  it('accepts a valid signature (bare hex)', () => {
    expect(verifySignature(secret, body, sign(secret, body, ''))).toBe(true);
  });

  it('accepts GitHub prefix format (sha256=)', () => {
    expect(verifySignature(secret, body, sign(secret, body))).toBe(true);
  });

  it('rejects a signature for different body bytes', () => {
    expect(verifySignature(secret, body + ' ', sign(secret, body))).toBe(false);
  });

  it('rejects a signature from a different secret', () => {
    expect(verifySignature(secret, body, sign('wrong-secret', body))).toBe(false);
  });

  it('rejects tampered header (flipped hex char)', () => {
    const good = sign(secret, body, '');
    const flipped = good.endsWith('0') ? good.slice(0, -1) + '1' : good.slice(0, -1) + '0';
    expect(verifySignature(secret, body, flipped)).toBe(false);
  });

  it('rejects missing/malformed headers', () => {
    expect(verifySignature(secret, body, undefined)).toBe(false);
    expect(verifySignature(secret, body, '')).toBe(false);
    expect(verifySignature(secret, body, 'not-a-hex-digest')).toBe(false);
    expect(verifySignature(secret, body, 'sha256=short')).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifySignature('', body, sign(secret, body))).toBe(false);
  });
});

describe('verifyTimestamp — replay window', () => {
  const now = Date.parse('2026-09-05T12:00:00Z');

  it('allows when no timestamp header is sent (providers like GitHub)', () => {
    expect(verifyTimestamp(undefined, 300_000, now)).toBe(true);
  });

  it('allows a fresh timestamp', () => {
    expect(verifyTimestamp(new Date(now - 60_000).toISOString(), 300_000, now)).toBe(true);
  });

  it('rejects a stale timestamp beyond the window', () => {
    expect(verifyTimestamp(new Date(now - 301_000).toISOString(), 300_000, now)).toBe(false);
  });

  it('tolerates small clock skew in the future', () => {
    expect(verifyTimestamp(new Date(now + 60_000).toISOString(), 300_000, now)).toBe(true);
  });

  it('rejects an implausibly future timestamp (beyond the window)', () => {
    expect(verifyTimestamp(new Date(now + 600_000).toISOString(), 300_000, now)).toBe(false);
  });

  it('rejects unparseable timestamps', () => {
    expect(verifyTimestamp('not-a-date', 300_000, now)).toBe(false);
  });
});

describe('normalizeProviderEvent — GitHub', () => {
  it('normalizes a pull_request event with repo context', () => {
    const ev = normalizeProviderEvent('github', {
      action: 'opened',
      pull_request: { id: 123, number: 42, title: 'Fix login', state: 'open', html_url: 'https://github.com/a/b/pull/42' },
      repository: { full_name: 'acme/web' },
      sender: { login: 'octocat' },
    });
    expect(ev).not.toBeNull();
    expect(ev!.eventType).toBe('pr_opened');
    expect(ev!.externalEventId).toBe('pr_123');
    expect(ev!.summary).toContain('PR #42 opened');
    expect(ev!.payload.repository_full_name).toBe('acme/web');
    expect(ev!.payload.number).toBe(42);
  });

  it('normalizes an issue_opened event', () => {
    const ev = normalizeProviderEvent('github', {
      action: 'opened',
      issue: { id: 999, number: 7, title: 'Bug: crash on load' },
      repository: { full_name: 'acme/web' },
    });
    expect(ev!.eventType).toBe('issue_opened');
    expect(ev!.externalEventId).toBe('issue_999');
    expect(ev!.summary).toContain('Issue #7 opened');
  });

  it('normalizes a push event from head_commit', () => {
    const ev = normalizeProviderEvent('github', {
      ref: 'refs/heads/main',
      head_commit: { id: 'abc123', message: 'Fix typo\n\nlong body' },
      repository: { full_name: 'acme/web' },
      sender: { login: 'dev' },
    });
    expect(ev!.eventType).toBe('push');
    expect(ev!.externalEventId).toBe('commit_abc123');
    expect(ev!.title).toBe('Fix typo');
  });

  it('returns null for unsupported event shapes', () => {
    expect(normalizeProviderEvent('github', { action: 'opened' })).toBeNull();
    expect(normalizeProviderEvent('github', null)).toBeNull();
    expect(normalizeProviderEvent('github', 'string')).toBeNull();
  });
});

describe('normalizeProviderEvent — Linear', () => {
  it('normalizes an issue create event', () => {
    const ev = normalizeProviderEvent('linear', {
      type: 'Issue',
      action: 'create',
      data: { id: 'lin-1', title: 'Ship onboarding', state: 'backlog', url: 'https://linear.app/acme/issue/lin-1' },
    });
    expect(ev!.eventType).toBe('create_issue');
    expect(ev!.externalEventId).toBe('issue_lin-1');
    expect(ev!.summary).toContain('Issue create');
    expect(ev!.payload.id).toBe('lin-1');
  });

  it('normalizes an update event', () => {
    const ev = normalizeProviderEvent('linear', {
      type: 'Issue',
      action: 'update',
      data: { id: 'lin-2', title: 'Review pricing', state: 'in_progress' },
    });
    expect(ev!.eventType).toBe('update_issue');
  });

  it('returns null when data is missing', () => {
    expect(normalizeProviderEvent('linear', { type: 'Issue', action: 'create' })).toBeNull();
    expect(normalizeProviderEvent('linear', { type: 'Issue', action: 'create', data: {} })).toBeNull();
  });
});

describe('interpolateTemplate — task title placeholders', () => {
  it('fills known placeholders from the payload', () => {
    expect(interpolateTemplate('Review PR #{number}', { number: 42 })).toBe('Review PR #42');
    expect(interpolateTemplate('{title} — {repository_full_name}', { title: 'Fix', repository_full_name: 'a/b' })).toBe('Fix — a/b');
  });

  it('leaves unknown placeholders intact', () => {
    expect(interpolateTemplate('Handle {unknown}', { number: 1 })).toBe('Handle {unknown}');
  });

  it('coerces non-string values to strings', () => {
    expect(interpolateTemplate('Issue {number}', { number: 0 })).toBe('Issue 0');
  });
});