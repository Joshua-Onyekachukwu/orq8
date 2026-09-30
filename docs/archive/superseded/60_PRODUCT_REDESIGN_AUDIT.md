# 60. Product redesign — implementation audit

Status: audit complete, no redesign code written yet. This document satisfies
the audit-before-changing requirement (§47) and proposes the target
architecture, migration map, and implementation order for the redesign program.

One line of context: the app already runs a full auth overhaul (uncommitted on
this tree) with a verified E2E harness; all 14 DB-backed suites and the 55-check
auth flow battery are green. That work is the foundation this program builds on.

---

## 1. Current architecture

- **Monorepo**: `apps/api` (Fastify, TS, ESM), `apps/web` (Next.js 15 App Router,
  RSC-first), `packages/{core,db,domain,auth}`.
- **Web never touches Postgres.** Route handlers under `apps/web/app/api/*`
  proxy to the API with `Authorization: Bearer <session>`; the API enforces
  everything (sessions, org scoping, email-confirmation gate in `requireAuth`,
  autonomy enforcement server-side in `task-executor`).
- **Deploy shape**: web on Vercel, API on Railway (Cloud Run kit now prepared:
  `docs/59_CLOUDRUN_DEPLOYMENT.md`). Redis for cache/rate limits with in-memory
  fallback. 85 test suites, 32 schema migrations.
- **Design system**: dark shell, `bg-orq8-dark` sidebar, `#B8FF66` lime accents,
  light content cards. The audit flags the lime + light-card language for
  replacement (see §9).

## 2. Current routes (web pages, authenticated app)

40 authenticated pages today, 11 sidebar groups of links, 4 collapsed groups.

Command: dashboard, company health, scheduled jobs, approvals ("Command Center"),
weekly report, performance, engineering, MCP & tools, simulation, squads, ROI.
Organization: AI employees, departments, teams, strategy, goals & tasks, org explorer, business import.
Systems: integrations.
Governance: notifications, company memory, strategic lineage, decision memory, decision council, knowledge graph, audit trail, budgets, usage & limits, files, constitution, quality & learning, learning, briefings.

Plus settings pages (profile, providers, connections, privacy, terms, cookies)
and 13 admin pages (platform-admin only).

## 3. Current features (verified against routes + services, not docs)

- **EA (Executive Agent)**: `executive-agent.ts` (2,000 lines) — intent
  analysis, context building (org structure + memory + goals + approvals),
  task creation from intent, approval gating, workflow trace + progress sink.
  Command pipeline `POST /v1/commands` → SSE progress stream → done.
  Persistent panel exists (`executive-agent-shell` in app layout) with page
  context registry (route/entity awareness) and Cmd+Shift+E toggle.
- **Company hub**: dashboard with company progress (% + maturity stage),
  department progress bars, needs-attention strip, stat cards, recent activity,
  health score, reliability, model performance, EA panel, activity feed, quick
  actions FAB, dev-only contrast diagnostic.
- **Org**: departments (972-line page, CRUD, mission/head/budget), teams,
  agents (roster + detail with pause/resume/authority), org explorer tree,
  squads, business import (analyze/propose/approve/reject).
- **Work**: goals (with detail pages), tasks (detail pages), approvals
  (Command Center), briefings (daily/weekly/monthly from real data), weekly
  report, performance, ROI, budgets, usage.
- **Engineering**: repositories, branches, files, PRs (request-approval flow),
  sandbox runs, engineering tasks, MCP servers/tools, capability registry.
- **Governance**: audit trail, company memory, decision memory, council
  (deliberation), knowledge graph (entities + relations), lineage
  (strategy→objectives→key results→initiatives→tasks), constitution, quality
  & learning, files, notifications.
- **Credits**: balance/transactions/top-up/usage with subscription-backed
  balances, low-credit alerts, per-org isolation, web copy says "Credits".

## 4. Data model (82 tables, 32 migrations)

