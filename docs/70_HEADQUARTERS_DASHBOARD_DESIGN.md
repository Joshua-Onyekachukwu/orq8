# 70 — Headquarters dashboard redesign (dark mission control)

Status: **PLAN — approved direction, not yet built.** Source of truth for the
Headquarters redesign. When implementation starts, status rows move into
`docs/68_REQUIREMENT_MATRIX.md` and this document describes the design contract.

Updated 2026-09-30. Reference material: 8 founder-supplied screenshots
(hero canvas state, working state, default-model modal, approval modal,
employee drawer, tasks kanban, and two live-run states) + 1 agent-node
popover screenshot. **Founder decision (2026-09-30): the product must NOT
visually clone the reference** — see §1a "ORQ8-native translation rule".
Founder decisions: dark app shell + light marketing, build mock-first, unbuilt
features render as "coming soon" stubs, more reference material is coming —
this plan must absorb it.

---

## 1a. ORQ8-native translation rule (anti-plagiarism, founder-directed)

The references define the **interaction model and standard of quality**, never
the visual identity. Concretely, when building any ORQ8 surface:

1. **Take the flow, not the look.** Persistent EA beside the work, live state
   on one screen, founder attention surfaced, dense-but-calm — yes. Their
   colors, logos, crowns, graph-paper texture, component chrome, and branded
   microcopy — never.
2. **Use ORQ8's own design system** (docs/71 §V): `#0B0F14` base, lime/orange
   accents, hairline cards, Inter + JetBrains Mono, 11px caps micro-labels.
3. **Use ORQ8's own concepts and words:** Atlas (EA), Work Credits,
   authority bands (May do / Spend cap / Needs approval / Forbidden),
   departments, goals. If a reference term has no ORQ8 equivalent
   ("crown", "PRO chips", "sell this business"), it does not ship.
4. **When in doubt, redesign from the data**: draw the component from the
   real fields it must show (authority profile, approval payload, credit
   ledger), not from the screenshot.

Mocks: v1 (`marketing/headquarters-mock.html`) explored the reference-faithful
look; **v2 (`marketing/headquarters-mock-v2.html`) is the ORQ8-native baseline**
— sidebar shell, lime/orange system, in one clickable file. **v2 now covers the
full page set (14 screens):** dashboard, tasks kanban (+ task detail with live
log), employee drawer, default-model modal, plan (revision rail + ratify banner
+ diff view), approvals (open/decided tabs, trigger chips, export, "silence is
never consent" banner), goals (expandable rows + lineage breadcrumbs + step
chips), audit trail (expandable JSON rows, fixed vocabulary, filters, export),
team (7-employee cards), org chart (founder → Atlas → departments → employees),
budgets (per-goal/per-employee meters, warn ticks, PAUSED-at-exhaustion case),
finance (real-money-only empty state), memory (typed entries + recall counts +
detail pane), briefings (weekly report card + acknowledgement sign-off),
integrations (permissions-map cards: scopes, used-by, approval-required), and
settings (workspace / authority defaults / notification matrix / pause-org
danger zone). v2 supersedes v1 as the visual spec for implementation.

## 1. What the reference design is

A dark "mission control" built on one metaphor: **the whole company is a single
room.** The founder never hunts through pages for state — state comes to them —
and the lead agent's work is a *conversation with cards*, not a chat log.

Five zones, one screen:

1. **App frame** — org switcher with a live company status badge
   (`NEEDS APPROVAL` ↔ `LIVE`), a second nav row (Headquarters / Site / Plan,
   then Tasks / Files / Inbox / Ads / Finance / Settings with `PRO` chips), a
   business-level **Pause** switch, and a **daily usage meter** top-right.
   Control is always visible.
