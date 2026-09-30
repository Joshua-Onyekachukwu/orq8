# 67 — ORQ8 Product Experience, UI/UX and Design Development Specification

**Status:** canonical. This document is the source of truth for how ORQ8 should look, behave and be built.
**Relationship to other docs:** `33_UI_UX_SYSTEM.md` (screen intent), `65_COLOR_SYSTEM.md` (colour rules and the audit behind them), `32_DEPARTMENT_UX.md` (department workspaces), `62_ORQ8_SYSTEM_AUDIT.md` (what is real in the engine), `63_COMPANY_HUB_IMPLEMENTATION_AUDIT.md` (hub build history), `66_ORQ8_MVP_MASTER.md` §66.14 (open critical-path gaps). Where this document and an older one disagree, this one wins, and the older one gets corrected.

**Hard rule of this document:** it may only describe behaviour the system can actually perform. Anything else is marked `DEPENDENCY REQUIRED` with the backend work named. Design never invents execution.

---

## Part A — Understanding and audit

### A1. What ORQ8 is

ORQ8 is an AI-native operating system for running a company with AI employees. The unit of value is not a conversation and not a task list — it is **a company that keeps operating while the founder is not looking**.

```
Founder → Executive Agent → Company → Departments → AI Employees
        → Tools + Data → Work → Decisions → Outcomes → Company Memory → (loop)
```

The product's whole job: let a founder state intent once, then watch (and occasionally steer) a real organisation carry it out under explicit authority, with every consequential action passing through the founder.

**What it must never feel like:** a chatbot, a generic SaaS dashboard, an agent marketplace, a pile of CRUD pages, a card grid with fake metrics, or an analytics tool wearing an operating-system costume.

### A2. The loop the product exists to serve

```
Founder states intent
  ↓ EA interprets and decides what must happen
  ↓ EA delegates to departments / AI employees
  ↓ Agent executes work, calling tools and reading company data
  ↓ Agent hits an authority boundary
  ↓ Founder approves, rejects or modifies
  ↓ Agent continues and finishes
  ↓ Outcome is returned to the founder
  ↓ What mattered is written to company memory
  ↓ Company is measurably more capable next time
```

Every screen in this specification is justified by a step in that loop. A screen that serves no step is a candidate for `REMOVE` or `CONSOLIDATE`.

### A3. What the system can actually do today (evidence, not optimism)

Verified by execution (`scripts/vertical-slice-e2e.ts` **44/44**, `scripts/rls-security-e2e.ts` **55 passed / 0 failed**, `scripts/auth-e2e.ts` PASS, `apps/api/test/members.integration.test.ts` **17/17**):

- Tenancy, RLS and org isolation; auth (sessions, memberships, invitations, roles, org switching).
- Departments, teams, squads, agents, authority profiles, budgets, goals and tasks as persisted, audited records.
- Approvals as records, decision audit, activity events, model routing with failure handling, the Executive Agent service, memory tables, knowledge, tools registry, MCP, jobs, health, admin surfaces.
- Marketing accents and the whole marketing site render (see the landing section of this document, which is currently mid-restoration).

**What is not yet real** — this is the part the design must respect (all four are open in `docs/66.14`):

| # | Gap | Evidence | Consequence for UI |
|---|---|---|---|
| A | An approval cannot name the work it gates | `packages/db/src/schema.ts:477` — `approvals` has `agentId`, `action` (free text), `description`, `cost`, `riskLevel`, `status`, `decisionNote`. No `task_id`, no `tool_id`, no payload. `tool-registry.ts` returns `approvalRequired: true` + `approvalId` and the caller treats the work as finished. | An approval card cannot say "this blocks task X, step Y". Approving cannot resume anything. Any UI promising resume is `DEPENDENCY REQUIRED`. |
| B | The executor never calls tools | `apps/api/src/services/task-executor.ts` contains **0** references to `executeTool` / the tool registry. | Tool badges, tool activity rows and "agent used GitHub" events cannot be produced by real work yet. |
| C | Pending tasks are never executed | `executePendingTasks` (`task-executor.ts:536`) is exported and has **no callers** anywhere in `apps`, `scripts` or `packages`. | Nothing drains the queue. "Scheduled work" and "running" states have no runtime behind them today. |
| D | Memory is written but never exercised end to end | teach → store → retrieve → use has no acceptance test. | Memory screens must not claim recall that has not been demonstrated. |

**Consequences for this specification:** the *interface architecture* can be fully specified and built (navigation, hierarchy, states, components, tokens), but four capabilities must be labelled `DEPENDENCY REQUIRED` and unlocked by backend work in the order A → C → B → D. Design of those surfaces proceeds; shipping them as "working" does not. See §D2 for the phase map.

### A4. Founder mental model

The founder thinks in **intent, and consequences**, never in entities:

| The founder is thinking | The product must answer with | Not with |
|---|---|---|
| "I have something that needs doing." | Create work (one field, EA interprets) | A task form with 12 fields |
| "Who is actually doing it?" | The agent, its department, its current work | An agent marketplace |
| "Is anything waiting on me?" | What needs me, ranked, with the decision inline | An activity feed |
| "Can this thing be trusted with my money/keys/customers?" | Authority in plain sentences + what it has done so far | Permission checkboxes |
| "What happened while I was away?" | Outcomes and exceptions since last visit | Event volume |
| "What does it still know about us?" | Decisions it remembers, and why | A vector-store browser |

