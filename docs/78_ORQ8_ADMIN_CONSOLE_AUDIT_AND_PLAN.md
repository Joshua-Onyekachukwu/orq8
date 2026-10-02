# 78 — Platform Admin Console: Audit & Working Plan

Status: **PLAN — awaiting founder review. No admin-console code has been changed under this document.**

Scope: everything under `/admin` in `apps/web` (`app/admin/**`, `components/admin/**`) and the
platform-admin API surface in `apps/api/src/routes/admin.ts` (865 lines, 18 endpoints, every one
gated by `requirePlatformAdmin`). This is the console a founder opens when something is wrong at
3am, or when a cohort of waitlist signups needs to become paying organizations. It is the only
surface in ORQ8 that reads **across tenants**, which is why its correctness matters more than its
polish — and why the finding below that half of it ignores the platform-wide endpoints is the most
important line in this document.

Written 2026-10-02, after the credits/billing security pass (docs/77) and the landing-page
conversion work. Doc 78 continues the numbering from docs/75–77; the phase structure mirrors
docs/76 (audit → condensed problems → phased plan → decisions → risks → execution order).

---

## Part 1 — Audit: what exists today

### 1.1 The shell

| Piece | File | State |
|---|---|---|
| Auth gate | `app/admin/layout.tsx` | Real. Requires session cookie → `/v1/auth/me`; requires `platformRole === "admin"`; renders an explicit **Access Denied** screen (not a silent redirect) for non-admins; org membership role deliberately grants nothing. `emailVerified === false` → `/check-email`. |
| Sidebar | `components/admin/admin-sidebar.tsx` | Real. 6 groups / 13 links, collapsible groups, mobile drawer toggled by a `window` event from `TopBar` (`orq8:toggle-sidebar`). Active item is the only place in the console using the `.ink` band correctly. |
| Top bar | `components/top-bar.tsx` (shared with `/app`) | Reused, not admin-specific. |
| Page shell | none | Every admin page invents its own `mx-auto max-w-*` (3xl/6xl/7xl) and its own header block. |
| Loading states | **none** under `app/admin/**` | No `loading.tsx`, no skeletons. A slow `/v1/admin/providers` probe (live network calls to every provider) blocks the whole dashboard with no feedback. |
| Error state | `app/admin/error.tsx` | Real, one file, covers the whole admin tree. |

**Platform-admin gate coverage:** all 18 API endpoints call `requirePlatformAdmin`. The only
web-side write path is the proxy `app/api/admin/users/[id]/route.ts`, which forwards the session
cookie's bearer token to `PATCH /v1/admin/users/:id`; the API re-checks the platform role.

### 1.2 The 15 pages, and what each one actually reads

