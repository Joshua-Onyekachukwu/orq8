# docs/85 — ORQ8 Department Operating System: architecture plan

Status: ACTIVE PLAN (2026-10-07). Owner: platform.
Companion evidence: docs/78 (admin console audit), docs/83 §admin-intel
(privacy posture), docs/71 (plan revisions), docs/80 (credits).

## 0. What ORQ8 already is (recon summary — do not rebuild any of this)

Verified implemented and working:

| Capability | Where | Notes |
|---|---|---|
| Department/agent/task/goal/approval model | `packages/db/src/schema.ts` | departments(+teams), agents (autonomyLevel F12, authority profile, currentTask, creditsUsed), tasks (awaiting_approval, parentTaskId, estimatedCredits), approvals (callHash, gateExpiresAt, taskId/toolParams) |
| Department detail read-model | services/departments.ts `findDetail` + routes/departments.ts | members→scope, teams, NOW (live work), needsFounder, recentApprovals, activity, decisions, memory, files; tools resolved via `getToolsForRole` |
| Department workspace UI | components/work/department-workspace.tsx (1,059 lines) | header state machine, members, Now, Needs-you, 7 tabs (tools/resources/decisions/approvals/memory/authority/activity), authority rollup |
| Agent drawer | components/agents/agent-drawer.tsx | identity, tools w/ requiresApproval, authority rows, spending limit, activity, tasks |
| Hiring | /app/agents page + agent_templates (18 seeded roles) | hire modal with name/role/dept/team |
| Department activation | POST /v1/department-templates/:id/activate (org-recommendation.ts) | creates department + teams from template; **drops roles/functions/KPIs/typicalGoals (gap → §3.2)** |
| Tool registry | services/tool-registry.ts (1,382 lines) | 9 categories, risk levels, credit costs, permission checks, budget checks, approval gates (findOpenGate → release → resume), audit, decision tokens |
| Execution | task-executor.ts (1,196 lines) + agent_jobs queue (SKIP LOCKED, retries, dead-letter) | buildAgentContext (memory→prompt), delegation (parentTaskId), QA pass |
| Approvals | approvals + decision-token + gate expiry (7d, silence never approves) | approve = queue resume; reject = cancel with note |
| Multi-agent | squads, delegation-orchestrator, deliberation (Decision Council), council pages | proven by tests (xt evidence docs/83) |
| Outcome capture | activity_events (summary+reason+cost), decisions (expectedOutcome, predictionAccuracy, founderVerdict), connector_outcomes | |
| Monitoring | company-health scoring, briefings, attention items, quality, lineage, workforce-roi | |
| Templates | 23 department_templates (mission/functions/roles/teams/typicalGoals/kpis), 18 agent_templates, 23 team_templates | seeded on prod |

Live-org state (2026-10-07): 0 departments, 0 agents, 0 tasks. **Greenfield** —
the product IS the bootstrap flow: template → department → hire → assign →
execute → approve → outcome. Empty states must teach the next action.

## 1. Research matrix (what the best platforms actually do)

| Product | Agent creation | Tools | Knowledge | Multi-agent | Workflow | Approvals | Execution visibility | Department model | Take / leave |
|---|---|---|---|---|---|---|---|---|---|
| Relevance AI Workforce | Describe in plain English; agents = LLM+tools+knowledge; pin/folders/tags org | Connect tools to agents, tool→tool chains | RAG knowledge bases, escalation answers stored for reuse | Visual canvas; AI-handoff (agent judges) vs Next step (mandatory); agents reusable across workforces | Conditional routing; per-step monitoring "where it got stuck" | HITL approvals; escalate-to-human then remember | Task View central monitor; step-level trace | None (folders/tags only) | TAKE: handoff types, reusable agents, step-level stuck-detection. LEAVE: canvas-first (ORQ8 is departments-first) |
| Lindy | Trigger+instructions+tools; Agent Builder, Autopilot | 1000s of integrations per step | Company knowledge attached | Handoffs between Lindies | Trigger→steps chains | HITL inside flows | Execution logs per run | None | TAKE: trigger-first thinking (event_rules exist already). LEAVE: chat-first framing |
| n8n | AI Agent node + tools + memory | Any node as a tool | Retrieval nodes | Agents-as-tools (subagents) | Deterministic graph + agent loops | **Human-review per tool: pause, show tool+params, Approve/Deny, AI informed of denial** | Full run logs, per-node timing | None | TAKE: per-tool approval with exact params visible; denial informed to agent — ORQ8 already matches this (callHash) |
| Zapier Agents | Name+goal+data sources+starter prompts | 8-9k apps | Data sources | — | Zaps as triggers | HITL guardrails | Activity log | — | TAKE: data-source attachment model |
| Make | Scenarios + AI agents | App modules | — | — | Visual scenario graph | HITL steps | Scenario history | — | LEAVE: no department abstraction |
| Dify | Chat-build an agent; workflows | Tools + models | Knowledge pipelines | Agent nodes in workflow graphs | Workflow + chatflow | — | Trace per run | — | TAKE: knowledge pipeline as first-class |
| Copilot Studio | Topics + generative actions | Connectors + Power Fx | SharePoint/Dataverse | Multi-agent handoff (Enterprise) | Topic flows | Approvals via Power Automate; **escalate system topic; hand-off with full conversation context** | Activity, transcript | — | TAKE: handoff carries context; escalation is a first-class verb |
| CrewAI | role/goal/backstory + tools | Python tools | — | Hierarchical manager delegates; sequential; allow_delegation | Crew/Flow | human_input step | Task outputs per agent | Crew = team, not department | TAKE: role/goal/backstory triad; manager delegation. LEAVE: framework-level, no org model |
| AutoGen | Conversable agents | Tool calling | — | Group chat with manager speaker-selection; two-agent; nested | Conversation patterns | — | Message trace | — | TAKE: manager-as-router maps to department head |
| Anthropic (patterns) | workflows (code paths) vs agents (model-directed) | — | — | orchestrator-workers; evaluator-optimizer | prompt-chaining, routing, parallelization | — | — | — | TAKE: the philosophical spine — simplest thing that works; workflows for predictability, agents for judgment |
| Gumloop | Nodes + agents, IT-governed | Any model + integrations | — | Multi-agent canvases | Flow graph | Step approvals | Run traces | — | LEAVE: builder-first |

