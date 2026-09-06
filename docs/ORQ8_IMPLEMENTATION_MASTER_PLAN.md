# ORQ8 — Implementation Master Plan

**Persistent source of truth for ORQ8 completion work.**
Statuses: `NOT_STARTED | IN_PROGRESS | BLOCKED | IMPLEMENTED | TESTING | VERIFIED | PRODUCTION_VERIFIED | DEFERRED`

This document is updated after every phase. It does not replace `ORQ8_CURRENT_STATE.md`
(detailed subsystem state) or `ORQ8_CHANGELOG.md` (per-session log) — it is the
resumable task ledger.

---

## 0. Architecture (final)

```text
FOUNDER
  ↓
COMPANY
  ↓
EXECUTIVE AGENT  (orchestration layer — not an ordinary employee)
  ↓
COMPANY BRAIN  (shared memory + knowledge graph + decision memory)
  ↓
ORGANIZATION  (departments → teams → AI employees)
  ↓
CAPABILITY REGISTRY  (build-vs-buy: what can this company already do?)
  ↓
TOOL REGISTRY  (permission-gated tools)
  ↓
MCP + CONNECTORS  (external systems, company-owned credentials, scoped access)
  ↓
EXECUTION → VERIFICATION → AUDIT → MEMORY → LEARNING → EXECUTIVE BRIEFING → FOUNDER
```

Core loop: OBSERVE → UNDERSTAND → DECIDE → PLAN → DELEGATE → EXECUTE → VERIFY →
LEARN → REMEMBER → ANTICIPATE → REPORT.

**Governing rules (from the master prompt, §144):**
- Never build UI for a nonexistent backend.
- Never ship a backend without a founder-facing door.
- Never claim proactive operation before scheduler verification.
- Never claim external execution without live evidence.
- Never claim security without tests.
- Never claim package enforcement without server-side tests.
- Never claim autonomy without server-side enforcement.
- Never claim memory without retrieval evidence.
- Never claim connector health without real health checks.

---

## 1. Current implementation state (audited 2026-09)

The following are **IMPLEMENTED + VERIFIED** (tests pass, UI connected, org-isolated):

| Subsystem | Status | Notes |
|---|---|---|
| Auth (Supabase JWT) + sessions | VERIFIED | JWKS verification, requireAuth plugin |
| Organizations / memberships | VERIFIED | RLS-scoped, org isolation |
| Departments / Teams / Agents | VERIFIED | CRUD, org-scoped, entitlement-enforced |
| Entitlement engine | VERIFIED | Central caps, 5 creation paths enforce server-side |
| Packages & Usage dashboard | VERIFIED | `/app/usage` used/limit bars, upgrade path |
| Goals + Goal Intelligence | VERIFIED | `/v1/goals/:id/drilldown` + `/intelligence`, recovery proposals |
| Tasks | VERIFIED | Full lifecycle, cost, audit |
| Company Builder | VERIFIED | analyze → plan → activate; Business Import (0013) |
| Playbooks | VERIFIED | 3 industry templates, idempotent seed, plan-aware since f52e7e7 |
| Simulation V2 | VERIFIED | live baseline, what-if, approval-gated apply, audit |
| Agent Reliability + Performance Reviews | VERIFIED | KEEP/IMPROVE/REPLACE, 7/30/90d history since f52e7e7 |
| Knowledge graph + decision memory | VERIFIED | knowledge_entities/relations, company_decisions |
| Approvals + audit trail | VERIFIED | server-side gates, full audit service |
| Capability registry (build-vs-buy) | VERIFIED | PR-merge auto-registration, capability-resolve |
| Engineering workspace | PARTIAL | sandboxed executor, repos/files/PRs real; Monaco code browser still missing |
| Connectors (GitHub/Gmail/Linear) | PARTIAL | architecture + outcomes + audit complete; live E2E BLOCKED on OAuth creds |
| MCP | PARTIAL | registry, tool validation, connector catalogs; live servers not configured |
| Event engine / rules | PARTIAL | events + rules + ingestion exist; Stripe/CRM/calendar ingestion BLOCKED on creds |
| Scheduler / cron / anomaly jobs | BLOCKED | workflows + INTERNAL_TOKEN endpoints exist; production cron not verified |
| Company Health | VERIFIED | deterministic composite score + reasons, `/v1/health`, `/app/health`, 25 tests |
| SSE Command Center | PARTIAL | realtime service exists; replay/sequence hardening deferred |
| Billing | PARTIAL | checkout/portal backend; no web proxy/UI yet |
| Credits / budgets | VERIFIED | credit transactions, balances, alerts |
| Portability (export/import) | PARTIAL | export exists; import/restore DEFERRED |
| Knowledge graph E2E | PARTIAL | tables + memory writes; query UI limited |
| Load tests / k6 | NOT_STARTED | DEFERRED |
| DR runbook | NOT_STARTED | DEFERRED |
| OAuth completeness | BLOCKED | GitHub OK; Google/Linear need creds |