| Page | Route | Reads | Verdict |
|---|---|---|---|
| Overview | `/admin` | `/v1/admin/stats`, `/v1/admin/providers`, `/v1/admin/users?limit=200`, `/v1/admin/organizations?limit=200` | Real data; the "All systems operational / Live" banner is **hardcoded** and never reads `/v1/admin/health`. |
| Platform Health | `/admin/health` | `/v1/admin/health` | The strongest page (404 lines): subsystem list, 8 stat cards (users, orgs, agents, approvals, activity, subscriptions, sessions), infrastructure detail block. Read-only, no polling. |
| Users | `/admin/users` | `/v1/admin/users?limit=200[&search=]` | Real. Search via query param; **status filter applied client-side after fetching 200 rows**; no pagination though the API returns `meta.total`; role/status mutation exists in `components/admin/user-actions.tsx` (status only, no reason, no confirm). |
| Organizations | `/admin/organizations` | `/v1/admin/organizations?limit=200` | Read-only table. No detail route, no plan change, no suspend, no members/seats, no billing state. |
| AI Agents | `/admin/agents` | **`/v1/agents`** | **Wrong endpoint class.** `/v1/agents` is org-scoped, so a platform admin sees only their own org's agents while the page copy says "across organizations". Also expects `weeklyCost`/`tasksCompleted` fields the org route may not emit. |
| Agent Execution | `/admin/execution` | `/v1/admin/stats`, `/v1/admin/activity?limit=50`, `/v1/admin/users?limit=200`, `/v1/commands/history?limit=30` | Best-effort composite. No per-job trace, no run detail, no cancel/retry, no queue depth. |
| Model Router | `/admin/model-router` | `/v1/admin/providers`, `/v1/admin/model-router` | Live provider probes, latency, key counts, models, circuit state, usage-by-department. **Read-only**: no key rotation, no enable/disable, no circuit-breaker reset. |
| AI Usage | `/admin/ai-usage` | `/v1/admin/ai-usage` | New (docs/75-era). Week/month/all-time requests + cost, credit pool, agent counts. No per-org/per-agent/per-model breakdown, no margin view. |
| Approval Queue | `/admin/approvals` | **`/v1/approvals`** | **Wrong endpoint class** (org-scoped) and **the page has no decision controls at all** — `admin-approval-queue.tsx` is a status filter and a table. The console's "Approval Queue" cannot approve. |
| Background Jobs | `/admin/jobs` | **`/v1/admin/audit?limit=200`** | **Wrong endpoint.** `/v1/admin/jobs` exists (docs/75: `waitlist_emails` drip counts + `agent_jobs` queue counts + recent rows) but is not called. The page derives "jobs" from audit rows. |
| Activity Log | `/admin/activity` | **`/v1/activity?limit=50`** | **Wrong endpoint class** (org-scoped) despite copy claiming platform-wide. |
| Errors & Audit | `/admin/errors` | `/v1/admin/audit?limit=200` | Real aggregation of audit rows into Total/Critical/High + a raw audit table. No grouping/dedup, no time filter, no export, no link from an error to the run that caused it. |
| Security Center | `/admin/security` | `/v1/admin/security` | Failed-login lockouts (`login_lockouts`), denied events 24h, admin actions 24h, status banner. Good shape; no session list, no admin-action feed, no audit export. |
| Admin Settings | `/admin/settings` | **nothing** | Entirely **hardcoded** ("Registration: Open", "Maintenance Mode: Off", "Rate Limiting: Active", …) plus `process.env` presence checks for LiteLLM/Stripe/SMTP/S3/Redis. No write path exists anywhere in the API for these toggles. |

### 1.3 API inventory (`apps/api/src/routes/admin.ts`)

| Endpoint | Used by |
|---|---|
| `GET /v1/admin/users` (+`limit`,`offset`,`search`, returns `meta.total`) | Overview, Users, Execution |
| `GET /v1/admin/organizations` (+`limit`,`offset`) | Overview, Organizations |
| `GET /v1/admin/health` | Health *(not the dashboard banner)* |
| `GET /v1/admin/activity` | **nothing** |
| `GET /v1/admin/stats` | Overview, Execution |
| `GET /v1/admin/providers` (live probes + circuit breaker) | Overview, Model Router |
| `GET /v1/admin/model-router` | Model Router |
| `GET /v1/admin/audit` | Errors, Jobs |
| `GET /v1/admin/security` | Security Center |
| `GET /v1/admin/ai-usage` | AI Usage |
| `GET /v1/admin/jobs` (agent_jobs + drip) | **nothing** |
| `GET /v1/admin/credits/reconcile` (docs/77 P0) | **nothing** |
| `GET /v1/admin/nvidia/diagnostics` | nothing (no page) |
| `GET /v1/admin/waitlist` (+`status`,`search`,`limit`), `/stats`, `/:id`, `PATCH /:id`, `DELETE /:id` | **nothing** — the landing page's entire conversion funnel has no UI |
| `PATCH /v1/admin/users/:id` (status) | Users (via proxy) |

**Six endpoints, including the whole waitlist/pipeline surface and the credits reconciliation
report that docs/77 shipped specifically for operators, have no console UI.**

### 1.4 Shared components

Only four client components exist in `components/admin/`: `admin-sidebar.tsx` (228 lines),
`admin-approval-queue.tsx` (169, read-only), `admin-activity-feed.tsx` (89),
`admin-agent-status.tsx` (84), `user-actions.tsx` (73). Everything else is inline JSX in the page
files: no `StatCard`, no `DataTable`, no `StatusBadge`, no `EmptyState` usage (the shared
`EmptyState` component exists in the app and is unused here).

---

## Part 2 — What is wrong (condensed, in priority order)

**P0 — Correctness: three pages show the wrong tenant's data, and the approval queue cannot approve.**

