# 68 — Requirement matrix

The bridge between the plan and the code. One row per requirement, with the
state, the evidence that produced it, what is missing, what blocks it, and what
it is worth doing next.

Status is stated here and in `docs/66_ORQ8_MVP_MASTER.md` and nowhere else.
Anything else that states status is a snapshot and belongs in
`docs/archive/`.

Reconciled 2026-09-29. Evidence marked **[today]** was produced in the
reconciliation cycle; **[earlier]** was produced on this machine in the
preceding cycles and is named so it can be re-run; **[inspection]** is a code
read that has not been executed.

State vocabulary (as in `docs/66`): **REAL** = implemented and verified by
executing it · **PARTIAL** = implemented, a workflow in it cannot complete ·
**BROKEN** = worked, does not work now · **MISSING** = not implemented ·
**DUPLICATE** = implemented twice, one copy dead · **EXTERNAL** = complete in
code, blocked on a credential, account or host · **FOUNDER** = needs a decision
only the founder can make · **POST-MVP** = deliberately out of scope.

---

## 1. The matrix

| ID | Requirement | Ph | State | Evidence | Missing | Dependency | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MVP-001 | A reachable deployed product (API + web) | 1 | **MISSING** | **[today]** production API answers 404 from a Railway edge that no longer hosts anything; web serves `orq8.vercel.app` from a build older than local `main` by 33 commits; the local review stack serves the whole product (route sweep 33/33 **[earlier]**) | an API host, with the env surface set | founder: choose and provision the host (`58.11`) | **P0** |
| MVP-002 | A live database under the production lineage, migrations applied and recorded | 1 | **FOUNDER** | **[today]** local config points at Supabase ref `gttkaxbcdtpsusmconxm`; the connected Supabase account holds only `CapitalOS` (`tvekoojdilkjptjzpvqo`), an investor-intelligence database with no ORQ8 table | a project that hosts the ORQ8 lineage | founder decision: which project is production | **P0** |
| MVP-003 | A safe migration path (`--status` before apply, a ledger of what landed) | 1 | **REAL (code)**, never run in production | **[earlier]** lineage replays from scratch on the embedded harness; `DB Migrate` workflow replays drizzle + supabase with a ledger | a production run against MVP-002 | MVP-002 | **P0** |
| MVP-004 | A staging environment, so releases are not tested live | 1 | **MISSING** | **[inspection]** no second environment exists in CI or in the runbooks | a preview/staging target with its own database | MVP-001 | P1 |
| MVP-005 | Scheduled jobs and cron run against a live API | 1 | **BROKEN** | **[today]** `orq8-jobs`, `waitlist-drip` and `nightly-rehearsal` all target an `API_URL` whose host no longer exists; `INTERNAL_TOKEN` is the capability key (`/v1/readiness` names it) | a reachable API | MVP-001 | **P0** |
| MVP-006 | Sign up, confirm email, log in, log out, recover password | 2 | **REAL** | **[earlier, live]** register 200 → `/v1/agents` 403 `email_not_verified` → confirmation link read from the dev transport log → verify 200 → 200; the mail-body regression is fixed so a deployment without a provider fails loudly instead of reporting phantom success | a mail provider in production | MVP-001 | P1 |
| MVP-007 | Create a company and reach the dashboard | 2 | **REAL** | **[earlier, live]** founder loop §66.21: company created, dashboard rendered, all 33 `/app` routes render real content | — | — | P1 |
| MVP-008 | Onboarding to first value (first hire, first command) | 2 | **PARTIAL** | **[earlier, live]** the loop works when driven; nothing guides a new founder through it | onboarding steps around the loop | — | P1 |
| MVP-009 | Executive Agent: context, intent, plan, delegation, honest refusal | 3 | **REAL** | **[earlier]** 54/54 in the EA/task/command batch; the EA is the only caller of the tool registry today | — | — | — |
| MVP-010 | Departments: templates, create, configure, pause/resume | 4 | **REAL** | **[earlier]** 54/54 batch, `/app/departments` in the live sweep | — | — | — |
| MVP-011 | AI employees: hire, custom, edit, rename, authority, mode, tools, pause/resume, history, delete | 5 | **REAL** | **[earlier]** live hire in the founder loop; Trial plan caps at 3 | — | — | — |
| MVP-012 | Work: create, delegate, execute, states, failures, retry, outcome | 6 | **REAL** | **[earlier]** 10/10 — a gated task resumes, completes and spends 1 credit; a failed task is retried on purpose and completes; **[today]** the product can run one task now, retry a failed one, and shows *Waiting on your decision* when that is the real state (`mail-and-work-controls.integration.test.ts` 5/5 through the same routes the pages call) | — | — | — |
| MVP-013 | Approvals and authority enforced server-side, not only in the UI | 6 | **REAL** | **[earlier]** 8/8 approval-gated work; `engineering-approval` 5/5; the autonomy model's `requiresApproval` is now acted on instead of dropped | — | — | — |
| MVP-014 | Founder Attention as the single decision surface | 6 | **REAL** | **[earlier, live]** the attention queue moved 1 → 0 in the browser when the decision was made | — | — | — |
| MVP-015 | Credits, usage, budgets visible and enforced | 6 | **REAL** | **[earlier]** credit balance decremented by the resumed task; budget cap test in the EA batch. **[today, found live]** a tool was charged `OPERATION_COSTS['tool.<id>']` — absent from that table, so its `default: 2` — while the approval card, the spending-limit check and the affordability check all quote `tool.creditCost`: the founder approved $0.01 and the ledger took 2 credits. The charge now passes `tool.creditCost` explicitly, re-proved live (quoted 1, ledger `-1`, record `1 credit`), and the integration test asserts the charge equals the *quoted* cost rather than a constant | — | — | — |
| MVP-016 | Company memory persists and is used by agents and the EA | 8 | **REAL** | **[earlier]** `memory-acceptance.integration.test.ts` 4/4: taught → stored → retrieved from **different wording** → reaches the prompt → shapes the output → `useCount`/`lastUsedAt` record the use; another company's memory never appears | semantic retrieval without `EMBEDDING_BASE_URL` | embeddings (keyword-only until configured) | P2 |
| MVP-017 | Audit trail: hash-chained, inspectable, complete | 8 | **REAL** | **[earlier]** audit chain verified on the embedded harness; exports in the live sweep | — | — | — |
| MVP-018 | Member invites and roles | 5 | **REAL** | **[earlier]** 20/20 `members.integration.test.ts`; **[earlier, live]** invite → mail → accept → role change → remove, and removal revokes the removed member's sessions in that organization | — | — | — |
| MVP-019 | One working external integration end to end | 7 | **EXTERNAL** | **[today]** `/v1/readiness` reports `github_oauth` and `google_oauth` as `configuration_required`, naming `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` | an OAuth app and its keys | founder: create the OAuth app | P1 |
| MVP-020 | One-click demo company for a prospect | 7 | **PARTIAL** | **[earlier, live]** the review stack seeds a demo company; the product has no one-click path to it | a founder-facing control | — | P2 |
| MVP-021 | Production smoke check gating releases | 13 | **PARTIAL** | **[today]** `scripts/release-gate.mjs` asks a running deployment five questions — web `/healthz`, API `/healthz`, `/readyz`, `/v1/readiness` with the internal token, and `/v1/readiness/mail-check`, which sends one real message so *mail delivers* is proven rather than inferred from configuration (a `404` from an older API build is a failed check, not a skip) — and exits non-zero naming every blocking capability with its missing keys, its impact and its docs; `vercel-deploy.yml` runs it after verification and goes blocking the moment `PRODUCTION_API_URL` exists (before that it records *not run* in the job summary rather than a green check for a check that did not run); **[today, live]** proven against the local review stack both ways — it refused a stack with no mail provider (`blocking: email`, the mail step naming `RESEND_API_KEY`/`SMTP_HOST`) and cleared a stack whose mail capability is genuinely activated, reporting `smtp accepted a message for review@orq8.test`, with `/readyz` and `/v1/readiness` agreeing; `scripts/release-gate-proof.mjs` is a `proofs.mjs` proof asserting the verdict follows the deployment's own report *and* that the mail check fired — passing by delivering when a provider is configured, failing and naming the keys when one is not | a deployed target (MVP-001) | MVP-001 | **P0** |
| MVP-022 | The proof harnesses run in CI (slice, auth, RLS, routes) | 13 | **REAL / PARTIAL** | **[earlier]** `proofs` is a blocking CI job and reports the MVP id each proof protects (vertical slice 44/44, auth E2E, RLS 55/55, members 20/20); the route sweep needs a stack, so `founder-loop` is advisory until it holds on GitHub runners | making the stack proofs blocking | GitHub runner capacity | P1 |
| MVP-023 | Env surface documented and guarded against drift | 1 | **REAL** | **[earlier]** `env-surface.test.ts` holds `apps/api/.env.example`, `infra/.env.example` and `apps/web/.env.example` against `envSurface()` | — | — | — |
| MVP-024 | Backup and restore drill documented and exercised | 10 | **MISSING** | **[inspection]** `docs/53` describes it; no exercise is recorded | a performed drill | MVP-002 | P1 |
| MVP-025 | Cost caps and alerts verified in production | 10 | **PARTIAL** | **[earlier]** caps enforced on the embedded harness | production verification | MVP-001 | P1 |
| MVP-026 | Founder can operate for a week without developer intervention | 13 | **MISSING** | **[inspection]** it is the acceptance test; it cannot start before MVP-001 | the deployed product | MVP-001 | **P0** |
| MVP-027 | No brand surface can ship a raster logo, a hardcoded logo path or a foreign wordmark | 1 | **REAL** | **[earlier]** `scripts/brand-audit.mjs` is a blocking CI job; zero `orq8-*` tokens remain | — | — | — |
| MVP-028 | Every account-bearing route requires a session | 1 | **REAL** | **[earlier]** verified route by route, and gated in CI | — | — | — |
| MVP-029 | An approval decision drives the work it gated: approve resumes it, reject stops it with the reason | 7 | **REAL** | **[earlier]** 10/10: the gated task resumes and completes on approval; a rejection stops it for good and keeps the founder's reason; a second question is never stacked on the same task; **[today]** every founder surface names the blocked work — the approvals list resolves `gatedWork` (task title, status, tool), the attention item leads with it, and both cards render it | — | — | — |
| MVP-030 | A task execution can call a tool, under the same authority gate as the EA | 6 | **REAL** | **[today]** the executor calls `executeTool`, so the EA and a task share one path: role, authority, the approval gate, the idempotency key, the ledger and the audit row are the registry's, and a task-scoped tool audit names the task. The model is offered exactly its role's tools and one fenced tool request block to ask for one, bounded at 3 rounds. The task record says what the work used (`Tools used: analyze_data: ran in 1.2s, 2 credits`) and the task row's cost equals every charge in the ledger against it. **3/3** `task-tools.integration.test.ts` on the embedded database — a role's tool runs, is charged and audited as `tool.executed`; a forbidden action is refused, audited as `tool.denied` and charged nothing; a tool that needs the founder stops the task in `awaiting_approval` naming the tool and its exact arguments, then really runs when the approval is granted — plus **11/11** `task-tools.test.ts` and **42/42** on the executor-adjacent suites. **[today, found live]** the registry charged `OPERATION_COSTS['tool.<id>']`, a key absent from that table and therefore its `default: 2`, while the approval card, the spending-limit check and the affordability check all use `tool.creditCost` — a founder approved $0.01 and the ledger took 2 credits; the charge now passes `tool.creditCost` explicitly, re-proved live (quoted 1, ledger `-1`, record `1 credit`), and the integration test asserts the charge equals the *quoted* cost rather than a constant | — | — | — |
| MVP-031 | Something drives unblocked work (a runner with a caller, not an exported function) | 6 | **REAL** | **[earlier]** the approval decision drives the runner and `POST /v1/commands/tasks/:id/retry` drives it explicitly; **[today]** the founder drives both from the product — **Run queued work** in the Founder's Attention queue and **Run now** / **Retry this task** on the task page — with the batch result reported in plain language | — | — | — |
| MVP-032 | No company can read or write another company's data | 10 | **REAL** | **[earlier]** RLS matrix 55/55; tenant-isolation tests in the API suite; gated in CI | — | — | — |
| MVP-033 | A session can act in every organization its user belongs to | 5 | **REAL** | **[earlier, live]** accepting an invitation switches the session into the inviting company | — | — | — |

