import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { databaseSslOptions } from '../src/db.js';

const POOLER = 'postgresql://postgres.abc:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

describe('databaseSslOptions', () => {
  it('keeps local development plaintext', () => {
    expect(databaseSslOptions('postgres://orq8:orq8@localhost:5432/orq8', {})).toBe(false);
    expect(databaseSslOptions('postgres://orq8:orq8@127.0.0.1:5432/orq8', {})).toBe(false);
    expect(databaseSslOptions('postgres://orq8:orq8@db:5432/orq8', {})).toBe(false);
  });

  it('encrypts without verifying for a managed host that states require', () => {
    expect(databaseSslOptions(`${POOLER}?sslmode=require`, {})).toEqual({ rejectUnauthorized: false });
    expect(databaseSslOptions(`${POOLER}?sslmode=no-verify`, {})).toEqual({ rejectUnauthorized: false });
  });

  it('verifies when the URL asks for it', () => {
    expect(databaseSslOptions(`${POOLER}?sslmode=verify-full`, {})).toEqual({ rejectUnauthorized: true });
    expect(databaseSslOptions(`${POOLER}?sslmode=verify-ca`, {})).toEqual({ rejectUnauthorized: true });
  });

  it('encrypts a remote host even without an sslmode', () => {
    expect(databaseSslOptions(POOLER, {})).toEqual({ rejectUnauthorized: false });
  });

  it('honours an explicit disable', () => {
    expect(databaseSslOptions(`${POOLER}?sslmode=disable`, {})).toBe(false);
  });

  it('pins and verifies when a CA certificate is supplied as PEM', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
    expect(databaseSslOptions(`${POOLER}?sslmode=require`, { DATABASE_CA_CERT: pem })).toEqual({
      rejectUnauthorized: true,
      ca: pem,
    });
  });

  it('pins and verifies when a CA certificate is supplied as a path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orq8-ca-'));
    const file = join(dir, 'prod-ca.crt');
    writeFileSync(file, '-----BEGIN CERTIFICATE-----\nFROMFILE\n-----END CERTIFICATE-----');
    expect(databaseSslOptions(`${POOLER}?sslmode=require`, { DATABASE_CA_CERT: file })).toEqual({
      rejectUnauthorized: true,
      ca: '-----BEGIN CERTIFICATE-----\nFROMFILE\n-----END CERTIFICATE-----',
    });
  });

  it('ignores an unreadable CA path rather than failing to connect', () => {
    expect(databaseSslOptions(`${POOLER}?sslmode=require`, { DATABASE_CA_CERT: '/nope/missing.crt' })).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('returns false for a URL it cannot parse', () => {
    expect(databaseSslOptions('not-a-url', {})).toBe(false);
  });
});
