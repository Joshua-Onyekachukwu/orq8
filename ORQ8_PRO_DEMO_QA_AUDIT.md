# ORQ8 Pro Demo Account — QA Audit, Findings, Fixes, and Readiness

Date: 2026-10-16 · Auditor: Codebuff (Buffy) · Scope: production (`https://orq8.vercel.app` + `https://orq8api-production-062a.up.railway.app`) as the Pro demo account, plus repo implementation of safe fixes.
Related tracker: `docs/ORQ8_UX_FIX_PLAN.md` (P2–P5 complete; this audit is the founder-requested demo-account pass).

---

## 1. Executive summary

**The demo account works end to end, but it is not currently a Pro showcase.** The single biggest risk is positioning, not plumbing: the account the founder will log into (`demo@orq8.test`, org “Oddly”) sits on the **trial/Custom plan with every cap maxed** (agents 3/3, departments 4/2 — over limit, teams now 4/4 after this audit's own activation test), so a reviewer hits paywalls on the first click instead of seeing Pro functionality.

The second biggest risk is **stale failure**: 14 tasks failed this morning with credit-exhaustion messages, the balance has since recovered to 85/100 with no explanation anywhere, and nothing offers a retry path — the dashboard leads with a wall of FAILED. Two different credit figures disagree with each other (dashboard “0.58 credits spent” vs ledger “15 used”), which undermines trust in every money number on screen.

Against that: auth/session/navigation are solid, the EA answers from real company context with no cost metadata leakage, department activation is idempotent and honest about caps, and the upgrade path (Founder checkout, View plans) is present and wired.

**Two P2 defects were fixed and verified in this pass** (credit panels rendering 0/0; activation feedback dismissed with its modal). Three items need founder decisions before anyone touches them: granting the demo org a real Pro/team plan, topping up or resetting demo credits, and unifying the two cost bases behind the dashboard figure. Stripe live verification still waits on credentials (unchanged).

**Readiness: NOT YET ready for founder review.** Ready after: demo plan grant + credit reset (5 minutes, needs approval), plus the recommended cost-basis fix. Everything else is P2/P3 polish.

---

## 2. Application inventory

**Demo account (verified by login 2026-10-16 ~21:00 UTC):** `demo@orq8.test` / org “Oddly” (`161a7b05-…`), owner Joshua Onyekachukwu. Credentials live in gitignored `scripts/.env.demo.local` (email + password only — no secrets leak). Plan fields disagree slightly by endpoint (`plan: "free"` on the user object, `plan: "trial"/planName "Custom"` on entitlements/subscription) — itself a minor consistency note.

**Web routes (from repo, ~60 pages):** `/login`, `/register`, `/onboarding`, `/app` (dashboard + company hub), `/app/agents`, `/app/agents/[id]`, `/app/departments`, `/app/departments/[id]`, `/app/departments/templates`, `/app/goals`, `/app/goals/[id]`, `/app/tasks`, `/app/tasks/[id]`, `/app/approvals`, `/app/attention`, `/app/audit`, `/app/usage`, `/app/credits`, `/app/budgets`, `/app/finance`, `/app/report`, `/app/simulation`, `/app/council`, `/app/decisions`, `/app/briefings`, `/app/knowledge`, `/app/memory`, `/app/learning`, `/app/lineage`, `/app/mcp`, `/app/integrations`, `/app/members`, `/app/notifications`, `/app/constitution`, `/app/engineering`, `/app/business-import`, `/app/company/overview`, `/app/files`, `/app/health`, `/app/jobs`, `/app/org`, `/app/performance`, `/app/profile`, `/app/quality`, `/app/roi`, `/app/settings/*`, `/admin/*` (14 pages: activity, agents, approvals, ai-usage, commands, errors, execution, health, jobs, model-router, organizations, security, settings, users).

**API (from repo, ~40 route modules):** auth, agents, departments, department-templates, teams, goals, tasks (+ execute), approvals, attention, activity, dashboard, commands (+ stream), EA tools, credits, billing (checkout/portal/webhook/subscription/plans), entitlements, company-builder (+ playbooks), demo-company, integrations, connectors, mcp, members, org, settings (+ export), files, avatars, knowledge, memory, briefings, decisions, deliberation, council, simulations, notifications, webhooks, events, audit, health, readiness, jobs, admin, capabilities, ra
te-limit, migration, oauth, waitlist.

**Tested live in this pass:** login, session, dashboard, EA chat (1 grounded Q&A), departments list + catalog + one activation, usage page, tasks/agents/entitlements/balance/dashboard/activity/approvals/integrations via API. **Spot-checked only:** profiles/settings pages (rendered pre-existing). **Not tested:** onboarding flow (demo org already past it — would need a fresh account; covered by integration tests instead), admin pages (separate account, §8), integrations OAuth (no credentials), mobile viewports, Stripe live.

---

## 3. QA test matrix

| ID | Feature | Preconditions | Steps | Expected | Actual | Status | Evidence / Issue |
|----|---------|---------------|-------|----------|--------|--------|------------------|
| QA-T1 | Login | Demo creds in `.env.demo.local` | POST `/v1/auth/login` + browser sign-in | 200 + session, lands on /app | 200, token 30-day expiry, /app renders as Joshua | PASS | — |
| QA-T2 | Session/nav/refresh | Logged in | Refresh /app, direct-URL /app/departments, /app/usage | Same session, correct pages | All correct, no redirects | PASS | — |
| QA-T3 | Entitlements truth | Owner session | GET `/v1/entitlements` | Pro caps for a Pro demo | trial/Custom; agents 3/3 FULL, departments 4/2 over cap | FAIL | QA-F1 |
| QA-T4 | Dashboard honesty | 14 failed tasks exist | Read cards + LIVE ACTIVITY | Figures agree with APIs | Cards match APIs, but FAILED wall dominates; 0.58 vs 15 disagreement | FAIL | QA-F2, QA-F3 |
| QA-T5 | EA grounded Q&A | 3 agents, 3 goals, 14 failed | Ask “state of my company?” | Real context, no metadata | 4 depts, 3 agents, 3 goals, 14 failed cited; no $/tokens/models | PASS | — |
| QA-T6 | Dept catalog | 4 depts active | Open catalog, search/filter/Activate Engineering | 20+ templates; clear result | Catalog rich; activation silent (teams created, no feedback) | FAIL | QA-F5 (fixed) |
| QA-T7 | Activation idempotency | Engineering active | Re-activate Engineering | No duplicate dept | Still 4 departments; 4 teams added under Engineering | PASS | Note §7 |
| QA-T8 | Usage page money | Balance 85/100 | Open /app/usage | Real credit numbers | WORK CREDITS “0 / 0 —”; limits + upgrade path correct | FAIL | QA-F4 (fixed) |
| QA-T9 | Agents config | 3 agents | GET `/v1/agents` | Trial ceiling respected | All `execute_with_approval`, dept-linked | PASS | — |
| QA-T10 | Failed-task forensics | Failed task id | GET `/v1/tasks/:id` | Honest failure reason | “Credits exhausted (7 avail, 8 req)” — but balance now 85 | FAIL | QA-F2 |
| QA-T11 | Approvals/integrations | Owner session | GET both | Real states | Both empty `[]` — honest, not placeholder | PASS | QA-F8 (untestable live) |
| QA-T12 | Upgrade path | Caps reached | Usage page CTA | Checkout entry + plans link | “Upgrade to Founder” + “View plans” → /pricing present | PASS | Stripe live = Cat. B |

---

## 4. Bug register

### QA-F1 — Demo “Pro” account is on trial caps (P1 High)
- **Route/component:** whole app (`/v1/entitlements`, usage page, hire flows).
- **Impact:** the founder's review starts at paywalls: agents FULL 3/3, departments 4/2 (over cap), teams now 4/4. Nothing Pro can be demonstrated (hire blocked, autonomy capped at `execute_with_approval`).
- **Repro:** log in as demo, open /app/usage — “Plan limits have been reached”, plan “Custom/Free trial”.
- **Expected/actual:** Pro/team entitlements for the showcase org vs trial caps.
- **Root cause:** the demo org was never granted a paid plan (billing history: none found); trial caps enforced correctly — the data, not the gate, is wrong.
- **Fix applied 2026-10-16 (approved):** direct guarded update to the demo org only — `subscriptions` → plan team/active/4000 credits/maxAgents 25, `organizations.plan` → pro (legacy check constraint allows only free/pro/business/enterprise), October `credit_balances` → 4000/0/0/0. Two script bugs hit first (max_agents NOT NULL so 25 explicit, not NULL; org plan 'team' violates the legacy check) — both rolled back cleanly before the final apply. Live-verified: entitlements read team/25/autonomous with headroom everywhere; /app/usage renders Team, Autonomous, “3 / 4,000”.
- **Status:** DONE.

### QA-F2 — 14 tasks failed on credit exhaustion; balance recovered unexplained; no retry path (P1 High)
- **Impact:** dashboard leads with FAILED; 14 tasks blocked; founder sees a broken company.
- **Repro:** open /app — LIVE ACTIVITY all FAILED ~11:00–13:41; task result: “Execution blocked: Work Credits exhausted (7 available, 8 required)”; balance now reads 85/100.
- **Expected/actual:** failure honest per-task, but the intraday swing (7 avail → 85 avail, used=15 total) is unexplained, and failed tasks offer no retry/requeue affordance.
- **Hypothesis:** reservations released or a grant landed mid-day; needs ledger archaeology (`credit_transactions` has no list endpoint — also a gap).
- **Fix applied 2026-10-16 (approved):** credits reset to 4000 with B1; root cause confirmed as pure starvation by retrial — one failed task (“Define the MVP technical scope”) re-queued via `POST /v1/commands/tasks/:id/execute` completed in ~75s with a real deliverable at cost 3. No other failed tasks were retried (13 remain failed — left for the founder's review narrative or a follow-up). The intraday 7→85 swing mechanism remains unexplained; reservation accounting is the prime suspect.
- **Status:** DONE (grant + proof); retry-all + swing archaeology remain optional follow-ups.

### QA-F3 — Dashboard “credits spent” disagrees with the ledger (P1 High)
- **Evidence:** `/v1/dashboard` → `weekly_spend: 0.58→0.63` (growing, fractional) labeled “credits spent” next to “85 of 100 left” (implies 15 spent); ledger `totalUsed: 15`. `activityEvents.cost` mixes integer charges (`cost: 5` on llm.success) with fractional values — suspected mixed units (credits vs provider dollars) in one column, despite the code comment claiming credits-only.
- **Impact:** every money figure on screen is suspect.
- **Fix (recommended, not applied — needs data decision):** single unit for `activityEvents.cost`, or label the card with its true basis; add a test pinning ledger == dashboard basis. Deliberately NOT relabeled — that would paper over a possible unit bug.
- **Status:** FIXED 2026-10-16 (B3) — `weekly_spend` now sums `credit_transactions` `usage` rows (negated) over the last 7 days, the same ledger `credits.used` settles from. `activityEvents.cost` is no longer read for money math. Regression test `dashboard-weekly-spend.integration.test.ts` pins it (old rows, purchases, and a 9999-cost activity decoy excluded). Mixed-unit suspicion on the activity column stands but is now irrelevant to displayed money.
- **Live pre-deploy baseline (Railway API, still old code):** `weekly_spend: 0.72` vs direct-DB sums `activity7d = 72` (= 72/100, old dollar-conversion path) and `ledger7d = 18` (10 usage rows). Post-deploy expectation: `weekly_spend` becomes exactly `18`. Known cosmetic wrinkle: balance `used = 3` (B2 reset zeroed the counter without deleting ledger rows), so `weekly_spend (18) > used (3)` until the 7-day window rolls past the reset — both numbers are ledger-derived, no third basis involved.

### QA-F4 — Credit panels rendered 0/0 (P2, FIXED ✓)
- **Cause:** `/v1/credits/balance` returns flat fields (`total/used/remaining/utilizationPercent/daysRemaining`); usage, budgets, and profile pages read nested `balance.balance.*` (+ `utilization`, `daysLeft`) → all `?? 0` / “—”. The credits page (flat reads) always worked, which is why this survived.
- **Fix:** shape-tolerant reads in `app/app/usage/page.tsx`, `app/app/budgets/page.tsx`, `app/app/profile/page.tsx` (flat first, nested fallback). Web `tsc` green, suite 15/15 · 114/114.
- **Verified:** typecheck + full web suite; live re-verification fires automatically on next Vercel deploy of main (see §10).

### QA-F5 — Activation feedback dismissed with its modal (P2, FIXED ✓)
- **Cause:** `activateDeptTemplate` set the “Activated ✓” button state, then immediately closed the catalog — the confirmation was never visible. Verified live: 4 teams created silently.
- **Fix:** persistent dismissible success banner on the departments list (“X is active with its teams — open its workspace…”, `role="status"`), same visual language as the integrations OAuth notice. Web `tsc` green, suite green.
- **Verified:** code + typecheck + suite; live check on next deploy.

### QA-F6 — Utilization shown raw past 100% (P2, open)
- **Evidence:** Product “52h / 40h · 130%” with no explanation of over-capacity semantics. Cosmetic-trust issue; capacity math itself needs a product decision before any clamp. Documented, not changed.

### QA-F7 — Audit side effect: demo team cap now FULL (P3, noted)
- **What happened:** the QA-T6 activation test created the Engineering template's 4 teams (teams 0→4, now 4/4 FULL). No duplicate department (idempotency held). Reuse bypasses caps so demo function is unimpaired, and archiving Engineering would free them — leaving as-is deliberately (deleting demo structure would be worse). Flagged so the founder isn't surprised.

### QA-F8 — Integrations: honest empty state, live OAuth untestable (P3, BLOCKED)
- `/v1/integrations` → `[]`; UI catalog present. Cannot test GitHub/OAuth without credentials — no placeholder fraud found, but no function proven either. Needs creds (Category B).

---

## 5. Placeholder / incomplete-feature inventory

- **Fully functional (verified live):** auth/session/nav/refresh, EA grounded chat, department catalog + activation (modulo F5 feedback, fixed), entitlements enforcement, upgrade CTA wiring, attention counts, audit trail feed.
- **Partially functional:** task execution (works when funded — currently starved, F2), credit surfaces (F3 basis unified on ledger 2026-10-16; F4 rendering fixed).
- **Honest empty states (not placeholders):** approvals `[]`, integrations `[]`, decisions “none recorded yet”.
- **Blocked by configuration:** Stripe live (keys), integration OAuth (credentials), admin review (separate account).
- **Not implemented:** `credit_transactions` list endpoint (wanted for F2 archaeology), failed-task retry, mobile viewport pass.

---

## 6. UX and design recommendations

1. **Company hub → dedicated page (recommend option 2).** The hub region (~1/3 of the dashboard) duplicates what /app/company/overview, departments, goals, and memory pages already own, while the dashboard's action items (14 blocked, attention) compete for the top. Move the hub to `/app/company` as the full profile/goals/org/metrics page; keep the dashboard to decisions-blocked-active-next. Complexity: medium (move, don't rebuild; hub components already exist). Benefit: a founder opening the dashboard sees what needs them, not what they own. **Not implemented** — structural, needs founder sign-off.
2. **Failed-state recovery row.** Every failed/blocked task needs one primary action (Retry / Reassign / Dismiss with reason). Today there is none (F2).
3. **Money-number glossary.** Each credit figure should carry its basis in a tooltip (“ledger total this period” vs “activity sum this week”) until F3's unification lands.
4. Utilization bars cap at 100% visually with an “over capacity” flag instead of 130% raw (after F6 semantics decided).
5. Keep the EA clean — verified compliant; no action.

---

## 7. Stripe and payment readiness

- **Category A (done, incl. prior E2E):** checkout initiation to provider boundary, signed-webhook verify → apply → dedupe, replay safety, unsigned-webhook rejection, entitlement gating, upgrade/portal buttons, `/pricing` links on usage + budgets (P5). Boundary-stubbed E2E 6/6 in repo.
- **Category B (needs keys):** real checkout sessions, live webhook delivery, subscription sync, the QA-T12 click-through on production. No real payment initiated; no entitlements granted on claims.
- **New note:** my QA-T6 activation consumed the demo's 4 team slots — if the founder wants a pristine demo, archive-then-reactivate Engineering after the plan grant (F1).

---

## 8. Admin and security review

- **Not accessed:** admin pages require the separate admin account, which I did not use (per boundaries). No cross-company access was attempted; all probes used the demo owner's own token.
- **EA consultation feasibility:** the EA is org-scoped via session org (`requireAuth` → `ctx.orgId`); there is no admin-impersonation path in the routes reviewed. Any cross-company admin EA **must** be operational reporting (aggregate from authorized records) first; company-specific consultation needs explicit scope + audit (appendAudit exists and is the right sink); administrative action must stay behind separate approval. Recommend: build the read-only “company state” summary endpoint for admins (reuse EA context builders, never the chat history), audit every access, no private-conversation reads.
- **No security weakening** in this pass: fixes are display/contract-tolerance only; the email-verification gate and owner-only delete behavior were observed working (403s in the right places).

---

## 9. Implementation record

| Change | Files | Solution |
|--------|-------|----------|
| Credit-shape tolerance (F4) | `apps/web/app/app/usage/page.tsx`, `apps/web/app/app/budgets/page.tsx`, `apps/web/app/app/profile/page.tsx` | Interfaces accept flat API fields with nested fallback; usage computes `utilizationPct` from `utilizationPercent ?? utilization`; budgets reads `remaining ?? available`, `daysRemaining ?? daysLeft` |
| Activation confirmation (F5) | `apps/web/app/app/departments/page.tsx` | Persistent `role="status"` banner from existing `justActivated` state, shown after catalog closes; dismissible; reuses `CheckCircle2` + `text-mark-active` language |
| (Prior P5, already pushed) | budgets `/pricing` links, `files.ts` `dirname()`, org-deletion test fixes | See `docs/ORQ8_UX_FIX_PLAN.md` |
| Cost-basis unification (B3/F3) | `apps/api/src/routes/activity.ts`, `apps/api/test/dashboard-weekly-spend.integration.test.ts` | `weekly_spend` = 7d `usage`-ledger sum (negated); pinning test covers window/type/activity-decoy |
| Company-hub move (B6) | `apps/web/app/app/company/page.tsx` (new), `components/company-hub/company-welcome.tsx` + `first-value-checklist.tsx` (new), `components/dashboard/presence.ts` (new shared derivation), `app/app/page.tsx` (slimmed), sidebar, overview redirect | Hub moved, not rebuilt; dashboard and company page share one presence rule; sidebar Company → `/app/company` |

---

## 10. Verification and regression results

- Web `tsc --noEmit`: green after every edit.
- Web suite: 15/15 files, 114/114 tests, green after F4+F5 edits.
- API suite untouched by this pass (display-only changes); full corpus green as of P5 (139 files, 0 fail).
- **Live re-verification pending deploy:** F4/F5 fixes are committed to main; Vercel auto-deploys main (`.github/workflows/vercel-deploy.yml`). After deploy: reload /app/usage (expect “15 / 100”, “15% used”), reload /app/profile (expect “85”), activate a template (expect banner). These three checks are explicitly NOT yet done live.
- **2026-10-16 deploy-branch finding (BLOCKS B3 live verification):** the Railway API service (`orq8api-production-062a`) deploys branch `feat/ai-cost-guardrails-and-worker-soak` @ `99c5661` (2026-10-16T10:44Z), whose tip is a strict ancestor of main — production API is ~11h stale and missing the B3 fix (live `weekly_spend` still `0.72` = old `activity/100` path; direct-DB ledger basis = `18`). Main-only pushes never reach the API. RESOLVED 2026-10-16: founder chose merge-main-into-soak; branch fast-forwarded `99c5661 → 474e00a` and pushed, Railway redeployed, live `weekly_spend` flipped `0.72 → 18` = ledger basis exactly. B3 verified end-to-end (code + pinning test + production).
- Production probes used: login, entitlements, tasks ×6, balance, subscription, usage, dashboard, activity, agents, integrations, approvals — all read-only except one template activation (QA-T6, documented in F7).

---

## 11. Remaining blockers

| # | Blocker | Severity | Action required |
|---|---------|----------|-----------------|
| B1 | Demo org needs a real plan (F1) | P1 | DONE 2026-10-16 — team/4000/25 + org pro, live-verified |
| B2 | Credit swing unexplained (F2) | P1 | DONE (reset + starvation proven by successful retry); swing mechanism still open, optional |
| B3 | Cost-basis unification (F3) | P1 | DONE 2026-10-16 — dashboard `weekly_spend` reads the credit ledger (`usage`, 7d); pinning test green; mixed-unit activity column retired from money math |
| B4 | Live Stripe proof (Cat. B) | P2 | Supply test-mode keys; run checkout + `stripe trigger` webhook against staging |
| B5 | Integration OAuth proof (F8) | P3 | Supply sandbox credentials |
| B6 | Company-hub move (UX rec. 1) | P3 | DONE 2026-10-16 — founder approved option 2; hub (welcome, checklist, orbit, goals/depts snapshots) moved to `/app/company`, dashboard keeps decisions-blocked-active-next + company link card; sidebar Company entry; overview stub redirects; web tsc + 114 tests + build green |

---

## 12. Final readiness assessment

**Verified working:** sign-in/out-equivalent session flows, navigation incl. refresh and deep links, dashboard rendering with API-true cards, EA grounded Q&A without metadata leakage, department catalog (20+ templates) with idempotent activation, entitlement enforcement (caps + autonomy ceiling observed live), upgrade CTAs, honest empty states.

**Ready for founder review subject to the deploy check below.** B1 (real plan), B2 (credits + retry proven), and B3 (one ledger cost basis) are all DONE 2026-10-16 — the three review-blockers are cleared. Remaining: deploy verification of F4/F5/B3 on the live site, then credential-gated B4/B5 and sign-off-gated B6.