Core: users, organizations, memberships, sessions, audit_events,
credit_balances, credit_transactions, subscriptions.
Org: departments, teams, agents, goals, tasks, approvals, activity_events.
Workstream stack already exists: strategies → objectives → key_results →
initiatives → tasks (lineage from any task to strategy).
Memory/graph: company_memory (pgvector-ready), knowledge_entities,
knowledge_relations, company_decisions, decisions.
Platform: integrations + credentials + capabilities + agent_integration_access,
repositories/branches/files/prs, sandbox_runs, engineering_tasks, mcp_servers,
simulations, webhook_events, briefings, business_imports, onboarding_states.

Note: `tasks.status` is `pending | in_progress | completed | free-form text`
with a `blocked` value used by code but not pinned by a CHECK constraint; the
BACKLOG/TO DO/DOING/REVIEW/DONE mapping is a UI concern over real statuses.

## 5. Agent architecture (current)

- **Model layer**: `model-router.ts` (1,810 lines) — capability registry,
  provider adapters (NVIDIA NIM, OpenRouter, LiteLLM, Ollama chain), key
  pools with rate-limit/cooldown handling, health tracking, calibration
  routing, fallback. `llm-tracer` records per-call usage/cost/latency/outcome.
  This is already the §21 architecture (runtime → routing → gateway →
  provider → evaluation loop).
- **Autonomy**: 5 levels (observe → recommend → draft → execute_with_approval →
  autonomous) × action classes (task_execute, connector_read,
  external_communicate, modify_resources, connector_action, draft_external).
  Enforcement is pure + server-side (`enforceAutonomy`), wired into
  task-executor pre-execution blocks (persisted to the task row, honest
  reasons, zero cost).
- **Approvals**: table + routes + Command Center UI. Approvals are created by
  the EA (`createApprovalIfNeeded`) and by autonomy gates.
- **Continuity**: orphaned-execution reaper at boot + every 10 min; failure
  analyzer; circuit breaker; provider health.
- **Memory → execution**: `agent-context.ts` builds context from
  company_memory; learning system captures lessons from task outcomes;
  retrieval feeds new executions.

## 6. Current realtime architecture

- API: `registerRealtimeEndpoint` (SSE, org-scoped), `broadcastToOrg` emitted
  from task/execution/approval/decision paths.
- Web: same-origin SSE proxy `/api/events` → API `/v1/events` (cookie auth
  forwarded as bearer), shared connection via `realtime-client.ts`, poll
  fallback every 60s. Used by DepartmentActivityWidget and notifications.
- Gap: only 2 consumers. The company hub does not subscribe to live task/
  approval/agent-status events; it re-renders per navigation.

##  hook1. Current integrations

- Provider-agnostic integration service: `integrationProviders`,
  `integrationCredentials` (encrypted), `integrationCapabilities`,
  `agentIntegrationAccess` (per-agent grants — authority for external systems
  already modeled).
- GitHub, Linear, Gmail connectors with OAuth authorize/callback/disconnect,
  health checks, connector actions. Webhooks receiver with HMAC verification.
- Business import: analyze → propose → approve → reject pipeline.
- OAuth sign-in (founder identity) is separate (GitHub/Google, HMAC state).
- Gap: integrations are administered in one place (`/app/integrations`,
  `/settings/connections`); they do not surface inside department workspaces.

## 8. Current permission system

- Platform role (users.platformRole admin/user) gates `/v1/admin/*` + `/admin`.
- Org roles (owner/admin/member) gate org admin actions.
- Agent authority: `agents.autonomyLevel` + `agents.authority` JSONB
  (canExecuteTasks, canCommunicate, canModifyResources) +
  `agentIntegrationAccess` per external system.
- Enforcement: `enforceAutonomy` (pure) called in task-executor, tool registry,
  connector actions; approvals created when a gate says approval required.
- Gaps: no financial thresholds (approvals.cost exists but no rule engine), no
  risk-level policy per action class, no department-scoped autonomy override
  (levels are per-agent only), constitution table exists but is advisory.

