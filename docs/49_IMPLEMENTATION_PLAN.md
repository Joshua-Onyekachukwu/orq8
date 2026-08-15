# 49 — Implementation Plan

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 49.1 Principles

- Architected for the full system from the beginning; implemented incrementally.
- Each phase has a **Definition of Done (DoD)** and ends in a runnable state.
- FOSS-first: every phase runs free (local Ollama models, self-hosted Postgres/MinIO, pg-boss). Funded upgrades are config swaps, not rewrites.
- The Golden Workflow (§04) is the acceptance test that gates Phase 6+.

## 49.2 Development Dependency Graph

```
Phase 0 (docs) ──► Phase 1 (foundation) ──► Phase 2 (org core) ──► Phase 3 (executive intel)
                                                                        │
Phase 4 (goals/work) ────────────────► Phase 6 (multi-agent) ◄──────────┘
        │                                       │
Phase 5 (governance) ◄──────────────────────────┘
        │
        ├──► Phase 7 (model gateway)
        ├──► Phase 8 (tools/integrations)
        ├──► Phase 9 (engineering workspace) ──► Phase 11 (build-vs-buy)
        ├──► Phase 10 (existing business import)
        ├──► Phase 12 (performance/workforce)
        ├──► Phase 13 (voice)
        ├──► Phase 14 (reporting)
        └──► Phase 15 (simulation)
                 └──► Phase 16 (scale & hardening)
```

