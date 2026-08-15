import { describe, expect, it } from 'vitest';
import {
  AesGcmCipher,
  DEFAULT_KEY_KID,
  maskSecret,
  parseSecret,
  serializeSecret,
} from '../src/crypto.js';

const MASTER = 'dev-only-encryption-key-32-bytes!!';

describe('AesGcmCipher (docs/23.5, 37)', () => {
  it('encrypts and decrypts round-trip', () => {
    const cipher = new AesGcmCipher(MASTER);
    const { secret, kid } = cipher.encrypt('sk-ant-abcdef123456');
    expect(kid).toBe(DEFAULT_KEY_KID);
    expect(cipher.decrypt(secret)).toBe('sk-ant-abcdef123456');
  });

  it('uses a fresh IV per encryption (same plaintext → different ciphertext)', () => {
    const cipher = new AesGcmCipher(MASTER);
    const a = cipher.encrypt('sk-1234');
    const b = cipher.encrypt('sk-1234');
    expect(a.secret.ciphertext).not.toBe(b.secret.ciphertext);
    expect(a.secret.iv).not.toBe(b.secret.iv);
  });

  it('rejects tampered ciphertext or tag (GCM auth)', () => {
    const cipher = new AesGcmCipher(MASTER);
    const { secret } = cipher.encrypt('sk-abcdef');
    const tampered = { ...secret, ciphertext: (secret.ciphertext === 'AAAA' ? 'BBBB' : 'AAAA') };
    expect(() => cipher.decrypt(tampered)).toThrow();
    const badTag = { ...secret, tag: Buffer.from('00'.repeat(16), 'hex').toString('base64') };
    expect(() => cipher.decrypt(badTag)).toThrow();
  });

  it('fails to decrypt with a different master key', () => {
    const a = new AesGcmCipher(MASTER);
    const b = new AesGcmCipher('another-32-byte-master-key!!');
    const { secret } = a.encrypt('sk-secret');
    expect(() => b.decrypt(secret)).toThrow();
  });

  it('requires a sufficiently long master key', () => {
    expect(() => new AesGcmCipher('short')).toThrow();
  });

  it('serialize/parse round-trips the stored payload', () => {
    const cipher = new AesGcmCipher(MASTER);
    const { secret } = cipher.encrypt('sk-x');
    const stored = serializeSecret(secret);
    expect(cipher.decrypt(parseSecret(stored))).toBe('sk-x');
  });

  it('parseSecret rejects malformed payloads', () => {
    expect(() => parseSecret('{}')).toThrow();
    expect(() => parseSecret('not-json')).toThrow();
  });
});

describe('maskSecret (docs/23.3 — full keys never shown)', () => {
  it('masks long keys as prefix…suffix', () => {
    expect(maskSecret('sk-ant-abcdefghijklmnop')).toBe('sk-a…mnop');
  });
  it('elides short values', () => {
    expect(maskSecret('abc')).toBe('abc…');
    expect(maskSecret('')).toBe('');
  });
});