Design test for any screen: **can a founder answer their question without knowing the database schema?**

### A5. Current information architecture (as built)

Sidebar areas (`apps/web/components/app-sidebar.tsx`), 45 product routes in `apps/web/app/app`:

- **Overview** — `/app`, `/app/company/overview` (Company Hub), `/app/health`, `/app/activity`
- **Direction** — `/app/strategy`, `/app/goals`, `/app/goals/[id]`, `/app/lineage`, `/app/simulation`, `/app/report`, `/app/performance`, `/app/roi`, `/app/briefings`
- **Attention** — `/app/attention` (My Attention), `/app/approvals`, `/app/decisions`, `/app/council`, `/app/jobs`
- **Organisation** — `/app/agents`, `/app/agents/[id]`, `/app/departments`, `/app/teams`, `/app/squads`, `/app/org`, `/app/engineering`, `/app/business-import`, `/app/members`
- **Work** — `/app/tasks/[id]`, `/app/files`, `/app/quality`
- **Knowledge** — `/app/knowledge`, `/app/memory`, `/app/learning`
- **Capability** — `/app/integrations`, `/app/mcp`, `/app/budgets`, `/app/usage`
- **Governance** — `/app/constitution`, `/app/audit`, `/app/profile`, `/app/notifications`
- **Admin** — 14 routes under `/app/admin` (activity, agents, ai-usage, approvals, errors, execution, health, jobs, model-router, organizations, security, settings, users)
- **Prototype** — `/dashboard-prototype` (isolated, see A7)

**Problems with the current IA:** it is entity-shaped, not intent-shaped. A founder wanting "what needs me" must choose between Attention, Approvals, Decisions, Council and Jobs. Organisation duplicates itself across Agents / Departments / Teams / Squads / Org Explorer. There are three "how are we doing" areas (Health, Performance, ROI) plus Report and Briefings. Nothing in the top level says *the company*.

### A6. Page and component inventory, with a verdict

Every page is classified `KEEP | IMPROVE | REDESIGN | CONSOLIDATE | REMOVE | MISSING` (per the mission brief). Verdicts are reasons-first; nothing is changed for novelty.

| Area | Routes | Verdict | Reason |
|---|---|---|---|
| Company Hub | `company/overview` | **KEEP / IMPROVE** | The only surface that shows the company as a system. Becomes the primary post-login destination. |
| Overview | `/app` | **CONSOLIDATE** | Overlaps the Hub. Becomes the Hub, or is removed once the Hub carries the EA. |
| Attention | `attention`, `approvals`, `decisions`, `council`, `jobs` | **CONSOLIDATE → one Attention surface** | All five answer "what needs me". One ranked queue with typed items beats five lists. |
| Direction | `strategy`, `goals`, `goals/[id]`, `lineage`, `simulation` | **KEEP / CONSOLIDATE** | Goals + strategy + lineage are one story (intent → plan → provenance). Simulation stays separate but gains a clear "nothing here is real work" label. |
| Reporting | `report`, `performance`, `roi`, `briefings`, `health` | **CONSOLIDATE** | Five surfaces for "how are we doing". Becomes Outcome/Performance + Briefings. |
| Organisation | `agents`, `agents/[id]`, `departments`, `teams`, `squads`, `org` | **KEEP / CONSOLIDATE** | Agents and their detail are core. Teams/Squads/Org Explorer are three views of one structure — pick one primary and demote the rest into it. |
| Work | `tasks/[id]`, `goals`, `files`, `quality` | **IMPROVE / MISSING list view** | There is no work index page: only `/app/goals` and a task detail. "What is running right now" has nowhere to live. **MISSING**: Work. |
| Knowledge | `knowledge`, `memory`, `learning` | **IMPROVE** | Memory is the differentiator; today it is a table. Learning belongs with memory. |
| Capability | `integrations`, `mcp`, `budgets`, `usage` | **KEEP / IMPROVE** | Tools + budgets are trust surfaces. Group as Trust & Capability. |
| Governance | `constitution`, `audit`, `profile`, `notifications` | **KEEP** | Constitution and audit are the product's conscience; keep them quiet and exact. |
| Admin | 14 routes | **KEEP** | Operator-facing, not founder-facing. Out of the founder navigation. |
| Prototype | `/dashboard-prototype` | **KEEP isolated** | Design validation only. Never redirects or replaces production. |

**Component inventory (real files) and verdicts**

