import { describe, expect, it } from 'vitest';
import { canonicalJson, canonicalSha256, decisionToken, taskDecisionToken } from '../src/decision-token.js';

describe('canonicalJson', () => {
  it('sorts object keys so re-ordered payloads hash identically', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    expect(canonicalSha256({ b: 2, a: 1 })).toBe(canonicalSha256({ a: 1, b: 2 }));
  });

  it('sorts keys recursively, but keeps array order (order is information)', () => {
    expect(canonicalJson({ x: { d: 4, c: 3 } })).toBe(canonicalJson({ x: { c: 3, d: 4 } }));
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
    expect(canonicalJson({ list: ['z', 'a'] })).toBe(canonicalJson({ list: ['z', 'a'] }));
    expect(canonicalJson({ list: ['z', 'a'] })).not.toBe(canonicalJson({ list: ['a', 'z'] }));
  });

  it('keeps structurally distinct values distinct ("1" is not 1)', () => {
    expect(canonicalJson({ a: '1' })).not.toBe(canonicalJson({ a: 1 }));
  });

  it('drops undefined object values but keeps explicit nulls', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe(canonicalJson({ b: 1 }));
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
  });

  it('serializes dates as ISO strings', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(canonicalJson({ at: d })).toBe('{"at":"2026-01-01T00:00:00.000Z"}');
  });

  it('rejects non-finite numbers instead of hashing them to null', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson({ a: Infinity })).toThrow(/non-finite/);
  });
});

describe('decisionToken (docs/82 §decision-token)', () => {
  it('binds tool and params: same call → same token, any call change → different token', () => {
    const t = decisionToken('send_email', { to: 'a@b.c', subject: 'Hi' });
    expect(t).toBe(decisionToken('send_email', { subject: 'Hi', to: 'a@b.c' })); // key order irrelevant
    expect(t).not.toBe(decisionToken('send_email', { to: 'a@b.c', subject: 'Hi!' }));
    expect(t).not.toBe(decisionToken('post_tweet', { to: 'a@b.c', subject: 'Hi' })); // swapped tool
    expect(t).not.toBe(decisionToken('send_email', { to: 'b@b.c', subject: 'Hi' })); // swapped recipient
    expect(t).not.toBe(decisionToken('send_email', { to: 'a@b.c', subject: 'Hi', urgency: 'high' })); // extra arg
  });

  it('matches the audit chain convention: sha256 hex', () => {
    expect(decisionToken('t', {})).toMatch(/^[0-9a-f]{64}$/);
    expect(taskDecisionToken('c24bf0e1-0000-4000-8000-000000000000')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('task tokens differ per task', () => {
    expect(taskDecisionToken('t1')).not.toBe(taskDecisionToken('t2'));
  });
});
