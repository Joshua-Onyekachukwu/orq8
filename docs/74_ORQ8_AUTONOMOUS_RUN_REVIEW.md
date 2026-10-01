# 74 — Review guide: what I did while you slept (2026-10-01)

**Nothing was pushed to GitHub.** Everything is committed locally on `main`; the
remote is untouched. Read this file top to bottom and you can review the whole
run in about ten minutes.

---

## 1. Open the product

Two commands, from the repo root:

```bash
pnpm build                      # only needed if you have not built since pulling
rm -rf .review-stack-data-3111
nohup pnpm exec tsx scripts/review-stack.ts > .review-stack-autonomous.log 2>&1 &
```

Wait ~50 seconds, then confirm it is up:

```bash
grep -a "ORQ8 IS UP" .review-stack-autonomous.log
```

### Login

| | |
| --- | --- |
| **URL** | <http://localhost:3112/login> |
| **Email** | `demo@orq8.test` |
| **Password** | `Demo-Only-2026!x` |

The harness boots an embedded Postgres (real production migration lineage), a
local OpenAI-compatible model gateway so the Executive Agent actually runs, the
real API on `http://127.0.0.1:3111`, and the built web app on
`http://localhost:3112`. It seeds **Northwind Labs**: four AI employees (Nova,
Ember, Ridge, Iris) in the **Growth** department with the **Acquisition** team,
a goal, a pending approval, three tasks (one to run, one that stops for a tool
approval, one already failed) and one executed EA command so credits, activity,
attention and traces are not empty.

**Stop it:** `netstat -ano | grep LISTENING | grep -E ":(3111|3112)"`, then
`taskkill //PID <pid> //T //F` for each.

> ⚠️ `apps/web/.env.local` points `API_URL` at the **production** Railway API.
> Never run `next dev` on the web app without overriding it
> (`API_URL=http://127.0.0.1:3111`). The review stack overrides it for you.

---

## 2. What to look at first

1. **Dashboard** (`/app`) — rebuilt to the approved mock: the greeting, the
   four-state strip, the banner that morphs with company state, **the live
   organization** (each department with its lead, its people and their real
   work), and the **live-activity terminal**. This screen crashed on load two
   days ago; it now renders — and it no longer duplicates the performance,
   quality, goals and activity pages, it links to them.
2. **Approvals** (`/app/approvals`) — the gate queue: silence is never
   consent, each card names its trigger, **what it blocks** (the task, linked)
   and **what approving does**, the exact tool call is one click away, and the
   decision is the console's ghost pair (Reject / Approve). "Decided" is the
   table with your own notes.
3. **My Attention** (`/app/attention`) — the merged queue, ordered by severity.
   There is a real pending approval and a real failed task in it.
4. **Tasks** (`/app/tasks`) — the board: Backlog / In progress / Done plus the
   sticky detail column. Run the pending task; watch it move.
5. **Goals** (`/app/goals`) — rebuilt to the mock's commitments list: one
   expandable row per goal (status chip, meter, "N steps · due date"), and
   inside it the **lineage chain** (Strategy → Objective → Key result →
   Initiative → this goal, read from the real strategy tree through the goal's
   tasks) and the **plan steps** as chips carrying each task's live status and
   owner. A step an open gate is holding says "Paused". A goal with no strategy
   link says so instead of inventing a parent.
6. **Audit trail** (`/app/audit`) — now the real `audit_events` trail, not
   activity rows: event, actor (human / AI / system), outcome and the payload
   refs per row, expandable to the JSON with the **hash and previous hash**.
   The header verifies the org's hash chain end to end and states the result;
   the filter chips are the domains this org has actually written (auth, task,
   credits…). Export CSV / JSON include the hashes.
6b. **Budgets** (`/app/budgets`) — the mock's two ledgers: the reservation
   policy stated where the meters are, the company meter, then **by goal**
   (spend derived from the `task:<id>` usage lines) and **by employee** rows
   with real used/cap figures — and honest empty sections, because a meter
   over spend that does not exist would be theatre.
7. **An employee** — open **Iris** from `/app/agents` and use the new workspace
   (section 3 below). This is the biggest new surface of the run.
8. **Departments** (`/app/departments`) — four cards, real counts, real
   utilization. It printed `NaN%` before this run. Click a department's name to
   open the new **workspace** (section 3b below).
9. **Finance** (`/app/finance`) — the honest empty state: $0.00 and why, not a
   fabricated chart.
10. **Theme toggle** — flip light/dark in the account menu and re-walk the same
   screens. The sidebar follows the theme now; it used to be permanently black.

---

## 3. The new Employee workspace (`/app/agents/<id>`)

The reference product's employee drawer, expanded into a real governance
surface. Every control writes a real record — nothing here is decorative.