| Component | Verdict | Note |
|---|---|---|
| `components/app-sidebar.tsx`, `top-bar.tsx`, `page-shell.tsx`, `settings-shell.tsx` | **REBUILD** (tokens + IA) | Shell carries the new hierarchy; behaviour (nav, collapse, command bar) survives. |
| `components/executive-agent-shell.tsx`, `executive-agent-panel.tsx`, `executive-agent-context.tsx`, `ea-progress.tsx`, `dashboard/ea-open-button.tsx`, `ea-stage-registrar.tsx` | **IMPROVE** | The EA exists and is mounted in `app/app/layout.tsx:123`. Keep the plumbing; redesign the surface and its connection to company state. |
| `components/company-hub/company-orbit.tsx` | **IMPROVE** | Must only display real relationships (see C9). No decoration. |
| `components/attention/attention-board.tsx`, `attention-badge.tsx` | **KEEP** | Becomes the single Attention surface. |
| `components/dashboard/*` (StatCards, ActivityFeed, AgentRoster, ApprovalList, HealthScore, ReliabilityWidget, ModelPerformanceWidget, ReviewPanel, GoalExecutionPanel, DepartmentActivityWidget) | **MISSING/INCONSISTENT** | Eleven small widgets with eleven dialects of card, empty state and error. Replace with the component system in §C15; keep the data contracts. |
| `components/ui/*`, `empty-state.tsx`, `loading-state.tsx`, `error-boundary.tsx`, `page-error-boundary.tsx`, `app-error-boundary.tsx`, `command-bar*.tsx`, `org-tree.tsx`, `approval-actions.tsx`, `goal-actions.tsx`, `task-actions.tsx` | **KEEP / IMPROVE** | These are the load-bearing pieces; they get tokens, states and accessibility, not replacement. |
| `components/dashboard-prototype/*` | **KEEP isolated** | Design laboratory with its own `SPEC.md`, `state/store.tsx`, `lib/simulate.ts`. Explicitly simulated — must stay labelled as such. |

### A7. Current user journeys (as they behave today)

**J1 — Founder creates work.** `/app/goals` → goal create → task rows appear → `/app/goals/[id]` shows status. Today the loop **stops here**: tasks are persisted, but nothing executes them (gap C) and no tool is invoked (gap B). *State the interface may show:* created, assigned, queued. *Must not show:* "running", "using GitHub", "thinking" — there is no runtime behind them yet.

**J2 — Founder approves something.** `/app/approvals` lists `action` + `description` + `cost` + `riskLevel` → approve/reject writes `status` + `decisionNote` + `decidedAt`. Today the approval **cannot say which work it belongs to** (gap A), and nothing resumes after approval. The honest UI: a decision record with its consequence spelled out, and a visible "resuming is not wired yet" dependency.

**J3 — Founder checks the company.** `/app/company/overview` (Hub) and `/app` both attempt this with different vocabularies; the EA is available from any `/app` page via the shell. Works as a surface; fails as a *single* answer.

**J4 — Founder hires and configures an AI employee.** `/app/agents` → `/app/agents/[id]`: role, department, authority (CAN DO / CAN SPEND / REQUIRES APPROVAL / CANNOT DO), mode (MANUAL / ASSISTED / AUTONOMOUS), budget. Real and persisted. Weakness: authority and mode read as settings, not as a control system (see C11).

**J5 — Founder reviews what happened.** `/app/activity` + `/app/audit` carry real audit events. Weakness: two feeds, no narrative, no "what changed for the company".

**J6 — New founder first run.** `/login` → `/onboarding` → `/app`. There is no designed first-hour: no company setup narrative, no first AI employee, no first piece of work, no explanation of what will happen.

### A8. Functional and design gaps (consolidated)

**MVP blockers (product cannot be honestly shown without them)**

1. Approvals cannot name or resume their work (gap A). *Blocks the single most important founder interaction.*
2. Nothing executes pending work; no queue drain (gap C) and no tool calls from the executor (gap B).
3. Memory is unproven end to end (gap D).
4. No deployed runtime: Railway project `modest-bravery` exists with `@orq8/api` + `@orq8/web` services but **zero variables and no deployments**; the local `DATABASE_URL` points at `localhost:5432`, which refuses connections. No live API anywhere.

**Important**

5. No Work index surface; running work has no home.
6. Five competing attention surfaces; five competing reporting surfaces.
7. Widget-by-widget inconsistency (eleven card dialects) and duplicated empty/loading/error handling.
8. Founder first-run experience is a form, not a guided first hour.
9. Technical detail sits at the same level as founder meaning (no progressive disclosure).

**Non-blocking**

10. Marketing landing restoration is mid-flight (How it works restored and verified class-for-class; About, Features, Testimonials, Pricing, Faqs, Cta still on the old markup).
11. Palette split between marketing (vivid accents) and product (brand teal) is unresolved — see OD-1.

### A9. UX principles (proposed, binding)

1. **Answer first, explain second, expose third.** Every surface leads with the answer; mechanism is one deliberate step deeper.
2. **The company is the subject of every sentence.** Copy names the company, department, agent and outcome — never "the system", "the model" or "the agent runtime".
3. **State is a fact, not an animation.** Never imply activity that is not happening. Simulated surfaces are labelled simulated; unwired capabilities say so.
4. **Authority is a control system.** Four verbs, plain sentences, visible consequences, always reachable from the thing being controlled.
5. **One queue for the founder's attention.** Approvals, decisions, blocked work, permission requests, failures: one ranked list, typed items, decisions inline.
6. **Progressive disclosure with a strict order:** what happened → why → what it cost → technical detail.
7. **Context travels.** Moving from company → department → agent → work → execution → decision keeps the path visible and reversible.
8. **Quiet by default, loud only for consequences.** Colour, motion and elevation are reserved for things that need a decision.
9. **Every surface has all its states** (empty, loading, working, waiting, blocked, error, failed, retrying, success, no access, offline, first run) before it is called done.
10. **Complexity is allowed underneath, never on the surface.** If a founder needs the schema to read a screen, the screen is wrong.

