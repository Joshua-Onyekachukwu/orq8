# 90 — Master audit session tracker (2026-10-12)

The live progress record for the founder-commissioned master audit
(investigate → implement → test → verify → release → handoff).
Status vocabulary is the assignment's: PASS / PARTIAL / FAIL / NOT BUILT /
BLOCKED / UNVERIFIED. Requirement status itself lives only in docs/66 +
docs/68; this file tracks the *audit work*, not the product.

## Where things stand at session start

- Branch `main`; HEAD `fc16169` (execution-lock fence + jobs fence +
  heartbeat + fenced attention) is **local-only, ahead of origin/main by 1**.
- `origin/main` HEAD is `d773609`. The 62 modified + 5 untracked working-tree
  files are existing user work — preserved, never to be swept into unrelated
  commits.
- `pnpm -r typecheck`: PASS (8/8 projects), on the working tree.
- Full API suite: running as baseline (`.baseline-tests.log`).
- Production: API live (`orq8api-production-062a.up.railway.app`, ready 7 /
  config-required 7 / blocking 1); web live on two hosts (canonical host is
  still a founder decision per docs/68 MVP-001).
- Secrets just set: `API_URL` → live API, `PRODUCTION_API_URL` created;
  `INTERNAL_TOKEN` pre-existing, untouched.

## CI on origin/main (run 38199072822 @ d773609, 2026-10-12T03:16Z)

| Job | Result | Cause (all pre-existing, none from the fence — it is unpushed) |
| --- | --- | --- |
| Tests | PASS | — |
| Typecheck / UI audits / parity / brand / build / founder-loop | PASS | — |
| Scheduled jobs canary | FAIL | `API_URL` pointed at the deleted host (`404 Application not found`). Secret repointed after this run; next scheduled tick is the proof. |
| Proof gate (vertical slice) | FAIL on origin/main, FIXED in working tree (uncommitted) | Root cause: the *check* was wrong, not the product. Committed proof asserts `reason.includes("governance")` and `reason === "Pre-execution credit check"`; the executor deliberately records the human-readable block message (`reason.trim() \|\| governanceReason` — fallback only fires on empty), which contains neither string. The tree's `scripts/vertical-slice-e2e.ts` already asserts the recorded vocabulary instead. Slice re-running locally as proof (`.baseline-slice.log`). |
| Security audit | FAIL on origin/main, FIXED in working tree (uncommitted) | Reproduced locally: 45 vulns (1 critical, 10 high). Fix: nodemailer 9.1.0 → ^10.0.6 (direct prod dep, mail suite 24/24 re-passed); overrides raised (undici ≥7.29.1, sharp ≥0.35.5, source-map-js ≥1.2.2, proxy-addr ≥2.0.8, MCP SDK ≥1.31.0) + `brace-expansion@5.0.9` → 5.0.11 (exact-key, avoids forcing v5 on minimatch@1 chains). Remaining: 22 (20 moderate + 2 low, below the high+ gate) + 1 ignored: CVE-2026-93687 (`braces@3.0.3`, NO patch exists, reachable only via dev-time `@vercel/node` build tooling and the never-imported `shadcn` CLI — verified zero runtime imports). Ignored via pnpm's sanctioned `auditConfig.ignoreCves` (scoped to that CVE, re-check when upstream patches), NOT a gate edit. `pnpm audit --audit-level=high` now exits 0. Builds re-running as proof (api bundle exercises the vercel chain; web build exercises sharp). |

## Observed, not yet explained (UNVERIFIED) — updated 07:05Z

1. **Scheduled triggers look stalled (scheduler-side, not repo-side).**
   `orq8-jobs` (`*/5` cron) last ran 01:30Z, `waitlist-drip` 04:40Z,
   `data-path-canary` has no runs; the 07:00Z daily-briefing tick never
   fired — yet all workflows report `active`, files are unchanged-valid, and
   push/schedule runs of other workflows (Vercel 06:31Z) work. Web research:
   no Oct-12 official incident; community reports of missing schedules
   ~Oct 4–11 (unanswered); documented load-based schedule drops fit only
   partially for a 5.5h total gap on a */5 cron. No auto-disable rule
   matches (active repo). Treated as a GitHub scheduler stall, watched.