1. `/admin/agents` → `/v1/agents`, `/admin/approvals` → `/v1/approvals`, `/admin/activity` →
   `/v1/activity`. All three are org-scoped routes resolved from the caller's active membership, so
   the console silently reports a single tenant while labelling itself "platform-wide". No
   `requirePlatformAdmin` is involved because these are tenant endpoints.
2. `components/admin/admin-approval-queue.tsx` renders no buttons. A platform admin cannot
   approve, reject, or annotate anything from `/admin/approvals`; the page is a viewer.
3. `/admin/jobs` reads audit rows instead of the real job queues; job depth, retries, and
   dead-letter state are invisible precisely when they matter.

**P1 — Truthfulness: two surfaces state things they do not know.**

4. `/admin` prints "All systems operational · API · Database · Auth · Agent execution · n/4
   providers configured" with a pulsing "Live" dot, from literals. The one page a founder checks
   first cannot report an outage. `/v1/admin/health` (used by `/admin/health`) already returns what
   is needed.
5. `/admin/settings` renders nine hardcoded "Active/Open/Off/Enabled" chips. There is no settings
   table, no admin settings endpoint, and no mutation path — every chip is a claim the system
cannot honour. Two of the chips also read `text-ink-accent` (`#C2F2F2`, the pale tone for black
bands) on `bg-brand-deep/10` over white — near-unreadable in the light scope.

**P2 — Missing operator surfaces (the daily-use gaps).**

6. **No waitlist page.** `waitlist` + `waitlist_emails` is the top of the funnel: signups, drip
   status, invite conversion (`invited`/`signedUp` counts already computed by `/waitlist/stats`).
   Nothing in the console shows it. Growing a cohort is currently a SQL task.
7. **No credits & billing page.** `GET /v1/admin/credits/reconcile` reports ledger/balance drift
   per org; `CREDIT_PACKS` purchases, Stripe webhook outcomes, and `webhook_events` idempotency
   rows have no view. After docs/77 this is the highest-value missing page: it is the difference
   between "we think billing is correct" and "the console says drift is zero across 12 orgs".
8. **No page for `/v1/admin/nvidia/diagnostics`**, no audit export, no CSV anywhere.

**P3 — Scale, states, and consistency.**

9. Every list is `limit=200`, client-side filtered, unsorted, unpaginated, and unexportable.
10. No `loading.tsx`/skeletons under `/admin`; no empty-state reuse; error handling is one root
    `error.tsx`.
11. Tables on Users/Agents/Organizations/Jobs wrap in `overflow-hidden` (clipped on mobile) while
    Security alone uses `overflow-x-auto`.
12. Admin pages are hand-rolled Tailwind (`rounded-xl border-hairline bg-white p-5`) rather than the
    Phase-3 primitives from docs/76 (`page-container.tsx`, `data-boundary.tsx`, width tiers) — the
    console is now the last surface in the product outside the design system.
13. Authenticated reads mix `next: { revalidate: 30 }` with the layout's explicit
    `cache: "no-store"`. Platform-wide admin data should be explicitly uncached and consistently
    fetched through one helper.
14. No write path captures *why*: `PATCH /v1/admin/users/:id` takes `{status}` only, so the audit
    row records what changed but not the reason or the requesting operator's note.
15. No confirmation dialog on any destructive action (suspend user, delete waitlist entry).
16. Accessibility: tables have no caption/sort semantics; filter selects have no labels; the
    dashboard's status is conveyed by a pulsing dot plus text (acceptable) but several badges use
    colour alone to distinguish states.

---

## Part 3 — The plan (phased, approval-gated)

### Phase A — Correctness pass (1–2 days)

*No new features. Every item is a bug fix with a test.*

- **A1** Add platform-wide reads where the console already claims them:
  `GET /v1/admin/agents`, `GET /v1/admin/approvals`, and switch `/admin/activity` to the existing
  `GET /v1/admin/activity`. Each returns `{ data, meta: { limit, offset, total } }` and is gated by
  `requirePlatformAdmin`.