- **Identity** — name, role, department · team, live status (`Working` / `Needs
  you` / `Blocked` / `Paused` / `Retired` / `Idle`), autonomy level, last active,
  tasks completed / failed, credits used, weekly cost, hire date. Rename, Pause,
  Resume and "Ask Atlas" are in the header; Ask Atlas opens the EA dock already
  pointed at this employee.
- **Authority** — the four bands from the plan: **Can do** (five real authority
  switches), **Can spend** (`$0.00` means every purchase needs you), **Requires
  approval** (the gates), **Cannot do** (hard stops), plus the five-level
  autonomy ladder. Editing shows an unsaved bar; saving `PATCH`es
  `agents.authority` and `autonomy_level` — the same columns the execution path
  reads. **Try it:** turn "Execute tasks" off for Iris, save, then run one of
  her tasks from the Tasks board; the refusal is real and lands in her activity.
- **Abilities** — skills (free text, written into the employee's working context
  and used for work routing) and the tool set for that role, resolved by
  `GET /v1/tools/role/:role` — the same registry the runtime uses, so the screen
  and the runtime can never disagree. Tools that need you are marked.
- **Memory** — `GET /v1/agent-memory?agentId=…`: lessons, failures, preferences
  and context the employee is handed before a task, filterable by category. You
  can teach it directly ("Remember this"), and it shapes its next run.
- **Work & cost** — every task it was given (status, priority, due, cost) and
  its activity feed, with the reason for each failure.

One §H item is deliberately **not** built: a per-employee model pin. There is no
persisted model field on an employee, so a picker would be a control that lies.
The Model routing card says what is true — Auto Model, decided per task from
your connected providers — and names the providers that are actually connected.

---

## 3b. The new Department workspace (`/app/departments/<id>`)

The plan's §G, built as a real page. A department owns only its own row, so
every zone is scoped through its **members** — the people are the scope, and the
legacy free-text department column is deliberately not used (that is the column
that made employees read as "Unassigned").

- **Header** — name, purpose, lead, employee avatars, live state (`Working` /
  `Needs you` / `Queued` / `Idle` / `Empty` / `Archived`), and a real count of
  what is waiting on you. **Needs-founder cards sit directly under the header,
  never buried**: each names the request, who asked, the risk level, the cost
  and when, with a Review link into the approvals queue.
- **Now** — the department's live work (queued, running, waiting on you) with
  the owner's name and cost. Nothing finished — finished work is each
  employee's history.
- **Team** — every member with their status, team, current task and their
  done/failed/credit numbers; clicking one opens the employee workspace. The
  teams inside the department are listed with their real headcounts.
- **Operating context** — seven tabs, all real: **Tools & integrations** (the
  union of the members' role resolvers — the same `getToolsForRole` the runtime
  calls, grouped by category, with risk level, credit cost and which roles may
  call each one), **Resources** (files members produced), **Decisions**
  (decisions a member made or that name one of their tasks), **Approvals**
  (waiting on you, then what you already decided, with your note), **Memory**
  (the same `company_memory` the runtime feeds them), **Authority** (the four
  bands rolled up from the members' own profiles, plus the autonomy
  distribution), **Activity** (their events, with reasons).
- **Empty is explained, not blank** — a department with no members says
  "hire one into this department, or ask the Executive Agent to brief it", and
  says why each zone is empty. I created a throwaway department, walked that
  state, and deleted it.

Try it: open **Growth**, read the one pending approval at the top, then switch
through the Operating-context tabs and compare the Authority roll-up with Iris's
own page.

---

## 4. Defects found and fixed in this run

Each one was found by using the product, reproduced, fixed, and re-verified on a
live stack.

