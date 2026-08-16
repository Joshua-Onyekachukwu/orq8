# ORQ8 → Supabase Migration

**Status:** Prepared (schema + RLS + seed). Apply + wire the API per this doc.
**Source of truth:** `packages/db/src/schema.ts` (Drizzle) → this SQL, reviewed against
`supabase-postgres-best-practices` (RLS enforced at the DB, FK columns indexed, identity PKs,
timestamptz, lowercase snake_case, text + CHECK constraints, `updated_at` triggers, `force row level security`).

---

## 1. What this migration does

| Artifact | Purpose |
| --- | --- |
| `supabase/migrations/0001_initial.sql` | Full Phase-1 schema: `users`, `organizations`, `memberships`, `sessions`, `audit_events`, `providers`, `user_provider_keys`, `secret_records`, `waitlist_signups`, `waitlist_emails` + RLS on every table + provider seed |
| `apps/landing`, `apps/web` | **No changes** — both already proxy to the API; the API's DB URL is the only thing that moves |

**Deliberate auth decision:** Supabase Auth owns credentials now. `users.id` references
`auth.users(id)`, `password_hash` is gone, and the API must verify Supabase-issued JWTs
via the JWKS URL (already provided). The old app-issued `sessions` flow is kept in the
schema only as a transition table and is retired once the auth swap lands (Section 4).

**RLS posture (per the skill's CRITICAL rule):**
- Tenant tables (`organizations`, `memberships`, `audit_events`, `user_provider_keys`,
  `secret_records`) are scoped through `memberships` + `auth.uid()` and **forced**, so even
  a misconfigured client can never read another org's rows.
- `waitlist_signups`: anon **insert only** — no read path, nothing to scrape.
- `waitlist_emails`: service_role only.
- `providers`: public read (config, not secrets); the API writes via service_role.
- The API continues to connect as **service_role** (secret key), so its existing queries are
  unaffected by RLS; the RLS layer protects *direct* Postgres/anon access.

---

## 2. Prerequisites

- Supabase project exists (already created — project ref `gttkaxbcdtpsusmconxm`).
- Keys already provided: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (anon),
  `SUPABASE_SECRET_KEY` (service_role), `SUPABASE_JWKS_URL`.
- **Not provided yet (needed to apply):** the Postgres connection string
  (`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`
  for the pooler, or the direct port 5432) and the **database password** from
  Supabase → Project Settings → Database. Nothing can run against the DB without it.

---

## 3. Apply

```bash
# One-time project link (creates .temp/supabase config, does not touch code)
npx supabase login
npx supabase link --project-ref gttkaxbcdtpsusmconxm

# Apply this migration (creates supabase_migrations.schema_migrations tracking)
npx supabase db push

# Or, without the CLI: paste 0001_initial.sql into
# Supabase Dashboard → SQL Editor and run it there (idempotent-safe: IF NOT EXISTS everywhere).
```

Verify after apply:

```sql
-- every tenant table must list as rls enabled + forced
select relname, relrowsecurity, relforcerowsecurity
from pg_class where relname in
  ('users','organizations','memberships','sessions','audit_events',
   'user_provider_keys','secret_records','waitlist_signups','waitlist_emails')
order by relname;

-- no unindexed foreign keys (skill: schema-foreign-key-indexes)
select conrelid::regclass as table_name, a.attname as fk_column
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
where c.contype = 'f'
  and not exists (
    select 1 from pg_index i
    where i.indrelid = c.conrelid and a.attnum = any(i.indkey)
  );

-- provider seed present
select slug from providers order by slug;
```

---

## 4. API-side swap (the actual cutover work — next task)

1. **`apps/api/.env`:** replace `DATABASE_URL` with the Supabase **pooler** URL
   (`...:6543/postgres`, transaction mode) — keep the local docker URL as fallback/dev.
   Add `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. **Auth plugin (`apps/api/src/plugins/auth.ts`):** stop verifying app-issued tokens;
   verify Supabase JWTs against the JWKS URL (`jose` + `createRemoteJWKSet`). Map
   `auth.uid()` → `users.id`.
3. **`users` service:** on first authenticated request, upsert the profile row
   (`id = auth.uid()`, email/name from the JWT) — Supabase creates the `auth.users` row at
   signup; the profile row follows lazily.
4. **`/v1/auth/*`:** `register` becomes "accept a Supabase session" (the client signs up via
   Supabase Auth first); `login` moves client-side. Keep the routes for now, backed by the
   session from the JWT, so `apps/web` login/register forms can be swapped last.
5. **Org bootstrap:** after first sign-in, ensure the user has ≥1 org + an `owner`
   membership (the transaction currently in `registerAuthRoutes` moves to a
   "ensure default org" step keyed on `auth.uid()`).
6. **Waitlist drip:** `POST /v1/waitlist` + `process-due` already run through the API → they
   now write to Supabase. The GitHub Action cron keeps working (it calls the API, not the DB).
7. **Local vs prod:** docker Postgres stays for `pnpm db:seed`/local dev; Supabase is the
   deployed DB. Drizzle migrations regenerate from the *updated* schema (users profile)
   and are applied to Supabase via the CLI, not the local migrate runner.

---

## 5. Verify (definition of done)

- [ ] Landing waitlist signup → row in `waitlist_signups` (idempotent on repeat)
- [ ] Waitlist drip rows queued with correct `scheduled_at`; `process-due` sends via nodemailer
- [ ] Register via Supabase Auth → profile + default org + `owner` membership created
- [ ] `/v1/auth/me` returns the org from the Supabase JWT
- [ ] Provider key save/rotate: `user_provider_keys` write as service_role, masked read as user
- [ ] **Direct anon query returns nothing for tenant tables** (RLS working), `waitlist_signups`
      insert works anon, select denied
- [ ] Local stack (`pnpm dev-api` against docker) still green — dual-env until cutover

---

## 6. Rollback

- **Schema:** run the inverse DDL (drop tables) or restore the local docker Postgres —
  Supabase keeps a 7-day PITR backup. Nothing in the migration is destructive to existing
  local data because this is the first deployment (no prod rows yet).
- **Auth:** keep `apps/api/.env` pointing at docker Postgres; the API code swap in §4 is the
  only revertible part — it's a separate PR.

---

## 7. Open items / decisions for you

1. **Postgres connection string + DB password** — required before anything can be applied.
2. **Auth UX:** with Supabase Auth, signup/login happen via `@supabase/supabase-js` in
   `apps/web` (email+password, or magic link / Google). Which providers do you want on?
3. **Schema drift:** after the auth swap, regenerate Drizzle migrations so `packages/db`
   stays the single source of truth (users profile without `password_hash`).
4. **Seed data on Supabase:** `providers` is seeded here; the Phase-5 seed
   (constitution, approval rules, permissions) can land as `0002_seed_governance.sql` when
   the governance tables exist.