### A10. Proposed information architecture

Seven top-level areas, each answering a founder question. Everything else becomes context or lives inside one of them.

| Area | Question it answers | Contains | Absorbs |
|---|---|---|---|
| **Company** | What is my company doing right now? | Company Hub (C8), briefings, health as a signal not a page | `/app`, `/app/health`, `/app/briefings` |
| **Work** | What is being done, by whom, and what happened? | Work index, work detail, goals, lineage, files, quality | `/app/goals` (list), new Work index |
| **Attention** | What needs me? | One ranked queue: approvals, decisions, blocked, permission, budget, failure | `/app/attention`, `/app/approvals`, `/app/decisions`, `/app/council`, `/app/jobs` |
| **Organisation** | Who works here and what are they responsible for? | AI employees (list + detail), departments as workspaces, structure | `/app/agents`, `/app/departments`, `/app/teams`, `/app/squads`, `/app/org`, `/app/members` |
| **Knowledge** | What does ORQ8 know, and why? | Company memory, decisions remembered, knowledge, learning | `/app/memory`, `/app/knowledge`, `/app/learning` |
| **Capability** | What can it do, spend, and reach? | Integrations, tools & MCP, budgets, usage, authority reference | `/app/integrations`, `/app/mcp`, `/app/budgets`, `/app/usage` |
| **Governance** | How is it controlled and recorded? | Constitution, audit trail, outcome reporting, settings | `/app/constitution`, `/app/audit`, `/app/report`, `/app/performance`, `/app/roi`, `/app/profile`, `/app/notifications`, `/app/settings` |

The Executive Agent is **not** an eighth area — it is persistent, one gesture away from everywhere (§C9). Admin stays out of the founder navigation entirely.

### A11. The question: if we deleted every screen, what would we build?

**A single operating surface with three layers, and nothing else on the top level.**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Company name · what changed since you last looked · [Ask the EA]        │
├───────────────────────────────────────────┬──────────────────────────────┤
│  1. WHAT NEEDS ME                         │   EXECUTIVE AGENT            │
│     one ranked queue, decision inline     │   persistent, always present │
│                                           │   answers with company state │
│  2. WHAT IS HAPPENING                     │   "what's happening with     │
│     live work grouped by department,      │    marketing?" → marketing   │
│     agent, state; latest outcome first    │    work, agents, blockers    │
│                                           │                              │
│  3. HOW ARE WE DOING                      │   always: mode, authority,   │
│     outcomes and exceptions over time,    │   what it just did, what it  │
│     never vanity counts                   │   is waiting for             │
└───────────────────────────────────────────┴──────────────────────────────┘
```

Everything else — departments, agents, memory, tools, constitution, audit — is reachable **from within** these three layers, preserving context, rather than being a destination a founder must remember. That is the whole argument of this document: ORQ8's top level is not a menu of modules, it is the company's current condition plus the agent that runs it.

---

## Part B — The specification

### B1. Design direction and brand rules

**Philosophy:** simple enough to understand immediately, powerful enough to operate a company. Calm, technical, human, operational, premium, trustworthy, distinctive. Not neon, not futuristic for its own sake, not a ChatGPT clone, not 2012 enterprise, not a gradient showcase.

The product palette is the ORQ8 brand system (`docs/65_COLOR_SYSTEM.md`), and it is already implemented as tokens in `apps/web/app/globals.css`:

| Role | Value | Token (as built) | Used for |
|---|---|---|---|
| Brand deep | `#356267` | `--orq-brand-deep` / `bg-brand-deep` | Primary actions, brand structure, marks on light |
| Brand primary | `#41737C` | `--orq-brand` / `bg-brand` | Hover/active step of brand |
| Pale cyan | `#C2F2F2` | `--orq-ink-accent` / `text-ink-accent` | Selected/contextual state, accents inside the ink band |
| Soft mint | `#EFFEFB` | `--orq-brand-tint` / `bg-surface-marketing` | Main page environment (marketing); brand tint wash in product |
| White | `#FFFFFF` | `--orq-surface-white` / `bg-surface-white` | All content surfaces |
| Black | `#000000` | `--orq-ink` / `.ink` band | Structural bands: hero, major CTA, footer, hub canvas, auth |
| Warm peach | `#F1C095` | `--orq-warm` / `text-warm-ink` | Attention, waiting, needs-you |
| Error | `#D55053` | `--orq-error` / `text-error-ink` | Errors and destructive only, never decoration |

**Banned in the product:** lime, purple, violet, neon green, rainbow or generic blue AI gradients, random greens, glassmorphism as a style. Colour carries meaning or it does not ship.

