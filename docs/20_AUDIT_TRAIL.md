# 20 — Audit Trail

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 20.1 Purpose (§34)

Every significant action is recorded immutably: actor, actor type, org, department, agent, task, action, tool, timestamp, input reference, result, authorization, approval, policy decision, cost, outcome. The trail is **append-only and tamper-evident**.

## 20.2 Hash Chain (34.4)

```
hash_n = sha256(prev_hash_n-1 || org_id || actor || action || payload || occurred_at)
```

- Per-org chain (genesis = org_id + salt).
- Any modification to an older row invalidates the chain → tamper-evident without external services (free-first; immutable external ledger optional later).
- **No update/delete path exists**; the audit service only appends.

## 20.3 Coverage

- All authz decisions (allow/deny with policy_ref) — `access_events`
- Approvals: request, decision, expiry, delegation
- Financial: spending requests, executions, budget threshold crossings
- Agent lifecycle, version publishes, hiring
- Tool executions (capability, args refs, result refs)
- Config changes: constitution, policies, permissions, model policies
- Emergency controls: activation/deactivation
- Memory writes and secret access metadata (never values)

## 20.4 Querying

`GET /v1/audit?actor=&action=&from=&to=&cursor=` (35). UI: Settings → Audit Log with filters and export. Retention per org policy; export for compliance.

## 20.5 Integrity Assurance

- Append-only service with no update/delete API.
- Periodic chain-verification job (recompute hashes) as a test + scheduled task (44).
- Audit writes occur in the same transaction as the business action where possible (outbox pattern, 36) so the record can't be lost.

## 20.6 Audit of Audit

Emergency controls, audit-config changes, and the verification job themselves emit audit events — nothing that controls the trail is outside it.