---

## 2. Phases

### PHASE 0 — Discovery + state ✅ (VERIFIED)
Inventory complete. See `ORQ8_CURRENT_STATE.md` + this ledger.

### PHASE 1 — Foundation ✅ (VERIFIED)
Org/department/team/agent models, entitlement engine, permission architecture, lifecycle.

### PHASE 2 — Workforce ✅ (VERIFIED)
Hiring, staffing, reuse/build-vs-buy, workload, performance, workforce optimization.

### PHASE 3 — Executive orchestration ✅ (VERIFIED)
Executive Agent, delegation, squads, goal integration, engineering-manager loop.

### PHASE 4 — MCP + Tools + Connectors 🟡 (PARTIAL)
- Tool registry ✅, capability registry ✅
- MCP registry ✅; live MCP execution BLOCKED (no creds)
- Connector OAuth: GitHub ✅, Google/Gmail/Linear BLOCKED (creds)
- Connector lifecycle UI: `settings/connections` exists; health states partial

### PHASE 5 — Memory + Intelligence 🟡 (PARTIAL)
Company Brain ✅, memory ✅, knowledge graph ✅, decisions ✅, provenance ✅.
Retrieval analytics dashboard DEFERRED.

### PHASE 6 — Autonomy + Approval ✅ (VERIFIED)
Autonomy levels (observe→autonomous), risk classification, approval gates, Decision
Center (approvals page groups by org), budget controls.

### PHASE 7 — Department ecosystem 🟡 (PARTIAL)
Shared runtime + playbooks cover Executive/Product/Engineering/Growth/Marketing/
Customer Experience/Operations/BD/Delivery. Vertical-specific departments are
template-level (not separate runtimes) by design (§124).

### PHASE 8 — Event-driven operation 🟡 (PARTIAL)
Events + event rules + internal scan exist. Stripe/CRM/calendar ingestion BLOCKED
on credentials. Production scheduler verification BLOCKED (INTERNAL_TOKEN set as
repo secret 2026-09; Railway var not yet verified).

### PHASE 9 — Engineering software factory 🟡 (PARTIAL)
Sandboxed executor ✅, repos/branches/files/PRs/tasks ✅, PR review UI ✅.
Code browser/Monaco editor ❌ (DEFERRED — largest remaining engineering gap).

### PHASE 10 — Company intelligence ✅ (VERIFIED)
Goal intelligence ✅, anomaly detector ✅, executive briefings ✅, performance
reviews ✅, workforce recommendations ✅, **Company Health ✅ (this session)**.

### PHASE 11 — Founder UX ✅ (VERIFIED)
Onboarding + playbook selection, org explorer, departments/teams/agents pages,
integrations, approvals, simulation, squads, performance, usage. Health page
**this session**.