Convergent findings (the industry consensus ORQ8 should match or beat):

1. An agent = **identity + instructions + tools + knowledge + memory + trigger
   + approval policy**. ORQ8 has all seven (authority profile, tool registry,
   company_memory, event_rules) — but doesn't SHOW them as one coherent
   employee sheet. → §5 employee page.
2. Multi-agent = **handoffs with explicit semantics** (AI-judged vs mandatory),
   a **manager/router** role, and **agents reusable across flows**. ORQ8's
   delegation-orchestrator + department head covers this; the UI never shows
   handoffs as first-class objects. → work cards show `via` lineage.
3. Approvals must show **the exact call** (tool + params), support Approve /
   Deny with a note, and **tell the agent what happened**. ORQ8 already does
   all three (callHash, decisionNote, denial audited). Just surface it better.
4. Execution visibility = **step/event trace with where-it-stuck**, not fake
   thinking. ORQ8: activity_events + audit + job attempts. Show as a timeline.
5. **No competitor has real departments.** Folders, canvases, crews — none
   model an org. This is ORQ8's wedge: the department page is the product.

## 2. Product architecture (the canonical map)

```
Company (org)
 └── Department (from template or custom; head; budget; mission; settings{templateSlug,pageConfig})
      ├── Teams (optional sub-structure)
      ├── AI employees (agents.departmentId; head agent = department.head)
      │    ├── Identity (name, role, avatar, title)
      │    ├── Mission + responsibilities (from template role / agent config)
      │    ├── Authority (CAN DO / CAN SPEND / REQUIRES APPROVAL / CANNOT DO; autonomyLevel)
      │    ├── Tools (role-resolved; risk + credit cost + approval flag)
      │    ├── Knowledge + memory (company_memory rows they read/write)
      │    ├── Current work (tasks.agentId, status pipeline)
      │      └── Track record (tasksCompleted/Failed, creditsUsed, activity)
      ├── Work (tasks via members; goal lineage via goals/initiatives)
      │    └── statuses: pending → in_progress → awaiting_approval → completed | failed | cancelled (+ paused via gate expiry)
      ├── Workflows (event_rules scoped to dept members; trigger → action → assignee → approval?)
      ├── Approvals (pending → decided; gates release exact calls)
      ├── Decisions (decisions rows incl. council sessions; founder verdicts)
      ├── Memory (company_memory, categories, importance)
      └── Metrics (budget vs creditsUsed, throughput, approval latency, health)
```

Rules that keep the map coherent:
- Every department-scoped query derives from **members** (departmentId) — the
  existing findDetail contract. No parallel scoping system.
- Work belongs to an employee; departments aggregate. A task never gets its
  own departmentId (avoids dual-source-of-truth).
- Authority is enforced server-side (autonomy column + authority jsonb +
  tool registry) — the UI renders it, never grants it.

## 3. Backend changes (small, surgical, real)

### 3.1 Migration 0050 — `departments.settings jsonb default {}`

Carries: `templateSlug` (lineage), `pageConfig` (per-department section
emphasis, defaults per slug), `kpis`, `typicalGoals`, `roles` (the template
blueprint). Additive, idempotent:
`alter table departments add column if not exists settings jsonb not null default '{}'::jsonb;`

