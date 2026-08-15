# 49 — Implementation Plan

**Product:** ORQ8 — AI Organization Operating System
**Status:** Phase 0 · full documentation set · **Revised:** post-review (ADR-014/017/018)

## 49.1 Principles

- Architected for the full system from the beginning; implemented incrementally.
- Every phase has a **Definition of Done (DoD)** and ends in a runnable state.
- FOSS-first: every phase runs free (local Ollama models, self-hosted Postgres/MinIO, pg-boss). Funded upgrades are config swaps, not rewrites.
- **Two architecture gates** validate the system: **Golden Workflow v1** at Phase 6, and the **full Golden Workflow** after Phases 12–15 (ADR-014; scope in §49.5 and 04 §4.6).
- Requirement scoping: `[M1]` = Golden Workflow v1 (02 §2.17). Never start a phase whose dependencies aren't done (§49.3 graph).

## 49.2 Gates & Milestones

| Gate | When | Exit criteria |
|------|------|---------------|
| **G0 — Docs approved** | Now | Full doc set internally consistent; ADRs recorded; this plan approved |
| **G1 — Foundation healthy** | End Phase 1 | Two tenants isolated end-to-end; audit chain verified; free stack boots |
| **G2 — Golden Workflow v1** | End Phase 6 | §49.5 v1 e2e passes with deterministic stubs and Ollama — the **architecture validation gate** |
| **G3 — Full Golden Workflow** | After Phases 12–15 | All 25 steps (§04.2) execute reliably (04 §4.4 acceptance criteria) |
| **G4 — GA-ready** | End Phase 16 | Load-tested; tenant isolation validated; DR runbook exercised; security suite green |

Gates are hard: a phase's DoD failing blocks the next phase. G2 is the most important — it proves the org loop before breadth (integrations, voice, reporting depth) is added.

## 49.3 Development Dependency Graph (corrected)

```
Phase 0 (docs) ──► Phase 1 (foundation) ──► Phase 2 (org core) ──► Phase 3 (executive intel)
                                                                        │
Phase 4 (goals/work) ─────────────────► Phase 6 (multi-agent) ◄─────────┘
        │                                        │
Phase 5 (governance) ◄───────────────────────────┘
        │
        ├──► Phase 7 (model gateway) ────────────┐
        ├──► Phase 8 (tools/integrations) ──────►│
        ├──► Phase 9 (engineering ws) ──► Phase 11 (build-vs-buy) ─► Phase 12 (perf/workforce)
        ├──► Phase 10 (business import) ─────────┤
        └──► Phase 13 (voice) ──────────────────►│
                                                 ▼
                                  Phase 14 (reporting) · Phase 15 (simulation)
                                                 │
                                          Phase 16 (scale & hardening)
```

**Parallel tracks after Phase 6:** Track A = gateway + integrations (7, 8); Track B = engineering + internal tools + performance (9, 11, 12); Track C = import (10); Track D = voice (13); Track E = reporting + simulation (14, 15). Tracks merge into 16.

**Key dependencies (edge list):**
- 1 → 2 → 3 (authz/tenant → org primitives → executive intelligence)
- 4 depends on 2,3 (goals/work need org + executive)
- 5 depends on 2,4 (governance needs org primitives + work objects to gate)
- 6 depends on 3,4,5 + workflow runtime (from 1) + **minimal simulation + v1 weekly report** (ADR-017/018)
- 7 pulls forward from 1 (LiteLLM client + Ollama wiring exist in Phase 1; 7 adds full routing/keys/cost surface)
- 8 depends on 5 (capability permissions) and 6; 9 depends on 8 (repo import) and 6
- 11 depends on 8,9 (registry + engineering request flow); 12 depends on 6,11
- 14, 15 extend the Phase 6 minimal versions (ADR-017/018); no new dependency on 7–13
- 16 depends on everything (hardening)

## 49.4 Phase-by-Phase Plan (scope · DoD · unlocks)

### Phase 0 — Documentation & Architecture ✅ complete
Full documentation set: 59 markdown docs (56 numbered + 00 + 17a + 17c) + 17b seed JSON + 21 ADRs + pitch. **DoD:** docs internally consistent (G0); ADRs recorded (56); this plan approved. **Unlocks:** G0.

### Phase 1 — Foundation
**Deps:** G0.
**Scope:** Monorepo (pnpm workspaces) · Fastify API skeleton · Next.js web shell · Drizzle + Postgres/pgvector + migrations + seeds · auth (register/login/session, Argon2id) · organizations + memberships + tenant scoping · audit framework (hash chain) · base UI (shell + nav + settings) · provider configuration + encrypted secret management · pino + OTel · error envelope + idempotency middleware · pg-boss workflow runtime + outbox · SSE skeleton · **LiteLLM client + Ollama wiring (pulled forward from 7)**.
**DoD (G1):** two tenants sign up, log in, see isolated shells; audit records auth/org events; chain verification passes; `pnpm test` green; `docker compose up` boots the free stack. **Unlocks:** 2, 3.

