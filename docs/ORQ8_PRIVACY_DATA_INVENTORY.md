# ORQ8 Privacy Data Inventory, Controller Map & Retention Schedule

Date: 2026-10-12. Phase 4 groundwork for R-008. Method: read the schema
(`packages/db/src/schema.ts`), routes, and services — every row below names
its evidence. Aspirational claims in `docs/38_PRIVACY_DATA_GOVERNANCE.md`
are checked against the implementation; where they do not hold, this
document says so. Nothing here is legal advice; jurisdiction conclusions
belong to Phase 5 + qualified counsel.

## 1. Personal-data inventory (what the system ACTUALLY stores)

| # | Category | Tables / fields | Subjects | Collected how | Purpose |
|---|----------|-----------------|----------|---------------|---------|
| 1 | Account identity | `users.email` (unique), `users.name`, `job_title`, `timezone`, `avatar_url`, `email_verified_at`, `status`, `platform_role` | Founders, members | Registration (`POST /v1/auth/register`), profile update, OAuth (`read:user user:email`, `openid email profile`) | Authentication, personalization, admin |
| 2 | Credentials (hashed) | `users.password_hash`; `password_reset_tokens`, `email_verification_tokens`, `sessions`, `login_lockouts` rows | Account holders | Registration, login, recovery flows | AuthN, brute-force defense |
| 3 | Membership | `memberships` (user↔org, role, status — deactivated rows RETAINED for audit) | Members | Invite accept, removal | Access control, audit trail |
| 4 | Invitations | `invitations.email`, role, token, status | Invitees (may never become users) | Member invite | Onboarding; note: third-party address stored before consent |
| 5 | Waitlist / marketing | `waitlist_signups.email`, name, role, source; `waitlist_emails` | Prospects | Landing form, design-partner application | Marketing, drip (`waitlist-drip.yml`) |
| 6 | Company content (MAY contain personal data) | `company_memory.content`, `knowledge_entities`, `files` + metadata, `business_imports`, tasks/agents/departments/teams names, decisions, briefings | Founder's employees, customers, counterparts — arbitrary free text | Founder input, business import, agent execution, uploads | Core product; memory is embedded (`embedding vector(768)`) for semantic retrieval |
| 7 | Integration secrets | `integration_credentials.encrypted_secret`, refresh-token hashes, scopes; `user_provider_keys` (BYO LLM keys) | The connecting member (tokens act as them) | OAuth connect flows (GitHub, Google/Gmail `gmail.modify+gmail.send`), BYO key settings | Acting in connected tools, model access |
| 8 | Billing | `subscriptions`, `credit_balances`, `credit_transactions` (org-linked); Stripe Checkout/Portal via org (`routes/billing.ts`, webhook replay-safe) | Paying org / founder | Checkout, webhooks | Entitlement, metering |
| 9 | Product analytics | `analytics_events` (org_id, user_id, event_name, free-form `properties` jsonb); PostHog client events + pageviews IF `NEXT_PUBLIC_POSTHOG_KEY` set (default US cloud) | Users | Client SDK, server instrumentation | Usage insight |
| 10 | Security/ops logs | `audit_events` (hash-chained, append-only), `activity_events`, `llm_performance` (prompts/outputs measured), platform logs | Users, agents | Every governed action | Audit, cost, debugging |

Findings that narrow prior claims:

- **No per-row data classification exists.** Doc 38 §38.1 says every memory
  entry carries a class enforced at retrieval — `company_memory` has
  `category/importance/source` but NO classification column, and no
  retrieval-time class check was found. Treat ALL company content as
  potentially containing personal data; isolation is org-scoping + RLS,
  not classification.
- **BYO provider keys** (`user_provider_keys`) mean some inference runs
  under the CUSTOMER's provider relationship, not ORQ8's — relevant to
  the subprocessor map (customer-as-controller for that leg).
- **No training opt-out headers** in the provider chain (`llm.ts` sends
  only `HTTP-Referer`/`X-Title`); provider retention/training posture is
  account/contract-level and UNVERIFIED — Phase 9 must confirm for
  OpenRouter + NVIDIA before customer data beyond trial scale.

## 2. Controller / processor map (preliminary — counsel to confirm)

| Activity | Proposed role | Basis in code |
|----------|---------------|---------------|
| Account, waitlist, auth artifacts, billing relationship, product analytics | ORQ8 **controller** | ORQ8 decides purpose/means (registration, plans, tracking) |
| Company content processed to execute founder-directed tasks (memory, files, tasks, integrations acting on instructions) | ORQ8 **processor** (customer = controller) | Processing follows founder/agent instructions within granted authority; requires DPA (MISSING — Phase 6) |
| Inference via ORQ8-held provider keys | ORQ8 → subprocessor chain (OpenRouter/NVIDIA) | ※ verify vendor DPA + retention (Phase 9) |
| Inference via customer BYO keys | Customer's provider relationship; ORQ8 routes only | Disclose; BYO settings copy should state this |
| Email delivery (verification, reset, notifications) | Processor leg to Resend/SMTP vendor | Recipient addresses leave ORQ8 systems |

## 3. Retention schedule (ACTUAL behavior — not policy wishes)

| Data | Actual retention | Delete path | Gap |
|------|-----------------|-------------|-----|
| Per-resource rows (memory entry, file, task, goal, agent, notification, rule, repo, MCP server, provider) | Until manually deleted via API | `DELETE` endpoints exist per resource | No bulk/retention automation |
| Membership | Indefinite — removal DEACTIVATES, row kept for audit (`members.ts`) | Deactivation only | By design for audit; disclose |
| Audit ledger | Indefinite, append-only (no delete path found) | None | Disclose; needed for trust, bounds DSR deletion |
| User account / organization | **NO DELETE PATH** — no account-close or org-delete endpoint found | None | **GAP vs doc 38 §38.4** ("staging → export → purge → confirm" workflow is NOT implemented) |
| Auth tokens | Validated/expiry-checked; no scheduled purge found | Expiry checks | Orphan rows accumulate — needs cron |
| Backups | Per Supabase project settings (UNVERIFIED from here) | Vendor | Confirm PITR + restore drill (R-009) |
| Provider-side (prompts/outputs) | Per vendor terms (UNVERIFIED) | Vendor | Phase 9 |

## 4. Data-subject rights (as-implemented today)

- **Access/portability:** PARTIAL — org export surfaces exist per doc 38
  claim but were not verified end-to-end this session; per-resource reads
  via API work.
- **Correction:** PASS for profile/account fields (update endpoints).
- **Deletion:** FAIL at account/org scope (no path); PASS at single-resource
  scope; audit-ledger deletion correctly impossible (disclose as exception).
- **Objection/restriction:** MISSING as a workflow; PostHog is
  key-gated (unset = no client tracking) which is the current
  minimization control.
- No request intake, identity-verification, deadline-tracking, or response
  process exists — Phase 4.4/6 work, needs founder decision on support
  channel.

## 5. Preliminary high-risk assessment (DPIA trigger screen)

Triggers present: AI agents acting on company data, consequential
actions (external email, spending), large-scale memory embedding,
third-party processor chain with unverified retention, no account
deletion. **Recommendation: treat a DPIA (or NDPA-equivalent assessment)
as REQUIRED before controlled pilot** — owner: founder + counsel.
Residual risk stays HIGH until Phase 5/6 decisions land.

## 6. What this phase did NOT do (explicitly out of scope)

Jurisdiction applicability (Phase 5), policy drafting (Phase 6),
vendor DPAs (Phase 9), and any representation of legal compliance.
R-008 stays OPEN.