- **A2** Wire decisions: `POST /v1/admin/approvals/:id/decision` with body
  `{ decision: "approved" | "rejected", note?: string }` → writes the approval row **and** an
  `audit_events` entry (`action: "admin.approval.decision"`, actor = operator, outcome, note).
  Then give `admin-approval-queue.tsx` real controls: Approve / Reject / note field, optimistic
  pending state, disabled state while in flight, error surface on failure, and a confirmation step
  for `rejected`.
- **A3** Point `/admin/jobs` at `GET /v1/admin/jobs` (drip + `agent_jobs` counts + recent rows).
  Render queue depth by status, last-error column, and empty state when the queue is idle.
- **A4** Dashboard truthfulness: replace the literal banner with `/v1/admin/health` (overall status
  + per-subsystem rollup), and remove the decorative "Live" dot unless the data is fresh (show
  "as of HH:MM" instead).
- **A5** `/admin/settings`: either (a) delete the page and its sidebar entry until real settings
  exist, or (b) keep it but render only what is actually knowable — env/config presence from
  `/v1/admin/health` — with no "Active/Open" claims. **Default recommendation: (a) delete the
  sidebar entry, keep the route as a "not yet available" placeholder.**
- **A6** Token fixes: `text-ink-accent` on light surfaces → `text-brand-ink` everywhere in admin.
- **A7** Standardise authenticated reads on one helper (`adminFetch(token, path)`, `cache:
  "no-store"`) so no page can accidentally cache tenant data.

**Exit criteria:** every admin page reads a platform-wide, `requirePlatformAdmin`-gated endpoint;
the approval queue can decide; the dashboard reflects real health; a non-admin session gets 403 on
every endpoint (test) and Access Denied on every page (test).

### Phase B — Console shell & primitives (2–3 days)

- **B1** `app/admin/loading.tsx` + per-route `loading.tsx` for the four heavy pages (health,
  execution, model-router, ai-usage) using skeleton blocks, not spinners.
- **B2** Adopt the docs/76 primitives: `PageContainer` (width tiers), `DataBoundary`
  (loading/empty/error in one place), plus three admin-local components — `StatCard`, `DataTable`
  (sticky header, `overflow-x-auto`, optional sort, pagination footer), `StatusBadge` (colour +
  label, never colour alone).
- **B3** Add pagination + server-side sort/filter to Users, Organizations, Activity, Audit, Jobs.
  The API already supports `limit`/`offset` and returns `meta.total`.
- **B4** Add a CSV export for the five list surfaces that operators paste into spreadsheets
  (Users, Organizations, Waitlist, Audit, Credits ledger). Escape per RFC 4180; no formula-injection
  (leading `=`/`+`/`-`/`@` prefixed with `'`).
- **B5** Sidebar: add the Growth group (Waitlist, Credits & Billing) and move Settings/Back to App
  into a footer group; add keyboard focus styles and `aria-current="page"`.

### Phase C — Customers: real management, not just tables (3–4 days)

- **C1** `GET /v1/admin/users/:id` detail: memberships (org, role, joined), sessions, recent
  activity, billing status, credit balance, and every admin action taken on the account.
- **C2** `/admin/users/[id]` page + `user-actions` v2: status change (active/disabled/suspended),
  platform-role grant/revoke, each with a required **reason** field, a confirmation dialog, and an
  audit row (`admin.user.status`, `admin.user.role`). Granting platform admin is the most dangerous
  control in the product — it requires typing the user's email to confirm.
- **C3** `GET /v1/admin/organizations/:id` + `/admin/organizations/[id]`: plan, status, members
  with roles, agents, credit balance, recent invoices, recent approvals, recent audit rows.
- **C4** Org mutations: plan change, suspend/reactivate, all reason-captured and audited
  (`admin.org.plan`, `admin.org.status`). Suspension must state its blast radius in the dialog
  ("124 agents pause, 3 members lose access").
- **C5** Impersonation is **explicitly out of scope** for this plan (see Part 5, Q3) — it needs a
  session-minting design, not a UI.

### Phase D — Growth & revenue surfaces (3–4 days)

- **D1** `/admin/waitlist`: table of signups (email, source, status, cohort, joined, drip state),
  `waitlist/stats` header (total, invited, signed up, conversion rate), status workflow
  (pending → invited → signed up → declined), search, pagination, CSV export, and the existing
  `PATCH`/`DELETE` wired with confirmation.
