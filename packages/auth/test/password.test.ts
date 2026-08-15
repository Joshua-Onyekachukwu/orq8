import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password.js';

describe('password (Argon2id, docs/37)', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct');
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
  });

  it('produces distinct hashes for the same password (salt)', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, 'same-password')).toBe(true);
    expect(await verifyPassword(b, 'same-password')).toBe(true);
  });
});
