# 71 — ORQ8 Product-Wide UI/UX and System Redesign Plan

Status: **PLAN — awaiting founder approval. No implementation has started.**
When approved, phases execute in order and status moves to `docs/68`.

Updated 2026-09-30. **Revision 2** — the founder supplied a detailed page-by-page
build brief (§V below). Where §A–U and the brief disagree, **the brief wins**;
this document records both and flags every change Revision 2 makes. Earlier
reference material: 8 Headquarters screenshots (dark mock built from them at
`marketing/headquarters-mock.html`), 1 agent-node popover screenshot.

---

## V. Revision 2 — the founder's build brief (authoritative where it differs)

The brief specifies a complete console: **dark-only design system**
(background `#0B0F14`, raised `#11161D`, hover `#161D26`, hairlines `#1E2732`;
**lime `#B6F09C`** for active nav / running states / positive deltas /
focus rings, **orange `#F59E4C`** for primary + approve CTAs (max one orange
button per view), danger `#F87171`, info `#7DD3FC`; Inter/Geist, tabular
numbers, 11px uppercase micro-labels; radius-10 hairline cards, no shadows;
status chips with pulsing lime running dots; skeleton loading; every list gets
a real empty state with one orange action).

**Shell (differs from §E — brief wins):** left **sidebar 240px** (collapse
to 64px) with grouped nav — Overview (Dashboard); Direction (Plan, Goals,
Constitution); Work (Tasks, Approvals, Audit Trail); People (Team,
Departments, Org Chart); Money (Budgets, Finance); Knowledge (Memory, Files,
Briefings); System (Integrations, Notifications, Settings) — lime active bar,
count badges (orange for approvals). Top bar 56px: breadcrumb, ⌘K palette,
bell, avatar. **Right dock 380px** (collapsible): the EA, one product with the
console, everything deep-linked. NOT the CTO.new-style top nav rows; the
approved HQ mock becomes the *Dashboard page* inside this shell, not the
shell itself.

**Pages the brief adds beyond the current app:** **Plan** (living document,
revision rail with diffs, unratified-revision banner + ratify button),
**Org Chart** (founder → EA → departments → employees, click = profile
drawer), **Briefings** (weekly/monthly reports with owner sign-off row),
**Authority editor** (May do / Spend cap / Needs approval / Forbidden — shared
by Team + Settings, diff-before-save, writes audit events), **Finance**
(balance, transactions, invoices from the payment provider),
**Org pause** ("Pause entire org" danger zone). Brief also specifies:
drag-reorder backlog with per-task live log panes, approvals page with
Open/Decided tabs + CSV/JSON export + the "silence is never consent" banner,
budget meters with warn ticks and structural no-overspend copy, memory with
"recalled n times", type-to-confirm destructive actions, responsive rules
(sidebar <1024px, tables-as-cards <640px, approvals usable on a phone).

**Seed/acceptance spec:** one org, 7 AI employees, goal "Announce the new
pricing page" mid-flight (2 running, 1 open gate, 1 done with report, 12
weeks of audit events, 2 weekly reports). Acceptance: company state answerable
in <5s; approving continues a run visibly; rejecting pauses + audits; an
exhausted meter shows PAUSED (never silent failure); org config exports as
valid JSON; every page has a real empty state.

### Reconciliation: what Revision 2 changes in §A–U

1. **Palette/accents (§N):** violet/gold primary set is **replaced** by
   lime/orange on near-black `#0B0F14`. The docs/70 mock's violet canvas stays
   as the Dashboard page's canvas treatment unless the founder says otherwise
   — flagged for confirmation, since the two references differ.
2. **Shell (§E):** sidebar shell replaces the two-row top nav. The HQ
   left-rail TODO/LIVE ACTIVITY concepts survive *inside the Dashboard page*.