### PHASE 12 — Billing + entitlements 🟡 (PARTIAL)
Entitlements ✅ enforced server-side; usage UI ✅. Stripe checkout/portal web
integration DEFERRED.

### PHASE 13 — Production hardening 🟡 (PARTIAL)
- Migrations 0001–0013 applied ✅ (verified 61 tables in prod Supabase)
- RLS/IDOR ✅ (org-scoped everywhere; integration tests)
- Secrets: gitignored `secrets.env` vault ✅; Railway vars not fully set (token missing)
- Cron/scheduler: repo secrets set ✅; production execution not verified
- SSE replay/sequence: DEFERRED
- k6 load tests: NOT_STARTED (DEFERRED)
- DR runbook: NOT_STARTED (DEFERRED)
- gVisor/container isolation evaluation: DEFERRED
- CI failures (pre-existing): Security audit (pnpm audit 19 high + 1 critical),
  Tests (runner-specific; passes locally)

### PHASE 14 — Final system verification 🟡 (PARTIAL)
- Unit/integration: 413 API tests pass (this session baseline)
- Web typecheck + production build: pass
- Live external actions: BLOCKED (creds)
- Package tests: entitlements suite covers agent/department/team/connector/mcp
- Multi-tenant isolation: covered by org-scoped integration tests

---

## 3. Open tasks (resumable ledger)

| ID | Phase | Task | Status | Next action |
|---|---|---|---|---|
| T-01 | 10 | Company Health service (deterministic composite score + reasons) | VERIFIED | `services/company-health.ts` — 6 weighted factors, pure + live aggregate |
| T-02 | 10 | `GET /v1/health` route (org-scoped) + web proxy | VERIFIED | route registered in app.ts; `/api/health` proxy |
| T-03 | 11 | `/app/health` founder page (score, reasons, drilldown) + sidebar entry | VERIFIED | score ring, reasons, factor breakdown; sidebar Command group |
| T-04 | 10 | Unit tests for health score determinism + reason generation | VERIFIED | 25 tests: thresholds, spikes, determinism, weighting, ordering |
| T-05 | 4 | Google/Gmail/Linear OAuth live verification | BLOCKED | needs OAuth creds in Railway |
| T-06 | 8 | Production scheduler verification (cron evidence) | BLOCKED | needs Railway INTERNAL_TOKEN set |
| T-07 | 12 | Stripe checkout/portal web proxy + upgrade UI | NOT_STARTED | after billing keys |
| T-08 | 9 | Monaco code browser in Engineering workspace | NOT_STARTED | large; defer |
| T-09 | 13 | Fix pnpm audit high/critical chain | NOT_STARTED | overrides/bump fast-uri via Fastify |
| T-10 | 13 | CI Tests runner-only failure diagnosis | NOT_STARTED | needs action-log access |

---

## 4. Verification gate (before any "complete" claim)

1. API typecheck (`cd apps/api && npx tsc --noEmit`)
2. Web typecheck + `pnpm build`
3. `pnpm -r test` (413+ passing)
4. Org isolation test (cross-tenant must 403/404)
5. Server-side enforcement test (limit exceeded must reject)
6. Deploy READY on Vercel + live route 200

---

## 5. Environment requirements

- Supabase prod: project `gttkaxbcdtpsusmconxm`, migrations 0001–0013 applied
- Vercel: project `orq8` (`prj_apiN6ei5QfGK4Dev4toYXLrjDmVl`), rootDirectory
  `apps/web`, outputDirectory `.next`, build `npx next build` (fixed 2026-09)
- Railway: `orq8api-production.up.railway.app` healthy; vars partially verified
- GitHub secrets: `VERCEL_TOKEN`, `VERCEL_WEB_PROJECT_ID`, `API_URL`,
  `INTERNAL_TOKEN` set
- Local key vault: `secrets.env` (gitignored) — GitHub/Vercel/Supabase/LLM keys
- MISSING: Railway API token, Supabase pooled DB password, OAuth client secrets