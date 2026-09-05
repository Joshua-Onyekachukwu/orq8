import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * Encryption at rest for sensitive secrets (OAuth tokens, provider keys).
 *
 * Uses AES-256-GCM with a key derived from ENCRYPTION_KEY (or SECRET_KEY as a
 * fallback). If neither is set, a deterministic dev-only key is used and a
 * warning is emitted once — production deployments MUST set ENCRYPTION_KEY.
 *
 * Payload format: v1:<iv base64>:<authTag base64>:<ciphertext base64>
 */

function getKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY ?? process.env.SECRET_KEY ?? '';
  if (!envKey) {
    // Dev-only fallback. Deterministic so restarts don't orphan secrets, but
    // NOT safe for production — log loudly.
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[crypto] ENCRYPTION_KEY not set — using insecure dev key. Set ENCRYPTION_KEY in production.');
    }
    return createHash('sha256').update('orq8-dev-only-insecure-key-do-not-use-in-prod').digest();
  }
  return createHash('sha256').update(envKey).digest();
}

/** Encrypt a plaintext secret. Returns the v1 payload string. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/** Decrypt a v1 payload. Returns null on any failure (bad key, tampering, format). */
export function decryptSecret(payload: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split(':');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
    const key = getKey();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}