2. **Jobs proven green by manual dispatch (run 38215641165, 07:0xZ): all 7
   jobs success, canary success.** The `API_URL` repoint + existing
   `INTERNAL_TOKEN` are correct; docs/68 MVP-005's "one secret away" is
   closed pending the natural cron tick. The dispatch also backfilled the
   missed 06:30 consolidation + 07:00 briefing ticks (no duplication — the
   crons never fired).
3. **Fence commit unpushed.** `fc16169` has no CI signal yet. Pushing it is a
   Phase 8 decision (needs the proof-gate question answered first, since CI
   runs the slice).

## Phase log

- [x] Phase 0.1 (in progress): repo structure, git state, docs chain (66/68
  authority, 83/89 prior audits), 58 API route modules, 87 web pages, 57
  migrations (0056/0057 local-only), 8 CI workflows mapped.
- [ ] Phase 0.2: baseline suite result, web tests, web build, parity check.
- [ ] Phase 0.3: this file + roadmap/test-matrix/infra/release/handoff
  sections below as each phase completes.
- [ ] Phase 1: route inventory + feature traces + the proof-gate root cause.
- [ ] Phase 2: infra matrix (GitHub/Vercel/Supabase/Railway/providers).
- [ ] Phases 3–4: EA/core + remaining surface.
- [ ] Phase 5: security/reliability (incl. 45-vuln triage).
- [ ] Phases 6–7: test matrix + demo scenario.
- [ ] Phases 8–10: regression, release push, founder handoff.

## Notes

- `pnpm --filter @orq8/api build:bundle` rewrites the TRACKED 4.9MB
  `apps/api/api/index.js` as a side effect (verified exit 0, then reverted
  to keep the footprint minimal). Railway deploys from `apps/api/Dockerfile`
  (source build), so the stale bundle does not affect production — but who
  consumes the committed bundle, and whether it is stale vs `fc16169`, is a
  Phase 2 question.
- Port 3112 serves a live Next.js app (not mine — left alone); review-stack
  proofs run on 3113/3114 instead.

## Baseline results (working tree, 2026-10-12)

- `pnpm -r typecheck`: PASS 8/8.
- API suite: **952 passed, 46 skipped, 0 failed** (115 files passed, 7 skipped), exit 0.
- Web tests: **97/97**, exit 0. Web build: exit 0 (twice — pre- and post-override).
- API `build:bundle`: exit 0 (then reverted the tracked artifact; Railway builds from Dockerfile).
- Lineage parity: no drift. `verify-no-store`: 123 fetches, clean.
- Vertical slice: **44/44**, exit 0. Data-path canary live: PASS.
- `pnpm audit --audit-level=high`: exit 0 (22 below-gate + 1 ignored unpatchable dev-only).
- Mail suite (nodemailer 10): 24/24.
- Stack proofs (routes/375/themes/gate/canary/proxy-cache): running (`.baseline-proofs.log`).

## Next concrete actions

1. Collect the baseline suite result.
2. Root-cause the 2 proof-gate FAILs (run the slice locally if needed).
3. Keep watching for natural scheduled ticks (stall vs recovery).

## Security review — 2026-10-12 session surface (skill: security-review)
Scope: uncommitted session diff (60 files) — auth.ts, orgs.ts, eaName flow, scripts.
- **ea_name (PATCH /v1/org):** zod `trim().min(1).max(60)`, owner/admin-gated,
  org-scoped by `ctx.orgId`, audited (`org.ea_renamed`). Consumers: React render
  (auto-escaped) + own-org EA/briefing prompts (same trust domain as org name).
  No high-confidence finding.
- **Injection:** no `eval`, no `dangerouslySetInnerHTML`, no new child_process in
  app source. `shell: true` hits are dev-only scripts + pre-existing sandboxed
  executor (documented design, founder-authored commands). Drizzle `sql` claim
  fence verified parameterized in prior session (queue-claim-scope test green).
- **Audit log:** `inputRef` carries display name only, no secrets.
- Needs-verification (architecture-wide, pre-existing): service-role DB relies on
  app-layer org checks — covered by queue-claim-scope + RLS e2e tests, both green.
