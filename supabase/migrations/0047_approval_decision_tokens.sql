-- 0047 — docs/82 §decision-token: a founder's decision authorizes an exact
-- call, not a question. When a gate opens (tool-registry executeTool,
-- task-executor gateTaskOnApproval, EA approvals), the exact authorized call —
-- tool_id + the canonical form of tool_params, or the task to execute — is
-- hashed into `call_hash`. Consuming the gate recomputes the hash and
-- compares: a mismatch is a denial, audited, never a silent approval of a
-- different call. Legacy rows (and approval shapes with no exact call — a
-- webhook rule, an EA intent) keep NULL and consume unchanged, so the binding
-- tightens only where the system can state what was authorized.
--
-- Also adds the index the gate-expiry sweep scans (status + created_at over
-- pending rows); without it the sweeper is a full scan on the hot table.
alter table approvals
  add column if not exists call_hash text,
  add column if not exists gate_expires_at timestamptz;

create index if not exists approvals_pending_created_idx
  on approvals (org_id, created_at)
  where status = 'pending';