### 3.2 Activation keeps the blueprint (`org-recommendation.activateDepartmentTemplate`)

On activate (create OR reuse): write
`settings = { templateSlug, kpis, typicalGoals, roles, pageConfig }` from the
template. The reuse path also upgrades — re-activating a template retrofits an
existing department with its blueprint instead of silently discarding it.
Audited as today.

### 3.3 `findDetail` enrichments (services/departments.ts)

- `queued` + `done` split from the current single `now` (now = in_progress +
  awaiting_approval; queued = pending; done = last 10 completed/failed w/ cost)
- `metrics`: creditsUsed30d (sum of task.cost in window), tasksDone30d,
  avgApprovalHours (decidedAt−createdAt over recent approvals), budgetBurnPct
  (budget vs members' creditsUsed)
- `workflows`: event_rules scoped to the department (assignee ∈ members) —
  id, provider, eventType, action, requiresApproval, enabled, assignee name
- `head`: resolved member row when department.head matches a member name (the
  CrewAI/AutoGen "manager" made explicit and clickable)

### 3.4 Endpoint shape unchanged

`GET /v1/departments/:id` stays the single read (response grows queued/done/
metrics/workflows/head). One read per page, server-rendered,
`revalidate: false` — governance posture unchanged.

### 3.5 Employee read-model

`GET /v1/agents/:id` already returns identity/authority/tools; extend with
`workflows` (rules assigning this agent) and `mission` (from the role's agent
template when present).

## 4. Status system (one vocabulary everywhere)

| State | Meaning | Task mapping | Agent mapping | Department mapping |
|---|---|---|---|---|
| WORKING | executing now | in_progress | currentTask set | any member in_progress |
| WAITING | stopped for a human decision | awaiting_approval | open gate on member | pending approvals > 0 (loudest) |
| QUEUED | accepted, will run | pending | active, idle | pending > 0 |
| BLOCKED | failed / exhausted retries | failed (or job dead) | active but nothing progressing after failure | last outcome failed, nothing newer running |
| PAUSED | intentionally stopped | owner cancel / gate-expiry pause | status paused | founder-set |
| DONE | finished successfully | completed | — (track record) | — |
| RETIRED | archived | — | archived (retiredAt) | archived |

Dot tones stay as built: working=animated, waiting=amber, blocked=red, quiet
otherwise. `departmentState()` priority becomes: Needs you > Blocked > Working
> Queued > Idle > Empty > Archived (a red department outranks a merely queued
one — the current code shows queued first).

## 5. Design-system primitives (components/os/)

Extract once, compose everywhere (department pages, employee page, executive
dashboard). No visual regression: primitives are introduced by the NEW
department page; existing pages migrate later, unchanged until then.

- `os/state-dot.tsx` — typed wrapper on the existing `.state-dot` CSS
- `os/stat.tsx` — metric block (extracted as-is)
- `os/work-card.tsx` — title, employee, status, priority, cost, due, approval
  flag, `via parent` lineage — links to /app/tasks/[id]
- `os/employee-card.tsx` — avatar, name, role, state, current task, track
  record, autonomy chip
- `os/approval-card.tsx` — action, exact-call block (tool+params when
  present), risk, cost, requester, approve/reject affordance
- `os/activity-stream.tsx` — type icon, summary, reason ("because"), cost, ago
- `os/decision-card.tsx` — title, what/why, confidence, verdict state
- `os/authority-panel.tsx` — CAN DO / CAN SPEND / NEEDS APPROVAL / CANNOT DO
  (shared logic with agent-drawer's AuthorityRow)
- `os/memory-list.tsx` — category chip + content + importance
- `os/tool-card.tsx` — name, category, risk, cost, approval-required chip
- `os/workflow-card.tsx` — trigger → action → assignee → approval chip
- `os/empty.tsx` — empty states that teach the next action ("No employees yet
  — hire from 18 role templates or ask your Executive Agent to staff this
  department"), never lorem-style

## 6. Information architecture

- `/app/departments` — existing list; per-row state dots; template catalog
  entry (P2)
- `/app/departments/[id]` — REBUILT page composing the os primitives:
  header (state, head, mission from blueprint, budget burn) → Now (work
  cards) → Needs you (approval cards) → Employees (employee cards) →
  Workflows → Metrics → tabbed: Queued / Done / Decisions / Memory / Tools /
  Resources / Activity
- `/app/agents/[id]` — NEW full employee page (identity, mission,
  responsibilities, authority panel, tools, memory, current work, history,
  performance, approvals involved, workflows). The drawer remains the quick
  glance; the page is the workspace; drawer links "Open full profile".
- `/app` executive dashboard — department strip (state per dept) linking in;
  company health stays as-is.

## 7. Department differentials (pageConfig, not clones)

pageConfig drives section ORDER + the department-specific metric set.
Defaults by template slug; unknown slugs get the canonical order.

| Dept | Primary metrics | Specialty section |
|---|---|---|
| executive_office | decisions this month, founder-attention queue, department states | Company priorities (ratified plan KPIs) + approvals across all depts |
| engineering | PRs/deployments (connector_outcomes provider=github), sandbox runs, failed tasks | Repositories & environments (engineering routes already exist) |
| marketing | content produced (activity type=drafted), campaigns, spend vs budget | Campaign board (goals + tasks) |
| sales | pipeline tasks, outreach activity, conversion | Lead queue (activity + tasks by priority) |
| finance | budget burn per dept, approval costs, spend forecast | Approval ledger (money-touching approvals) |
| customer_success | open escalations, response activity, health items | Escalation queue |
| product / operations / others | throughput, approvals, memory growth | generic order |

Server-resolved `pageConfig.sections` + `pageConfig.metrics`; UI renders what
the API returns, never guesses.

## 8. Agent architecture (execution & handoffs — existing runtime, better surfaces)

- Assignment: `task.agentId` set at creation (API, EA tool, or event rule
  create_task). Executor builds context (agent-context: workflow memory +
  agent memory + company profile) — unchanged.
- Handoffs: delegation-orchestrator creates child tasks (parentTaskId) —
  work cards render `via parent`; department page nests children one level
  under the parent card, no recursion.
- Approval wait: awaiting_approval + approval row (+ gateExpiresAt when set)
  → WAITING dot; approve resumes via the queue; UI reflects job state, not
  assumptions.
- Failure: failed task + job attempts/lastError on the work card detail;
  BLOCKED only while nothing newer is progressing.
- Escalation: REQUIRES APPROVAL is the escalation path; attention items +
  the department "Needs you" zone are the inbox; the founder's decisionNote
  flowing into decision memory is the Relevance-style "escalate, then
  remember" loop.

## 9. Security & governance (unchanged, restated)

- All department/agent reads org-scoped via requireAuth; the admin surface
  stays metadata-only per docs/83.
- Authority/autonomy enforced in tool-registry + task-executor (server); UI
  toggles go through PATCH /v1/agents/:id, which validates and audits.
- Approvals: exact-call binding (callHash), single-use release, 7-day expiry
  (silence never approves), denial audited and returned to the agent.
- New surfaces expose nothing outside the org scope.

## 10. Implementation phases

- **P1 (this session)**: migration 0050 + activation blueprint + findDetail
  enrichments (queued/done/metrics/workflows/head) + os primitives + rebuilt
  department page (works for ALL departments; differential via pageConfig) +
  employee page + pageConfig defaults for executive_office, engineering,
  marketing, sales.
- **P2**: template catalog page (activate from the department list),
  hire-from-template with role blueprints, workflow (event rule) editor
  embedded in the department page.
- **P3**: executive dashboard department strip, per-department health,
  workflow run history (job lineage per rule).

## 11. Validation plan

- API: `tsc --noEmit` (api + web); existing suites (abuse, login, credits,
  decision-token, gate-expiry) untouched and green.
- New checks: blueprint persisted on activate (incl. reuse path); queued/done
  split; metrics math; workflows scoping — against the embedded lineage DB.
- Web: tsc + build; pages render truthfully for the empty org (no fabricated
  data); state-machine consistency (needsFounder > blocked > working > queued).
- Live: activate executive_office + engineering on prod Oddly, verify settings
  persisted, hire one agent, assign a task, verify Now/Queued/metrics/
  workflows, approve through the gate, verify DONE + memory written.

## 12. P1 validation results (2026-10-07)

Run against the real Fastify app on an embedded prod-lineage DB
(`.tmp-dept-e2e.mjs`, deleted after the run; note: trial plan caps teams at
4, so the check uses one department):

- Blueprint: activate executive_office → `settings.templateSlug` + kpis=3 +
  roles=6 persisted; pageConfig resolved with 11 sections.
- Hire: executive_assistant created via org-recommendation → lands in the
  department member list.
- Work: `POST /v1/tasks` → pending; detail shows queued=1, now=0;
  metrics/workflows/head present; empty state truthful.
- Employee extras: `GET /v1/agents/:id` returns mission, responsibilities,
  tasks, activity, workflows, memory, pendingApprovals (base read never
  fails — extras are additive).
- Execute: `POST /v1/commands/tasks/:id/execute` → queued empties, task lands
  in done with result.
- Checks: `tsc --noEmit` exit 0 on apps/api and apps/web.
- Migration 0050 applied to prod and ledgered (canonical sha256; 0049
  re-ledgered with full checksum). DR drill still passing (~35 s RTO).
