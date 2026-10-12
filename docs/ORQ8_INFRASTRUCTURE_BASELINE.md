# ORQ8 Infrastructure Baseline — 2026-10-12

## Measured today

- API `/healthz`: 200 (~1.2s cold). `/readyz`: ready 7 / required 7 / blocking 1 (email).
- Web `/login`: 200 on Vercel (~3.0s) and Railway web (~1.4s).
- OpenRouter probe 988ms healthy; NVIDIA probe 727ms healthy (5 keys).
- Live completions: gpt-4o-mini exact output 1.2s; nemotron correct <1s at normal budgets.
- Prod tables: `agent_jobs` 0 rows, `tasks` 0 rows (zero workload — baseline is idle).
- CI full suite: 11/11 SUCCESS. Local proof gate: 16/16 PASS.
- `pnpm audit --audit-level=high`: exit 0. API `tsc --noEmit`: clean.

## Known failure modes and handling (all observed, none theoretical)

- Provider 429 → key deprioritization + Retry-After, then next provider.
- Provider hang → 30s first-byte abort, treated like 404 for NVIDIA.
- All providers down → structured fallback, reported (never fake success).
- Worker death mid-run → claim fence revokes zombie writes; orphan reaper converges rows.
- Budget expiry → converge-to-pending at zero cost; re-run is safe (lock cleared).
- Exhausted credits → block pre-execution at zero cost.
- DB Migrate ECONNRESET → hand-apply path documented and used (0056/0057).

## Dependencies of each evaluation target

Email change touches `transport.ts` only (provider check + send paths, tested). OTel wiring touches `packages/core/tracing.ts` + API/worker entry (seam ready). Redis touches rate-limit/session plugins (fallback preserved). Queue changes touch `jobs.ts`/`job-worker.ts`/worker entry (covered by soak + claim-scope tests).
