# 84 — External-testing readiness checklist

**Purpose:** the single list of what must be true before the first outside
user signs up on the production deployment, with the status as verified.
Evidence lives in docs/82 (runbook) and docs/83 (system audit); this doc is
the decision list. Statuses re-verified 2026-10-06 against the live
deployment (`orq8api-production-062a.up.railway.app` /
`orq8web-production.up.railway.app`).

Decision rule: **🔴 blocking** items must be green before any external
signup; **🟡** items can ship later but must be consciously accepted by the
founder; **✅** items are proven and pinned by tests/scripts.

---

## 🔴 Blocking — must be green first

| # | Item | Status (2026-10-06) | What closes it |
|---|---|---|---|
| 1 | Transactional mail configured + delivering | 🔴 **PENDING founder keys** — release gate's only red item (`RESEND_API_KEY` recommended, or SMTP; `EMAIL_FROM` on a verified domain) | Set keys on the Railway API service → §Flip procedure below |
| 2 | `REQUIRE_EMAIL_VERIFICATION=true` (outside users must confirm) | 🔴 **false today** (the escape hatch, commit `9065189`) | Step 3 of the flip procedure; the flip is **test-proven safe**: signup → real transport → confirm → login is pinned by `apps/api/test/verification-email-end-to-end.test.ts` (provider HTTP boundary stubbed; everything else production code) |
| 3 | Rate limiting ON | 🔴 **`RATE_LIMIT_ENABLED=false` on Railway** (kept from bring-up) | Flip to `true` — all layers (per-user, per-endpoint-class, per-org shared bucket, per-agent hourly job quota) are integration-proven in `test/abuse-suite.integration.test.ts` (12/12) |
| 4 | Release gate fully green | 🔴 blocked by #1 (4/6: serving ✓, ready ✓, activation ✓, public/named views agree ✓) | `node scripts/release-gate.mjs --api-url … --web-url … --internal-token …` exits 0 after #1 |
| 5 | Registration actually open in the UI | ✅ `REGISTRATION_OPEN=true` live — the register page serves the full form (verified against prod) | — |
| 6 | Signup flow works end-to-end in a real browser | ✅ after the 2026-10-06 checkbox fix (terms/privacy links can no longer trigger the checkbox; verified live) | re-run after every auth-surface change |

## ✅ Proven & pinned (no action needed)

- **Tenant isolation** — RLS matrix **59/59** as the real PostgREST roles
  (cross-org read/update/delete on tasks, approvals, memory, agents,
  credit rows, audit; no self-escalation; `agent_jobs` service-role-only:
  ENABLE+FORCE, zero policies, §3.7).
- **Authority model** — server-enforced autonomy from the DB row; gates
  bind a **decision token** (`sha256(tool_id + canonical_json(params))`);
  a mismatched call on resume is an audited denial with the grant left
  unspent; gate release runs through the queue (no model call on the
  request path); open gates expire to a pause — silence never approves.
- **Credit economy** — reserve→settle→release, trial daily cap, budget
  policy evaluated at `reserveCredits`, per-side ledger reconciliation
  (`used` vs `purchased`), audits inside the ledger transaction; the ledger
  line equals the price the approval card quoted (`tool.creditCost`).
- **Audit chain** — prod chains independently re-hashed VALID
  (19 rows at cleanup, `scripts/verify-audit-chain.cjs`); SQL↔TS byte
  parity pinned by `test/audit-chain-parity.integration.test.ts`.
- **AI providers live** — OpenRouter and NVIDIA pools proven through the
  production chain (2026-10-05); model router reason recorded (0045).
- **Worker/queue** — `JOB_QUEUE_MODE=enqueue` with a dedicated worker
  service; one open job per (org, type, task) by partial unique index.
- **Admin safety** — `requirePlatformAdmin` (org-admin deliberately
  insufficient, every denial audited); user-detail + org-intel endpoints
  expose metadata only, never company memory content.
- **Full test suite** — 965 tests; known load flake only
  (`email-transport` under parallel DB boots, green in isolation).

## 🟡 Accepted-later items (founder call; external testers can start without them)

| Item | Current state | Risk of deferring |
|---|---|---|
| Stripe / billing keys | Pending — every org rides free credits | Testers can't pay; no spend can exceed the trial ceiling |
| Google/GitHub OAuth | Pending — email+password only | Extra friction, no security gap |
| Playwright in CI | Job not yet added (PART 3.2 open) — `account-journey.spec.ts` exists but never runs in CI | UI regressions caught by audits/manual, not by CI |
| Legal review of the linked documents | Terms (`/settings/terms-conditions`) and privacy policy (`/settings/privacy-policy`) are live pages linked at signup | Founder review before a public launch is prudent; product-side nothing blocks |
| User-data deletion requests | Org deletion + probe-retention procedure documented (docs/83); no self-serve "delete my account" yet | Support handle it manually; audited |
| `REDIS_URL` | Optional; jobs use Postgres | Restart-of-Redis only affects cache warm-up |

## §Flip procedure — from "mail pending" to fully green

When the Resend key arrives (recommended; SMTP equivalent below):

1. **Set the keys** on the Railway **API** service:
   `RESEND_API_KEY=<key>`, `EMAIL_FROM=ORQ8 <noreply@<your-domain>>`
   (the domain must be verified in Resend — SPF/DKIM via their dashboard).
   SMTP alternative: `SMTP_HOST`, `SMTP_PORT` (465 or 587), `SMTP_USER`,
   `SMTP_PASS`.
2. **Redeploy** (push a commit or restart the service), then prove the
   provider without sending: the release gate's mail-check does the
   provider-level verification (`verifyMailProvider` — authenticated
   domains call for Resend, handshake for SMTP).
3. **Flip the flag**: `REQUIRE_EMAIL_VERIFICATION=true` on the Railway API
   service. Signup then mints an unconfirmed session, emails the link, and
   `/check-email` + `/verify-email` own the confirm loop. The behaviour is
   pinned by `test/email-verification-optional.test.ts` (the on-branch gates
   login with `403 email_not_verified` until confirmed) and
   `test/verification-email-end-to-end.test.ts`.
4. **Turn rate limiting on**: `RATE_LIMIT_ENABLED=true` (same service).
5. **Run the gate**: exit 0 = release-ready. Record the output in docs/83.
6. **Post-flip sanity** (one probe account): register → confirmation mail
   arrives → confirm → login reaches `/app`; then delete the probe account
   per the retention policy (docs/83) — chains are per-org, survivors stay
   verifiable with `scripts/verify-audit-chain.cjs`.

Steps 1–5 are the whole change; every behaviour they enable already has a
green test, so the flip is configuration, not code.