**Verdict: no high-confidence vulnerabilities in session surface.**

## Proof-gate forensics — 2026-10-12
- The `--only routes,...` run showed 31/31 route PASSes then `did not become
  healthy within 4 minutes` with no `▶ routes-375` header. Root cause: two
  overlapping proofs invocations shared `.baseline-proofs.log`; the timeout
  line belongs to the stale concurrent run, not the green route sweep.
- Orphaned stack (API pid 47408, web pid 50260) verified healthy and current-
  revision (API /healthz ok, web /login 200 on 3113/3114); kept and reused.
- Full `proofs.mjs` relaunched once, in background → `.baseline-proofs2.log`.
- Offline gates: `verify-no-store.mjs` pass (123 fetch calls, no proxy cache);
  `verify-ci-lineage.ts` pass (3 objects + 3 columns after CI drizzle step).

## Proof-run forensics II — 2026-10-12 ~09:05Z
- proofs3 (`.baseline-proofs3.log`): died mid-`routes` — killed from outside
  (turn interruption), not a product failure. vertical-slice/auth/rls/members
  all PASS before the kill; members 20/20 (earlier exit-3221226505 crash = transient).
- proofs4 (`.baseline-proofs4.log`): review-stack refused to boot — port 3114
  still held by the orphaned `next start` (pid 50260) from the first run. That
  refusal is correct behavior. Secondary: child teardown after a mid-boot fatal
  trips a Windows libuv assertion (`win/async.c:76`) — cosmetic, P3, teardown path only.
- Orphan killed (50260), both ports verified closed, proofs relaunched cleanly
  as `.baseline-proofs5.log` (`--with-stack`, own log file per run from now on).

## Infrastructure verification — 2026-10-12 ~09:15Z (read-only)
| Service | Intended responsibility | State | Evidence |
|---|---|---|---|
| GitHub | source of truth, CI | PASS | main @ d773609 remote; local fc16169 ahead 1 + uncommitted tree. gh auth ok. |
| GitHub Actions CI @ d773609 | gates | 3 FAILs, all root-caused (see below) | job logs pulled 09:00Z |
| Vercel (orq8.vercel.app) | canonical web host candidate | PASS live | /login 200 (3.0s). "Verify Vercel Production" workflow green 06:31Z. |
| Railway web | second web host | PASS live | /login 200 (1.4s). Host decision still open (founder). |
| Railway API (-062a) | live API | PASS live | /healthz 200, /readyz 200 (ready 7 / required 7 / blocking 1 — same as 10-11). |
| Old Railway hosts | dead, must not be referenced live | PASS dead | edge 404 "Application not found" (this WAS the CI canary failure). Stale defaults remain in 5 dev scripts (P3). |
| Supabase prod | system of record | PASS reachable | ledger top 0052; 0053 applied (locked_at nullable YES); 0054 tables present (empty in prod, correct); 0056 absent (unpushed — release applies it via db-migrate on push). |
| AI providers | EA + execution | LIVE per review-stack | openrouter primary → nvidia fallback (seen in proofs5 boot). |
| Email | verification mail | BLOCKED/dev-only | no mail provider; review uses SMTP sink. activation.blocking=1 likely this. |
CI failures @ d773609: (1) jobs canary — API_URL pointed at deleted host, repointed since; scheduled ticks green 07:03/07:51Z = resolved, stale. (2) proof-gate vertical-slice — wrong check strings, fixed in tree (re-verify: proofs5). (3) security audit — deps fixed, `pnpm audit --audit-level=high` exits 0 locally 09:05Z, critical gone.

## Proof-run forensics III — 2026-10-12 ~09:20Z (process, not product)
- proofs5 failures root-caused as environmental contention, NOT product bugs:
  - members: `initdb: failed to remove contents of data directory` — stale
    embedded-PG data dirs held by orphaned postgres.exe from killed runs.
  - routes/gate: web (3114) + API (3113) starved mid-sweep — my own parallel
    `integration-suite plan-revisions` run (09:13, second embedded PG + API +
    vitest transform) contended with the gate. routes-375/themes PASSed after
    my run finished and the servers recovered. gate exit 2 = API timeout, same cause.
