# 76 — Application-Wide Audit & Implementation Plan (UI, Workspace, Functionality)

Status: **PLAN — awaiting founder approval. No implementation has started.**

Scope: the founder's application-wide brief mapped onto what actually exists today. This document
is the Phase-1 audit + Phase-2 architecture plan from the brief. Implementation only begins after
approval, and follows the phase order in Part 9.

---

## Part 1 — Audit findings (what exists today)

### 1.1 Shell and layout system

- `app/app/layout.tsx` is the real shell: auth gate, `.console` theme scope, `AppSidebar` (fixed
  240px), `TopBar`, and a single `<main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">` that all 44
  workspace pages render into. There is **no width container at the layout level** — every page
  invents its own.
- `PageShell` (components/page-shell.tsx) is **only an error-boundary wrapper** — it contains no
  header, no container, no width logic. Only **6 of 44 pages** use it (tasks, goals list, finance,
  audit, agent detail, department detail).
- Design law already exists and is good: **docs/73 Console UI Skill** (token table, state-dot,
  `.console-card`, one orange CTA per screen, empty-state pattern) + **docs/71** (Phases 0–2
  shipped: tokens, console skin, dashboard mock; **Phases 3–8 explicitly await founder go-ahead —
  this brief is that go-ahead**). Mocks on disk: `marketing/headquarters-mock-v2.html` (canonical),
  `headquarters-mock.html`.

### 1.2 Container widths — measured, page by page

Grep of every `page.tsx` under `/app` (first max-w found, per page):

| Page | Container | Verdict |
|---|---|---|
| tasks | max-w-2xl region inside content | too narrow for a board |
| tasks/[id] | none | full-width detail vs narrow list — inconsistent pair |
| goals | max-w-full | full-bleed list page |
| goals/[id] | none | full-width |
| agents | max-w-4xl/5xl mix | near-standard |
| agents/[id] | none (EmployeeWorkspace) | full-width |
| engineering | max-w-[…] + max-w-2xl | narrow despite being an operational workspace |
| departments | max-w-2xl | narrow |
| departments/[id] | none (DepartmentWorkspace) | full-width |
| files | max-w-2xl | narrow |
| memory | max-w-2xl | narrow |
| integrations | max-w-2xl | narrow |
| mcp | max-w-md! + max-w-[…] | narrowest in the app |
| briefings, budgets, finance, audit, approvals, notifications, teams | max-w-2xl–4xl | standard-ish but each self-defined |
| strategy, decisions | max-w-lg/max-w-5xl | mixed inside one page |
| overview (company) | max-w-7xl | widest |

**13 distinct width values across 44 pages, zero shared primitives.** The two worst symptoms the
brief calls out are real: tasks list is max-w-2xl while its own detail page is edge-to-edge; and
Engineering inherits a narrow content width.

### 1.3 Loading / empty / error states

