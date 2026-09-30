# 63. Company Hub implementation audit

Pre-implementation audit for the dashboard redesign ("Company Hub", 75% hub plus
25% Executive Agent). Written from the running system: the review stack on this
machine (`localhost:3112` web, `localhost:3111` API, embedded Postgres with the
production lineage) plus the real response shapes of the live endpoints.

## 63.1 What currently exists

Route `/app` is a 1,001-line server component (`apps/web/app/app/page.tsx`) that
renders 17 blocks in one column: welcome banner, system status, Executive Agent
setup strip, company overview tiles, "needs your attention", active work, goals,
recent decisions, executive recommendations, daily brief, company progress,
company health, goal execution, workforce reliability, department activity,
model performance, and a command bar with an activity feed. Seven more dashboard
components live in `apps/web/components/dashboard/`.

Data it uses today: `GET /v1/dashboard`, `/v1/company-progress`,
`/v1/company-builder/state`, `/v1/goals`, `/v1/agents`, `/v1/approvals`,
`/v1/decisions`, `/v1/activity`. The Executive Agent is a separate surface: a
slide-in panel (`executive-agent-panel.tsx`) driven by `executive-agent-context`,
opened from a floating launcher, and a command bar that streams through
`lib/command-stream.ts`.

## 63.2 What can be reused

| Need | Reuse | Evidence |
| --- | --- | --- |
| Founder's attention with WHAT, WHY, WHO, AUTHORITY, IMPACT, NEXT plus actions | `GET /v1/attention` and `components/attention/attention-board.tsx` | Response shape already includes every field the spec requires, with real actions (`approve`, `reject`, `retry`, `pause`, `acknowledge`, `ask_ea`) and honest empty state (`quiet`) |
| Organization structure | `GET /v1/departments` (with `agentCount`), `GET /v1/agents` (with `departmentName`, `teamName`, `status`, `currentTask`, `autonomyLevel`, `capabilities`, `authority`, `lastActiveAt`, `creditsUsed`, `tasksCompleted/Failed`) | Queried live: 5 departments, 6 agents with every field the spec asks an employee node to show |
| Execution capacity | `GET /v1/dashboard` credits block (`remaining`, `used`, `utilizationPercent`, `isLow`, `isCritical`, `daysRemaining`) | Reuse; detail already lives under Governance → Usage & Credits |
| Work | `GET /v1/tasks` (with `goalId`, `initiativeId`, `agentId`, `status`, `priority`, `cost`, `result`, `dueDate`) | Queried live |
| Goals and workstreams | `GET /v1/goals`, `GET /v1/initiatives`, `GET /v1/company-progress` (per-department task, agent and output counts) | `initiatives` is the workstream entity: title, status, priority, progress, owner agent |
| Activity and outcomes | `GET /v1/activity` (`type`, `summary`, `reason`, `cost`, `department`, `occurredAt`) | Reuse; outcomes are completed/QA events with a result |
| Realtime | `GET /v1/events` SSE plus web hooks `use-realtime`, `use-realtime-notifications`, `use-attention` | Already streams `task.*`, `credits.consumed`, `attention.changed` |
| Executive Agent conversation | `executive-agent-context` (`openPanel`, `setPageContext`, `pendingPrompt`), `runCommandStream` | Reuse for the 25% panel so the hub and the panel share one EA and one thread |
| Company health | `/app/health` page plus its API | Link the hub summary to the full page rather than duplicating it |

## 63.3 What should be redesigned

The page itself: one column, 17 blocks, no hierarchy, and several sections that
answer the same founder question more than once (attention appears as its own
block, again inside company progress, and again as executive recommendations;
health appears as a tile row and as a full panel; activity appears twice).
The redesign replaces the column of blocks with the spec's hierarchy:
company header, founder's attention, goals and workstreams, the organizational
hub, active work, outcomes, health and capacity, with the Executive Agent
persistently in the right 25%.

## 63.4 What should move

Decisions and briefings belong to their own areas (Company → Reports,
Decisions) rather than the hub. Model performance belongs to Company → Reports →
Performance. Workforce reliability belongs to Company → Health. Company progress
and maturity belong to Company → Health. The daily brief belongs to Company →
Reports → Briefings. All of these stay reachable; none is deleted.