## 9. Current problems

1. **IA sprawl**: 40 peer pages in 4 collapsible groups; "Command" group mixes
   daily (approvals) with deep tooling (MCP, simulation); no Workstreams entry;
   no dedicated decisions surface distinct from memory; memory/learning/quality/
   lineage/knowledge overlap in naming.
2. **Dashboard is a card wall** (9+ stacked widget blocks) rather than a
   75/25 company hub with persistent EA; the EA panel is bottom-left, not
   spatially persistent; command bar is a separate block.
3. **EA conversation is single-request** (`loading` disables send until the
   stream completes) — violates §8 (founder must be able to send multiple
   messages while work happens).
4. **Workstreams exist in the data model** (strategy stack + goals) but have no
   first-class surface; the dashboard shows goals only as progress bars.
5. **Departments are near-identical CRUD pages** (RULE 8 violation risk);
   engineering is the only specialized workspace; department pages don't embed
   their integrations/tools/files.
6. **Attention is derived ad hoc in page code** (dashboard attentionItems) —
   it should be a real system (one API, all sources: approvals, permission
   requests, blocked critical work, failures, credit alerts, deadline risk).
7. **Design-language drift**: lime accent (`#B8FF66`) in sidebar/plan/status,
   light content cards on a dark shell, gradient progress bars, animate-pulse
   decoration, mixed font weights/sizes (text-3xs overline culture), demo badge
   styling.
8. **Realtime underused**; several pages poll or are static per navigation.
9. **Naming drift**: tokens/credits both appear in some admin surfaces; ROI
   page vs performance vs report overlap.

## 10. Proposed architecture (target)

- **IA (54)**: COMPANY (Overview, Workstreams, Activity) / WORK (All work,
  My attention, Tasks, Reviews) / DEPARTMENTS (real list) / DECISIONS (Center,
  Pending, History) / REPORTS (Company, Departments, Performance, Costs) /
  secondary (Memory, Files, Approvals, Budgets, Audit, Integrations,
  Notifications, Governance, Settings). Departments generated from real org
  data; collapsed sidebar mode; no functionality removed — Command group
  members move into workspaces (Engineering keeps MCP, simulation moves to
  Reports? no: simulation is an operator tool → Governance; squads move into
  Departments as sub-units; ROI merges into Reports/Performance).
- **Company page (§4)**: 75/25 split. Main area: attention strip (top),
  workstreams row, org hub (departments → agents → current work) with live
  statuses, recent activity rail. Side area (persistent): EA conversation.
- **Founder's Attention (§10)**: new API `GET /v1/attention` aggregating:
  pending approvals, permission requests, blocked critical tasks, failures
  needing review, credit alerts, deadline-risk work, conflicting council
  recommendations. Item shape: what/why/who/authority/impact/next + actions
  (approve/reject/ask EA/view/delegate). Used by company page, top bar badge,
  and `/app/attention` page.
- **EA conversation (§8)**: queue-based. Founder messages post immediately,
  render in order, and the EA answers as each completes; input never disables
  while work runs; progress events attach to the message that caused them.
  Context-aware EA entry on every page (existing page-context registry
  extended with suggested prompts per route/entity).
- **Workstreams (§11)**: first-class pages over the strategy stack (initiative
  level = workstream: objective, owner, departments involved, tasks, blockers,
  deadline, health, activity, outcomes). Compact when empty (RULE 13).
- **Departments (§12-14)**: department workspace architecture: shared frame
  (mission, head, agents, active work, goals, approvals, budget, activity,
  memory, tools) + per-department capability modules that only render what
  exists (engineering: repos/PRs/sandboxes; marketing: campaigns planned;
  finance: budgets/usage; sales: pipeline planned). Honest "planned" states
  per honesty rules.
 marked- **Tasks (§15)**: keep real statuses; add kanban-style board UI
  (Backlog/To do/Doing/Review/Done + Blocked column) over
  `pending | in_progress | review | completed` + blocked flag; dependency links
  surfaced from existing dependency support; task detail already rich.
