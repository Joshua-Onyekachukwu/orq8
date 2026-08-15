# 19 — Approval Engine

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 19.1 Principle (§73)

Approval is **server-side and deterministic**. Never rely on frontend state, prompt instructions, or hidden UI. The backend verifies actor, permission, resource, action, approval state, policy, and expiry **before** executing any consequential action.

## 19.2 Permission Namespace (canonical)

`{domain}:{resource}:{action}` — e.g.:
- `org:create`, `org:convene`, `org:restructure`
- `dept:create`, `dept:hire`, `dept:budget_edit`
- `agent:hire`, `agent:offboard`, `agent:version_publish`
- `tool:github:read|write|pr|merge|delete`
- `memory:read|write`, `budget:approve`, `finance:transfer`, `comm:send`
- `constitution:amend`, `policy:update`, `permission:grant`

Defined in a registry consumed by Authz (18), tools (25), and this engine.

## 19.3 Approval Record Lifecycle

```
pending → approved | rejected | expired | revoked
```

Fields (34): resource_type/id, action, requested_by, required_tier, status, approver, decision_note, evidence_refs, expires_at, decided_at. Each state change is an event + audit row.

## 19.4 Decision Engine

`approval_rules` are deterministic: `(action_pattern, amount_range, conditions, required_tier)`.

Default matrix (from 17a): <$50 approved-category = auto; $50–250 = dept head; >$250 = CEO; subscriptions/vendors/contracts/transfers/policy changes = review or CEO. Organizations configure their own rules; rules are versioned (policy objects, not code).

## 19.5 Decision Center Actions (§36)

- **Approve** · **Reject** · **Modify** (change parameters, re-queue) · **Discuss** (returns with comments) · **Delegate** (where policy allows).
- Every decision shows: what, why, who recommends, evidence, alternatives, cost, risk, impact, expiration.
- **Mandatory vs preferred** approval (17a VI.5): preferred may auto-pass after deadline; mandatory never does (financial/legal/external default to mandatory).

## 19.6 Execute-Once Semantics

An approved action executes exactly once, even across retries: approval consumption + idempotency key + audit record in one transaction.

## 19.7 Delegation & Temporary Authority (§81)

- Delegations: scope, amount, action types, departments/projects, time limit, conditions, approver, revocation. An agent may delegate only authority it possesses and never broader (R-GOV-6).
- **Temporary authority expires automatically** (e.g., "$500/day until Sept 30"), enforced by the engine at authorization time.

## 19.8 Events & API

Events: `approval.requested/approved/rejected/expired/delegated`. API: `GET /v1/approvals?status=pending`, `POST /v1/approvals/:id/approve|reject|modify|delegate` (35). Error codes: `approval.required`, `approval.expired`, `approval.rejected`.