### Added during this reconciliation

| ID | Requirement | State | Evidence | Why it exists |
| --- | --- | --- | --- | --- |
| MVP-034 | A running deployment can say what it can and cannot do, by configuration rather than by a developer reading the source | **REAL** | **[today]** `capabilityReadiness` in `@orq8/core`, `GET /readyz` (counts, public, names no capability), `GET /v1/readiness` (named) — readable by a founder with a session or by a machine with `x-internal-token`, compared in constant time, so a release gate can say *why* a deploy is not good; `POST /v1/readiness/mail-check` goes one step past configuration and runs the deployment's own three-verdict delivery diagnosis over the same machine path, so the gate can prove mail works instead of reading that it is set up; 7/7 `readiness.test.ts`, 6/6 `readiness-mail-check.test.ts` (refused without the token, the failing step reported without erroring, the fix named, the recipient resolved from `EMAIL_FROM`) and 11/11 `health.test.ts` including the machine read, the refused token, and `/readyz` agreeing with the named report | docs/19 asks integrations to activate by configuration; docs/66.11 lists founder actions that nothing in the product could enumerate |
| MVP-035 | Mail delivery is provable: the founder can check the configured provider and be told exactly what failed and what to change | **REAL** | **[today]** `GET /v1/settings/mail` (configuration, names only) and `POST /v1/settings/mail/test` (three verdicts, owner/admin, audited as `mail.delivery_checked`); `email-diagnostics.test.ts` 18/18 and `mail-and-work-controls.integration.test.ts` 5/5; the settings page renders delivering/not-delivering, the failing step, the cause and the fix | A mail failure is invisible until someone is locked out; without a provider the product reported phantom success (fixed in 66.18), which left the founder with nothing to check |

