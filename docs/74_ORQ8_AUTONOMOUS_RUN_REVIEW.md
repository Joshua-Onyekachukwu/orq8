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

1. **Dashboard** (`/app`) — the health score, "What's happening now", the org
   chart. This screen crashed on load two days ago; it now renders.
2. **My Attention** (`/app/attention`) — the merged queue, ordered by severity.
   There is a real pending approval and a real failed task in it.
3. **Tasks** (`/app/tasks`) — the board: Backlog / In progress / Done plus the
   sticky detail column. Run the pending task; watch it move.
4. **An employee** — open **Iris** from `/app/agents` and use the new workspace
   (section 3 below). This is the biggest new surface of the run.
5. **Departments** (`/app/departments`) — four cards, real counts, real
   utilization. It printed `NaN%` before this run.
6. **Finance** (`/app/finance`) — the honest empty state: $0.00 and why, not a
   fabricated chart.
7. **Theme toggle** — flip light/dark in the account menu and re-walk the same
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

Also fixed in this run: the sidebar was hard-coded ink-black (broke light mode)
and `docs/73_ORQ8_CONSOLE_UI_SKILL.md` was written to stop the console drifting
into generic dashboard UI — token table, colour discipline, the four primitives,
the honesty rules and a six-step pre-ship checklist.

---

## 5. Verification — all of it run today, on the current tree

| Check | Result |
| --- | --- |
| `pnpm typecheck` | clean — all 7 packages |
| `pnpm test` | **1,155 passing, 0 failing** (api 845 + 3 skipped, core 213, web 72, db 20, auth 5) |
| `node scripts/route-sweep.mjs --base http://localhost:3112` | **35/35 routes clean** |
| `node scripts/content-audit.mjs --base …` | clean — no `NaN` / `undefined` / `null%` / `[object Object]` |
| `node scripts/content-audit-browser.mjs --base …` | clean — real Chromium, rendered text |
| `node scripts/scan-rsc-boundary.mjs` | clean (2 hits, both legitimate tests) |
| `pnpm --filter @orq8/web build` | green — 180 static pages |
| Live authority write | toggled "Execute tasks" off → `PATCH` → server row `canExecuteTasks: false`; restored |
| Live memory write | `POST` → `201` → entry retrievable with category and importance |

Nothing in the console shows invented data: empty states instruct, zero is shown
as zero, and a failed fetch shows the failure rather than a confident `0`.

---

## 6. Still open (honest list)

Not done, in the order I would do them next:

1. **Plan revisions + ratify** — needs a new table and endpoints; the design is
   in `docs/71 §W` (the mock's "Keep rev 4 / Apply rev 6" card).
2. **Department workspace (`/app/departments/[id]`, §G)** — the three-zone page
   (Now / Team / Operating context with Tools, Resources, Decisions, Memory,
   Authority tabs). The list page exists and is correct; the detail page does
   not.
3. **Memory tabs, Integrations permissions map, Auto Model controls (§M)** — the
   employees' memory is now visible, but the company-wide memory page still has
   one flat list, the integrations permission matrix is not built, and the
   hierarchy picker (Company → Department → Employee → Task) needs a persisted
   model field first.
4. **Light-mode visual pass** — the sidebar now follows the theme, but I have
   not walked every screen in light mode by eye.
5. **`docs/68` requirement matrix + changelog** — the changelog entry for this
   run is written; a full matrix re-walk is not.
6. **Responsive/mobile walk** — the board grids and the new workspace follow the
   `lg`/`xl` rules, but the 375px pass over all 18 mock screens is not re-done.

---

## 7. Guardrails I kept

- **No push.** No `git push`, no PR, no deploy. Local commits only.
- **No invented data.** Every number on every screen comes from an endpoint.
- **No fake controls.** Anything the backend cannot persist is stated in words
  instead of rendered as a switch (see the model pin above).
- **Nothing abandoned.** No stub pages, no TODO comments left in the UI path.