| # | Defect | Why it mattered | Evidence it is fixed |
| --- | --- | --- | --- |
| 1 | **Dashboard crashed on load** — a server component called `computeScore()` from a `"use client"` module | The first screen after login was an error | Dashboard renders; pure scorer moved to `lib/health-score.ts` |
| 2 | **Five proxy routes returned `{}`** — `NextResponse.json(await proxyApiJson(...))` double-wrapped a `Response`, and passed a full URL where a path was expected | Workforce, company progress, the template catalog and the EA silently starved; "Add from catalog" was empty | Catalogue lists real templates; workforce and progress return real payloads |
| 3 | **Departments showed `UTILIZATION: NaN%`** — the API returned `agentCount` but not `activeCount`, and the page read `activeCount` | A founder reads `NaN` as a broken product | Card now reads "4 agents · 4 active · 1 team", "80% coverage", "UTILIZATION 13%" |
| 4 | **Budgets rendered `[object Object]`** — `byOperation` typed as a map, API returns an array | Cost reporting was unreadable | Rows render with `count` and `totalCost` |
| 5 | **Every employee's department and team was `null`** — the batch name lookup used a raw `= ANY(array)` against `uuid` columns, which Postgres cannot compare; the `catch` swallowed it and returned `null`s | Every screen that names a person's department said "Unassigned". Tests never caught it because the catch was silent | Before: `departmentName: null` ×4. After: `"Growth"` ×4, `"Acquisition"` on Ember and Nova |
| 6 | **A governance-blocked execution never incremented `tasksFailed`** — the pre-execution block persisted the failed task and wrote activity, but skipped the employee's counter | Iris read "Blocked · Last task failed" beside "Tasks failed 0" — two numbers the founder cannot reconcile, on the screen that judges reliability | Iris now reports `TASKS FAILED 1` |
| 7 | **`usePageContext` looped forever** — the hook called `setPageContext` during render and its guard was always true | Any page that registered EA context froze its own main thread. Nothing had called it yet; the new employee workspace was the first caller and locked up | Hook now registers in an effect keyed on the context's contents; the page is interactive |
| 8 | **Activity summaries stuttered** — `Execution blocked: Execution blocked by autonomy level: …` | Copy defect in the founder's feed | Reads `Failed: <task>` with the reason carried once |
| 9 | **Light mode never persisted** — the server shell (a server component) imported the theme cookie *name* from `components/theme-toggle.tsx`, a `"use client"` module. On the server that import is a client reference, not the string, so the cookie lookup could never match and every request fell back to dark | The toggle appeared to work, then silently reverted on the next navigation. The failure was invisible: the code read as correctly wired | Server HTML carries `data-console-theme="light"` after switching; `scripts/scan-rsc-boundary.mjs` was extended to flag SCREAMING_SNAKE constants imported from client modules so this class cannot return |
| 10 | **`.text-muted` rendered the marketing-light teal on the dark console** — `--muted-foreground` is declared at `:root` with its `var()` already substituted there, so inheriting it into `.console` bypassed every console token: every muted label (page subtitles, table captions, metadata) rendered `#356267` on `#0B0F14` | At **2.85:1** it was below even the 3:1 a drawn mark needs, on the muted label used on every console page — not a subtle tint problem, text that is hard to read. The contrast audit never saw it because it measures tokens, not the utility that resolves through a different alias | `.console` re-points `--muted-foreground`; measured live: dark `#97A3B4` (7.52:1), light `#5C6878` (5.67:1); the audit now measures the alias and treats an unmeasurable pair as a failure |
| 11 | **Four screens scrolled sideways at 375px** — the departments header button row, the approval card's Approve/Reject pair, the engineering registry grid (a `truncate` description forces a grid item's `auto` min-width) and the quality tab strip all overflowed the viewport | A founder on a phone gets a page that pans horizontally; it reads as broken, not dense | Each now wraps or shrinks (`min-w-0` on the grid items); the sweep gained `--width` and an overflow check, and is **37/37 clean at 375px** |
| 12 | **Three light-theme contrast failures** — the light palette was written (lime, orange and red all exist *because* they must survive on white) but nothing measured it: `.console` re-points every token, so the existing audit only ever checked `:root` | (a) orange state dot `#E8761A` on a light card measured **2.81:1** — below the 3:1 a drawn mark needs, i.e. “needs you” quietly fading on white; (b) white-on-orange primary CTA **2.98:1** — the one button the design demands you find failed AA; (c) dark-on-red destructive label **3.43:1** | `scripts/color-contrast-audit.ts` now measures **both** console themes from the layered token maps; orange → `#DC6D14` (3.17:1), on-orange → `#231206` (5.38:1), new `--console-on-red` → `#FFFFFF` in light (dark keeps `#231206`); `pnpm audit:contrast` passes |
| 13 | **The audit page showed empty Event and Outcome columns** — it read `/v1/activity`, whose rows have no `action` or `outcome` fields at all; the real trail (`audit_events`, docs/34.4) had no org-scoped read anywhere in the API | The one page whose job is proof rendered two blank columns on every load | New `GET /v1/audit` (+ domain filter + actor resolution) and `GET /v1/audit/verify`; the page renders the real rows, verifies the hash chain end to end, and says "verification unavailable — check the hashes yourself" when it cannot |
| 14 | **Every console element without its own text colour inherited near-black** — `<body>` carries `.text-foreground`, but the shadcn alias layer (`--foreground`, `--muted`, `--border`, `--card`… all declared at `:root`) substitutes its `var()`s against the *light* palette, so `.console` never received dark values. Same defect family as #10, one layer out: 108 `bg-muted` call sites painted `#F7F9F9` blocks and 30 files of `text-brand-deep` read 2.85:1 on the dark canvas | Text invisible on the dark console on every page that used the standard aliases; the goals rewrite is what finally exposed it element-by-element | `.console` is now **self-contained**: it sets `color` itself, re-points the whole shadcn alias layer plus `--orq-brand/-deep/-soft` (brand weight becomes the raised-neutral ladder; tile colour stays dark in both themes so white labels hold), the 30 legacy `text-brand-deep` call sites became `text-ink`, and the contrast audit gained five pairs (inherited foreground, muted chip, brand-soft chip, brand tile in both themes) so it cannot return |