- **Authority UI (§17)**: agent detail gets an authority panel rendering
  CAN / REQUIRES APPROVAL / CANNOT from autonomyLevel + authority + grants;
  company-level autonomy configuration (§19) in governance.
- **Decision Command Center (§20)**: evolve council page into the structured
  15-step process view (define → context → evidence → independent analyses →
  assumptions → challenge → risks → alternatives → synthesis → governance →
  approval → execution → outcome → memory). Multi-model assignment per
  analytical role via the model router (models are already role-capable).
- **Credits (§36)**: already credit-native end to end (balances, transactions,
  alerts, per-org isolation). Keep; rename any residual "tokens" strings;
  per-department/agent/workstream credit rollups in Reports/Costs.
- **Org graph (§23)**: knowledge_entities + knowledge_relations already cover
  customer/product/project/goal/department/agent/decision/integration; extend
  type enum with workstream/tool/file/outcome and add the missing relation
  verbs; power context-building and UI links from it (not a new DB).
- **Memory (§22)**: company_memory already feeds agent-context; surface
  memory provenance in the EA answers (which memories were used) to make
  memory visibly influence execution; decisions auto-summarized into memory.
- **Realtime (§48)**: extend broadcast events (task status, agent status,
  approval created/resolved, workstream progress) and subscribe the company
  hub, attention strip, and task board via the existing SSE proxy + hooks.
- **Design language (§31)**: replace lime with dark-green-dominant + orange
  accent; dark content surfaces (no white cards on dark shell); fine borders
  `border-white/[0.06]`; 4/8/12/16/24/32 spacing; two font weights; sentence
  case; status colors only for status; kill decorative pulse/gradient motion;
  no fabricated activity (existing demo-org data is explicitly badged, keep).

## 11. Feature migration map