- Exactly **one** `loading.tsx` in the whole app tree; **one** usage of a shared `EmptyState`
  component (a good one exists — it's just unused).
- Many pages are client components that render nothing meaningful during fetch; server pages at
  least stream but have no skeletons. docs/71 brief demands skeleton loading + real empty states
  everywhere.

### 1.4 Work system (goals / tasks / briefings)

- **Data model** (`packages/db`): `tasks.status` vocabulary is locked:
  `pending | in_progress | awaiting_approval | completed | failed | cancelled`. Priority
  `low|normal|high|urgent`. No position/order column, **no comments table**, no task-history table
  (but `audit_events` + `activity_events` both exist and are already written on task changes).
- **API**: `GET/POST /v1/tasks`, `GET/PATCH/DELETE /v1/tasks/:id` all exist and are org-scoped +
  audited. **Bug found:** `updateTaskBody`'s status enum omits `awaiting_approval`, so the API
  rejects setting that status (arguably correct for founders, but it must be a deliberate rule,
  not an accident — the executor sets it internally).
- **UI**: tasks page = `WorkBoard` (3 columns Backlog/In progress/Done + detail pane, filters,
  real data, nice chips) — it is a **read-only board**: no drag, no create, no edit, no
  status change on the board itself. `TaskActions`/`GoalActions` modals exist (create/edit with
  real POSTs/PATCHes) but live on the **goals** page, not tasks. Task detail page
  (tasks/[id]) is a 389-line client page with retry/execute actions — separate visual language
  from the board's detail pane.
- **Briefings**: real data (daily/weekly/monthly from actual activity), sign-off concept present;
  container narrow; fine after layout pass.

### 1.5 EA awareness — current mechanism

- EA context is built **fresh from the DB at every command** (`buildOrgContext` → agents,
  departments, teams, goals, tasks, approvals, company memory, strategy, capabilities). So the EA
  always sees **current state** — including any status a founder just set.
- What it **cannot** see: **change history and actorship**. Nothing renders "Task X was moved
  Todo→Doing *by the founder* *at 14:02*" into EA context. Meanwhile the raw material already
  exists: `PATCH /v1/tasks/:id` writes `audit_events` rows (`task.status_changed`), and
  `activity_events` is written by executor/quality/delegation paths — but **founder-driven UI
  actions write no activity events**, and `buildContextPrompt` includes **zero event history**.
- The EA dock/panel on the web does `router.refresh()` on send; it has no live event feed (SSE
  exists: `use-realtime` hook + `/v1/events` stream + `registerRealtimeEndpoint`, used by
  dashboard widgets only).

### 1.6 Agent surfaces

- `agents/[id]` = **EmployeeWorkspace** (docs/71 §H): identity, autonomy level, current task,
  tasks, activity, memory, role-derived tools, providers — a real operational page, server-fed
  with `revalidate:false`.
- Clicking a working agent on the dashboard org-tree or agents page **navigates** to that page.
  No drawer exists anywhere. The brief's drawer is therefore a **new container** reusing
  EmployeeWorkspace's data needs (the same 6 endpoints), not a new data layer.
- Live updates: none on the workspace (server-rendered snapshot). SSE infra exists to fix this.

### 1.7 Engineering

- The page is a 840-line client page: engineering org, engineering tasks, repositories + sandbox
  runs, capability registry, MCP servers, PR reviews (real approve/request-changes flows),
  Engineering Manager panel.
- Real APIs exist and are unused by UI: `GET /v1/repositories/:id/branches`,
  `GET /v1/repositories/:repoId/files?path=` (tree listing),
  `GET /v1/repositories/:repoId/file?path=` (content), PR list/create/patch +
  `request-approval`. **No file explorer / code viewer / diff UI exists.** Nothing fabricates
  GitHub activity — the honest-data rule is already respected.
- Layout is narrow; the brief's full-width workspace requirement is unmet.

### 1.8 Company systems

- **Departments**: list page self-contained; detail page → `DepartmentWorkspace` (1059 lines:
  overview, agents, work, budget, goals, activity tabs — genuinely good, matches brief §8
  already; needs layout standardization + the drawer wiring).
- **Files**: folders by purpose, filter, preview modal, delete, real upload/download; **no search,
  no sort, no metadata columns** (schema has agentId/taskId/mimeType/size — derivable).
- **Memory**: `companyMemory` (source, category, content) + real `/v1/memory/stats` endpoint that
  **the page never calls**; no "recalled n times" (not tracked); type filter exists on API.
- **Integrations**: strong already — connected vs available split, health probes, OAuth
  connect/disconnect, error banners. Minor: terminology consistency, error-state visibility.
- **Tools & MCP**: single combined page (`/app/mcp`) with role→tools mapping and MCP servers
  (list, discover, execute). Sidebar labels it "Tools & MCP". Functional but dense; needs the
  connected/configured/permissions clarity + consistent shell.

### 1.9 Fake/placeholder/dead inventory

No "Coming soon" strings, no mock-data blocks in `/app` pages. The real sins are subtler:
buttons that only `router.refresh()`, filter chips that don't persist, stats endpoints that exist
but are never fetched (memory), APIs with no UI (engineering file/tree), and status vocabulary
mismatches between UI columns and API enums. The audit found **no fabricated activity** — the
honesty rule from docs/71 is holding.

---

## Part 2 — What is wrong (condensed)

1. **No layout system**: 13 ad-hoc widths, 6/44 pages with any shell, 1 loading.tsx, 1 EmptyState
   use. Every page re-invents header + container.
2. **Kanban is read-only**: no DnD, no create/edit from board, no manual status moves, no
   ordering, no comments, no history view; detail pane and detail page are different designs.
3. **EA is state-aware but change-blind**: no event history in context, no actor attribution,
   founder actions write audit rows but no activity events; dock has no live updates.
4. **Agent click = navigation**, no drawer; workspace is a static snapshot.
5. **Engineering wastes its own backend**: file tree/content/branch APIs exist with no UI; page
   is narrow; no Repository→Files→Code→Changes→Review flow.
6. **Company-system pages under-use their own data** (memory stats, files metadata, MCP health).
7. Width-by-accident rather than width-by-page-type.

---

## Part 3 — The plan (phased, approval-gated)

### Phase 3 — Core layout system (the foundation everything else lands on)

New file `apps/web/components/layout/` with four primitives, built strictly on docs/73 tokens:

1. **`PageContainer`** — the single width authority. Props: `width` ∈
   `narrow` (max-w-3xl: settings-ish, forms) | `standard` (max-w-6xl: most pages, **default**) |
   `wide` (max-w-[1600px]: dashboards, board) | `full` (edge-to-edge + inner padding: Engineering,
   Kanban, code). Renders the standard page header pattern (mono kicker / h1 / lede / actions slot)
   + optional footer slot. Migrating a page = replace its hand-rolled wrapper with this; 44
   mechanical migrations with a per-page width decision recorded in the migration table.
2. **`PageHeader`** — used by PageContainer but exported for odd cases.
3. **`DataBoundary`** — one component that composes the trio the app lacks: `loading.tsx`
   skeleton per page type (list/board/detail/code), shared `EmptyState`, error retry. Adopted by
   every migrated page.
4. **`DetailPane`/`Drawer`** — shared right-side container (used by agent drawer, task detail,
   file preview) with backdrop, Escape, focus trap, `lg:` persistent variant.

No color/hex/radius changes — token law stays. Every migrated page keeps its content; only the
wrapper changes. Width decision table goes in this doc as pages land.

### Phase 4 — Work system (Kanban + tasks + goals + briefings + EA awareness)

**4a. Kanban (real, persistent).**

- **Status mapping (no schema change to the locked vocabulary):** board columns are a *view* over
  the real statuses: **Backlog** = `pending` (+ new `position` order), **Todo** = `pending` moved
  to "ready" via position==0 bucket? — **decision needed (see Part 6 questions)**: simplest honest
  model is 5 columns mapped 1:1 — Backlog(`pending`), Doing(`in_progress`), Blocked(`awaiting_approval`
  relabeled "Blocked — needs approval"), Review *(see below)*, Done(`completed`) — plus `failed`
  shown as red flag inside Done, `cancelled` collapsed into Done with chip. The brief asks for
  Todo and Review as distinct states; two options:
  - **Option A (recommended): extend the vocabulary** — migration adds `review` and `blocked` to
    the tasks.status CHECK-free text column (it's text; no constraint exists), `updateTaskBody`
    enum + WorkBoard + executor guards updated. `blocked` is distinct from `awaiting_approval`
    (founder gate) — it's a user-declared blocker. Small, honest, additive.
  - Option B: keep 6 statuses, fake Todo/Review by derivation — rejected: violates "no fake UI".
- **Drag & drop:** `@dnd-kit/core` + `@dnd-kit/sortable` (new dependency — tiny, accessible,
  maintained; framer-motion deliberately NOT added). Optimistic move + `PATCH /v1/tasks/:id`
  `{status, position}`; revert on error with toast. Horizontal scroll at narrow widths; keyboard
  move via card menu for a11y.
- **Ordering:** migration `0015_task_position.sql` (+supabase parity): `position integer not null
  default 0` + index `(org_id, status, position)`; PATCH extends to accept `position`; insert
  assigns max+1.
- **Board CRUD:** New Task modal (reuse `TaskActions` internals: title/description/agent/goal/
  priority/due), edit modal, card menu (assign, priority, status), header counts. Create/edit
  actions **write activity events** (4b) so the EA sees them.
- **Task detail:** one source of truth — clicking a card opens the shared **Drawer** (Phase 3
  primitive) with full detail: description editor, status/priority/assignee controls, activity
  timeline (from `audit_events` + `activity_events` — who/what/when), result block for completed
  tasks, Execute/Retry buttons reusing existing endpoints. The `/app/tasks/[id]` route remains for
  deep links and redirects to the board with the drawer open (query param), eliminating the
  two-designs problem.
- **Comments:** new `task_comments` table (0016: id, org_id, task_id, author_user_id,
  author_agent_id, body, created_at) + `GET/POST /v1/tasks/:id/comments` + drawer thread.
  Agent comments allowed (executor can post on completion notes later).
- **History:** the timeline renders `audit_events` (actor, action, resultRef, occurredAt) —
  real data, no new backend.
- **Persistence & refresh:** all mutations are API-backed; board refetches via `router.refresh()`
  + drawer-level fetch; deep-link state in URL (`?task=<id>`).

**4b. EA awareness (the event seam).**

- **Single writer helper** `apps/api/src/services/work-events.ts`:
  `recordWorkEvent(db, {orgId, type, actorType: 'user'|'agent'|'system', actorId, actorName,
  taskId, goalId, agentId, summary, details})` → inserts `activity_events` (type ∈ new founder
  vocabulary: `task_status_changed`, `task_assigned`, `task_priority_changed`, `task_created`,
  `task_updated`, `goal_created`, `goal_updated`, …, `summary` =
  `"Move 'X' from Todo to Doing — by Ada (founder)"`).
- **Call sites:** `PATCH /v1/tasks/:id` (status/priority/assignee/title/description — with
  before→after in details), `POST /v1/tasks`, task comments, `POST/PATCH /v1/goals/:id`,
  agent create/status change, department update, file upload, engineering task/PR events,
  approval decisions (some already emit activity — dedupe by reusing `recordActivity` in
  `services/activity.ts` so we don't double-write; the helper wraps it).
- **EA context:** `buildOrgContext` gains a **Recent Work Events** block — last ~25 org activity
  events rendered as `- [14:02] task_status_changed: 'Pricing page' pending → in_progress (by
  founder)`. Cheap (one indexed query already used by /v1/activity), bounded, and it means every
  EA answer is grounded in who-did-what, not just current state.
- **Dock live feed:** the EA dock subscribes to the existing `/v1/events` SSE stream
  (`use-realtime`) so gates/activity appear without refresh; falls back to 60s poll when SSE is
  unavailable.
- No EA prompt rewrite beyond the context block — the existing system prompt already says "use the
  real state in the context above".

**4c. Goals/Briefings.** Migrate to PageContainer; goal detail reuses the same DetailPane timeline
component; briefings get standard width + skeleton. No functional rework needed beyond wiring
(they're already real).

### Phase 5 — Agent experience (right-side drawer)

- **`AgentDrawer`** component on the shared Drawer primitive. Opens on click of any working/any
  agent chip in: dashboard org-tree, agents page cards, department workspace roster, engineering
  assignees. URL-addressable (`?agent=<id>` on any host page) so refresh keeps it open.
- **Data:** reuse EmployeeWorkspace's exact endpoint set (`/v1/agents/:id`, tasks by agent,
  activity by agent, agent-memory, tools by role, providers) fetched client-side with
  `cache: no-store` and a 15s poll **plus SSE-triggered refetch** (agent status changes already
  broadcast on `/v1/events`).
- **Sections (per brief §5):** identity header (avatar, role, dept, status-dot, current task,
  autonomy L-level, mode) / current work (task card w/ progress, live state) / activity (last 10
  events, live) / authority (L-level rules rendered from the real autonomy policy, spend cap from
  agent record, tools list w/ permission chips) / outputs (recent completed task results, files
  by agent, PRs authored) — all from existing endpoints; empty states where an agent has none.
- **CTA:** "Open full workspace →" navigates to `/app/agents/[id]` (EmployeeWorkspace stays the
  deep view). Close returns to the underlying page (it never navigated).
- EmployeeWorkspace itself gets the Phase-3 shell + live poll (it's the drawer's big sibling).

### Phase 6 — Engineering workspace (full-width)

- **Layout:** PageContainer `width="full"`; internal 3-pane resizable workspace:
  left = Repositories + file tree; center = code viewer / diff; right = review panel + agent
  activity. Below: engineering tasks + sandbox runs strip (existing content, restyled).
- **Repository area:** real repo list, default branch, last commit-ish metadata available from
  existing endpoints (honest: only what the API returns).
- **File explorer:** NEW — calls existing `GET /v1/repositories/:repoId/files?path=` (tree) +
  lazy folder expansion, file search input filtering the tree client-side.
- **Code viewer:** NEW — `GET .../file?path=` renders with **`@monaco-editor/react`** (new dep,
  loaded via CDN loader by default; `readOnly` for viewers). Editing: the backend has **no
  file-write endpoint** — per brief §16 we will NOT fake one; the viewer ships read-only and the
  plan notes the dependency (a `PUT /v1/repositories/:id/file` + sandbox write path) as required
  before an editor mode unlocks. Monaco also gives in-file search free.
- **Changes/Diff:** honest scope — PRs already carry head/base branch + status; diff rendering
  arrives only if the provider integration returns diffs (currently not stored) → ship the
  Changes tab against **engineering task + sandbox-run + PR status data that exists**, with a
  clearly-marked empty state "Diff view requires a connected provider that returns diffs" instead
  of fabricated diffs.
- **Review flow:** strengthen the existing real loop: engineering task → agent works → PR created
  (real `POST /v1/prs`) → Review panel (existing approve/request-changes PATCH) → status reflected
  on the task + activity event emitted (feeds EA + timelines). Agent integration strip: which
  agent, which task, which repo, files-touched (from task description/PR), approval required?
  — rendered from real engineering-task fields.
- **Branches:** existing `GET .../branches` + `POST .../branches` wired into a branch switcher.

### Phase 7 — Company systems

- **Departments:** list → PageContainer standard; detail (DepartmentWorkspace) → standard width +
  drawer wiring on agent click + activity tab fed by recordWorkEvent output. Structure already
  matches brief §8.
- **Files:** add search box (client-side over fetched metadata), sort controls (name/size/date),
  metadata columns (type, size, uploaded-by, related task/agent links), preview via existing
  modal; empty/loading states via DataBoundary. Upload origin (task/agent) is real schema data.
- **Memory:** call the existing `/v1/memory/stats` (counts by category/source), add type filter
  UI, source rendering ("added by Atlas · 3 days ago"), explicit "recalled" only if tracking
  exists — otherwise omitted (honesty rule). Connect-to-system: memory entries already reference
  real entities.
- **Integrations:** keep the strong existing page; migrate shell; unify "Connected/Available"
  section headers + health badge vocabulary with docs/73 states; error banner consistent.
- **Tools & MCP:** split into two clear sections on one page (or two pages — decision point):
  Tools (registry by role, what each does, which agents, config status) + MCP (servers, tools
  per server, health, permissions, errors). Wire the existing discover/execute APIs' statuses
  visibly.

### Phase 8 — App-wide QA

- Route sweep script extension: every /app route at 1440 + 375 + 768; width assertion per page
  against the migration table; console-error capture.
- Interaction QA list: task create/edit/drag/status/comment persists across reload; drawer state
  survives refresh via URL; EA answers "who moved task X" correctly (manual eval); engineering
  file open/search; files search/sort; memory stats render; integrations connect/disconnect;
  MCP health. Loading/empty/error forced via API-stop test for each page family.
- Full battery: api tests (extend for new endpoints/events), web tests (new components),
  tsc, builds, release gate.

---

## Part 4 — New reusable components (complete list)

`layout/PageContainer`, `layout/PageHeader`, `layout/DataBoundary` (+skeleton variants),
`layout/Drawer` (shared), `work/kanban-board` (replaces WorkBoard), `work/task-drawer` (detail),
`work/task-comments`, `work/activity-timeline` (shared by task/goal/agent/department),
`agents/agent-drawer`, `engineering/file-explorer`, `engineering/code-viewer`,
`engineering/review-panel` (extract of existing review modal). Dependencies to add:
`@dnd-kit/core`, `@dnd-kit/sortable`, `@monaco-editor/react` (CDN-loaded, engineering only).

## Part 5 — Backend/data changes required

1. Migration `0015_task_position.sql` + supabase `0039`: `tasks.position`, index.
2. Migration `0016_task_comments.sql` + supabase `0040`: `task_comments` table.
3. `updateTaskBody`: status enum + `review`, `blocked` (Option A) + `position` field.
4. `services/work-events.ts` + call-site wiring (tasks, goals, agents, departments, files,
   engineering, approvals) → `activity_events`.
5. `buildOrgContext`: Recent Work Events block (last ~25).
6. `GET/POST /v1/tasks/:id/comments`; PATCH position; (optional) `GET /v1/tasks/:id/history`
   wrapping audit_events for task-scoped rows.
7. Documented-not-built: file-write endpoint (editor mode), provider diff storage.

## Part 6 — Decisions I need from you (defaults in parentheses)

1. Kanban states: **Option A** extend vocabulary with `review` + `blocked` (recommended) vs
   keep 6 statuses with a 5-column view. (Default: A)
2. Tools & MCP: one page with two sections vs two sidebar entries. (Default: one page, two
   sections — matches current sidebar label "Tools & MCP")
3. Monaco via CDN loader (no bundle cost, needs network) vs self-hosted (~5MB in build).
   (Default: CDN)
4. EA event context size: last 25 events per context build. (Default: 25)
5. Task detail as drawer-everywhere with /app/tasks/[id] as redirect (recommended) vs keeping a
   standalone detail page too. (Default: drawer + redirect)

## Part 7 — Risks

- **Volume:** 44-page migration is mechanical but wide; mitigated by the width table + doing it
  in family batches (work → people → knowledge → money → system) with per-batch sweeps.
- **DnD + SSR:** dnd-kit needs client components; the board is already client — fine.
- **Event spam:** recordWorkEvent on every PATCH could flood activity; dedupe rule: emit only on
  actual field change (compare before/after), cap details, and exclude `updatedAt`-only writes.
- **Status vocabulary change** touches executor/batch-runner assumptions (`pending` selection);
  `review`/`blocked` are terminal-for-executor states — batch runner only picks `pending`, so
  risk is contained; tests added.
- **Monaco weight:** loaded only on engineering route, CDN, lazy — no impact elsewhere.
- **SSE variability:** every live feature degrades to polling; no hard dependency.

## Part 8 — What gets reused (not rebuilt)

PageShell's error-boundary behavior (absorbed into DataBoundary), WorkBoard's chip/filter/status
logic, TaskActions/GoalActions modal forms, EmployeeWorkspace's data contract, DepartmentWorkspace
(nearly the whole thing), integrations page wholesale, engineering APIs, the entire token/console
system, use-realtime hook, EmptyState component, audit/activity tables and writers.

## Part 9 — Execution order after approval

Phase 3 (layout primitives + first 6 pilot pages) → **checkpoint: sweep + your eyes on it** →
Phase 4a/4b (Kanban + events + EA context) → 4c → Phase 5 (drawer) → Phase 6 (engineering) →
Phase 7 (company systems) → Phase 8 (QA + battery). Each phase ends with: tsc + builds + affected
tests + browser verification, committed separately (conventional commits, local-only as always).