3. **IA (§D):** Plan, Org Chart, Briefings, Finance, Authority editor join
   the map; Attention is realized as the brief's **Approvals page** (Open/
   Decided) plus dashboard "Needs your decision" panel; Audit Trail gets its
   own page with fixed event vocabulary + export.
4. **Backend gaps the brief implies (extends §R):** plan revisions + ratify
   (no revisions model yet — needs new table/endpoints); org-level pause flag
   (new, additive); audit export endpoint (CSV/JSON — read-only, easy);
   per-task live log stream (partially exists via command-stream/execution
   logs — needs a per-task surface); weekly briefing generator exists
   (`briefings` route) but the sign-off row + rendering are new frontend.
   Budgets exist (credits); the warn-line meter + per-employee/per-goal split
   is frontend over existing data. **No destructive migrations; all additive.**
5. **Phasing (§S) updated:** Phase 1 becomes tokens-to-the-brief + shell;
   Plan/Org Chart/Briefings/Authority-editor join later phases; a new final
   phase seeds the acceptance fixture and walks the 6 acceptance checks.

---

## A. Executive summary

You are building an **AI-native Company Operating System**: a founder logs in,
describes an idea, ORQ8 assembles an AI organization (departments, employees,
tools, authority), runs the work, and surfaces only the decisions the founder
must make. The product must feel like *operating a living company*, not using a
chat app or a dashboard of charts.

What you approved in the CTO.new references — and what this plan carries
forward — is an **interaction model**: one dark operational environment, a
persistent EA beside the work, live activity instead of static reports, and
founder attention surfaced rather than hunted. What we do **not** copy: their
branding, colors, exact UI, or features ORQ8 has not chosen (sponsored slots,
SMS assistant, "sell this business").

This plan covers the whole application: shell, dashboard, departments,
employees, work, approvals, memory, integrations, models, settings, onboarding
— with a design system, responsive rules, backend-impact honesty, risk list,
and acceptance criteria. The single biggest structural decision: ORQ8's app
shell becomes **dark operational** (as you approved for the dashboard), the
marketing site stays light.

## B. Current ORQ8 audit

**Routes (web, founder-facing):** `/app` (dashboard), `activity`, `agents`,
`agents/[id]`, `approvals`, `attention`, `audit`, `briefings`, `budgets`,
`business-import`, `company/overview`, `constitution`, `council`, `decisions`,
`departments`, `engineering`, `files`, `goals`, `goals/[id]`, `health`,
`integrations`, `jobs`, `knowledge`, `learning`, `lineage`, `mcp`, `members`,
`memory`, `notifications`, `org`, `performance`, `profile`, `quality`,
`report`, `roi`, `simulation`, `squads`, `strategy`, `tasks/[id]`, `teams`,
`usage` — ~40 surfaces, each a standalone light-mode page sharing a sidebar +
top bar shell. Plus `/admin` (11 pages), `/settings` (6), `/onboarding`,
auth pages, landing.

**Backend surface:** 57 API route files, including `departments`,
`agents` (authority schema), `approvals`, `attention`, `commands` (EA),
`company-builder`, `company-progress`, `memory`, `agent-memory`, `knowledge`,
`integrations`, `models`, `mcp`, `lineage`, `decisions`, `goals`, `quality`,
`circuit-breaker`, `command-stream` (SSE), `realtime` service. The data layer
for nearly everything the redesign needs **already exists**.

