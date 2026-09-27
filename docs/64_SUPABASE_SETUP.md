# 64 — Supabase setup

**Covers:** the ORQ8 Supabase project, how to reach it, how the lineage is applied
and recorded, and what still differs from the code schema.
**Related:** `docs/58_DEPLOYMENT.md` (hosting), `docs/62_ORQ8_SYSTEM_AUDIT.md`
(why the plumbing was broken), `supabase/MIGRATION.md` (lineage rules).

---

## 64.1 The project

| | |
|---|---|
| Name | ORQ8 |
| Ref | `gttkaxbcdtpsusmconxm` |
| Region | `eu-west-1` |
| Postgres | 17.6 |
| Status | ACTIVE_HEALTHY |
| Public schema | 69 tables, 0 rows |
| Direct host | `db.gttkaxbcdtpsusmconxm.supabase.co` (IPv6 only) |
| Pooler host | `aws-1-eu-west-1.pooler.supabase.com` |

**One trap worth stating plainly:** the connected Supabase MCP server exposes a
different project, `CapitalOS` (`tvekoojdilkjptjzpvqo`). That is another product.
Everything in this document targets `gttkaxbcdtpsusmconxm`, reached through the
Management API and the pooler, not the MCP server.

---

## 64.2 Credentials

Two secrets exist, and neither belongs in git.

| Secret | Where it lives | Used for |
|---|---|---|
| Management API token (`sbp_…`) | `.supabase-setup.json` (gitignored) | project metadata, SQL, password rotation |
| Database password | `.supabase-setup.json` (gitignored) | the pooler connection string |

The vault file at the repo root holds `projectRef`, `region`, `poolerHost`,
`poolerUser`, `directHost`, `managementToken` and `databasePassword`. It is listed
in `.gitignore`. Never commit it, never print its values, never paste the contents
into an issue, a workflow or a log line.

Rotate the database password (prints nothing but the HTTP status):

```bash
node -e "
const fs=require('fs'), crypto=require('crypto');
const cfg=require('./.supabase-setup.json');
const pw=crypto.randomBytes(24).toString('base64url').slice(0,32);
fetch('https://api.supabase.com/v1/projects/'+cfg.projectRef+'/database/password',{
  method:'PATCH',
  headers:{authorization:'Bearer '+cfg.managementToken,'content-type':'application/json'},
  body:JSON.stringify({password:pw}),
}).then(async r=>{
  if(!r.ok){ console.log('status', r.status, await r.text()); process.exit(1); }
  cfg.databasePassword=pw;
  fs.writeFileSync('.supabase-setup.json', JSON.stringify(cfg,null,2)+'\n');
  console.log('password rotated and stored in the vault');
});
"
```

A rotation takes a few seconds to reach the pooler. A `password authentication
failed for user "postgres"` immediately after a rotation is propagation, not a
wrong password: wait, then retry.

Run arbitrary read-only SQL against the project with the Management API:

```bash
node -e "
const cfg=require('./.supabase-setup.json');
const q=process.argv[1];
fetch('https://api.supabase.com/v1/projects/'+cfg.projectRef+'/database/query',{
  method:'POST',
  headers:{authorization:'Bearer '+cfg.managementToken,'content-type':'application/json'},
  body:JSON.stringify({query:q}),
}).then(async r=>console.log(r.status, await r.text()));
" "select current_user, count(*) from information_schema.tables where table_schema='public'"
```

That endpoint runs as `postgres` with a 2 minute `statement_timeout`. It is how
the `auth.*` ownership failure below was diagnosed.

---

## 64.3 Connection paths (measured 2026-09-27)

| Path | Result |
|---|---|
| Pooler, session mode, port 5432 | works, read and write |
| Pooler, transaction mode, port 6543 | works, read and write |
| Direct `db.<ref>.supabase.co:5432` | `getaddrinfo ENOTFOUND` on this network (IPv6 only) |

Use the pooler. For migrations use **session mode (5432)**: DDL and session-level
state belong to a connection that survives the statement.

Pooler user format is `postgres.<project-ref>`, not `postgres`.

**TLS.** `packages/db/src/db.ts` decides TLS from the URL:

- no `sslmode`, remote host → encrypt, do not verify the chain (Supabase carries
  its own CA, which Node's store does not trust)
- `sslmode=verify-full` → encrypt and verify
- `DATABASE_CA_CERT` = the provider's CA (PEM or path) → used, and verification is
  switched on
- no `sslmode`, local host → no TLS

Avoid `sslmode=require` in a Supabase URL: node-postgres currently treats it as
`verify-full`, and the handshake then fails with `self-signed certificate in
certificate chain`.

---

## 64.4 Migrations and the ledger

Two runners exist, and they are not equivalent:

| Runner | Source | Command |
|---|---|---|
| Drizzle (legacy) | `packages/db/migrations` | `pnpm --filter @orq8/db migrate` |
| Supabase (production path) | `supabase/migrations` (34 files) | `pnpm --filter @orq8/db migrate:supabase` |

Report what a database has actually received, without writing anything:

```bash
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" \
  pnpm --filter @orq8/db migrate:supabase:status
```

`--force` replays every file (all statements are idempotent) when a database has
to be reconciled with what is on disk.

What is applied is recorded in `supabase_migrations.schema_migrations` — the
Supabase CLI's own table, plus a `checksum` column of ours. The key is the
migration **file stem** (`0034_fk_indexes`), not the numeric prefix: this lineage
uses `0002` twice (`0002_add_all_missing_tables`, `0002_add_departments_and_authority`),
so a prefix cannot be a key. With the prefix as the key the two files shared a
row, the later one overwrote the other's checksum, and the other read as
permanently "changed".

**Production state (2026-09-27):** 34/34 applied, 0 pending, 0 changed.

### 0034 was the file that could not apply

`0034_fk_indexes.sql` builds indexes from the catalog so one file is correct on
both lineage shapes. Its gap query had no schema filter, so on a real Supabase
database it walked `auth.*` as well and tried to index `auth.mfa_challenges`,
which the `postgres` role does not own:

```
ERROR: 42501: must be owner of table mfa_challenges
CONTEXT: CREATE INDEX IF NOT EXISTS mfa_challenges_factor_id_idx ON auth.mfa_challenges (factor_id)
```

Local and CI runs passed because the embedded `auth` shim has no FKs. The file and
the `scripts/rls-security-e2e.ts` invariant are now both scoped to `public`, which
is the schema ORQ8 owns, and 0034 applied cleanly.

### CI

`.github/workflows/db-migrate.yml` runs `migrate:supabase:status` then
`migrate:supabase` against `secrets.SUPABASE_DATABASE_URL`. That secret must be
the pooler URL; the previously stored value pointed at the deleted Railway proxy,
which is why the workflow answered `read ECONNRESET`.

---

## 64.5 Schema parity, measured

Two fingerprints, both produced by `scripts/lineage-parity.ts`:

```bash
# the target
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" \
  PARITY_LABEL="supabase production (gttkaxbcdtpsusmconxm)" \
  pnpm exec tsx scripts/lineage-parity.ts --out .lineage-parity/supabase-prod.json

# the canonical lineage, from scratch, on an embedded Postgres
pnpm exec tsx scripts/lineage-parity.ts --fresh --out .lineage-parity/fresh.json

pnpm exec tsx scripts/lineage-parity.ts --diff .lineage-parity/fresh.json .lineage-parity/supabase-prod.json
```

| | fresh lineage | production |
|---|---|---|
| Columns | 801 | 828 |
| Indexes | 261 | 264 |
| Policies | 79 | 87 |
| Functions | 44 | 128 |
| Triggers | 26 | 26 |

Three groups account for every difference.

**1. Expected environment differences.** Supabase ships `pg_stat_statements`,
`supabase_vault` and `uuid-ossp` with their functions. The embedded harness skips
pgvector, so `company_memory.embedding` and `company_memory_embedding_idx` exist
only in production. These are not drift.

**2. Legacy tables that only exist in production.** `agent_memory`,
`notification_preferences`, `platform_admins` and `user_org_mapping`, with their
indexes, policies and RLS. `packages/db/src/schema.ts` already documents
`agent_memory` and `notification_preferences` as superseded (the app reads
`company_memory`). Nothing creates them, so a fresh database does not have them.

**3. Missing in production, because only the Supabase lineage was applied there.**
Eight performance indexes live in the drizzle lineage only
(`activity_events_org_occurred_idx`, `agents_org_status_idx`,
`approvals_org_status_idx`, `credit_balances_org_idx`,
`credit_transactions_org_created_idx`, `files_org_id_idx`, `goals_org_status_idx`,
`tasks_org_status_idx`), plus `users.password_hash`, `webhook_events.title` and a
few column defaults (`users.id`, `audit_events.id`, `secret_records.id` have no
default; `organizations.plan` defaults to `free` rather than `trial`).

**The conclusion matters more than the counts.** Production has 0 rows and is not
serving traffic, so this is cheap to fix now. But it cannot be fixed by the
Supabase lineage alone: the Supabase half never carries the drizzle half. Either
the two lineages are converged into one, or the drizzle lineage is applied to
production as well. That decision is open — see the changelog entry for
2026-09-27.

---

## 64.6 Removed as dead

- `railway.json` — Railway deploy config; the Railway application it names
  returns `{"code":404,"message":"Application not found"}`.
- `DEPLOY.md` — unreferenced, Railway-based deployment guide that contradicted
  `docs/58_DEPLOYMENT.md`. `docs/58` is the current path.
- `.github/workflows/db-migrate.yml` comments updated from Railway to Supabase.

Still open, and deliberately not changed here: the landing **privacy** and
**security** pages name Railway as the application host. That copy is user-facing
and legal-adjacent, so it needs a decision rather than a silent edit.

---

## 64.7 Verify the whole thing

```bash
pnpm typecheck
pnpm --filter @orq8/db test
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" \
  pnpm --filter @orq8/db migrate:supabase:status
rm -rf .rls-e2e-pg; pnpm exec tsx scripts/rls-security-e2e.ts
```
