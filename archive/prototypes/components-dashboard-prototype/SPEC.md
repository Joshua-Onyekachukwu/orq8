# Dashboard prototype — task record

Internal implementation record for the ORQ8 dashboard concept prototype. This is not a
specification for production; it is the checklist this prototype is built and verified against.

## Objective

Design and build an isolated, fully interactive prototype of a new ORQ8 dashboard that makes the
operating centre of an AI-run company understandable at a glance: founder on top, Executive Agent
coordinating, departments organising, AI employees executing, the founder handling decisions and
approvals.

The prototype exists to be **opened, used and judged**. It is a product-validation artefact.

## Non-negotiable constraints

1. The current dashboard is production code and is not modified, replaced, redirected, refactored
   or deleted. No shared component is changed to make the prototype easier.
2. The prototype lives on its own route and depends on nothing but the design tokens, the root
   layout and the prototype folder itself.
3. Dummy data is clearly dummy and cannot be mistaken for the user's company.
4. Simulation logic is isolated from production services and explicitly marked as simulated. No
   production API, database or agent path is called.
5. No migration into production. Approval comes first.

## Route

`/dashboard-prototype` (`apps/web/app/dashboard-prototype/page.tsx`).

Properties: outside `/app` and outside the `(landing)` group, so it inherits only the root layout;
not listed in `middleware.ts` `PROTECTED_ROUTES` or `ADMIN_ROUTES`; `robots: noindex`; a visible
prototype banner links back to the real dashboard.

## Structure

```
COMPANY (founder's view of the whole)
   ↓
EXECUTIVE AGENT (coordination layer)
   ↓
DEPARTMENTS
   ↓
AI EMPLOYEES
   ↓
WORK → OUTCOMES / DECISIONS / MEMORY
```

Desktop layout is 3/4 operating hub + 1/4 persistent Executive Agent panel.

## Required content

| Area | Requirement |
| --- | --- |
| Company state | operating state, departments, AI employees, active work, awaiting approval, blocked, completed today, credits |
| Founder attention | prominent, actionable, not hidden, not overwhelming |
| Active work | department, AI employee, task, status, meaningful progress, origin |
| Organization | EA at the centre, departments around it, employees under departments, work under employees |
| Priorities | concise, with owner and progress |
| Activity | operational stream tied to company operations, not chat or notifications |
| Memory | lightweight intelligence summary with deeper access |
| Metrics | supporting only, never overpowering the organization |
| Executive Agent | persistent, conversation, company context, quick asks |
| Quick actions | hire AI employee, add department, create work, connect tool, review approvals, ask the EA |

## Interactions

1. Select a department → detail drawer, organization highlight.
2. Select an AI employee → detail drawer with status, mode, authority and current work.
3. Select a work item → detail drawer with origin, progress, blocker.
4. Select an attention item → approval interface with approve / reject / ask the EA.
5. Send an EA message → simulated response plus a visual state change (highlight, filter, drawer).
6. Add a department → appears in the organization and the counts.
7. Hire an AI employee → appears under its department.
8. Create work → appears in the department's lane and in the work list.
9. Keyboard: every selectable node is a real button with a visible focus ring.

## Data architecture

One data layer, no dummy objects inside components:

```
components/dashboard-prototype/
├── types.ts                 status/authority/mode vocabulary + entity types
├── data/company.ts          company profile, memory, priorities, credit budget
├── data/org.ts              departments, AI employees
├── data/operations.ts       work, attention queue, activity stream
├── state/store.tsx          reducer + context, derives every count from the data
└── lib/simulate.ts          deterministic EA intents and their effects
```

Counts on screen are **derived from the arrays**, so hiring and adding departments change the
numbers the way the real product would. Replacing this folder with real ORQ8 state is the intended
migration path.

## Visual requirements

- Only the ORQ8 token system. No hex value in a component.
- Teal is a minority of the screen. The Executive Agent band is the main brand moment.
- Departments are distinguished by structure, icon and typography, never by colour.
- Status is always glyph plus word plus colour.
- Not everything is a card: the hub is built from sections, hairline rules, open space and a small
  number of meaningful containers (attention, EA panel, drawers).
- Supporting information sits below the fold of the hierarchy, in quieter type.

## Responsive

- ≥1280: 3/4 + 1/4, EA pinned.
- 1024–1279: hub full width, EA as a docked panel toggled from the header.
- <1024: EA as a full-height drawer; organization becomes a scrollable stack; attention stays
  first; all targets ≥ 40px.

## Verification record

Each phase was checked before the next one started.

| Check | Evidence |
| --- | --- |
| Route opens, protected dashboard untouched | `/dashboard-prototype` renders; `/app` still served by the same files (its diff contains no prototype reference) |
| Isolation | prototype imports only `react`, `lucide-react`, `next/link` and the brand mark; no `fetch`, no API, no Supabase, no storage, no `/api/` path |
| Data-driven organization | hiring and adding departments change every count from the arrays (24 → 25 employees, 7 → 8 departments, 12 → 13 work items) |
| Department, agent and work selection | drawer opens, `aria-pressed` set, hub dims everything outside the selection, banner names the highlight |
| Approval flow | Approve removed the escalation, unblocked the work, reopened the owner, dropped "awaiting you" 4 → 3, wrote an activity entry and a memory decision, and the Executive Agent acknowledged it |
| EA conversation → board | "What is Engineering working on?" highlighted Engineering and its five employees; "Show me blocked work" filtered work to Blocked; "Create a legal department" added the department and highlighted it |
| Add department, hire, create work, connect tool | all four mutate the board and log what they did; creating work in an empty department is refused with a reason |
| Status vocabulary | eight statuses, four authorities, three modes, each glyph + word + colour |
| Contrast | `pnpm exec tsx scripts/color-contrast-audit.ts` → pass, every required pair |
| Types | `pnpm --filter @orq8/web exec tsc --noEmit` clean |
| Console | after a clean reload, one React DevTools info line and no errors or warnings |
| Browser review | 1600, 1440, 1280, 1100, 834, 390, 320 |
| Reduced motion | EA delay drops to 0, scrolling becomes instant, no looping animation (`motion-safe:` on the one pulse) |

### Defects found in review and fixed

1. A work item with 100 steps rendered 100 segments and blew out the row; `Steps` now draws one
   proportional bar above eight units.
2. The work strip scrolled horizontally and cut the last figure mid-word; it reflows as a grid now.
3. Between 1024 and 1279 there was no way into the Executive Agent panel or out of the drawer (the
   trigger and the close button used `lg:` while the layout switch is `xl:`).
4. The hire dialog kept a stale department, so hiring from a department panel could land the
   employee in another department.
5. The activity stream lower-cased work titles.
6. Departments hid a blocked employee behind "+N more"; whoever needs a human now sorts first.
7. The EA panel could be left on "Reading the board" because the panel dispatched the question
   without the answer scheduler.
8. A nowrap title set the min-content of the priorities column and pushed the whole page sideways
   at 320px.

### Not machine-verified

Keyboard focus rings are declared with `focus-visible:` on every interactive element, and Tab moves
focus through the board in document order, but Chromium under synthetic key input reported
`:focus-visible` as false, so the ring could not be observed in the harness. Escape closing the
dialog and the drawer was verified with real key events.

## Definition of done

The 26 points in the original brief, plus: the reviewer can open one URL, understand the concept in
under a minute, break the data without breaking the UI, and see exactly which parts are simulated.
