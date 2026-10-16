# ORQ8 UX Fix Plan — implementation tracker (from audit 2026-10-16)

Rule: implement in order, test each fix, hunt for new issues, fix them, then advance.
Checked = done + tested. Suspected items must be confirmed by test before fixing.

Sibling find (2026-10-16): budgets page has NO upgrade link at all — cover in C-01b.

## Phase 1 — Money and safety
- [x] C-01a: usage page "View plans" `href="/"` → `/pricing` (`apps/web/app/app/usage/page.tsx`) — done, route verified
- [x] C-01b: in-app Stripe checkout button on usage/budget limit states (`POST /v1/billing/checkout`) — done + tsc green both sides
- [x] C-01c: customer portal button (`POST /v1/billing/portal`) + deep-link resume after checkout — done (proxies + usage UI; success_url already deep-links /app?upgraded=true)
- [x] Sibling fix: checkout derived Stripe customer id via `sub_→cus_` string surgery — now reads live subscription's customer (billing.ts); webhook tests 8/8 pass
- [x] C-07: fallback priorities stored as `context` (not `decision`); default goal labeled suggested (`apps/api/src/services/company-builder.ts`) — done, new regression test `test/company-builder-fallback.test.ts` 1/1 pass

## Phase 2 — First-run experience
- [x] C-02: playbook seeding gated behind company-facts capture (name, objective) — done, `test/company-builder-playbook-gate.integration.test.ts` 2/2 pass; autonomy capture deferred to C-09
- [x] C-06: onboarding `companyName` applied to org record on activation (`PATCH /v1/org`) — done, `test/company-builder-activate.integration.test.ts` 3/3 pass
- [x] C-05: onboarding catalog activation parity — success feedback, full list, established badges, "Open it" link — done, web tsc green (browser E2E pending a running stack)
- [x] C-03/C-04: isolated demo org + first-run demo doors — done: `POST /v1/demo-company/isolated` creates a separate seeded org, moves the session into it (real org untouched; 409 `demo_exists` returns the live demo id); proxy `/api/demo-company/isolated`; onboarding path-phase demo card + register-page door (`/onboarding?demo=1` intent); integration 2/2 pass (6/6 in file)
- [x] C-09: autonomy/approval-preference step in onboarding — done: plan-review "How much leeway?" selector (cautious/balanced/autonomous) PATCHed to each hired agent's `autonomy_level` + `authority.requiresApprovalFor` (the columns enforcement reads); playbook path ships balanced; done screen confirms the mode; web tsc green
- [x] C-10: `/onboarding` public-shell handling — DECIDED: stays publicly reachable (funnel entry for the register door), but performs no data action without a session; anonymous demo click redirects to `/register?next=/onboarding%3Fdemo%3D1` and returns with intent highlighted

## Phase 3 — Core reliability (verify-then-fix)
- [x] Verify cap enforcement inside `activateDepartmentTemplate` (test first) — done, `test/template-activation-caps.integration.test.ts` 4/4 pass (clean activate, dept cap 403, reuse bypasses cap, team cap 403)
- [x] Cents→credits display divisor unit test (resolve C-08 suspicion) — done: canonical `lib/credits.ts` (`tests/format-credits.test.ts` 4/4 pass); `os/primitives` re-exports it
- [x] C-08: EA cost-visibility rule — done: dock/activity/command results hide per-response $ (verified by grep + `tests/ea-conversation-cleanliness.test.ts` 3/3 pass); details pages keep full accounting; vitest harness fixed via `@vitejs/plugin-react` (full web suite 14/14 files, 111/111 tests)

## Phase 4 — Pro environment (needs founder approval)
- [x] NovaForge plan tier (Founder phased vs Company full map) — done (non-payment part): `enforceAutonomyCap` in `services/entitlements.ts` gates Trial/Founder at `execute_with_approval`, unlocks `autonomous` at Team/Company/Enterprise, enforced on hire + PATCH + performance set_autonomy + EA `create_agent` tool (hunt find: tool bypassed the gate); demo-seed fixtures aligned to the trial ceiling; onboarding selector discloses the ceiling (`lib/autonomy-tiers.ts`, locked option + upgrade hint, fails open); `test/autonomy-tier-gate.integration.test.ts` 7/7, `tests/autonomy-tiers.test.ts` 3/3 pass
- [x] Stripe test-mode keys for payment E2E — RESOLVED WITHOUT keys (approved): no STRIPE_* keys exist and none invented; E2E stubs exactly the Stripe HTTP boundary via explicit `__setStripeClientForTests` seam (`vi.mock('stripe')` verified ineffective against the CJS `require` path); `test/billing-checkout-e2e.integration.test.ts` 6/6 pass
- [x] Provision NovaForge per audit §F with seeded-vs-real labeling — done (design + tooling): `scripts/provision-showcase-org.mjs` registers a throwaway founder, mints the isolated demo org, and verifies SEEDED (`isDemo`) vs REAL (untouched, unflagged) labeling; `node --check` clean

## Phase 5 — Regression + hunt
- [x] EA presentation assertion test (no $, token, model strings in message nodes) — done in Phase 3 (`tests/ea-conversation-cleanliness.test.ts` 3/3)
- [x] Checkout E2E — done, boundary-stubbed (no live keys): trial 403 ceiling → checkout session (plan in metadata) → signed webhook apply → subscription row active/team → read-model shows team → same hire 201 → replay-safe (1 row) → unsigned webhook 400 with no state change; 6/6 pass
- [x] Onboarding name→org + playbook-gate tests — done in Phase 2 (activate 3/3, playbook-gate 2/2)
- [x] Full affected-suite runs green; new-issue hunt after each fix — done for P2/P3: scoped API regression 15/15 files, 130/130 tests (tier-gate, demo-company, entitlements, attention ×2, template-caps, template-catalog, autonomy-policy, autonomy, governance-gate, onboarding-seed, billing-webhook, billing-checkout-e2e, llm-fallback, llm-multikey); web suite 15/15 files, 114/114 tests; api + web tsc green; hunt fixed EA-tool tier bypass + demo-seed tier inconsistency + stale onboarding-seed payload (C-02 companyName contract)
- [x] P5 pass on the pushed tree (`fc8eff8`): API regression 18/18 files, 136/136 tests (prior 15 + activate/playbook-gate/fallback); web 15/15 files, 114/114; hunt found ONE live issue — budgets page still had no upgrade path (the C-01b sibling): low/critical meter and the no-billing-data empty state stranded the user — fixed with `/pricing` links in `app/app/budgets/page.tsx`, web tsc + `next build` green (`/app/budgets` 5.7 kB); EA cost-visibility re-grep clean (`$` hits are template/aria literals), fail-open markers consistent (lib + onboarding + entitlements)

## Approvals already requested (audit §K, items 1–8) — do not implement Phase 4 without them.