### Phase 2 — Organization Core
**Deps:** 1.
**Scope:** Departments · positions · teams · agent profiles · agent templates (seed = 17d) · hiring lifecycle (proposed→approved→hired→onboarding→active) · `business_cases` · organization explorer UI · employment records · authority profiles v1.
**DoD:** CEO creates departments and hires template agents with business cases; org chart renders; hiring flow emits `hiring.*` events + audit. **Unlocks:** 3, 4.

### Phase 3 — Executive Intelligence
**Deps:** 1, 2.
**Scope:** Intent engine (classifier) · Executive Agent workflow (context → plan → recommend) · Company Memory (pgvector, permission-aware, configurable `EMBED_DIM`) · explain-why · ask-for-help · Executive screen chat mode.
**DoD:** `POST /v1/intelligence/execute` classifies vague input, gathers context, produces a recommendation with evidence/assumptions/confidence, and **queues approval structurally** (full Approval Engine in Phase 5) — running on local/free models. **Unlocks:** 4, 6.

### Phase 4 — Goals and Work
**Deps:** 2, 3.
**Scope:** Goals/objectives/**kpis table**/strategies · projects · tasks + dependencies · teams · WorkflowSpec builder v1 + durable runs · stop conditions · commitments · Work Center UI (kanban/list/timeline).
**DoD:** CEO defines a goal; Executive creates project + tasks; tasks trace to objectives via `objective_id`; KPIs feed snapshots; stop conditions trigger pause/escalate. **Unlocks:** 5, 6.

### Phase 5 — Governance
**Deps:** 2, 4.
**Scope:** Constitution editor + versioning (seed = 17a; loader spec = 17c) · policies · permissions (canonical namespace, ADR-019) · authority profiles enforcement · **Approval Engine + CEO Decision Center** · forbidden actions (hard denies) · emergency controls + kill switches · default operational limits (18.5) · audit trail UI.
**DoD:** a consequential action from any agent is blocked/queued per policy; CEO approves/rejects/modifies/delegates; emergency pause halts the org instantly (verified in tests); all audited. **Unlocks:** 6, 8.

### Phase 6 — Multi-Agent Collaboration 🏁 **Golden Workflow v1 gate (G2)**
**Deps:** 3, 4, 5 + workflow runtime (1) + **minimal cost/workload simulation + v1 weekly report** (ADR-017/018).
**Scope:** Delegation · councils (independent analysis, debate, synthesis, preserved disagreement) · temporary teams · parallel execution · escalation · need-human · durable golden-loop wiring · minimal simulation · v1 weekly report (PA drafts, Executive reviews).
**DoD (G2):** **Golden Workflow v1 e2e passes** (04 §4.6: steps 1–13, 17–18, 21, 24 + minimal cost tracking) with deterministic model stubs and with Ollama — the architecture validation gate. **Unlocks:** 7, 8, 9, 10, 13 (parallel tracks).

### Phase 7 — Model Gateway
**Deps:** 1 (client), 6.
**Scope:** Provider abstraction (LiteLLM) · user API keys UI (BYOK, encrypted, masked, rotatable) · model registry · routing + fallback · usage tracking · weekly/monthly cost views · cost-aware policies.
**DoD:** BYOK for OpenAI/Anthropic/Gemini/DeepSeek/Groq/OpenRouter + Ollama route through one gateway; costs attributable org→dept→project→agent; weekly/monthly cost views render.

### Phase 8 — Tools and Integrations
**Deps:** 5, 6.
**Scope:** Integration framework (OAuth) · tool registry · capability permissions (`tool:*`) · GitHub · email (draft vs send) · PM tools (Linear/Jira) · calendar · health/revocation.
**DoD:** agents read/write repos, send gated email, sync PM items — per-capability permissions, full audit. **Unlocks:** 9, 11, 10 (connectors).

### Phase 9 — Engineering Workspace
**Deps:** 6, 8.
**Scope:** Repository import · code browser · Monaco editor + diffs · agent activity · sandboxed terminal (Docker, 30) · git/PRs · tests · preview · review panel · approval gates.
**DoD:** a user watches an engineering agent edit, test, and propose a PR in the sandbox; approves changes; everything audited. **Unlocks:** 11.

### Phase 10 — Existing Business Import
**Deps:** 6, 8.
**Scope:** Website/repo/document analysis · business discovery · business map (`import_runs`) · baselines · recommended organization · import simulation · activation flow.
**DoD:** connecting a real website + repo produces a Business Map + proposed org; **nothing activates without CEO approval**.

