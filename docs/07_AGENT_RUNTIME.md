# 07 — Agent Runtime

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 7.1 Design Position

An Agent is **configuration + a runtime loop**, not a special process. The platform owns the runtime; agents are data (profile, version, authority, model policy, tools, knowledge). The runtime enforces everything the model cannot be trusted to enforce.

Platform-native runtime → Engineering Agent → coding tools → sandbox → repository workspace.
Third-party coding applications never dictate platform architecture (ADR-010).

## 7.2 Agent Execution Loop

```
┌──────────────────────────────────────────────────────┐
│ 1. Dequeue task (workflow assigns → task.assigned)   │
│ 2. Build context                                     │
│    - task + project + objective context              │
│    - Company Memory entries (permission-filtered)    │
│    - knowledge sources, docs, precedents             │
│    - authority profile (tools, limits)               │
│    - conversation/tool history for this task         │
│ 3. Select model (Model Router, cost-aware)           │
│ 4. Agent loop (bounded iterations):                  │
│    a. call model (LiteLLM) → record usage/cost       │
│    b. parse structured tool requests                │
│    c. Tool Layer validates each request              │
│       - permission check (ToolPermission)            │
│       - authority/approval gate (consequential)      │
│       - action limits (count, rate, spend)           │
│    d. execute tool (or queue approval / need-human)  │
│    e. feed result back; continue or finish           │
│ 5. Produce output (report, artifacts, code, memory)  │
│ 6. Emit events + audit + cost attribution            │
│ 7. task.completed / task.blocked / need-human        │
└──────────────────────────────────────────────────────┘
```

## 7.3 Runtime Components

### Agent Loop (`packages/agents`)
- Deterministic state machine: `initializing → thinking → tooling → waiting → finalizing → done`, with iteration, token, time, and spend budgets.
- **Termination conditions** are mandatory: max iterations, max tool calls, max spend, max wall time, max retries (§83). Agent-agent loops have explicit max delegation depth and termination events.
- Structured tool-calling protocol: the model returns typed tool requests; the runtime executes them — never free-form shell from the model in the host process.

### Tool Layer
- Every tool invocation passes: `authorize(actor, resource, action)` → `approveIfRequired(action, amount, policy)` → `limits(actor, action)` → `execute` → `audit`.
- Capabilities are granular (GitHub read / write / pr / merge / delete as separate grants) (§53).
- Tools are registered (`packages` registry + Integration/InternalTool tables) with capability catalogs.

### Context Builder
- Permission-aware retrieval from Company Memory: only entries the agent's AuthorityProfile may read (§33, R-MEM-2).
- Context is bounded: token budget per task class; summaries for large corpora.

### Need-Human Escalation
- Formal `human.input_requested` event with what/why/impact/urgency/what-continues (§17).
- Workflow pauses only the waiting branch; sibling tasks continue (§R-ATT-3).

### Sandbox (engineering + external tools)
- Ephemeral Docker containers: isolated filesystem, network policy, resource limits, timeout, secrets isolation, command allow/deny, repo access controls, audit events (§43).
- Engineering executions (code, tests, git) run in the sandbox; the API process never executes untrusted model-directed commands on the host.

### Event Emission
- Every step publishes domain events (§36) and writes to the audit trail; SSE pushes activity to the UI (Agent Activity Center, §49).

## 7.4 Agent Identity & Versioning

- Agent → `AgentVersion` (immutable): instructions, model policy, tool grants, knowledge sources, authority profile version.
- Version switch requires evaluation (§71); never silently overwrite (§25).
- Performance metrics are keyed to `(agent, version, period)` for comparison.

## 7.5 Model Integration

- The loop calls the **Model Gateway** (LiteLLM) only. No direct provider SDKs in domain code.
- Router inputs: task type, complexity, reasoning requirement, latency, context size, tool use, vision/audio, cost ceiling, quality, availability, provider keys (§29).
- Every call records `ModelUsage` (tokens, duration, cost, task, agent, org) and a `CostEntry`.

## 7.6 Failure & Reliability

- Workflows are durable; a worker crash restarts the step, not the whole org (§72).
- Tool calls are idempotent where possible; retries never duplicate side effects (idempotency keys on writes).
- Provider outage → router fallback (configurable order per model policy).
- Model/tool failure → bounded retry → escalate to workflow-level decision (replan, need-human, or fail with full context preserved).

## 7.7 Concurrency & Limits

- Per-agent: max concurrent tasks, max execution time, max model spend, max tool calls, max retries (§83).
- Global emergency controls override everything at the platform layer (§18, §83, R-NFR-7): pause org/dept/team/agent; revoke financial execution; stop outbound comms; freeze deployments.

## 7.8 Runtime Modes

| Mode | Behavior |
|------|----------|
| Chat | Conversational; no side effects; planning/discussion only |
| Execution | Authorized operational work under authority profile |
| Review | Read-only review of results/code/reports; produces review objects |
| Simulation | Forecasts without side effects (see 15_ later doc) |
| Voice (later) | Same loop, voice I/O; same authorization (§39, R-VOI-2) |

## 7.9 Implementation Notes (Phase 1 scope)

- `packages/agents` exposes: `runAgentTask(task, agentVersion)` returning a `TaskResult`, plus the Tool Layer and Context Builder.
- First tools: memory read/write, document read, web search (via provider or free API), internal registry search, task ops. GitHub/email/PM integrations arrive with Phase 8.
- Engineering sandbox (Phase 9) uses the same Tool Layer with a `sandbox.execute` capability.