- **D2** `/admin/credits`: reconcile report from `/v1/admin/credits/reconcile` — "checked N orgs,
  M drifting", drift highlighted in error tone, per-org ledger drill-down, and a re-check button.
  Drift is a P0 alert condition, so the dashboard gets a one-line banner when `drifting > 0`.
- **D3** `/admin/billing`: credit packs (name, price, credits, active), purchases by org in the last
  30 days, Stripe webhook outcomes including `webhook_events` replay/no-op rows, and failed-event
  dead letters with the raw payload.
- **D4** Dashboard: add "Waitlist this week" and "Credits consumed this week" cards; keep the
  first-row four metrics unchanged.

### Phase E — Execution & jobs truth (2–3 days)

- **E1** `GET /v1/admin/jobs/:id` returning the full `agent_jobs` row (payload, attempt count,
  scheduled/started/finished timestamps, error) plus the audit/activity rows it produced.
- **E2** `/admin/execution` becomes a queue-first view: counts by status, running-longest table
  (with elapsed timer), failure rate sparkline over 24h, and a run detail drawer reusing the
  docs/76 drawer primitive.
- **E3** Operator controls: retry a failed job, cancel a queued/running job, all audited
  (`admin.job.retry`, `admin.job.cancel`), disabled where the worker cannot honour them (state it
  in the UI rather than pretending).

### Phase F — AI cost & economics (2–3 days)

- **F1** `GET /v1/admin/ai-usage/by-org`, `/by-agent`, `/by-model`: requests, tokens, cost, and
  cost-per-completed-task; margin = credits consumed − provider cost, per org.
- **F2** `/admin/ai-usage` gains the breakdown tables + a 30-day trend, and links into
  `/admin/organizations/[id]`.
- **F3** `/admin/model-router` write actions: rotate/deactivate a BYOK key, enable/disable a
  provider, reset a circuit breaker, all audited (`admin.provider.*`) with the reason captured.
  Provider keys are secrets — the UI shows only a fingerprint (`sk-…abcd`), never a value.

### Phase G — Security & compliance (2–3 days)

- **G1** Security Center expansion: active sessions (user, IP, user-agent, last seen) with
  force-revoke; admin action feed (not just counts); lockout management (clear a lockout, add an
  allowlist entry); failed-auth rate over 24h/7d.
- **G2** `GET /v1/admin/audit/export` (CSV/JSONL, time-bounded, max rows) and a UI selector for
  range + action prefix, so an incident can be reconstructed without SQL.
- **G3** Every admin mutation writes an audit row with `actor`, `action`, `target`, `reason`,
  `before`/`after` values, and `ip`. This becomes the contract Phase C/D/E/F all rely on.
- **G4** Optional: alert hooks — email the founder when drift > 0, when a provider is `down` for
  > 10 minutes, or when failed logins spike.

### Phase H — QA & hardening (2 days, and it is not optional)

- **H1** API tests for each admin endpoint: 403 for non-admin, 401 for anonymous, pagination
  boundaries, search escaping, and audit-row assertions for every mutation.
- **H2** Playwright smoke: each admin route renders for a platform admin, Access Denied for a
  regular user, and every "dangerous" action shows its confirmation.
- **H3** Verify `/admin` pages under `next build` with `revalidate: 0`/no-store so no tenant data
  can be served from a cache to another operator.
- **H4** Mobile pass at 375px for every admin page (the drawer + table overflow work in B2 should
  make this mechanical, but it must be checked).
- **H5** Docs: update `docs/ORQ8_STYLE_GUIDE.md` with the admin primitives and add the admin
  console to `docs/ORQ8_LAUNCH_CHECKLIST.md`.

---

