# ORQ8 Service Inventory — 2026-10-12

Status key: WORKING / PARTIAL / BROKEN / UNUSED / MISSING / BLOCKED / UNVERIFIED. Live evidence in `docs/ORQ8_SERVICE_VERIFICATION_REPORT.md`.

## Compute & hosting

| Service | Purpose | Env | Config | Creds | Connectivity | E2E | Cost basis | Problems | Action |
|---|---|---|---|---|---|---|---|---|---|
| Vercel | web frontend | prod | WORKING | token in CI | WORKING | WORKING (65/65 assets) | hobby ~$0 | none | keep |
| Railway API | Fastify API | prod | WORKING | env set | WORKING | WORKING | usage, ~$5–10/mo share | none | keep |
| Railway worker | job drain | prod | WORKING (per runbook) | env set | UNVERIFIED direct | WORKING in CI | ~$2.50/mo idle | no prod traffic to observe | keep; verify on first jobs |
| Railway web | second web host | prod | WORKING | — | WORKING | WORKING | usage | host undecided | founder: pick canonical host |
| Old Railway hosts | — | — | UNUSED | — | dead 404 | — | $0 | stale refs removed | none |

## Data

| Service | Purpose | Env | Config | Creds | Connectivity | E2E | Cost basis | Problems | Action |
|---|---|---|---|---|---|---|---|---|---|
| Supabase Postgres | system of record | prod | WORKING | mgmt token local | WORKING | WORKING (RLS proof) | free tier | DB Migrate runner ECONNRESET | fix runner or keep hand-apply |
| Supabase Auth | sessions | prod | WORKING | — | WORKING | WORKING (auth proof) | free | none | keep |
| Supabase Storage/Realtime | files/live | prod | UNUSED | — | UNVERIFIED | UNVERIFIED | — | unused | evaluate on need |
| Redis/Upstash | shared rate limits | — | MISSING | none | — | fallback in-memory | ~$0 | single-instance OK | add before 2nd replica |

## AI

| Service | Purpose | Config | Connectivity | E2E | Cost basis | Action |
|---|---|---|---|---|---|---|
| OpenRouter | primary LLM | WORKING (key set) | healthy 988ms | live exact completion | ~$0.001/EA turn | keep primary |
| NVIDIA NIM | fallback LLM | WORKING (5 keys) | healthy 727ms | live completion | ~$0.003/EA turn | keep fallback |
| LiteLLM/Ollama | dev only | DOWN by design | — | — | $0 | keep last, never prod |

## Platform services

| Service | Purpose | Status | Action |
|---|---|---|---|
| GitHub Actions | CI/CD | WORKING (11/11) | keep; consider branch protection |
| Resend/SMTP email | transactional mail | BLOCKED (no secret) | founder: set `RESEND_API_KEY` |
| Sentry (or equiv.) | error monitoring | MISSING | add on first users (dev plan free) |
| OTel exporter | tracing | MISSING (seam stubbed) | wire with monitoring |
| GitHub/Google/Linear/OAuth integrations | connected tools | PARTIAL per runbook | OAuth ids pending (founder) |
| Analytics/logging platform | aggregation | MISSING | platform logs suffice pre-launch |