### Phase 11 — Build vs Buy / Internal Tools
**Deps:** 8, 9.
**Scope:** Capability registry · internal tool registry (`internal_tools`) · build-vs-buy analysis (`capability_evaluations`) · vendor/procurement registry · internal marketplace · engineering request workflow.
**DoD:** "do we already have something that extracts PDF data?" returns ranked options with recommendation. **Unlocks:** 12.

### Phase 12 — Performance & Workforce Optimization
**Deps:** 6, 11.
**Scope:** Performance metrics · reviews · agent versions (`agent_eval_runs`) · diagnose→improve→evaluate→replace pipeline · replacement with knowledge transfer · workforce analytics.
**DoD:** an underperforming agent is flagged, diagnosed, improved (new version), evaluated, and replaced only if still failing — with approvals and knowledge transfer. **Unlocks:** G3 (with 13/14/15).

### Phase 13 — Voice
**Deps:** 6.
**Scope:** STT/TTS (local Whisper/Piper first) · conversational approval with spoken confirmation · interruption handling · voice safety limits (31.6).
**DoD:** "Approve the marketing campaign" requires spoken confirmation and uses the same authorization as chat.

### Phase 14 — Reporting
**Deps:** 6 (extends v1 report).
**Scope:** Full weekly/monthly reports (all sections) · PA/reporting agent · executive dashboard · goal/financial/workforce reporting · org health with evidence.
**DoD:** scheduled weekly report generated, reviewed by Executive Agent, delivered to CEO with all sections (§37/§38).

### Phase 15 — Simulation
**Deps:** 6 (extends minimal sim).
**Scope:** Organization/workforce/cost/workload/risk simulation · scenario comparison · import simulation (`simulation_runs`).
**DoD:** before activating a major org change, a simulation shows expected workforce, costs, risks, bottlenecks. **Unlocks:** G3 (with 12/13/14).

### Phase 16 — Scale & Hardening
**Deps:** all.
**Scope:** Distributed workers · stronger sandboxing (gVisor/Firecracker eval) · advanced queues (Temporal adapter if justified) · reliability/DR · rate limits · **Postgres RLS hardening** (ADR-006) · security testing · load testing (k6) · model failover · observability dashboards.
**DoD (G4):** load-tested at target scale; tenant isolation validated; DR runbook exercised (53); security suite green (44).

## 49.5 Golden Workflow v1 vs Full (reference — see 04 §4.6)

| Scope | Steps (§04.2) | Depends on | Gate |
|-------|---------------|------------|------|
| **v1** | 1–13, 17–18, 21, 24 | Phases 1–5 + minimal sim + v1 report | **G2 (Phase 6)** |
| **Full** | All 25 incl. 10 (full sim), 14–16 (build/buy + internal/external tools), 19–20 (perf/replacement), 22–23 (business unit/expansion), 25 (full reporting) | Phases 7–15 | G3 |

The **full** workflow remains the canonical validation scenario (04 §4.4–4.5); v1 is its Phase 6 precursor. Both are e2e suites in 44 §44.4 (deterministic + live modes).

## 49.6 Notes & Sequencing Decisions

- **Model gateway basics pulled forward:** Phase 1 includes the LiteLLM client + Ollama wiring (Phase 3 needs model calls); Phase 7 adds routing/keys/cost surface.
- **Memory foundation in Phase 3** (Executive needs it); full memory UX/imports grow through 8–10.
- **Approval engine in Phase 5**; workflow runtime + idempotency exist from Phase 1, so earlier phases queue approvals structurally (Phase 3 DoD reflects this).
- **Minimal simulation + v1 weekly report ship with Phase 6** (ADR-017/018) so G2 is self-contained; Phase 14/15 extend them.
- **Phases 7–15 parallelize after Phase 6** per §49.3 tracks; G3 waits for the slowest track (12/15), not for all breadth.
- Each phase keeps the free stack green (49.7); paid upgrades are config swaps (ADR-003/005).

## 49.7 Cost/Infrastructure Estimate (free-first)

| Item | Free path | Funded path (when ready) |
|------|-----------|--------------------------|
| Models | Ollama (local) + free tiers + BYOK cheap models | Frontier models via BYOK/platform keys |
| Compute (dev) | Local machine / free CI | — |
| Compute (prod baseline) | Single VPS ~$5–10/mo | fly.io/Railway/K8s |
| Database | Postgres on VPS (free) | Managed Postgres |
| Storage | MinIO (free) | R2/S3 |
| Workflows | pg-boss (free) | Temporal (same interface) |
| Observability | pino + OTel self-hosted | Langfuse Cloud/managed |
| CI | GitHub Actions free tier | — |

Dev model cost at startup: **$0/month** with local models; cents-to-low-dollars with BYOK used selectively (cost-aware routing, 22/24).

## 49.8 External Services / API Key Checklist (verify at implementation, §65)

