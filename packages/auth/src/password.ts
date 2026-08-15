import { hash, verify } from '@node-rs/argon2';

// docs/37 — Argon2id for password storage. OWASP-ish defaults for interactive logins.
const OPTIONS = {
  algorithm: 2 as const, // Argon2id
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await verify(hashValue, password, OPTIONS);
  } catch {
    return false;
  }
}
