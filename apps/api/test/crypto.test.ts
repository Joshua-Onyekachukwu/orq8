/**
 * Encryption-at-rest unit tests.
 *
 * Verifies the AES-256-GCM secret service:
 *   1. Encrypt/decrypt round-trips with a configured ENCRYPTION_KEY
 *   2. Two encryptions of the same secret produce different ciphertexts (IV)
 *   3. A wrong key fails to decrypt (returns null, never throws)
 *   4. Tampered payloads fail to decrypt (GCM auth tag)
 *
 * Pure unit tests — no database, no server.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret, decryptSecret } from '../src/services/crypto.js';

const REAL_KEY = process.env.ENCRYPTION_KEY;

afterEach(() => {
  vi.stubEnv('ENCRYPTION_KEY', REAL_KEY ?? '');
});

describe('crypto — encryption at rest', () => {
  it('round-trips a secret with ENCRYPTION_KEY set', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-1234567890');
    const secret = 'gho_very_secret_token_abc123';
    const payload = encryptSecret(secret);
    expect(payload.startsWith('v1:')).toBe(true);
    expect(payload).not.toContain(secret);
    expect(decryptSecret(payload)).toBe(secret);
  });

  it('produces unique ciphertext for the same secret (random IV)', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-1234567890');
    const a = encryptSecret('same-secret');
    const b = encryptSecret('same-secret');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same-secret');
    expect(decryptSecret(b)).toBe('same-secret');
  });

  it('returns null when decrypting with a different key', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'correct-key-A');
    const payload = encryptSecret('top-secret');
    vi.stubEnv('ENCRYPTION_KEY', 'wrong-key-B');
    expect(decryptSecret(payload)).toBeNull();
  });

  it('returns null for tampered ciphertext (GCM auth failure)', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-1234567890');
    const payload = encryptSecret('integrity-check');
    const [version, iv, tag, data] = payload.split(':');
    // Flip a character in the ciphertext portion
    const flipped = data?.endsWith('A')
      ? data.slice(0, -1) + 'B'
      : (data ?? '').slice(0, -1) + 'A';
    const tampered = [version, iv, tag, flipped].join(':');
    expect(decryptSecret(tampered)).toBeNull();
  });

  it('returns null for malformed payloads instead of throwing', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-1234567890');
    expect(decryptSecret('')).toBeNull();
    expect(decryptSecret('not-a-valid-payload')).toBeNull();
    expect(decryptSecret('v1:onlytwo')).toBeNull();
    expect(decryptSecret('v2:aaaa:bbbb:cccc')).toBeNull(); // unsupported version
  });

  it('round-trips non-ASCII secrets (UTF-8)', () => {
    vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-1234567890');
    const secret = 'contraseña-秘密-🔐';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });
});