## Part 4 — API contracts to add (summary)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/admin/agents` | Platform-wide agent list (+org, +cost/week) |
| GET | `/v1/admin/approvals` | Platform-wide approval queue (+org, +agent) |
| POST | `/v1/admin/approvals/:id/decision` | Approve/reject with note, audited |
| GET | `/v1/admin/users/:id` | User detail: memberships, sessions, actions |
| GET | `/v1/admin/organizations/:id` | Org detail: members, agents, credits, invoices |
| PATCH | `/v1/admin/organizations/:id` | Plan/status change, reason required, audited |
| GET | `/v1/admin/jobs/:id` | Single job row + produced events |
| POST | `/v1/admin/jobs/:id/retry`, `/cancel` | Operator control, audited |
| GET | `/v1/admin/ai-usage/by-org`, `/by-agent`, `/by-model` | Cost/economics breakdown |
| POST | `/v1/admin/providers/:slug/key`, `/toggle`, `/circuit/reset` | Provider management, audited |
| GET | `/v1/admin/waitlist/export` | CSV export |
| GET | `/v1/admin/audit/export` | CSV/JSONL export, time-bounded |
| GET | `/v1/admin/sessions` | Active sessions + force-revoke |

`PATCH /v1/admin/users/:id` gains an optional `reason` field; every mutation above writes an
`audit_events` row in the same transaction as the write.

---

## Part 5 — Decisions I need from you (defaults in parentheses)

1. **Admin Settings**: delete until real, or keep as an env-status readout? *(default: delete the
   sidebar entry, keep a placeholder route)*
2. **Approval decisions from admin**: should a platform admin be able to approve on a customer's
   behalf, or only view? *(default: yes, with a mandatory note, clearly labelled "by platform
   admin" in the customer's own approval feed)*
3. **Impersonation**: build it, or keep it out of scope? *(default: out of scope for doc 78)*
4. **Drip/waitlist email sending**: is the console allowed to trigger the invite email, or is that
   still CLI-only? *(default: UI trigger, single-recipient only, no bulk send until Phase H)*
5. **Provider key management**: should admins be able to add/rotate keys in the UI, or is that
   strictly deployment config? *(default: read-only fingerprints in the console; no key writes)*
6. **CSV exports**: which surfaces must have one on day one? *(default: Users, Organizations,
   Waitlist, Audit, Credits ledger)*
7. **Alerting (G4)**: email the founder? *(default: yes for drift > 0 and provider down > 10 min)*

---

## Part 6 — Risks

- **Cross-tenant reads widen blast radius.** Every new admin endpoint is a chance to leak another
  org's data. Mitigation: one gate (`requirePlatformAdmin`), one query helper that always takes an
  explicit org filter or none, and a test per endpoint asserting 403 for non-admins.
- **Reason-captured mutations slow the operator down.** That is the point, but it must not become
  friction theatre — allow a short preset list plus free text.
- **Phase F touches provider keys and circuit breakers.** Read-only default limits the damage; any
  write path needs a fingerprint-only UI and audit rows.
- **Admin pages are server-rendered on every request.** Page B2's pagination and B1's skeletons are
  what keep that acceptable as data grows; without them, `/admin/users?limit=200` gets slower every
  week.
- **Scope.** Phases A+B are the ones that stop the console lying to you. C–G are product surface.
  If time is short, ship A+B+D2 and defer F/G.

---

## Part 7 — What gets reused (not rebuilt)

- `requirePlatformAdmin` + the audit/activity writers in the API (all mutations already have a
  place to land).
- `app/admin/error.tsx`, the Access Denied screen, and the sidebar's mobile drawer.
- `apps/web/components/top-bar.tsx`, the docs/76 `PageContainer`/`DataBoundary`/drawer primitives,
  the shared `EmptyState`, and `docs/73 Console UI Skill` colour/token law.
- `/v1/admin/health`, `/v1/admin/jobs`, `/v1/admin/credits/reconcile`, `/v1/admin/waitlist*` —
  already built, just unwired.
- The docs/77 credit ledger and `webhook_events` idempotency rows as the data behind Phase D.

---

## Part 8 — Execution order after approval

1. Phase A (correctness) — ship alone, one reviewable PR, with tests.
2. Phase B (shell + primitives) — foundation for everything visual after it.
3. Phase D2 + D1 (credits reconcile, then waitlist) — the two highest-value operator surfaces.
4. Phase C (customers) — user detail, then org detail, then the reason-captured mutations.
5. Phase E (jobs/execution) → Phase F (economics) → Phase G (security) as time allows.
6. Phase H closes the loop: tests, mobile pass, docs, checklist.

Each phase ends with: `pnpm --filter @orq8/api test`, `pnpm --filter @orq8/web test`, a web build,
a browser pass at 1440 and 375 for every page the phase touched, and one commit per phase.