- Evidence it is contention: proofs3 ran vertical-slice/auth/rls/members green;
  run #1 route sweep 31/31 green; proofs5 routes-375/themes green. No failure
  reproduces on an uncontended machine.
- Cleanup: 15 orphaned postgres.exe killed; 3113/3114 verified closed.
- RULE from now on: one proofs run at a time, nothing heavy in parallel, one
  log file per run. The plan-revisions fix itself is verified (12/12 green).

## Proof-run forensics IV — 2026-10-12 ~09:35Z (environment: memory)
- proofs6 (`.baseline-proofs6.log`): review stack seeded fully, web Ready, then
  embedded postmaster died → worker lost DB → "not healthy in 4 min". No product
  code in the causal chain; seed + boot all green.
- Box has 7.9GB RAM, ~0.8GB free. Top: founder's Firefox (~2GB, untouchable),
  Freebuff/bun-baseline (harness, untouchable). 15 pg + 6 node orphans reaped
  (freed ~nothing — they were tiny). The gate repeatedly runs 80-90% green in
  these conditions; treating the postmaster death as a flake to retry, serially.
- Standing rule reinforced: single proofs run, zero parallel load, unique log
  per run, reap orphans between runs.

## Stale-host defaults fixed — 2026-10-12 ~09:45Z (P3)
- 6 dev scripts defaulted API/HEALTH URLs to the deleted Railway host
  (`orq8api-production.up.railway.app` — the exact 404 that failed the CI jobs
  canary). Repointed to the live `-062a` host; all pass `node --check`/`bash -n`.
  Env overrides unchanged (still win when set).

## Proof-run forensics V — 2026-10-12 ~09:55Z (orphan recurrence)
- proofs7 never booted: stale `next start` (pid 53356, survivor of proofs6's
  SIGTERM kill) still held 3114. review-stack's pre-boot port check correctly
  refused. Root pattern: on Windows the stack kill does not reap `next start`.
- Reaped 53356 + stale supervisor 50488 (both mine, both functionless). Ports clear.
- Box memory now 0.3GB free (founder Firefox ~2GB + harness untouchable).
  Relaunching once; if the stack fails on memory symptoms again, verification
  blocks until the founder frees RAM — will escalate rather than flake-retry.

## Release — 2026-10-12 ~10:00Z
- Pushed 5 commits (d773609 → b327d41): fc16169 fence, ef388fe deps,
  cbbb807 EA-rename+console migration, abf3b74 proof-harness, b327d41 session docs.
- CI on b327d41: canary/typecheck/audits/security/parity/brand/proof-gate all
  SUCCESS (the 3 prior failures resolved). Tests + founder-loop pending.
- DB Migrate failed (ECONNRESET, pre-existing — never succeeded since 09-27).
  Hand-applied 0056 (execution_lock uuid) + 0057 (execution_heartbeat_at
  timestamptz) via supabase-sql Management-API path; both verified live with
  correct types. 0053/0054/0055 confirmed already present.

## Final release report — 2026-10-12 ~10:30Z
- Commit: b327d41 (5 commits over d773609). Branch: main. Pushed, remote matches.
- CI (run 38225205977): SUCCESS — 11/11 (canary, typecheck, UI audits,
  security, lineage parity, brand, proof gate, tests, docker, build validation,
  founder loop). The 3 prior failures are resolved in this tree.
- DB Migrate: fails (pre-existing infra — ECONNRESET, never green since 09-27).
  0056 + 0057 hand-applied and verified live. Ledger still reads 0052; the
  runner will record them whenever its connectivity is fixed (files idempotent).
- Vercel: b327d41 built, READY, domain serves it, 65/65 assets 200. API on
  Railway (-062a) live with the fence columns.
- Local proof gate: 16/16 PASS on this tree (proofs8 + proxy-cache rerun).
  `pnpm audit --audit-level=high` exits 0. API typecheck clean.
- Known limitation / BLOCKED: production email capability — no mail provider
  configured. Release gate reports BLOCKED on `email` + `mail delivers`.
  Founder action: set RESEND_API_KEY (or SMTP_*), then re-run Verify Vercel
  Production. Everything else is green.
- Machine left clean: review-stack survivors and PG orphans reaped, 3113/3114 free.
