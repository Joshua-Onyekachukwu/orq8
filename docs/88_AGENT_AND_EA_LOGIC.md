# 88 — How agents work, how the Executive Agent works, and how work reaches an agent

Written from the code, not from the design docs: every claim below names the file and
function that implements it. Where something is **not** implemented, it says so.

---

## 1. The three loops, in one picture

```
        FOUNDER                          EXECUTIVE AGENT                    EMPLOYEE (agent)
        ───────                          ───────────────                    ────────────────
  "hire a researcher"  ──POST /v1/agents──▶  (direct, no EA)  ──▶ row in `agents`
                                                                   │
  "research our 3      ──POST /v1/commands─▶ buildContext         │
   closest competitors"                     analyzeIntent         │
                                            createTasksFromIntent─┼──▶ row in `tasks`
                                            createApprovalIfNeeded│      (agent_id set)
                                            enqueue / execute ────┘
                                                                   │
                                            worker claims job ─────▶ executeTask
                                                                      ├ autonomy check
                                                                      ├ credits reserve
                                                                      ├ model call
                                                                      ├ tool call (gated)
                                                                      └ QA → ledger → audit → memory
```

Three entry points, one execution path. That is the design invariant: a command, a task
retry and a queued drain all end in the same `executeTask`.

---

## 2. How an agent is CREATED

