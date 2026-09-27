import { describe, expect, it } from 'vitest';

import {
  checksumSql,
  migrationName,
  migrationVersion,
  planLedger,
  summarizeLedger,
} from '../src/migration-ledger.js';

describe('migrationVersion / migrationName', () => {
  it('keys the ledger on the unique file stem', () => {
    expect(migrationVersion('0033_rls_hardening.sql')).toBe('0033_rls_hardening');
    expect(migrationVersion('0001_initial.sql')).toBe('0001_initial');
    expect(migrationName('0033_rls_hardening.sql')).toBe('rls_hardening');
    expect(migrationName('0001_initial.sql')).toBe('initial');
  });

  it('keeps the two files that share the 0002 prefix apart', () => {
    const first = migrationVersion('0002_add_all_missing_tables.sql');
    const second = migrationVersion('0002_add_departments_and_authority.sql');
    expect(first).not.toBe(second);
  });

  it('survives a filename that does not follow the convention', () => {
    expect(migrationVersion('stray.sql')).toBe('stray');
    expect(migrationName('stray.sql')).toBe('stray');
  });
});

describe('checksumSql', () => {
  it('is stable across line endings and trailing whitespace', () => {
    const lf = 'create table t (id int);\nselect 1;\n';
    const crlf = 'create table t (id int);\r\nselect 1;   \r\n\r\n';
    expect(checksumSql(crlf)).toBe(checksumSql(lf));
  });

  it('changes when the statement changes', () => {
    expect(checksumSql('select 1;')).not.toBe(checksumSql('select 2;'));
  });
});

describe('planLedger', () => {
  const files = [
    { file: '0001_initial.sql', sql: 'create table a (id int);' },
    { file: '0033_rls_hardening.sql', sql: 'create policy p on a;' },
  ];

  it('treats every file as pending when nothing has been recorded', () => {
    const entries = planLedger(files, []);
    expect(entries.map((e) => e.state)).toEqual(['pending', 'pending']);
    expect(summarizeLedger(entries)).toEqual({ applied: 0, pending: 2, changed: 0, total: 2 });
  });

  it('skips a file whose recorded checksum matches', () => {
    const entries = planLedger(files, [
      { version: '0001_initial', checksum: checksumSql(files[0]!.sql) },
    ]);
    expect(entries[0]!.state).toBe('applied');
    expect(entries[1]!.state).toBe('pending');
  });

  it('re-applies a file that changed since it was recorded', () => {
    const entries = planLedger(files, [{ version: '0001_initial', checksum: 'stale' }]);
    expect(entries[0]!.state).toBe('changed');
  });

  it('re-applies a file recorded without a checksum', () => {
    const entries = planLedger(files, [{ version: '0001_initial', checksum: null }]);
    expect(entries[0]!.state).toBe('changed');
  });

  it('replays everything under force, including applied files', () => {
    const entries = planLedger(
      files,
      [{ version: '0001_initial', checksum: checksumSql(files[0]!.sql) }],
      true,
    );
    expect(entries.map((e) => e.state)).toEqual(['pending', 'pending']);
  });

  it('preserves the caller order and pairs each file with its own checksum', () => {
    const entries = planLedger(files, []);
    expect(entries.map((e) => e.file)).toEqual(['0001_initial.sql', '0033_rls_hardening.sql']);
    expect(entries[0]!.checksum).toBe(checksumSql(files[0]!.sql));
    expect(entries[1]!.version).toBe('0033_rls_hardening');
  });
});
