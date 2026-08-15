# 18 — Governance & Authorization

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

> **Principle:** Authorization is determined by the platform, never by the model. Agents and workflows request actions; the Authz + Approval services decide. Prompt content — including content retrieved from the web, email, documents, or other agents — is never treated as governance instruction (§74).

## 18.1 Approval Tiers (§4)

| Tier | Definition | Examples |
|------|-----------|----------|
| Automatic | Low-risk, reversible, internal | read memory, draft documents, run local analyses, create draft tasks |
| Department Authority | Executable by department head under policy | create branches, draft PRs, use department tools within authority, spend within delegated authority |
| Executive Approval | Material business actions | approve moderate spend within delegated authority, approve internal hires within limits, sign off on department plans |
| CEO Approval | Strategic, financial, legal, external, production, destructive, high-impact | external commitments, spend above thresholds, contracts, offboarding critical roles, constitution changes, org restructuring, production deploys, kill-switch overrides |
| Forbidden | Explicitly prohibited by Constitution/security policy | delete production data, exfiltrate secrets, modify governance, elevate permissions, impersonate CEO |

Each organization configures which action classes map to which tier (policy objects, not code).

## 18.2 Enforcement Components

### Authz Service (deterministic)
- Input: `(actor, resource, action, context)`.
- Evaluates: role-based access (human RBAC) + agent AuthorityProfile + Permission grants + emergency controls + constitution deny rules.
- Output: `allow | deny(reason, policy_ref) | requires_approval(approval_rule, required_tier)`.
- Never consults a model. Pure function of stored policy state.

### Approval Engine
- Creates `approval` records for consequential actions; queues them in the CEO Decision Center.
- Verifies server-side at execution time: actor, permission, resource, action, approval state, policy, expiry (§73).
- Supports approve / reject / modify / discuss / delegate (where policy allows) (§36).
- Idempotent: an approved action executes exactly once even across retries.

### Authority Profiles (§81)
Every AI employee has an explicit profile:

```
Identity · Role · Department · Manager · Mission · Capabilities
Tools · Data Access · Model Access · Financial Authority
Communication Authority · External Action Authority · Approval Authority
Security Clearance · Operating Limits · Operating Hours
Delegation Authority · Escalation Rules
```

Permission examples: draft email / send email / contact customers / create git branches / merge code / deploy to staging / deploy to production / purchase approved software / create ad campaigns / hire agents / modify workflows / approve other agents' work / sign commitments / transfer funds.

All explicit and enforced outside the prompt.

### Delegated & Temporary Authority (§81.1, §81.2)
- CEO delegates authority to Executive Agent/department heads; an agent may delegate **only authority it possesses** and never grant broader permissions than its own.
- Delegations carry: scope, amount, action types, departments/projects, time limit, conditions, approver, revocation.
- Temporary authority **expires automatically** (e.g., "$500/day on the launch campaign until September 30").

### Financial Authority (§79)
- Four controls: Allocated Budget / Spending Authority / Cumulative Authority / Payment Authority.
- Financial execution layer (deterministic):
  `Spending Request → Policy Engine → Budget Check → Authority Check → Risk/Vendor/Category Check → Approval if required → Payment Executor → Receipt/Evidence → Ledger + Audit`
- Budget allocation ≠ spend authorization. Hiring budget separate from operating/infrastructure/tool budgets.
- Performance-linked budget recommendations (measured vs attributed vs estimated, clearly labeled).

## 18.3 Tool Permission Model (§53)

Capabilities exposed separately per tool. Example GitHub: read repository, create branch, write files, create commit, create PR, merge PR, delete branch → agent may have `{read: yes, write: yes, pr: yes, merge: no}`. A single "GitHub access" grant is never used.

## 18.4 Model Permission Model (§54)

Agents have model policies: routine researcher → cheap models only; engineering → medium/high reasoning; CEO strategic analysis → high quality; sensitive work → approved providers only. Router falls back around unavailable models.

## 18.5 Emergency Controls (§83)

Platform-layer kill switches (override prompts entirely):
- pause entire organization / department / team / agent
- revoke external actions · revoke financial execution
- stop outbound communication · revoke tool access · freeze deployments

Implemented as `emergency_controls` state consulted by Authz on every action; plus operational limits (max concurrent tasks, execution time, model spend, tool calls, retries, delegation depth, outbound rate, financial authority).

**Default operational limits (editable per org):** max 5 concurrent tasks/agent · max 30 min execution/task (agents) · max $25 model spend/task (paid models) · max 50 tool calls/task · max 3 retries per step · max delegation depth 3 · max 10 outbound messages/hour/agent · financial authority per constitution (17a VIII). Voice limits in 31.6. These are defaults, not hard-coded values — every org configures its own (R-NFR-8).

## 18.6 Change Management (§86)

Major changes follow `Change Proposal → Impact Analysis → Simulation → Approval → Implementation → Verification → Audit` (create/remove department, change reporting, increase budgets, replace critical agents, change goals, new financial policy, major workflow changes).

## 18.7 Human Attention as Managed Resource (§87)

- Categorize: FYI / Routine / Delegatable / Needs executive review / CEO approval required / Urgent.
- Bundle related decisions into briefings; report decisions waiting, average decision age, delegated, escalated, estimated CEO time saved.
- Mandatory-approval vs preferred-approval distinction.

## 18.8 Data Model Sketch

```
permissions: id, org_id, actor_type (user|agent|role), actor_id, resource_type, resource_id (nullable=scope),
             action, effect (allow|deny), created_at, created_by
authority_profiles: id, org_id, agent_id, version, profile (jsonb: §18.2 shape),
                    status, supersedes_id, approved_by, approved_at
approval_rules: id, org_id, name, action_pattern, required_tier, amount_range, conditions (jsonb), enabled
approvals: id, org_id, resource_type, resource_id, action, requested_by, required_tier,
           status (pending|approved|rejected|expired|revoked), approver, decision_note, expires_at
delegations: id, org_id, grantor_actor, grantee_actor, scope (jsonb), amount_limit, expires_at, conditions, revocations
emergency_controls: id, org_id, scope (org|dept|team|agent), scope_id, control_type, active, activated_by, activated_at
financial_controls: id, org_id, entity_type (dept|project|team|agent), entity_id, period,
                    allocated, warning, ceiling, per_txn_authority, daily/weekly/monthly_authority,
                    payment_authority (jsonb), version
```

## 18.9 Denial UX

Every denial returns: reason, governing policy/constitution clause, and how to request approval (queue to Decision Center) — explain-why for denials, not silence.