**Route:** `POST /v1/agents` — [agents.ts:239](../apps/api/src/routes/agents.ts#L239)
**Template hire:** the same route with a template slug, seeded from `agent_templates`
(`packages/db/src/schema.ts` → `agentTemplates`; 18 system templates across 9 categories).

What a created employee actually carries (all columns on `agents`):

| Field | Meaning | Where it is enforced |
|---|---|---|
| `role` | what the employee is (e.g. `software_engineer`) | tool registry role map; EA's role matching |
| `department_id` / `team_id` | who it reports to | department pages, delegation |
| `autonomy_level` | how far it may go alone | [autonomy.ts:26](../apps/api/src/services/autonomy.ts#L26) — `observe`, `recommend`, `draft`, `execute_with_approval`, `autonomous` |
| `authority` (jsonb) | `canCreateTasks`, `canExecuteTasks`, `canAccessCompanyInfo`, `canCommunicateExternally`, `canModifyResources`, `spendingLimitCents`, `requiresApprovalFor[]`, `forbiddenActions[]` | checked before the work runs, not in the UI |
| `capabilities` | what the EA's matching scores against | `agent-recommendation.ts` (used by the EA at [executive-agent.ts:766](../apps/api/src/services/executive-agent.ts#L766)) |
| `config.systemPrompt` | the persona the employee is prompted with | read by the task executor as its system prompt |
| `status` | `active` / `paused` | a paused employee cannot run work |
| `credits_used`, `weekly_cost`, `tasks_completed`, `tasks_failed` | the performance record the department pages read | — |

`POST /v1/agents/emergency-stop` and `/v1/agents/resume-all` are the founder's fleet-wide
brakes ([agents.ts:545](../apps/api/src/routes/agents.ts#L545), [:575](../apps/api/src/routes/agents.ts#L575)).

---

## 3. How an agent is GIVEN work

There are exactly four ways a `tasks` row acquires an `agent_id`, and they all converge on
the same task row:

1. **The Executive Agent.** `executeCommand` → `createTasksFromIntent`
   ([executive-agent.ts:1467](../apps/api/src/services/executive-agent.ts#L1467)) turns the
   analysed intent into tasks. The model returns a `taskDecomposition[]`, each entry naming a
   `suggestedAgentRole`; the EA maps role → employee and writes the task with that `agent_id`.
2. **Delegation.** A task can delegate to a child task
   (`tasks.parent_task_id`, migration `0044`), so a manager employee hands work down.
3. **The founder directly.** The Tasks page / `POST /v1/tasks` creates a task with an
   assignee.
4. **Squads.** A named group works a shared objective through the delegation orchestrator.

A task then has one of the states the product shows: `pending` → `in_progress` →
`completed`, or `awaiting_approval`, `failed`, `blocked`, `paused`.

### From task to execution — the queue in between

With `JOB_QUEUE_MODE=workers` the API **enqueues** and a worker drains; with `enqueue` the
worker is a separate process (`apps/worker`); with `inline` the request path runs it. The
queue is `agent_jobs`:

- `enqueueJob` — idempotent per `(org, type, task)`; the partial unique index
  `agent_jobs_open_task_uniq` owns the invariant so a double-click cannot double-run.
- `claimJob` — one statement, `UPDATE … FOR UPDATE SKIP LOCKED`, `attempts++` in the same
  write, so N workers never double-claim. It takes an **optional `orgId` narrowing**: the
  production worker is unscoped (serves every org), while the approval-release drain claims
  only the org whose founder just said yes.
- `preflightTaskJob` — decides *before any model call* whether the job should run: `dead`
  (no payload / task gone) or `skip` (task already `completed`, or another job is already
  running it). This is what stops honest history being re-executed.
- `executeWithQuality` → `executeTask` — the one real execution path.

### What `executeTask` does, in order

[task-executor.ts:345](../apps/api/src/services/task-executor.ts#L345):

1. load the task, its employee and the employee's authority;
2. **autonomy check** — an `observe`-mode employee's run is refused (this is the seeded Iris
   case in the review stack: her task fails on purpose so "Retry" has something to retry);
3. **credits** — reserve before spending, settle after (migrations `0039`–`0042`);
4. **model call** — through the router (provider + model choice + cost attribution,
   `llm.ts`, `llm-tracer.ts`, `0040`/`0043`);
5. **tool round** — the model may ask for a tool in a fenced block; the request goes through
   `executeTool` in the registry, which enforces role → authority → approval → credits →
   audit as **one** implementation shared with the EA. A tool needing the founder stops the
   task in `awaiting_approval` naming the tool and its exact arguments;
6. **quality pipeline** (`quality-pipeline.ts`) — QA verdict, score, revision instructions;
7. **ledger + audit + memory** — charges recorded against the task, an `audit_events` row,
   and what was learned written to company memory.

The task row says what happened: status, result, cost, and — when tools ran — a tool-use
summary. Chained case fixed this session: a tool that ran *before* a later tool stopped for
approval is now kept, with its charged credits, instead of being discarded.

---

## 4. How the Executive Agent works

[executive-agent.ts:1572](../apps/api/src/services/executive-agent.ts#L1572) `executeCommand`.
The pipeline, in the order the code runs it:

| Step | What happens | Function |
|---|---|---|
| 1 | **Build context** — org structure, employees, goals, strategy, memory, recent work | `buildContext` ([:654](../apps/api/src/services/executive-agent.ts#L654)) |
| 2 | **Analyze intent** — the model returns intent, category, risk, cost estimate and a task decomposition | `analyzeIntent` ([:951](../apps/api/src/services/executive-agent.ts#L951)); `fallbackAnalysis` ([:1179](../apps/api/src/services/executive-agent.ts#L1179)) when the model is unavailable |
| 3 | **answerOnly short-circuit** — a question is answered, audited and remembered, and is **never** taskified, executed or billed as work | inline in `executeCommand` |
| 4 | **Check credits** and take a **reservation** — the hold is what stops two concurrent commands committing the same credits | `reserveCredits` |
| 5 | **Budget policy** — a hard ceiling or the org kill switch refuses the command; spend above the approval threshold is surfaced as awaiting a decision rather than silently running | `reserveCredits`, constitution policy |
| 6 | **Create tasks** from the decomposition, assigning the matched employee | `createTasksFromIntent` |
| 7 | **Approval gate** when the action needs the founder | `createApprovalIfNeeded` ([:1484](../apps/api/src/services/executive-agent.ts#L1484)) |
| 8 | **Release / execute** — approved work is released through the queue, and the reservation is settled | approval release drain → `enqueueJob` → worker |

Every step writes to the **trace** (`llm-tracer.ts`), which is what the Commands tab and the
EA dock read — so "what did the EA do" is answerable from rows, not from logs.

`validateIntent` ([:472](../apps/api/src/services/executive-agent.ts#L472)) is the guard that
rejects a malformed plan before anything is created — including the rule that a decomposed
task with no agent role is invalid.

### The gates, in one list

| Gate | Enforced in |
|---|---|
| autonomy level | `executeTask` / `autonomy.ts` |
| employee authority (`requiresApprovalFor`, `forbiddenActions`, spending limit) | tool registry + executor |
| founder approval + single-use decision token | `approvals.ts`, migration `0047` |
| credits (reserve → settle, budget ceilings, alerts) | `credits.ts`, `0039`–`0042` |
| layered rate limits | `docs/80 §3.3` (durable-queue counts, `RATE_LIMIT_FORCE`) |
| tenant isolation | RLS + org-scoped queries everywhere; RLS matrix 55/55 |

---

## 5. What is NOT implemented (so nobody tests for it and finds a surprise)

- **A real external integration** (MVP-019) — GitHub/Gmail OAuth keys are not configured, so
  `/v1/readiness` reports `configuration_required`.
- **Scheduled jobs in production** (MVP-005) — updated 2026-10-11: the workflows exist and the host
  exists; every scheduled run fails `404 Application not found` because the GitHub `API_URL` secret
  still names the deleted Railway application. One secret fixes it.
- **A deployed product** (MVP-001/002) — this is the one P0 that is not a feature; the review
  stack is the only place the whole loop runs.
- **Campaigns / experiments tables** — marketing reads produced assets and briefings because
  no campaigns table exists (docs/87 §4). Deals and tickets now do exist (`0054`).