## 63.5 What should be removed from the hub but preserved elsewhere

| Block | Where it lives instead |
| --- | --- |
| Model performance | Company → Reports → Performance |
| Workforce reliability | Organization → AI Employees, Company → Health |
| Company progress and maturity stage | Company → Health |
| Goal execution panel | Company → Strategy → Goals |
| Daily brief | Company → Reports → Briefings |
| Recent decisions | Decisions → Decision Center |
| Executive recommendations as a separate block | fold into Founder's attention and the EA panel |
| Command bar as a separate block | the 25% EA panel becomes the single command surface |

## 63.6 What data already exists

Everything the spec asks the hub to display except the items in 63.7: agents
(name, role, department, status, current task, authority flags, tools,
capabilities, autonomy, spend, last active), departments (name, description,
head, budget, status, agent count), teams and squads, goals (title, status,
progress, priority, due date), initiatives as workstreams (title, status,
priority, progress, owner agent), tasks (status, priority, cost, result, link to
goal, initiative, agent and team), approvals (action, description, cost, risk,
status), activity events (type, summary, reason, cost, department, timestamp),
credits (balance, usage, period, alerts), audit trail, and decisions.

## 63.7 What data is missing

1. No `executions` table. Execution state is derived from `tasks.status`,
   `agents.currentTask` and activity events; "running for 4 minutes" is derivable
   from the latest event for that task, not from a stored execution row.
2. No `outcomes` entity. Outcomes are completed tasks with a `result` plus
   activity events; the distinction between activity and outcome is a rendering
   decision, not a stored type.
3. No `risks` entity. Risk comes from the attention sources (`deadline`,
   `blocked_work`, `failure`, `credits`).
4. No per-department spend field. `departments.budget` exists; spend must be
   summed from `activity_events.cost` by `department` or from task cost.
5. No company tagline or industry field. `organizations` holds name, slug, plan,
   status and a `settings` JSONB. A header subtitle must come from settings or
   onboarding data, or be omitted rather than invented.
6. No infrastructure health dimension. The health page computes what exists; the
   hub must not claim an infrastructure score it cannot source.
7. No first-class workstream table: `initiatives` is the closest, and tasks carry
   `initiativeId`. If the product wants workstreams as a first-class entity, that
   is a schema decision to take deliberately, not a hub change.

## 63.8 What is currently mocked

Nothing in the product path. The simulation feature is real and labels its
projections; the review stack's model responses come from a local gateway stub
while the pipeline, credits, audit and events around them are real rows. Two
fabrications were removed this cycle: the floating quick actions launcher and the
notifications bell's "seed sample notifications" button.

## 63.9 Backend changes required

None for the first implementation phases. The hub reads existing endpoints.
Backend work becomes necessary only for: department spend derived server-side
(a small aggregate), an execution view if "running for N minutes" should be
authoritative, and any new entity the founder wants as first class (risks,
workstreams, outcomes).

## 63.10 Frontend changes required

New route `/app/company/overview` (the hub), a 75/25 shell, a company header, a
compact founder's attention section, goals and workstreams, the organizational
hub (EA centre, departments, employees, states), active work, outcomes and
activity, health and capacity summary, and the persistent EA panel in the right
column wired to the existing EA context so the panel understands what the
founder is viewing. Then: realtime wiring, responsive behaviour, detail drawers,
and QA.

## 63.11 Realtime changes required

None structural. The hub subscribes to the existing SSE stream through the
existing hooks (`task.*`, `credits.consumed`, `attention.changed`, activity
events) and re-fetches on event, instead of adding polling.

## 63.12 Risks

1. Duplicate surfaces: until `/app` is replaced, the old dashboard and the hub
   coexist. Mitigated by a clearly temporary nav entry and by replacing `/app`
   once the founder approves the design.
2. The hub could imply authority ORQ8 does not have. Every node and card must
   show the founder's control: blocked states, approval requirements, cost.
3. Employee counts beyond a few dozen will not fit a graph. The spec's scaling
   rule (collapse employees behind departments) must be in the first version.
4. Scope: 14 phases in the spec. Implementing them in one change would be
   unreviewable; this audit and the first page are the review surface.
5. Data honesty: department budgets are frequently null and department spend is
   derived. Show "no budget set" rather than a fabricated number.
