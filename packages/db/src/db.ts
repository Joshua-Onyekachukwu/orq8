import { readFileSync } from 'node:fs';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

/**
 * TLS for managed Postgres (Supabase pooler, Cloud SQL, RDS).
 *
 * The pooler host presents a certificate chain signed by the provider's own CA,
 * which Node's store does not trust, so node-postgres' `sslmode=require` (which
 * it currently treats as `verify-full`) fails with "self-signed certificate in
 * certificate chain". The URL therefore states its own trust level:
 *
 *   `sslmode=require`     encrypt, do not verify the chain (provider-trusted)
 *   `sslmode=no-verify`   same, said explicitly
 *   `sslmode=verify-full` encrypt and verify the chain
 *   `sslmode=disable`     no TLS
 *   no `sslmode`, local host   no TLS (docker-compose, embedded Postgres)
 *   no `sslmode`, remote host  encrypt, do not verify
 *
 * To verify the chain without relying on the system store, set
 * `DATABASE_CA_CERT` to the provider's CA certificate as a PEM string or a path
 * to a `.crt` file; it is then used and verification is switched on.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'db', 'postgres']);

export interface DatabaseSslConfig {
  rejectUnauthorized: boolean;
  ca?: string;
}

function readCa(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes('BEGIN CERTIFICATE')) return trimmed;
  try {
    return readFileSync(trimmed, 'utf8');
  } catch {
    return undefined;
  }
}

export function databaseSslOptions(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): false | DatabaseSslConfig {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return false;
  }

  const mode = (url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? '').toLowerCase();
  if (mode === 'disable' || mode === 'false') return false;
  if (!mode && LOCAL_HOSTS.has(url.hostname)) return false;

  // A supplied CA always means verify: the point of pinning the certificate is
  // to stop trusting whatever the network hands us.
  const ca = readCa(env.DATABASE_CA_CERT);
  if (ca) return { rejectUnauthorized: true, ca };
  if (mode === 'verify-full' || mode === 'verify-ca') return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

/** Pool for any Postgres: local plaintext, or a managed host over TLS. */
export function createPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    ssl: databaseSslOptions(databaseUrl),
  });
}

export function createDb(databaseUrl: string): { db: Db; pool: Pool } {
  const pool = createPool(databaseUrl);
  const db = drizzle(pool, { schema });
  return { db, pool };
}
