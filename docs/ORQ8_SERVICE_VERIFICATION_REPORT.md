# ORQ8 Service Verification Report — 2026-10-12

Live evidence only. Prior-session context: `docs/90_MASTER_AUDIT_SESSION.md`, `docs/68_REQUIREMENT_MATRIX.md`, `docs/82_DEPLOYMENT_RUNBOOK.md`.

## Verdicts

| Service | Role | Status | Evidence (today) |
|---|---|---|---|
| GitHub / Actions | source, CI/CD | WORKING | CI 11/11 SUCCESS on `ce9d17a`; scheduled-jobs green |
| Vercel (`orq8.vercel.app`) | web host | WORKING | release build READY, domain serves it, 65/65 assets 200 |
| Railway API (`-062a`) | API host | WORKING | `/healthz` + `/readyz` 200 |
| Railway worker (`@orq8/worker`) | job drain | UNVERIFIED live, WORKING in CI | prod `agent_jobs`/`tasks` empty (zero workload — nothing to drain, nothing stuck); drain proven by CI founder-loop + proof gate, not prod traffic |
| Supabase Postgres | system of record | WORKING | ledger read; 0053–0057 verified present; RLS proof green in CI |
| OpenRouter | primary LLM | WORKING | models-list healthy (988ms); live `gpt-4o-mini` completion exact output (1.2s) |
| NVIDIA NIM | fallback LLM | WORKING | models-list healthy (727ms, 5-key pool); live nemotron completion correct at normal budgets |
| Ollama / LiteLLM | dev providers | DOWN (by design) | nothing listening locally; correctly last in chain |
| Email (Resend/SMTP) | transactional mail | BLOCKED | no provider secret in prod; code ready (`transport.ts` Resend + SMTP + provider check); release gate BLOCKED on `email` |
| Redis/Upstash | rate-limit sharing | MISSING (optional) | in-memory fallback active; correct on single API instance |
| Error monitoring (Sentry etc.) | alerts | MISSING | no SDK; OTel seam exists but exporter never wired (`tracing.ts` stub) |
| Old Railway hosts | dead | UNUSED (correct) | edge 404; dev-script defaults repointed to `-062a` |

## Probe scripts (kept in tree)

- `apps/api/scripts/pico-provider-probe.ts` — free models-list health per provider, no key material in output.
- `apps/api/scripts/pico-capability-ping.ts` — one tiny completion per provider (fractions of a cent).

## Blockers needing the founder

1. `RESEND_API_KEY` (or SMTP_*) in the API environment → unblocks email + release gate.
2. `SUPABASE_DATABASE_URL` reachability from Actions runners (DB Migrate ECONNRESET since 09-27; 0056/0057 hand-applied meanwhile).
3. Confirm Railway API service config still matches repo (`apps/api/railway.json` is new; Dockerfile CMD already ran the same start script — likely harmless, unverified from here).