---

## 2. Counts

| State | Count |
| --- | --- |
| REAL | 23 |
| PARTIAL | 4 |
| MISSING | 4 |
| BROKEN | 1 |
| EXTERNAL | 1 |
| FOUNDER | 1 |
| **Total** | **35** |

Priorities: **P0 = 6** (MVP-001, 002, 003, 005, 021, 026 — of which MVP-026 is
the acceptance of MVP-001; MVP-030 closed this cycle), P1 = 8, P2 = 2, remainder
unprioritised because they are complete.

---

## 3. What the matrix says about the shape of the remaining work

1. **Everything a founder does inside the product works; nothing reaches a
   founder outside it.** Five of the six P0 rows are the same requirement:
   there is no host. The engine, the loop, the gates, the memory and now the
   release gate are verified on a real database; the deployment is not.
2. **The last product gap inside the code closed this cycle**: MVP-030. An AI
   employee's work now calls a tool through the same registry the Executive
   Agent uses — role, authority, the approval gate, the ledger and the audit
   trail are one implementation, not two. What is left in the matrix is
   operational, and the only P0 that is not a host is the smoke gate that now
   exists and cannot yet be pointed at anything.
3. **The four "missing" rows are all operational** (a host, the production
   environment, a restore drill, a week of founder operation). None of them is
   a feature.
4. **Nothing in the matrix is blocked on invention.** Every P0 row is either a
   credential, an account, or a decision.

---

## 4. How a row gets updated

1. Implement.
2. Test on the embedded harness (or against the review stack when the claim is
   about the live product).
3. Update the row here **and** the register in `docs/66` §66.7.
4. Add the entry to `docs/ORQ8_CHANGELOG.md`.
5. If the requirement is protected by a proof, make sure `scripts/proofs.mjs`
   names it — `node scripts/proofs.mjs --list` prints each proof and its MVP id.
