# ORQ8 — Founder Return Guide

One page: boot it, log in, click through what changed, and see what's still open.
Last updated after the console rollout (all 18 mock screens implemented).

---

## 1. Boot the review stack

Everything runs locally from this checkout. Two processes: the API (in-process from
TypeScript source) and the built web app. One script does both.

```bash
# from the repo root (Git Bash on Windows)
rm -rf .review-stack-data-3111
( nohup pnpm exec tsx scripts/review-stack.ts > .review-stack-autonomous.log 2>&1 & )

# wait ~60–90s, until the log prints:
grep -a "ORQ8 IS UP" .review-stack-autonomous.log
```

| What    | Where |
|---------|-------|
| Web app | http://localhost:3112 |
| API     | http://127.0.0.1:3111 (endpoints under `/v1/...`) |
| Login   | `demo@orq8.test` / `Demo-Only-2026!x` |
| Seeded org | Northwind Labs — 4 AI employees (Nova, Ember, Ridge, Iris), Growth dept, 1 pending approval, 3 tasks |

The data directory (`.review-stack-data-3111`) is wiped on each boot — this is a
disposable demo database, not production.

**If the web app says "Failed to load profile" or pages 404:** your browser session
survived from a previous boot but its cookie references a wiped database. Log in again
— that's all it takes.

**If ports are stuck** (a previous run didn't die cleanly):

```bash
PIDS=$(netstat -ano | grep LISTENING | grep -E ":(3111|3112)\b" | awk '{print $5}' | sort -u)
for p in $PIDS; do taskkill //PID $p //T //F; done
```

## 2. What changed while you were away

All 18 screens from the marketing mock (`marketing/headquarters-mock-v2.html`) are now
the real product, on one dark console design language (`#0B0F14` canvas, `#11161D`
cards, lime/orange/red state marks, one warm CTA per screen). Light mode is a first-
class theme — toggle it in Settings; every page has been verified in both.

Newest first (all committed locally on `main`, nothing pushed):

1. **Departments** — the last legacy screen. Department cards with live member rows
   (who's staffed, their state, Cr/wk), capacity/teams/utilization from real workforce
   data, department catalog with stage filters, and "Ask Atlas to hire into X" which
   opens the Employees hire modal preselected.
2. **Settings** — moved inside the console; cards, toggles and CTAs match the rest.
3. **Constitution** — articles §1–§8 with Active chips and the Atlas banner.
4. **Integrations** — connection cards with health dots; OAuth, health checks, event
   rules all live.
5. **Notifications** — unread strip, working mark-read (verified 1 → 0 live).
6. **Briefings** — card shell over real briefings.
7. **Memory + Files** — two-pane memory list/detail; folder grid for files.
8. **Docs** — mock's document shell.
9. **Budgets** — per-goal and per-employee credit spend (fixed: usage-by-agent and the
   7-day chart had never populated).
10. **Audit trail** — real `audit_events` with actor resolution (human/AI/system) and a
    hash-chain verify endpoint; goals got a lineage API (task → initiative → KR →
    objective → strategy).
11. Console design language locked; shadcn alias tokens re-pointed so `.console` is
    self-contained in both themes (fix for white-block bleed).

## 3. A five-minute click-through

1. Log in → you land on **HQ**. Note the dark console: sidebar, warm CTA, state dots.
2. **Approvals** — one pending approval (Nova's paid pilot budget). Approve or reject;
   the audit trail records you as the actor.
3. **Employees** — the four seeded employees. Iris is in observe mode: run her task and
   watch it be refused by the autonomy check (that's the gate working).
4. **Tasks** — run the queued tool-gate task (Ember); approvals wire up from it.
5. **Departments** — the new screen. Growth has 4 members, 1 team, utilization 13%.
   Click "Ask Atlas to hire into Growth" — the hire modal opens with the department
   preselected.
6. **Budgets** — per-goal/per-employee credit meters over real usage.
7. **Audit** — every action so far, with actor and a verify button (hash chain).
8. **Settings** — flip **Theme → Light**; every page stays legible (this was walked
   page by page).

## 4. Quick health checks

```bash
# every route renders (37 routes, no blank pages, at any width)
node scripts/route-sweep.mjs --base http://localhost:3112

# content + contrast audits
node scripts/content-audit.mjs --base http://localhost:3112
pnpm audit:contrast

# full test suite (needs the local Postgres)
PGPORT=5433 PGHOST=127.0.0.1 pnpm test        # 1,165 passing
```

## 5. Still open

- **Plan-revisions table + ratify flow** (docs/71 §W) — schema, endpoints, UI.
- **Memory tabs / integrations permission map / Auto Model hierarchy** (docs/74 §M).
- docs/68 screen matrix re-walk against the mock.
- Marketing pages outside the console scope (login, landing) still on brand-light.

## 6. Git state

`main` is ahead of `origin/main` by design — **nothing has been pushed**. Commits are
local only. Untracked `all prompt.txt` is intentionally never committed.