**Key existing components:** `executive-agent-panel.tsx` (494 lines — EA chat
with tool/plan/approval cards, floating launcher), `company-hub/company-orbit.tsx`
(308 lines — an orbital canvas experiment, recent commit "rebuild the Company
Hub as a single orbital surface"), `attention-badge`, `approval-actions`,
`dashboard/*` widgets, `command-bar`.

**Model routing:** `services/model-router.ts` already implements provider
selection, fallbacks, key rotation, and `selectModel(requirements)` — the
**Auto Model backend largely exists**; it is simply not exposed as a founder
concept anywhere in the UI. That is a discovery of this audit: Auto Model is
*mostly built, never surfaced*.

**Strengths to keep:** real data discipline (server-derived states, no
invented activity — enforced in code and tests), the authority model
(CAN DO / CAN SPEND / REQUIRES APPROVAL / CANNOT DO), Work Credits, the EA
service layer, attention queue, audit trail, SSE realtime, and a genuinely
dense backend. **Weaknesses:** light-first generic-SaaS look; ~40 flat pages
with heavy IA (founder must know where to look); the dashboard answers
"what metrics" more than "what is happening"; the orbital hub is an
unshipped experiment; EA is launcher-first rather than workspace-first;
no mobile story for the operational surfaces.

**Technical constraints:** Next.js App Router + server components;
Tailwind v4 with `@theme` tokens and the `dark:` variant scoped via `.ink`
(reused for the new `.hq` shell); light-marketing must stay untouched
(founder decision); API is session-cookie auth + internal-token guards;
existing tests (vitest, 600+ across batches) and proofs must stay green.

## C. Reference analysis

**Adapt (interaction patterns):**

1. **One operational environment** — nav divided into functional areas; the
   company visible from one screen; density organized by caps-tracked section
   labels, not cards-in-grids.
2. **State-carrying canvas** — agents as nodes whose ring color/status is
   derived from real work state (gold working, purple+count awaiting approval,
   dim idle); click for details; banner morphs with company state.
3. **Persistent EA beside the work** — not a page, not a launcher: a rail.
   Event cards (thinking, tool, plan update, approval, active task) instead of
   chat bubbles only; composer with `/` commands and model picker.
4. **Live activity as a first-class layer** — terminal strip, expandable.
5. **Auto Model as the default** — "the founder shouldn't have to pick";
   override when needed; model shown as a small pill, intelligence/cost dots.
6. **Founder actions as a TODO list** — "Hire employee — AI systems architect":
   the company tells the founder what it needs.
7. **Node popover** (new screenshot): clicking an agent shows role summary,
   model, **permission icon row**, Settings — quick identity + authority at a
   glance, deep work in a drawer.

**Do not copy:** branding/colors/logos; exact component shapes; sponsored
slots; SMS assistant; "Sell this business"; multi-model marketplace per task
(ORQ8's Auto Model + authority model is the answer); their grid/graph paper
metaphor as literal graph paper (we keep ORQ8's dotted canvas from the
approved mock); anything requiring backend capabilities ORQ8 has not built.

## D. New information architecture

```
Company (HQ dashboard — the live organization)
├─ Departments (operating units, each with purpose/status/lead/work)
│   └─ AI Employees (workspace per employee: status, authority, work, model)
├─ Work (goals → tasks → outcomes; kanban + work view; lineage)
├─ Attention (approvals · decisions · blockers — the founder's queue)
├─ Memory (decisions, policies, knowledge, learned context)
├── Infrastructure (integrations, tools/MCP, models/Auto Model, files)
├─ Activity (company audit trail; admin-grade detail)
└─ Settings (org, members, billing/credits, constitution, authority policy)
```

Nav is reorganized from ~40 flat links into these **7 groups**. Related today-
separate pages merge (e.g. `attention` + `approvals`; `knowledge` + `memory` +
`files` presented as one surface with tabs; `usage` + `budgets` + `roi` under
one "Economics" entry inside Settings/Company). Nothing is deleted; redirects
preserve old URLs.

**How they relate:** Work belongs to a department; employees execute work
within authority limits; exceptions raise Attention; every action writes
Activity; outcomes write Memory; Infrastructure defines what employees may
touch; Settings defines what the company may do.

## E. New application shell

- **Header (52px):** org switcher + **company status badge** (LIVE /
  NEEDS APPROVAL / PAUSED — derived from attention queue + paused flag),
  global command bar (⌘K), usage meter (daily/weekly), attention bell, avatar.
- **Second nav row:** the 7 groups above; current group highlighted; counts
  where meaningful (Tasks 1, Attention 3).
- **Left rail (HQ only):** TODO LIST (founder actions), LATEST TASKS,
  INTEGRATIONS, GROWTH/ECONOMICS — the approved mock's rail.
- **Main workspace (75%):** route-specific; HQ shows the live org canvas.
- **EA rail (25%, persistent):** upgraded `executive-agent-panel` pinned as
  the right rail on every operational page; collapsible to 48px icon strip;
  event-card types (already partially built); context-aware (knows the
  current route/department/employee and says so).
- **Activity layer:** HQ bottom terminal strip; per-page recent-activity
  sections; global `/activity` for the full audit.
- **Responsive:** ≥1280px full 75/25; 1024–1279 EA collapses to icon rail,
  left rail hidden behind a toggle; <1024 (tablet) EA becomes a bottom sheet
  opened by a floating EA button; <768 (mobile) single column, canvas becomes
  a vertical department list with status chips, nav collapses into a drawer,
  header keeps status badge + attention + EA button. No operational surface is
  desktop-only.

## F. Dashboard design (Company HQ)

The approved mock (`marketing/headquarters-mock.html`) is the visual spec.
Layout: header → nav row → [left rail | canvas 75% | EA rail 25%].

- **Canvas:** departments as **columns** under the EA node (matching your
  ASCII sketch: COMPANY → EA → departments → employees → work). Each employee
  is a node with status ring derived from real state: working (gold, task
  title + Thinking…), awaiting approval (purple, count), blocked (red),
  idle (dim). Click → popover (role, model, permission icons, Settings →
  employee drawer). Department headers show ACTIVE/WAITING + current work.
- **Morphing banner:** priority order — approvals waiting → work blocked →
  agent working → all clear ("All caught up"). One primary action each.
- **TODO LIST:** from attention queue + EA recommendations (hire X, approve Y,
  connect email). Red count badge.
- **LIVE ACTIVITY strip:** real `/v1/activity` SSE, `TYPE — agent: summary`,
  expandable to full pane. Real events only.
- **GROWTH/ECONOMICS:** credits, spend, plan — real numbers.
- **Interactions:** node click → popover → drawer (employee) or column click →
  department page; banner Review → Attention; task chips → task view.

## G. Department experience

Route: `/app/departments/[id]` (upgraded from the current list+detail).
**States:** active (work in progress), waiting (needs founder), blocked,
idle, empty (hired but no work — shows "ask the EA to brief this department").

Header: name, purpose, status badge, lead, employee avatars, **Needs
founder** count. Body in three zones:

1. **Now** — current work items with owner + progress; live.
2. **Team** — employees with status rings and current task; click-through.
3. **Operating context** — tabs: Tools & integrations (which of the company's
   connectors this department's roles may use), Resources (files/knowledge),
   Recent decisions, Recent approvals, Department memory (what this department
   knows), Authority (what this department may do/spend — derived from member
   authority profiles), Activity.

**Founder needs surfaced at top**, never buried: "Production deployment
approval" style cards with Review/Approve.

## H. Employee experience

Route: `/app/agents/[id]` upgraded into a **workspace** (the reference's
employee drawer, expanded). Sections:

- **Identity:** role, department, status (ACTIVE/WORKING/WAITING/BLOCKED/
  REVIEW/DONE/PAUSED/OFFLINE — preserved), current task with live progress.
- **Authority panel:** the existing authority profile rendered as the four
  bands — CAN DO / CAN SPEND / REQUIRES APPROVAL / CANNOT DO — with the
  `forbiddenActions` list; editable by the founder (writes existing API).
- **Model section:** Auto Model toggle + override picker (see §M).
- **Abilities/tools:** toggles from authority profile + tool registry
  (Code Access, Image Generation, etc. — the drawer's ability rows).
- **Memory:** what this employee knows/remembers (agent-memory API).
- **Recent work:** tasks with outcomes, cost, duration; approvals history.
- **Actions:** Rename, Pause, Fire (existing endpoints), Chat (opens EA rail
  focused on this employee).

## I. Work / task experience

Work = goal → tasks → outcome. Routes stay; presentation upgrades:

- **Tasks board** `/app/tasks`: BACKLOG (priority order, DRAFT chips) /
  WORKING (owner + Thinking…) / DONE (newest first) — the reference kanban,
  headed by "Work is assigned from goals and by your EA. Approvals pause
  work that needs you." Board is **read-organized**; mutations stay in the
  existing task pages/EA (no drag-drop in MVP).
- **Task view** `/app/tasks/[id]`: outcome-first — status, owner, cost,
  duration, **result**, tool calls made, approval trail, lineage link.
- **Work view:** from a goal, see all contributing tasks/employees/departments
  (lineage API exists) — "follow a piece of work from beginning to end".

## J. Approval / decision experience

- **Attention** `/app/attention` becomes the single founder queue: approvals,
  decisions, blockers, budget requests, risk events — grouped, each card
  carrying the EA's explanation: what/why/what-wants-to-happen/what-permissions/
  if-approved/if-rejected (the gated-work card from MVP-030 is the template —
  it already names taskId/toolId/toolParams).
- Approve/Reject/Ask-the-EA inline; decisions log back to the record.
- Header badge + company status badge reflect the queue; the EA proactively
  reports it.
- The **assign-task approval modal** from the reference becomes our approval
  detail drawer: ASSIGN TO / TASK / GOAL / SCOPE sections when the approval
  carries that payload, else the generic explanation card.

## K. Memory experience

`/app/memory` (merging knowledge/files presentation): tabs — **Decisions**
(decision log with rationale), **Policies** (constitution excerpt), **Company
knowledge** (documents/learned facts, sources cited), **Operational history**
(past work outcomes). The EA cites memory entries in its cards ("we chose X
because Y — see Decisions"). Search across all. Real entries only; empty
states explain how memory accumulates.

## L. Integration experience

`/app/integrations` reframed as **company infrastructure**: connected systems
(GitHub, Supabase, Gmail, OpenRouter, MCP servers — actual current list from
the integrations/mcp routes), each showing: which departments' roles use it,
which employees have access, permission scope, tools unlocked, actions
requiring approval, health/last-used. Not a marketplace: a **permissions
map** first, "add connection" second.

## M. Model experience (Auto Model)

Backend `model-router.selectModel()` already exists. Surface it:

- **Company default:** Auto Model by default (router picks per task by
  complexity/cost/context — its existing `requirements` logic); founders may
  pin a default.
- **Hierarchy:** Company → Department → Employee → Task override, each level
  "Auto (inherits)" unless pinned. UI shows the resolved chain in the employee
  workspace and task view ("GLM 5.3 Flash — auto-selected: cost-optimized for
  drafting").
- **Picker** (from the reference modal): our picks / smartest / cheapest /
  all, intelligence–cost dots, current selection marked. **No per-message
  model marketplace**; choice happens at employee/task level, keeping
  governance coherent.
- EA composer model pill reflects the EA's own routing.

## N. Design system

Tokens extend `docs/65` + existing `@theme`: **dark operational palette**
(near-black navy base from the mock: `--bg #0b0d14`, panels, hairlines) +
ORQ8's existing brand accents repurposed: **violet = primary/attention,
green = live/healthy, gold = busy, red = blocked/error**. Typography:
Inter (UI) + JetBrains Mono (activity/terminal/data) + Fraunces (marketing
only). Spacing 4px grid; radius 8/12; 1px hairlines; shadows minimal.
Components to formalize: `StatusRing`, `StatusBadge` (the 8 statuses),
`SectionLabel` (caps-tracked), `EventCard` (EA), `TerminalFeed`,
`ApprovalCard`, `TodoRow`, `NodePopover`, `EmployeeDrawer`, `ModelPill`,
`ModelPicker`, `EmptyState`, `MetricBar`. Motion: 150–250ms ease-out;
ring pulse only when working; no decorative animation. A11y: contrast
passes with existing `data-contrast-check` convention. Anti-slop rules from
§14 of your brief adopted verbatim as lint-level guidance in the style guide.

## O. Responsive system

Summarized in §E; detail: breakpoints 1536/1280/1024/768/480; canvas
degrades canvas → list; EA degrades rail → icon → bottom-sheet → full-screen
page (`/app/ea`); tables become definition lists on mobile; touch targets
≥44px; no horizontal-scroll operational data.

## P. Component architecture

New/reworked (all in `apps/web/components/`): `hq/` namespace — `AppFrame`
(header+nav+rails), `OrgCanvas`, `AgentNode`, `AgentNodePopover`,
`StatusRing`, `MorphBanner`, `TodoList`, `LiveTerminal`, `EventCard`,
`ApprovalCard`, `EmployeeDrawer`, `ModelPicker`, `KanbanBoard`, `DeptColumn`,
`AttentionQueue`, `MemoryTabs`, `IntegrationMap`, `AuthorityPanel`,
`AutoModelControl`. Server components by default; client islands for
composer, canvas interactions, drawers; SSE via existing `command-stream`/
`dashboard-realtime` patterns. Existing `executive-agent-panel` refactors
into `hq/ea-rail` (keeping its API/contract); `company-orbit` is retired into
archive after HQ ships (its canvas ideas live on in `OrgCanvas`).

## Q. Route / page plan

| Current | New |
| --- | --- |
| `/app` | **Company HQ** (canvas) — replaces current metrics dashboard |
| `/app/attention`, `/app/approvals` | **Attention** (one queue) |
| `/app/departments`, `/app/departments/[id]` (new) | **Departments** list + workspace |
| `/app/agents`, `/app/agents/[id]` | **Employees** list + workspace |
| `/app/tasks/[id]` + new `/app/tasks` | **Work** board + task view |
| `/app/goals`, `/app/goals/[id]` | Work → Goals (inside Work group) |
| `/app/memory`, `/app/knowledge`, `/app/files` | **Memory** (tabs) |
| `/app/integrations`, `/app/mcp` | **Infrastructure → Integrations** |
| `/app/usage`, `/app/budgets`, `/app/roi` | **Economics** (Settings group) |
| `/app/decisions`, `/app/lineage`, `/app/audit`, `/app/activity` | Activity group (Decisions, Lineage, Audit) |
| `/app/constitution`, `/app/org`, `/app/members`, `/app/profile` | Settings group |
| `/app/council`, `/app/teams`, `/app/squads` | Departments group (governance bodies) |
| `/app/engineering`, `/app/jobs`, `/app/health`, `/app/quality`, `/app/performance`, `/app/report`, `/app/briefings`, `/app/simulation`, `/app/learning`, `/app/business-import`, `/app/notifications`, `/app/strategy`, `/app/company/overview` | Fold into the group where they belong; low-traffic pages get redirects, not dedicated nav slots |

No route is deleted without a redirect. Admin keeps its own (unchanged) shell.

## R. Data / backend impact

- **No backend changes needed:** HQ canvas, attention merge, employee
  workspace, approvals, memory presentation, integrations map, kanban — all
  served by existing endpoints (`company-progress`, `attention`, `agents`,
  `approvals`, `activity`, `memory`, `integrations`, `mcp`, `lineage`,
  `agent-memory`).
- **Small API additions (design now, build in phase):** `GET
  /v1/company-status` (or extend dashboard payload) for the header badge
  (paused flag + attention count); department-scoped activity/decisions query
  params; "needs founder" rollup per department. All reads; no schema change.
- **Possibly later (not this redesign):** per-department model pinning
  (needs a departments.model column — deferred; company/employee level covers
  the MVP), employee status history.
- **Realtime:** reuse `command-stream` SSE; add attention-count events.
- **No destructive migration.** Any new columns are additive with defaults.

## S. Implementation phases

- **Phase 0 — DONE:** HQ dark mock approved-visual baseline
  (`marketing/headquarters-mock.html`), docs/70.
- **Phase 1 — Design tokens & primitives:** `.hq` dark scope, tokens,
  StatusRing/Badge/SectionLabel/EmptyState; story-route `/app/_style` (admin
  visible) for review. *Deliverable: tokens + 5 primitives, nothing user-
  facing changes.*
- **Phase 2 — App shell:** header + nav groups + redirects map; EA rail
  refactor (rail + collapse states); responsive scaffolding. Old dashboard
  still reachable during this phase.
- **Phase 3 — Company HQ:** canvas, morph banner, TODO list, live terminal,
  node popover. Replaces `/app`.
- **Phase 4 — Attention + Work:** merged queue; kanban; task view upgrades.
- **Phase 5 — Departments + Employees:** workspaces per §G/§H.
- **Phase 6 — Memory + Integrations + Models:** tabs, permissions map,
  Auto Model controls.
- **Phase 7 — Responsive completion + a11y/contrast pass + empty states.**
- **Phase 8 — QA:** full test batches, route sweep, proofs, mobile walk,
  docs/68 update, changelog. *Each phase ends green: typecheck, tests,
  build, manual click-through.*

## T. Risk analysis

1. **Regression surface is large (40 pages).** Mitigation: redirects, not
   deletions; phase gates with full green batches; the route-sweep proof.
2. **Light↔dark boundary leaks.** `.hq` scoping + visual QA on landing after
   each phase; landing has zero dark changes.
3. **Server-component waterfalls** on HQ (9 parallel fetches today). Keep
   Promise.all, add cheap endpoints, cache static parts.
4. **Realtime duplication** — two SSE patterns exist; consolidate on
   `command-stream` contract, keep `dashboard-realtime` as consumer.
5. **IA churn confusing existing users** — nav groups + redirects + a
   "What changed" note in changelog; old URLs keep working.
6. **Scope creep into backend rewrites** — plan explicitly caps backend work
   to the reads listed in §R; anything else found mid-build becomes a
   documented follow-up, not silent scope.
7. **Mock-to-real drift** — the mock stays the visual spec; components are
   built from it, not re-inspired.
8. **Mobile ambition** — the operational canvas on phones is a real risk of
   half-UI; Phase 7 treats mobile as acceptance-gated, not best-effort.

## U. Acceptance criteria

1. Founder logs in → HQ answers "what is my company doing right now" in one
   screen with zero invented data (rings/banners/counts all API-derived).
2. Every old route resolves (redirect) and every nav item works at 1536,
   1280, 1024, 768, 480 widths.
3. EA is reachable on every operational page within one interaction, and its
   cards reflect real approvals/tasks/activity.
4. Approvals, decisions, blockers all appear in Attention with the
   explanation template; approving from Attention works end to end (gated
   tool task path stays green).
5. Auto Model is visible, understandable, and overridable at company and
   employee level; resolution chain is shown.
6. Departments and employees each have a workspace meeting §G/§H content
   lists, driven by existing APIs.
7. Memory, integrations, activity use real entries only; empty states
   instruct.
8. All existing test batches, typecheck, build, proofs green; route sweep
   clean; contrast checks pass.
9. Marketing site pixel-unchanged (diff-checked).
10. docs/68 rows + changelog updated; this doc's status flips to
    IMPLEMENTED per phase.

---

*End of plan. Awaiting founder approval before Phase 1 begins.*