Also fixed in this run: the sidebar was hard-coded ink-black (broke light mode),
the light `--console-on-red` token did not exist (one “on-warm” value cannot
label both a pale dark-theme red and a deep light-theme red), and
`docs/73_ORQ8_CONSOLE_UI_SKILL.md` was written to stop the console drifting into
generic dashboard UI — token table, colour discipline, the four primitives, the
honesty rules and a six-step pre-ship checklist.

---

## 5. Verification — all of it run today, on the current tree

| Check | Result |
| --- | --- |
| `pnpm typecheck` | clean — all 7 packages |
| `pnpm test` | **1,165 passing, 0 failing** (api 855 + 3 skipped, core 213, web 72, db 20, auth 5) — includes the new goal-lineage (5) and audit-trail (4) integration suites |
| `node scripts/route-sweep.mjs --base http://localhost:3112` | **37/37 routes clean** — includes the new department workspace and an employee workspace, discovered dynamically |
| `node scripts/content-audit.mjs --base …` | clean — no `NaN` / `undefined` / `null%` / `[object Object]` |
| `node scripts/content-audit-browser.mjs --base …` | clean — real Chromium, rendered text |
| `pnpm audit:contrast` | **pass** — every required pair, both console themes, including the `.text-muted` alias, the inherited foreground and the muted / brand-soft / tile surfaces |
| `node scripts/scan-rsc-boundary.mjs` | clean (2 hits, both legitimate tests) |
| `pnpm --filter @orq8/web build` | green — 180 static pages |
| Live workspace walk | Growth: 4 members, 1 needs-you card, 26 tools resolved through the runtime's role resolver, real memory/activity rows; a throwaway empty department rendered its explained empty state |
| Live light/dark measurement | `data-console-theme` honoured after reload; card `#F7F8FA`, CTA chip `#DC6D14` on `#231206`, muted labels `#5C6878` (light) / `#97A3B4` (dark) |
| `node scripts/route-sweep.mjs --width 375` | **37/37 routes clean** at 375px — after fixing the four overflows above |
| Live authority write | toggled "Execute tasks" off → `PATCH` → server row `canExecuteTasks: false`; restored |
| Live memory write | `POST` → `201` → entry retrievable with category and importance |

Nothing in the console shows invented data: empty states instruct, zero is shown
as zero, and a failed fetch shows the failure rather than a confident `0`.

---

## 6. Still open (honest list)

Not done, in the order I would do them next:

1. **Plan revisions + ratify** — needs a new table and endpoints; the design is
   in `docs/71 §W` (the mock's "Keep rev 4 / Apply rev 6" card).
2. **Memory tabs, Integrations permissions map, Auto Model controls (§M)** — the
   employees' memory is now visible, but the company-wide memory page still has
   one flat list, the integrations permission matrix is not built, and the
   hierarchy picker (Company → Department → Employee → Task) needs a persisted
   model field first.
3. **Responsive walk beyond the app routes** — the 375px sweep covers all 37
   app routes (and the four overflows it found are fixed), but the marketing
   pages are not in that sweep and were not re-walked at 375px.
4. **Light-mode walk over the older screens** — the console palette is now
   measured in both themes and the new surfaces were walked in light mode, but
   the legacy pages (departments list, tasks board, memory) have been
   spot-checked rather than all walked by eye.
5. **`docs/68` requirement matrix** — the changelog entries for this run are
   written; a full matrix re-walk is not.
6. **Most legacy screens still use the old light utilities** (the departments
   *list* page is the clearest example). They now render *correctly* inside the
   console — defect 14 re-pointed the aliases they lean on — but they are not
   yet rewritten in the console's own classes, and their washes/accents resolve
   to neutral surfaces rather than the mock's compositions.

---

## 7. Guardrails I kept

- **No push.** No `git push`, no PR, no deploy. Local commits only.
- **No invented data.** Every number on every screen comes from an endpoint.
- **No fake controls.** Anything the backend cannot persist is stated in words
  instead of rendered as a switch (see the model pin above).
- **Nothing abandoned.** No stub pages, no TODO comments left in the UI path.