| Provider | When needed | Auth | Free tier |
|----------|-------------|------|-----------|
| Ollama | Phase 1 (dev models) | none (local) | free |
| LiteLLM | Phase 1 (gateway) | self-hosted proxy key | free (OSS) |
| OpenAI / Anthropic | Phase 3+ (optional BYOK) | API key | trial credits |
| Google Gemini | Phase 3+ (optional BYOK) | API key (AI Studio) | free tier |
| DeepSeek / Groq / OpenRouter | Phase 3+ (optional BYOK) | API key | cheap/free/starter |
| GitHub | Phase 8 (integration) | OAuth | free |
| Email (Gmail/Outlook) | Phase 8 | OAuth | free |
| Linear/Jira | Phase 8 | OAuth | free tier |

Exact endpoints, scopes, and pricing are verified against current official docs at implementation time — nothing in this plan hard-codes them.

## 49.9 Definition of Done (every phase)

1. Feature code merged with unit + integration tests.
2. API contracts validated; error envelope + idempotency + audit present.
3. UI implements the feature with the shared shell; no orphan screens.
4. Authz/approval/emergency checks exercised by tests for the phase's actions.
5. Events published for the phase's domains; SSE updates the relevant screens.
6. Docs updated where behavior diverged (ADR recorded in docs/adr/ + 56).
7. `pnpm lint`, `pnpm typecheck`, `pnpm test` green; e2e (deterministic mode) green.
8. Runs on the free stack (no paid dependency required).

Cross-check with 50_DEVELOPMENT_CHECKLIST.md §50.2 at every phase end.

## 49.10 Risks & Mitigations (top 10)

| Risk | Mitigation |
|------|-----------|
| Model cost spiral | Budget ceilings, cost-aware routing, cheap-model defaults, weekly cost review (24) |
| Prompt injection exfiltrating data | Untrusted-content tagging, tool-level authz, sandbox, secret isolation (37) |
| Agent loops / runaway work | Operational limits (18.5), termination conditions, delegation depth caps (83) |
| Approval fatigue | Attention model, decision bundling, delegation with limits (87) |
| Duplicate side effects after retries | Idempotency keys, execute-once semantics, durable workflow state (72) |
| Tenant data leaks at scale | org_id everywhere, RLS hardening, isolation tests (44) |
| Provider outage | Router fallback, fallback order, provider-agnostic abstractions (22) |
| Scope creep | Gates G0–G4; Golden Workflow as yardstick; no integrations before Phase 8 |
| Third-party license issues | License review before adoption (47, ADR-010) |
| Single point of failure (one VPS) | Backups + DR runbook (53); managed services when funded |

## 49.11 Phase → Docs Map

| Phase | Governing docs |
|-------|----------------|
| 0 | whole set; ADRs (56, docs/adr/) |
| 1 | 06, 34, 35, 37, 42, 43, 51 |
| 2 | 09, 10, 12, 13, 33 |
| 3 | 08, 21, 22, 35 |
| 4 | 15, 16, 36 |
| 5 | 17, 17a, 18, 19, 20, 37 |
| 6 | 04, 07, 14, 15, 36, 41 (§minimal), 40 (§v1) |
| 7 | 22, 23, 24, 54 |
| 8 | 25, 48 |
| 9 | 29, 30 |
| 10 | 28 |
| 11 | 26, 27 |
| 12 | 11, 45 |
| 13 | 31 |
| 14 | 40, 38 |
| 15 | 41 |
| 16 | 37, 42, 43, 44, 53, 52 |

## 49.12 Indicative Timeline (solo full-stack build; ±50%)

| Phases | Weeks | Milestone |
|--------|-------|-----------|
| 1 | 2–3 | G1 |
| 2–3 | 4–6 | org core + executive |
| 4–5 | 4–6 | goals/work + governance |
| 6 | 3–4 | **G2 — Golden Workflow v1** (~3.5–4.5 mo total) |
| 7–9 | 7–10 | gateway + integrations + IDE |
| 10–12 | 5–8 | import + build-vs-buy + performance |
| 13–15 | 4–6 | voice + reporting + simulation |
| 16 | 3–4 | **G4 — GA-ready** (~7–9 mo total) |

G3 (full Golden Workflow) lands at the end of 12–15. Tracks after Phase 6 parallelize; dates are indicative, not commitments.

## 49.13 Immediate Next Steps

1. ~~Approve the documentation set~~ ✅ (G0 satisfied; set reviewed and revised).
2. ~~Generate remaining docs~~ ✅ (09–56 + 00 + 17a + 17b + 21 ADRs).
3. **Begin Phase 1 (Foundation)** implementation in this repo — monorepo, Drizzle schema, auth, Fastify shell, free local stack.
4. Track progress on GitHub (`origin/main`); record any divergence as new ADRs.
