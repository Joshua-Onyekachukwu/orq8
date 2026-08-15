import { describe, expect, it } from 'vitest';
import { extractBearer, generateSessionToken, hashSessionToken } from '../src/session.js';

describe('session tokens (ADR-007)', () => {
  it('generates unique opaque tokens', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it('hashes tokens deterministically without revealing them', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('extracts bearer tokens (docs/35.1)', () => {
    expect(extractBearer('Bearer abc123')).toBe('abc123');
    expect(extractBearer('bearer xyz')).toBe('xyz');
    expect(extractBearer(undefined)).toBeNull();
    expect(extractBearer('Basic abc123')).toBeNull();
    expect(extractBearer('')).toBeNull();
  });
});