**OD-1 (open decision, blocks the landing restoration):** the marketing landing currently carries vivid accents (`--orq-accent-lime #B8FF66`, `--orq-accent-orange #E86A33`, added while restoring the founder's pre-revert design), while this specification bans lime in the product. Either marketing keeps a documented two-token exception, or the landing moves onto the brand palette above. This must be decided before the landing restoration continues, because it changes the accent classes in every restored section.

### B2. Design tokens

Tokens live in `globals.css` as `@theme` + `@theme inline` aliases. Components use semantic names only; hardcoded hex outside the token file is a review failure (this is already enforced by `scripts/color-contrast-audit.ts` and the audit must stay green).

- **Colour:** as B1, plus surfaces `--orq-surface-page | -white | -secondary | -tint`, text `--orq-text-primary | -secondary | -warm | -brand`, borders `--orq-border | -soft | -strong` (exposed as `border-hairline*`), interactive `--orq-focus-ring`, status and mark tokens (`--orq-mark-active | -warm | -brand`), and the `.ink` scope that inverts the system inside black bands.
- **Typography:** `--font-sans` (Inter), `--font-display` (Fraunces, headlines only), `--font-mono` (JetBrains Mono, numbers/IDs/technical). Scale pairs existing Tailwind sizes with the custom tokens `.text-2xs` (9), `.text-3xs` (10), `.text-overline` (11), `.text-2sm` (13), `.text-md` (15). Sentence case everywhere; no decorative type.
- **Spacing:** 4 / 8 / 12 / 16 / 24 / 32. Radii: 6 (controls), 10 (cards), 14 (panels), 20 (feature surfaces), full (pills). Borders: hairline 1px in `--orq-border`; the ink band uses white at 6–8%.
- **Elevation:** one shadow scale, `--orq-shadow-sm | -md | -lg`; elevation means "above the page", never decoration.
- **Motion:** durations 120/180/240/320ms, easing standard `cubic-bezier(0.16, 1, 0.3, 1)`. Every animation has a `prefers-reduced-motion` kill switch (the pattern already used by `.reveal-out/.reveal-in` and the tree animations).
- **Z-index:** base 0, sticky bar 20, drawer 40, modal 50, toast 60, EA panel 45, command menu 70. Documented in one place, never invented per component.

### B3. Component architecture

The required system, mapped to what exists (reuse first — do not rebuild what works):

| Component | Status | Contract |
|---|---|---|
| `ORQ8Brand` | exists (`components/branding/logo-mark.tsx`) | The single lockup. Wordmark follows `currentColor`; mark takes `dotColor`. No second lockup, no raster logos (brand gate enforces). |
| `AppShell` (`AppSidebar` + `TopBar` + `PageShell`) | exists, **rebuild tokens/IA** | Owns navigation, company context, EA entry, command bar. |
| `WorkspaceSwitcher` / `CompanyContext` | missing | Shows active company + org switch; today `/v1/org/switch` exists server-side with no UI. |
| `EAEntry` / `ExecutiveAgentPanel` / `EAStage` | exists (`executive-agent-shell.tsx`, `executive-agent-panel.tsx`, `ea-progress.tsx`) | Persistent EA: collapsed entry, expanded panel, progress stages. |
| `CompanyHub` / `DepartmentNode` / `AgentNode` | partial (`company-hub/company-orbit.tsx`) | Structure views that display **only real relationships and real state**. |
| `WorkItem` / `WorkIndex` / `StatusIndicator` | missing / scattered | One work row: what, who, state, cost, needs-you flag. |
| `AttentionItem` / `ApprovalCard` / `DecisionCard` | partial (`attention/attention-board.tsx`, `approval-actions.tsx`) | Typed attention items with inline decision; approval card carries subject, scope, cost, risk, consequence. |
| `AuthorityControl` / `ModeControl` / `PermissionControl` | missing (settings-shaped today) | Four authority verbs and three modes as first-class controls with consequences. |
| `MemoryItem` / `ActivityItem` / `ToolConnection` | missing / scattered | Memory with provenance and currency; activity as operational narrative; tool with scope and authority. |
| `Button` `Input` `Select` `Field` `Modal` `Drawer` `CommandMenu` `Toast` `EmptyState` `LoadingState` `ErrorState` `Skeleton` `Badge` `Panel` `Table` `Tabs` | partial (`components/ui/*`, `empty-state.tsx`, `loading-state.tsx`, `error-boundary.tsx`) | One implementation per interaction; variants by intent, never by page. |

Rule: a page may compose these; a page may not invent a new visual dialect for an interaction that already exists.

### B4. Navigation architecture

- **Global:** the seven areas of A10 in a fixed order — Company, Work, Attention, Organisation, Knowledge, Capability, Governance. Attention carries a count when non-zero; nothing else does.
- **Contextual:** every entity page (department, agent, work item, memory record) exposes its neighbours inline — department → its agents → its work; agent → its department, its work, its authority, its last outcomes. This is how a founder moves without the sidebar.
- **Persistent:** the Executive Agent is available on every product screen (panel on desktop, full-height sheet on mobile) and inherits the current context ("what's happening with **this**?").
- **Hidden until needed:** admin, budget internals, model routing, raw audit detail, MCP transport detail.
- **Never:** a menu entry per database table; two routes answering the same founder question.

### B5. Dashboard architecture

The Company Hub occupies ~75% of the workspace; the EA occupies ~25% and is permanent. The hub answers, in this order: **(1) what needs me** (top of column, most urgent first), **(2) what is happening** (live work grouped by department and state), **(3) how are we doing** (latest outcomes and exceptions, not vanity counts). The EA's column always shows four facts: its mode, the authority digest, its most recent action, and what it is waiting for.

This layout is retained from the current direction; the audit found no better model for "company condition + persistent operator", and the failure mode it must avoid is decoration (structure views that show nothing true).

### B6. Executive Agent experience

The EA is the operational intelligence layer, not a chat box. It must be able to state: what it understood, what it decided, what it delegated, what it is doing, what is waiting, what is blocked, what completed, what changed, what it recommends, and what it needs from the founder.

Answer pattern (binding): **answer → evidence → offer → consequence.** "Marketing has 3 pieces of work; one is waiting for your approval to publish; the other two are drafts." followed by inline links into live work, then the action buttons. Every EA claim about company state must link to the record that proves it; if no record exists, the EA says it does not know (never a confident invention).

### B7. Department experience

A department is a workspace, not a row: its agents, its current work, its budget against spend, its authorities, its recent outcomes, and its blockers — one scroll, no tab hunting. Managed access (founder/admin only) is visually distinct from operating access.

### B8. AI employee lifecycle

Hire → configure (role, remit, department) → authority → mode → tools → budget → first work → monitor → review → pause/resume → edit → retire. The agent detail page must answer the six founder questions in A4 within the first screen: what it does, what it can do, what it cannot, what it is working on, what it can reach, what needs the founder. Authority and mode are shown as a control panel with plain-language consequences, not as settings checkboxes; changing either shows what changes about future work.

### B9. Work experience

**Work index (new, `MISSING`):** every item of work with state, owner agent, department, cost, and needs-you flag; grouped by state (Needs you / Running / Waiting / Blocked / Recently completed); filterable by department and agent.

**States (real):** `CREATED`, `ASSIGNED`, `RUNNING`, `WAITING`, `BLOCKED`, `REVIEW`, `COMPLETED`, `FAILED`, `RETRYING`. Each has a distinct visual weight and a one-line explanation of what happens next. Today only a subset can be honestly shown, because nothing executes work (gaps B/C): `RUNNING`, `RETRYING` and tool activity are `DEPENDENCY REQUIRED` until the executor and queue drain land.

**Work detail:** the outcome first; then the plan; then the execution timeline (model calls, tool calls, costs) as evidence; then provenance (which goal, which decision, which memory). Never show activity that did not happen.

### B10. Approval and decision experience

An approval card must answer: **what it gates** (the work and the step), **what it costs**, **what the risk is**, **what happens if I approve**, **what happens if I reject**, and **who asked**. Decision is inline (approve / reject / modify with a note), and the founder's note is captured as the decision record's reasoning.

`DEPENDENCY REQUIRED` — today the `approvals` row (`packages/db/src/schema.ts:477`) has only `agentId`, `action` (free text), `description`, `cost`, `risk_level`, `status`, `decision_note`. To make this card truthful, add `task_id`, `tool_id` and a structured `payload` (what exactly will be done), plus the resume path: approval flips the gated work back to `RUNNING`, rejection writes a terminal reason and stops it. Until then the UI states plainly that approving records a decision and does not yet resume execution.

### B11. Company memory experience

Memory is shown as human knowledge, not a vector browser: what ORQ8 remembers, why, where it came from (source record), who can use it, and whether it is current. Decisions, outcomes and founder preferences are the three most valuable memories; they get the top of the surface. Stale or superseded memory is visibly marked, never silently used. `DEPENDENCY REQUIRED` — recall must be demonstrated end to end (gap D) before any "ORQ8 remembered and used this" claim ships.

### B12. Tools and integrations

One surface per capability, showing: what it is, what it can reach (scopes), which agents may use it, whether it needs approval, its last call, and its failure state. Credentials are never displayed. A tool that has never been called says so. Secrets are configured once per company, and a tool that requires approval shows which authority rule triggers it.

### B13. Activity and audit

Two layers, one story. **Activity** is operational narrative in the founder's language: "EA created work", "agent requested approval", "founder approved", "work completed", "decision recorded", "memory updated", "execution failed". **Audit** is the immutable record with actor, entity, before/after and timestamp, linked from every activity row. Volume is never the point; significance is.

### B14. Notifications and attention

One ranked queue, typed: approval, decision, blocked work, permission request, budget request, failure, mention. Ranking: blocking + cost + age. Each item carries its decision inline; ignoring an item is a deliberate act (snooze with a reason), never a silent decay. Notifications outside the app are summaries of attention, never a parallel queue.

### B15. State architecture (binding on every screen)

Every surface defines: **empty** (what it is, what to do first), **loading** (skeleton in the final shape, no spinners over content), **working** (only when the backend is truly executing), **waiting** (what it waits for, who unblocks it), **blocked** (the blocker and the escape), **error** (what failed, what to do, a retry that is safe to press), **failed** (terminal, with the reason preserved), **retrying** (attempt n, next attempt), **success** (the outcome, not a checkmark), **approval required**, **permission required**, **no access** (who can grant it), **offline/stale** (data age, last successful read), **first run**.

Copy rules: sentence case; name the subject; state the consequence; never "Something went wrong"; never blame the founder; never expose a raw provider error without a human sentence and a details disclosure.

### B16. Responsive behaviour

Desktop ≥1280: hub + EA side by side. Laptop 1024–1279: EA becomes a docked panel that can overlay. Tablet 768–1023: EA is a bottom sheet; navigation collapses to an icon rail with labels on demand. Mobile <768: single column; navigation is a sheet; work rows become stacked cards; approvals are full-screen decisions with the consequence text above the buttons (thumb-reachable). Nothing important may exist only on hover, and nothing may require horizontal scrolling.

### B17. Accessibility

Keyboard: every action reachable, visible focus from `--orq-focus-ring`, escape closes overlays, focus returns to the trigger, `Cmd/Ctrl+K` opens the command menu. Semantics: real landmarks, `aria-live` for state changes (the repo already uses `role="status"`/`role="alert"`), state never communicated by colour alone (icon + text + shape). Contrast: AA minimum, audited by `scripts/color-contrast-audit.ts` on every token pair, including inside the ink band. Motion: honours `prefers-reduced-motion`. Targets: 44px minimum on touch. Forms: labels, `autoComplete`, `type=tel` for phone, errors tied to inputs by `aria-describedby`.

### B18. Motion

Motion explains state: opening/closing (180–240ms), state change (240ms), navigation (120ms), attention (one pulse, once), feedback (immediate, ≤120ms). Banned: perpetual floating, orbiting nodes, particles, glow cycles, anything whose purpose is "look AI". If a motion cannot name the state change it communicates, it is removed.

### B19. Page specifications

Core loop pages are specified in full; the remainder are specified as deltas. Template fields: Purpose · User · Primary action · Secondary · IA order · Components · States · Interactions · Data · API · Permissions · Responsive · A11y · Acceptance criteria.

**P1 — Company Hub (`/app`), absorbs `/app/health` and `/app/briefings`**
Purpose: the company's condition and the EA's presence. User: the founder. Primary: act on the most urgent item. Secondary: ask the EA, open a department, read the latest outcome. IA: (1) what changed since last visit, (2) needs you, (3) live work by department/state, (4) latest outcomes and exceptions, (5) EA column. Components: `CompanyContext`, `AttentionItem[]`, `WorkItem[]`, `DepartmentNode`, `ExecutiveAgentPanel`, `EmptyState`. States: first run (no company activity), quiet (nothing needs you), blocked, stale data, EA unavailable. Interactions: click a work item → work detail with context preserved; approve inline; ask the EA. Data: `activity_events`, `tasks`, `goals`, `approvals`, `agents`, `departments`, org budget. API: existing reads + attention aggregate. Permissions: founder/admin; members see a scoped company view. Responsive: per B16. A11y: per B17. Acceptance: a founder can answer "what needs me" and "what is happening" without scrolling past the first screen on desktop.

**P2 — Attention (`/app/attention`)**
Purpose: one queue for everything that needs the founder. Primary: decide. Secondary: snooze with a reason, open the subject. IA: ranked list, typed, with the consequence text on the card. Components: `AttentionItem`, `ApprovalCard`, `DecisionCard`. States: empty ("nothing needs you"), waiting-for-backend (approvals that cannot resume — labelled). Data/API: approvals, decisions, blocked work, budget requests, failed executions. Acceptance: every item type traces to a real record; decisions are captured with the founder's note.

**P3 — Work (`/app/work`, new) and Work detail (`/app/work/[id]`)**
Purpose: what is being done and what happened. Primary: understand status; unblock. IA per B9. Components: `WorkIndex`, `WorkItem`, `StatusIndicator`, `Timeline`. States: all of B9, with unwired states labelled. Dependencies: gaps B and C for `RUNNING`, tool activity and retries. Acceptance: no state is displayed that the backend cannot produce; detail shows outcome before mechanism.

**P4 — AI Employees (`/app/agents`, `/app/agents/[id]`)**
Purpose: the workforce and one employee in full. Primary (list): hire or inspect. Primary (detail): change what this employee may do, or give it work. IA: identity and remit → authority panel → mode → tools → budget → current work → recent outcomes → history. Components: `AgentNode`, `AuthorityControl`, `ModeControl`, `ToolConnection`, `WorkItem`. States: offline, paused, no work yet, waiting on approval, blocked. Data: `agents`, authority, budgets, `tasks`. Acceptance: the six A4 questions are answerable from the first screen; changing authority shows its consequence before saving.

**P5 — Departments (`/app/departments`)**
As B7. Acceptance: budget vs spend and blockers are visible without navigation.

**P6 — Memory (`/app/memory`)**
As B11. Acceptance: every memory shows provenance and currency; no claim of recall that is not demonstrated.

**P7 — Capability (`/app/integrations`, `/app/mcp`, `/app/budgets`, `/app/usage`)**
As B12, plus spend against budget with the founder's thresholds visible. Acceptance: no credential is ever rendered; a never-called tool says so.

**P8 — Governance (`/app/constitution`, `/app/audit`)**
Purpose: the rules and the record. Primary: verify what happened. IA: rules by category → recent amendments; audit: filter by actor/entity/time with a linked activity narrative. Acceptance: every audit row links back to the activity that produced it.

**P9 — First run (`/onboarding`)**
Purpose: a founder's first hour. Sequence: what ORQ8 is (one screen, no marketing) → name the company → the first AI employee (with its authority and mode explained in place) → the first piece of work → "here is what will happen next". Acceptance: a new founder reaches first work in under two minutes and can state what will happen without help.

**P10 — Settings, profile, notifications**
As they are, re-tokened and reorganised under Governance. Acceptance: no settings screen exposes a concept that does not exist in the product.

**Remaining routes** (`strategy`, `goals`, `goals/[id]`, `lineage`, `simulation`, `report`, `performance`, `roi`, `files`, `quality`, `knowledge`, `learning`, `teams`, `squads`, `org`, `engineering`, `business-import`, `members`, `decisions`, `council`, `jobs`, `profile`, `notifications`, `admin/*`): each is `KEEP` and re-tokened under B2/B3, then moved into its A10 area. `simulation` is labelled simulated in its own header. `dashboard-prototype` stays isolated and unlinked from founder navigation.

### B20. Backend and data dependencies

| UI capability | Needs | Status |
|---|---|---|
| Approval card naming its work + resume on approve | `approvals.task_id`, `approvals.tool_id`, structured payload; approval → work state transition | **BLOCKER (gap A)** |
| Work states `RUNNING` / `RETRYING`, retry UI | queue drain (`executePendingTasks` callers), worker runtime | **BLOCKER (gap C)** |
| Tool activity, tool authority enforcement in execution | executor → tool registry wiring | **BLOCKER (gap B)** |
| "ORQ8 remembered and used this" | memory teach→store→retrieve→use acceptance test | **BLOCKER (gap D)** |
| Anything at all in production | Railway env vars + deploy; production `DATABASE_URL` (Supabase project `gttkaxbcdtpsusmconxm.supabase.co` is alive; local URL points at a dead localhost) | **BLOCKER (founder action)** |
| Company/EA live state | existing reads (`activity_events`, `tasks`, `agents`, budgets) | available |
| Org switching UI | `POST /v1/org/switch` + `sessions.switchOrg` | server ready, UI missing |
| Working agent "thinking" progress | EA progress stages (`ea-progress.tsx`) | partial — must not over-claim |

### B21. Design-to-development roadmap

1. **Phase 0 — truths first (no UI).** Close gaps A → C → B → D so states mean something; land a production runtime (Railway vars + deploy) so anything can be verified live. Design work continues in parallel on paper only.
2. **Phase 1 — tokens and shell.** Freeze B1/B2, rebuild `AppShell` navigation to A10, add `WorkspaceSwitcher`, keep behaviour. Green: contrast audit, brand audit, typecheck, existing tests.
3. **Phase 2 — Attention + Company Hub.** The two surfaces the founder lives in, with real data and every state in B15. This is the moment the product starts feeling like an operating system.
4. **Phase 3 — Work index + work detail**, gated behind the executor work from Phase 0.
5. **Phase 4 — AI employee + department experiences** (authority as control panel).
6. **Phase 5 — Memory and activity narrative**, gated behind memory acceptance.
7. **Phase 6 — Capability + governance re-tokening**, first-run experience.
8. **Phase 7 — responsive, accessibility and motion passes**, then QA against B22.

Each phase ships behind the existing gates (typecheck, 47+ API tests, RLS suite, brand audit, contrast audit, proof runner) and never breaks working functionality to look better.

### B22. QA and acceptance checklist

Per screen: does it answer its founder question in one screen? Are all B15 states implemented with real copy? Is every state traceable to a backend fact? Does colour carry meaning? Keyboard-only pass? Contrast audit green? Empty and first-run as designed? Context preserved on entry and exit? Mobile behaviour per B16? No hardcoded hex? Per feature: does it survive the eight quality bar questions in §39 (simplicity, clarity, control, trust, efficiency, consistency, distinctiveness, scalability, accessibility, implementability)?

### B23. Definition of done

The experience is done when a founder can, without help: open ORQ8 and see what needs them; approve or reject with the consequence understood before they click; see live work and what happened to it; understand what each AI employee may and may not do; read what the company remembers and why; trace any outcome back to the decision that caused it; and trust the system because nothing in the interface claims more than the system did.

### B24. Post-MVP design opportunities

Voice input for intent (docs/31); an engineering workspace that shows real diffs (docs/29/30); simulation as a first-class "rehearse the quarter" tool (docs/41); board-grade outcome reporting (docs/40); a mobile attention app that is decisions-only; department-level autonomy dials; and a founder-facing "what would ORQ8 do next" forecast once memory recall is demonstrated.

### B25. Open decisions

- **OD-1** — palette split: keep vivid marketing accents (`accent-lime`/`accent-orange`) as a documented marketing-only exception, or move the landing onto the brand palette. Blocks the landing restoration (About, Features, Testimonials, Pricing, Faqs, Cta still on old markup).
- **OD-2** — approvals schema: accept the additive `task_id` / `tool_id` / `payload` migration (required for a truthful approval card).
- **OD-3** — provider priority: **RESOLVED** — OpenRouter is primary, NVIDIA NIM is the first fallback, LiteLLM/Ollama are development-only. Recorded in docs/22.9; enforced by `PROVIDER_PRIORITY` in `services/model-router.ts`.
- **OD-4** — how much of the 45 product routes collapse in Phase 1 (this document proposes five consolidations; each is a founder-visible IA change).
- **OD-5** — whether `/app` and `/app/company/overview` become one Company Hub, or the Hub becomes the only one and `/app` redirects.
