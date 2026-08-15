import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// docs/23.5 + 37 — encryption at rest for provider keys and OAuth tokens.
// AES-256-GCM with a master key from env (ENCRYPTION_KEY); the SecretCipher
// interface is the KMS seam: a KMS-backed implementation (wrapping key in KMS,
// per-org data key) can be swapped in later without touching callers.

export interface EncryptedSecret {
  /** base64 ciphertext (no IV/tag — kept separate) */
  ciphertext: string;
  /** base64 12-byte IV */
  iv: string;
  /** base64 16-byte GCM auth tag */
  tag: string;
}

/** Wrapping-key version — bumped when the master key rotates (docs/23.5 key_kid). */
export const DEFAULT_KEY_KID = 'v1';

export interface SecretCipher {
  encrypt(plaintext: string, kid?: string): { secret: EncryptedSecret; kid: string };
  decrypt(encrypted: EncryptedSecret): string;
}

/** Derive a 32-byte AES-256 key from the env master key (any-length secret → SHA-256). */
export function deriveMasterKey(masterKey: string): Buffer {
  return createHash('sha256').update(masterKey, 'utf8').digest();
}

export class AesGcmCipher implements SecretCipher {
  private readonly key: Buffer;

  constructor(masterKey: string) {
    if (!masterKey || masterKey.length < 16) {
      throw new Error('AesGcmCipher: master key must be at least 16 characters');
    }
    this.key = deriveMasterKey(masterKey);
  }

  encrypt(plaintext: string, kid: string = DEFAULT_KEY_KID): { secret: EncryptedSecret; kid: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      secret: {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
      },
      kid,
    };
  }

  decrypt(encrypted: EncryptedSecret): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(encrypted.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}

/** Serialize an EncryptedSecret for storage in a single text column. */
export function serializeSecret(encrypted: EncryptedSecret): string {
  return JSON.stringify(encrypted);
}

/** Parse an EncryptedSecret from its serialized form. */
export function parseSecret(payload: string): EncryptedSecret {
  const parsed = JSON.parse(payload) as Partial<EncryptedSecret>;
  if (!parsed.ciphertext || !parsed.iv || !parsed.tag) {
    throw new Error('parseSecret: malformed encrypted payload');
  }
  return { ciphertext: parsed.ciphertext, iv: parsed.iv, tag: parsed.tag };
}

/**
 * Display-only mask — full keys are never shown after save (docs/23.3).
 * "sk-abc…wxyz" — first 4 / last 4 when long enough, else a short elided form.
 */
export function maskSecret(value: string, visible: number = 4): string {
  if (value.length <= visible * 2 + 2) {
    return value.length === 0 ? '' : `${value.slice(0, visible)}…`;
  }
  return `${value.slice(0, visible)}…${value.slice(-visible)}`;
}