2. **Left rail = state summary** — TODO LIST (what the lead needs *from the
   founder*: "Hire employee — AI systems architect", with counts),
   LATEST TASKS with instructive empty states ("No tasks yet — ask the lead to
   create one"), INTEGRATIONS, GROWTH (Ads / Finance / Site status).
3. **Center = the org canvas** — dotted grid, agents as nodes. The lead wears a
   crown; the ring is **gold while working**, **purple with a red count when
   approvals wait**, dimmed when idle. The top banner **morphs**: "2 actions
   need your approval → Review" becomes "CTO is working → View live chat".
   Beneath it: **LIVE ACTIVITY**, a terminal feed
   (`[21:41:25] TOOL — CTO: Check team status`).
4. **Right rail = the lead's chat, the cockpit** — not plain messages but event
   cards: *Finished thinking / View thoughts*, *Terminal* with the real
   command, *Read media* with the path, *Update business plan (v2) / View
   plan*, inline **approval cards** (Review / Approve / Auto-approve all), a
   green **Active task** card with *Thinking… / Open task*, and a composer with
   model picker + `/` commands.
5. **Modals & board** — Default-model picker ("our picks", Smartest vs
   Cheapest, model grid with intelligence/price dots), an **Assign-task
   approval modal** (ASSIGN TO / TASK / GOAL / SCOPE, Reject/Approve), an
   **employee drawer** (Rename/Fire, preferred model, ability toggles like
   Code Access, recent work), and a Tasks **kanban** (BACKLOG priority-ordered
   / WORKING / DONE) headed "Chat with your lead to populate the backlog".

Visual system: near-black navy, dotted canvas, 1px hairlines, purple =
primary, green = live, gold = busy, red = attention; caps-tracked section
labels; mono for the terminal; counts as badges everywhere. High density,
but calm.

## 2. Product goal (why this design fits ORQ8)

Someone logs in, has an idea, and the system builds the tool/SaaS and then
**runs the business** for it. The dashboard is the founder's seat at the head
of that company: one glance answers *is it alive, what needs me, what is it
doing right now*. The five zones map exactly onto the founder loop:

- Frame → control (pause, plan, usage — "am I in charge?")
- Left rail → what the company needs **from me** (TODO LIST)
- Canvas → what the company **is** (who is hired, who is working)
- Right rail → what the company is **doing and saying** (the lead's cards)
- Modals → the few moments where the founder **decides** (approvals, hiring,
  model defaults)

## 3. What ORQ8 already has (reuse, do not rebuild)

| Reference element | Already in ORQ8 |
| --- | --- |
| Lead chat rail (event cards, approvals inline, composer) | `apps/web/components/executive-agent-panel.tsx`, `executive-agent-shell.tsx`, `executive-agent-context.tsx`, floating launcher; `/v1/ea/*` routes |
| Approval cards + queue | `/v1/approvals`, `components/approval-actions.tsx`, `/app/approvals`, attention queue |
| Attention badge | `components/attention-badge.tsx` |
| Tasks with statuses + board data | `/v1/tasks`, task pages, `components/task-actions.tsx` |
| Live activity feed | `/v1/activity`, `components/dashboard/ActivityFeed.tsx`, `dashboard-realtime.tsx` |
| Agents + authority profiles (abilities) | `/v1/agents`, authority-profile JSON (`canCreateTasks`, `forbiddenActions`, …) |
| Daily usage / credits | `/v1/dashboard` credits block, Work Credits system, `docs/24` |
| Model concepts per agent | model routing in the API, `docs/22` |
| Company-builder onboarding (idea → plan → hires) | `/v1/company-builder/*`, `/onboarding` |
| Dark-band technique | `.ink` custom variant in `apps/web/app/globals.css` — the `.hq` shell reuses the same mechanism |

## 4. What is missing (the actual build)

| # | Missing piece | Notes |
| --- | --- | --- |
| M1 | **Dark `.hq` app shell** | Scoped dark variant + frame: status badge in org switcher, second nav row with PRO chips, Pause switch, usage meter. Marketing site untouched. |
| M2 | **Org canvas** | Agent nodes positioned from org structure; lead state ring (gold/purple/dim) derived from real task+activity state, never invented. |
| M3 | **Morphing status banner** | Priority order: approvals waiting → agent working → idle/caught up. Each state has exactly one primary action. |
| M4 | **LIVE ACTIVITY terminal strip** | Mono feed from `/v1/activity` with `TYPE — agent: summary` lines; expands. |
| M5 | **TODO LIST section** | Items are founder actions the EA recommends (hire X, approve Y); seeded from recommendations + attention queue. |
| M6 | **Tasks kanban** | BACKLOG (priority order) / WORKING / DONE; same data as `/app/tasks`, new presentation. |
| M7 | **Employee drawer** | Rename / pause / fire, preferred-model picker, ability toggles writing to the existing authority profile, recent work list. |
| M8 | **Default-model modal** | First-run: pick the org default model; "our picks" from the model router; per-agent override afterwards. |
| M9 | **Coming-soon stubs** | Ads, Inbox, Files, Site, text-the-assistant, sponsor slots — real nav entries, polished empty state, no fake functionality. |
| M10 | **Agent node popover** | Clicking an agent node opens a compact card: name, role summary, current model, **permission icon row** (from the authority profile), Settings → opens the employee drawer (M7). Reference screenshot 2026-09-30. |

## 5. Build order (mock-first, as decided)

- **Phase 0 — mock (DONE 2026-09-30).** Full-fidelity static dark dashboard
  (hard-coded fixture data mirroring the screenshots) at
  `marketing/headquarters-mock.html` — plain HTML/CSS, no build step; open it
  directly or serve the `marketing/` folder. Founder reviews the look before
  any production code changes.
- **Phase 1 — foundation.** `.hq` shell + frame (M1) + left rail (M5, M9
  stubs) on the real `/app` route family.
- **Phase 2 — canvas.** Org canvas (M2) + morphing banner (M3) + terminal
  strip (M4), all fed by real endpoints.
- **Phase 3 — cockpit.** Right rail upgrade (M7 drawer, M8 modal) and kanban
  (M6).
- **Phase 4 — polish + docs.** Motion, empty states, a11y contrast pass
  (existing `data-contrast-check` convention), `docs/68` rows, changelog.

Phase 1 + 2 is the "log in and see your company breathing" moment.

## 6. Design rules carried into the build

1. **Every state is real.** Rings, banners, and badges derive from
   task/approval/activity state in the API — the same rule the dashboard
   already follows (server-derived, never inferred client-side).
2. **One primary action per zone.** The banner has exactly one button per
   state; the approval card offers Review/Approve, not five links.
3. **Counts everywhere.** Unread things always show a count; nothing pulses
   without a number.
4. **Light marketing, dark app.** The `.hq` scope keeps `dark:` variants inert
   outside the app shell; landing/nav/settings stay as shipped.
5. **Absorb incoming references.** More screenshots are coming; new elements
   land as numbered additions to §4, not ad-hoc features.

## 7. Open items awaiting founder material

- Additional reference images the founder said they will send.
- Sponsor slots and "Sell this business": present in the reference product;
  treated as coming-soon stubs unless the founder says otherwise.
- Text/SMS assistant ("Message your business by text"): stub until a real
  channel exists.
- Default-model modal needs the "our picks" list — confirm which models ORQ8
  actually offers at launch (ties into `docs/22` model routing).
- **Revision 3 (open):** the founder is reviewing mock v2 and will list
  changes (colors, wording, layout). Each change is recorded in docs/71 §W
  and applied to `headquarters-mock-v2.html` **before** the remaining pages
  (Constitution, Departments, Files, Notifications) are mocked.