| Current | Becomes |
|---|---|
| `/app` dashboard (9 widgets) | Company Overview (75/25 hub + persistent EA) |
| `/app/approvals` (Command Center) | Work → My attention (approvals flow here) + Work → Reviews |
| `/app/goals` | Work → Tasks (board) + Company → Workstreams (initiative-backed) |
| `/app/strategy` + `/app/lineage` | Company → Workstreams (strategy context folded in) |
| `/app/decisions` + `/app/council` | Decisions → Center / Pending / History |
| `/app/performance`, `/app/roi`, `/app/report` | Reports (Company, Departments, Performance, Costs) |
| `/app/budgets` + `/app/usage` | Reports → Costs + secondary Budgets |
| `/app/engineering`, `/app/mcp` | Departments → Engineering (MCP/tools inside) |
| `/app/squads` | Departments (sub-unit view) |
| `/app/simulation` | Governance (operator tool) |
| `/app/quality`, `/app/learning` | Governance + Reports/Performance (merged where overlapping) |
| `/app/knowledge` | Memory (org graph view inside Memory) |
| `/app/memory` + `/app/lineage` | Memory + Company → Activity (lineage feeds workstream pages) |
| `/app/org`, `/app/teams` | Departments (org explorer inside) |
| `/app/business-import` | Settings → Existing company import (onboarding flow) |
| `/app/health`, `/app/jobs`, `/app/briefings` | Reports/Company + secondary Notifications/Briefings |
| `/app/integrations` | Secondary Integrations + embedded per-department modules |
| `/app/constitution`, `/app/audit` | Governance |
| `/app/members`, `/app/profile`, settings/* | Settings |
| `/admin/*` (13 pages) | unchanged (platform admin, outside this IA) |

Every current route is accounted for; nothing is deleted, some pages redirect
or are re-homed. Old URLs get redirects to avoid breaking bookmarks.

## 12. Database changes required

Minimal (the schema already anticipates this design):
1. `workstreams` may reuse `initiatives`; optionally add
   `health` + `departments jsonb` columns (or derive from tasks; prefer
   derive-first, add columns only if queries demand).
2. Tasks: pin `review` in the status flow (no CHECK change needed — text).
3. Attention: no table; aggregate query over approvals/tasks/activity/
   creditAlerts/decisions (+ optional materialized view later for scale).
4. Knowledge graph: extend `type` enum values + relation verbs (text columns;
   no migration needed unless CHECKs exist).
5. Credits per dimension: existing credit_transactions carry org-level rows;
   add `departmentId`/`agentId`/`goalId` attribution columns if missing for
   per-dimension rollups (verify `creditTransactions` shape before writing).

## 12b. API changes required

1. `GET /v1/attention` (+ ack/read semantics), `GET /v1/workstreams`,
   `GET /v1/workstreams/:id` (initiative-backed with derived health),
   `GET /v1/departments/:id/workspace` (one call assembling the workspace),
   `GET /v1/reports/:kind` (company/departments/performance/costs from real
   data), EA queue endpoints: `POST /v1/ea/messages` (enqueue + stream per
   message), `GET /v1/ea/messages?since=` (poll/SSE per message progress).
2. Extend `/v1/events` broadcast events (task/approval/agent/workstream).
3. Keep every existing endpoint during migration; old ones are re-homed, not
   removed, in phase order.

## 13. UI changes required

1. New app shell: sidebar with nested nav + collapsed mode, top bar with
   attention badge + credits, persistent EA column on company page + floating
   launcher elsewhere (shell already has the wiring to extend).
2. Company Overview page (75/25), Attention page, Workstreams pages, Task
   board, Department workspace frame + Engineering upgrades, Decision Center
   evolution, Reports set, Memory/graph view, Governance group.
3. Design-system pass: dark surfaces, palette swap (lime → orange accent),
   spacing/typography normalization, honest empty states with next actions.

## 14. Risks

1. Big-bang shell rewrite risks breaking 40 working pages — mitigate with
   phase order (nav first, then company page; old pages keep working under
   the new shell since the shell wraps routes, not route contents).
2. EA queue redesign touches the live command pipeline — keep `/v1/commands`
   intact; add the message queue above it; feature-flag the new panel.
3. Attention aggregation must not leak cross-org data — single org-scoped
   query family, covered by existing requireAuth org scoping; add tests.
4. Derived workstream health can be wrong — derive from real tasks/goals only,
   show "insufficient data" honestly when inputs are thin.
5. Design swap can regress contrast — the repo has a contrast self-check
   pattern; run it in the design phase; keep statuses AA on dark surfaces.
6. Uncommitted auth work on the tree: commit it first (it is verified) so the
   redesign diffs stay reviewable.

## 15. Recommended implementation order (phases 3-16 of the spec)

1. **Commit pending verified work** (auth overhaul) — clean baseline.
2. **Phase 3, navigation**: new sidebar IA + redirects; all existing pages
   reachable (no functionality moved out of reach at any point).
3. **Phase 5, attention API + page**: highest value-per-effort; real data
   only.
4. **Phase 4+7, company page + persistent EA queue**: 75/25 hub, live
   statuses via SSE, EA conversation that never blocks input.
5. **Phase 8, workstreams + task board**.
6. **Phase 9-10, department workspace architecture + agent authority UI**.
7. **Phase 11, decision center** (council evolution, multi-model roles).
8. **Phase 12-13, memory/audit/credits surfacing + Reports**.
9. **Phase 14-16, integrations embedding, responsive pass, QA battery**
   (extend scripts/auth-e2e.ts pattern into scripts/product-e2e.ts).

## 16. What must not break

- Auth/session/confirmation gates (just verified), credits isolation,
  autonomy enforcement + approval persistence, SSE auth proxy, admin gates,
  engineering repo/PR/sandbox flows, deliberation contract, audit writes,
  business import pipeline, existing API contracts used by web proxies.