Key dependencies: Governance (5) depends on org/work primitives (2,4). Executive intel (3) depends on foundation (1) + memory (part of 3). Multi-agent (6) depends on workflows (1's workflow runtime) + governance approvals (5) + model gateway basics (7 could be pulled earlier for agent calls — see 49.4 note).

## 49.3 Phase-by-Phase Plan (with DoD)

### Phase 0 — Documentation & Architecture ✅ (in progress)
Core set delivered; remaining docs (09–56) after review. **DoD:** docs internally consistent; ADRs recorded; this plan approved.

### Phase 1 — Foundation
Monorepo, pnpm workspaces, Fastify API skeleton, Next.js web shell, Drizzle + Postgres/pgvector + migrations + seeds, auth (register/login/session), organizations + memberships + tenant scoping, audit framework (hash chain), base UI (shell + nav + settings), provider configuration + secret management (encrypted keys), pino + OTel, error envelope, idempotency middleware, pg-boss workflow runtime + outbox, SSE skeleton.
**DoD:** two tenants can sign up, log in, and see isolated shells; audit trail records auth/org events; `pnpm test` green; `docker compose up` boots the whole stack free.

### Phase 2 — Organization Core
Departments, positions, teams, agent profiles, agent templates, hiring lifecycle (proposed→approved→hired→onboarding→active), organization explorer UI, employment records, authority profiles (v1).
**DoD:** CEO creates departments and hires template agents with business cases; org chart renders; hiring flow emits events + audit.

### Phase 3 — Executive Intelligence
Intent engine (classifier), Executive Agent workflow (context → plan → recommend), Company Memory (pgvector, permission-aware), explain-why, ask-for-help, chat mode in Executive screen.
**DoD:** `POST /v1/intelligence/execute` classifies vague input, gathers context, produces a recommendation with evidence/assumptions/confidence, and queues approval structurally (the full Approval Engine ships in Phase 5) — running on local/free models.

### Phase 4 — Goals and Work
Goals/objectives/KPIs/strategies, projects, tasks, dependencies, teams, workflows (workflow builder v1), stop conditions, Work Center UI (kanban/list/timeline).
**DoD:** CEO defines a goal; Executive creates project + tasks; tasks trace to objectives; stop conditions trigger pause/escalate.

### Phase 5 — Governance
Constitution editor + versioning, policies, permissions, authority levels, approval engine + CEO Decision Center, forbidden actions, emergency controls, audit trail UI.
**DoD:** a consequential action from any agent is blocked/queued per policy; CEO approves/rejects; emergency pause halts the org instantly; all audited.

### Phase 6 — Multi-Agent Collaboration
Delegation, councils (independent analysis, debate, synthesis), temporary teams, parallel execution, escalation, durable workflows wiring the golden loop.
**DoD:** **Golden Workflow v1 e2e passes** (04.6: steps 1–13, 17–18, 21, 24 + minimal cost tracking + v1 weekly report + minimal cost/workload simulation) with deterministic model stubs and with Ollama — the architecture validation gate.

### Phase 7 — Model Gateway
Provider abstraction (LiteLLM), user API keys UI, model registry, routing + fallback, usage tracking, weekly/monthly cost views, cost-aware policies.
**DoD:** BYOK for OpenAI/Anthropic/Gemini/DeepSeek/Groq/OpenRouter + Ollama all route through one gateway; costs attributable org→dept→project→agent; weekly/monthly reports render.

### Phase 8 — Tools and Integrations
Integration framework (OAuth), tool registry, capability permissions, GitHub, email, PM tools (Linear/Jira), calendar; initial high-value only.
**DoD:** agents can read/write repos, send gated email, and sync PM items with per-capability permissions and full audit.

### Phase 9 — Engineering Workspace
Repository import, code browser, Monaco editor + diffs, agent activity, sandboxed terminal, git/PRs, tests, preview, code review, approval gates.
**DoD:** a user watches an engineering agent edit, test, and propose a PR in the sandbox; approves changes; everything audited.

### Phase 10 — Existing Business Import
Website/repo/document analysis, business discovery, business map, baseline reports, recommended organization, import simulation, activation flow.
**DoD:** connecting a real website + repo produces a Business Map + proposed org; nothing activates without CEO approval.

### Phase 11 — Build vs Buy / Internal Tools
Capability registry, internal tool registry, build-vs-buy analysis, vendor registry, internal marketplace, engineering request workflow.
**DoD:** "do we already have something that extracts PDF data?" returns ranked options with recommendation.

### Phase 12 — Performance & Workforce Optimization
Performance metrics, reviews, agent versions, optimization, replacement recommendations, hiring business cases, workforce analytics.
**DoD:** an underperforming agent is flagged, diagnosed, improved (new version), evaluated, and replaced only if still failing — with approvals and knowledge transfer.

### Phase 13 — Voice
Voice input/output, conversational approval, interruption handling, voice safety confirmation.
**DoD:** "Approve the marketing campaign" requires spoken confirmation and uses the same authorization as chat.

### Phase 14 — Reporting
Weekly/monthly reports, PA/reporting agent, executive dashboard, goal/financial/workforce reporting, org health.
**DoD:** scheduled weekly report generated, reviewed by Executive Agent, delivered to CEO with all sections (§37/§38).

### Phase 15 — Simulation
Organization/workforce/cost/workload/risk simulation, scenario comparison.
**DoD:** before activating a major org change, a simulation shows expected workforce, costs, risks, bottlenecks.

### Phase 16 — Scale & Hardening
Distributed workers, stronger sandboxing (gVisor eval), advanced queues, reliability/DR, rate limits, RLS hardening, security testing, load testing, model failover, observability.
**DoD:** load-tested at target scale; tenant isolation validated; DR runbook exercised.

## 49.4 Notes & Sequencing Decisions

- **Model gateway basics are pulled earlier than Phase 7:** Phase 3 needs model calls. Phase 1 includes the LiteLLM client + Ollama wiring; Phase 7 adds the full routing/keys/cost surface.
- **Memory foundation lands in Phase 3** (needed by Executive); full memory UX/imports grow through Phases 8–10.
- **Approval engine arrives in Phase 5** but the workflow runtime + idempotency exist from Phase 1, so earlier phases can queue approvals structurally (Phase 3 DoD reflects this).
- **Minimal cost/workload simulation and a v1 weekly report ship with Phase 6** (ADR-017/018) so the Golden Workflow v1 gate is self-contained; the full simulation (Phase 15) and full reporting (Phase 14) replace them.
- Phases 8–12 can partially parallelize after Phase 6; the Golden Workflow remains the integration yardstick.

## 49.5 Cost/Infrastructure Estimate (free-first)

| Item | Free path | Funded path (when ready) |
|------|-----------|--------------------------|
| Models | Ollama (local) + free tiers + BYOK cheap models | Frontier models via BYOK/platform keys |
| Compute (dev) | Local machine / free CI | — |
| Compute (prod baseline) | Single VPS ~$5–10/mo | fly.io/Railway/K8s |
| Database | Postgres on VPS (free) | Managed Postgres |
| Storage | MinIO (free) | R2/S3 |
| Workflows | pg-boss (free) | Temporal |
| Observability | pino + OTel self-hosted | Langfuse Cloud/managed |
| CI | GitHub Actions free tier | — |

Estimated model cost at startup with local/free models: **$0/month** for development; cents-to-low-dollars with BYOK when using paid frontier models selectively (cost-aware routing keeps routine work cheap).

## 49.6 External Services / API Key Checklist (needed at implementation)

| Provider | When needed | Auth | Free tier |
|----------|-------------|------|-----------|
| Ollama | Phase 1 (dev models) | none (local) | free |
| LiteLLM | Phase 1 (gateway) | self-hosted proxy key | free (OSS) |
| OpenAI | Phase 3+ (optional BYOK) | API key | trial credits |
| Anthropic | Phase 3+ (optional BYOK) | API key | trial credits |
| Google Gemini | Phase 3+ (optional BYOK) | API key (AI Studio) | free tier |
| DeepSeek | Phase 3+ (optional BYOK) | API key | cheap |
| Groq | Phase 3+ (optional BYOK) | API key | free tier |
| OpenRouter | Phase 3+ (optional BYOK) | API key | starter credits |
| GitHub | Phase 8 (integration) | OAuth | free |
| Email (Gmail/Outlook) | Phase 8 | OAuth | free |
| Linear/Jira | Phase 8 | OAuth | free tier |

Each provider's exact endpoints, scopes, and pricing must be verified against current official docs at implementation time (§65) — nothing in this plan hard-codes endpoints or prices.

## 49.7 Definition of Done (every phase)

1. Feature code merged with unit + integration tests.
2. API contracts validated; error envelope + idempotency + audit present.
3. UI implements the feature with the shared shell; no orphan screens.
4. Authz/approval/emergency checks exercised by tests for the phase's actions.
5. Events published for the phase's domain; SSE updates the relevant screens.
6. Docs updated where behavior diverged from this set (ADR recorded).
7. `pnpm lint`, `pnpm typecheck`, `pnpm test` green; e2e suite (deterministic mode) green.
8. Runs on the free stack (no paid dependency required).

## 49.8 Risks & Mitigations (top 10)

| Risk | Mitigation |
|------|-----------|
| Model cost spiral | Budget ceilings, cost-aware routing, cheap-model defaults, weekly cost review |
| Prompt injection exfiltrating data | Untrusted-content tagging, tool-level authz, sandbox, secret isolation (§37) |
| Agent loops / runaway work | Iteration/spend/time limits, termination conditions, delegation depth caps (§83) |
| Approval fatigue | Attention model, decision bundling, delegation with limits (§87) |
| Duplicate side effects after retries | Idempotency keys, execute-once semantics, durable workflow state (§72) |
| Tenant data leaks at scale | org_id everywhere, RLS hardening, isolation tests (§37.4) |
| Provider outage | Router fallback, model policy fallback order, provider-agnostic abstractions |
| Scope creep (build everything at once) | Phased plan; Golden Workflow as gate; no integrations before Phase 8 |
| Third-party license issues | License review before any adoption (ADR-010, 46_ later) |
| Single point of failure (one VPS) | Backups + documented DR runbook (53_ later); managed services when funded |

## 49.9 Immediate Next Steps (after this review)

1. Approve this core documentation set (or request changes).
2. I generate the **remaining docs (09–56)** to complete the set.
3. Begin **Phase 1 (Foundation)** implementation in this repo.
4. You create the GitHub repository and share the remote; I push and we track progress there.
