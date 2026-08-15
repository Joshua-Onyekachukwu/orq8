# 30 — Code Execution Sandbox

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 30.1 Purpose (§43)

Every engineering execution happens in a controlled workspace. **No agent gets unrestricted host-machine access.** The sandbox is the trust boundary between model-directed commands and the infrastructure.

## 30.2 Requirements (§43)

- isolated filesystem
- network policy (egress allowlist; no host network)
- resource limits (CPU, memory, time)
- timeout (hard kill)
- secrets isolation (no host secrets inside)
- command allow/deny policy
- ephemeral environments (created per run, destroyed after)
- repository access controls (scoped checkouts)
- audit events per run

## 30.3 Architecture (Phase 9)

```
Tool Layer (permission-gated, 07) → SandboxClient
  → Docker API → ephemeral container (image: node/python/etc. per task)
  → workspace volume (repo checkout, scoped)
  → stdout/stderr streamed (terminal UI, 29) + captured
  → run record (sandbox_runs) → audit + cost
  → container destroyed (or retained for review, TTL)
```

- Commands from the model are **allow-listed** (npm/pnpm/git/test/…); anything else denied unless explicitly granted.
- The API process never executes model-directed commands on the host.

## 30.4 Isolation Levels (progressive)

1. Docker containers (start, Phase 9)
2. gVisor/Firecracker (Phase 16 evaluation) for stronger kernel isolation
3. Optional: remote execution workers for tenant scale (Phase 16)

## 30.5 Safety Details

- **Secrets isolation:** env inside sandbox contains only task-scoped variables; master secrets never mounted.
- **Network policy:** default no egress; per-task allowlist (e.g., package registries, repo host).
- **Data exfiltration controls:** outbound content inspection hooks at egress.
- **Rate/limits:** per-run CPU/mem/time, per-agent concurrency caps (83).
- Audit: `sandbox.run_started/completed/failed`, full command history in run record.

## 30.6 Data Model

`sandbox_runs` (added to 34): id, org_id, task_id, agent_id, repo_ref, image, command_allowlist, limits, status, exit_code, output_ref, duration_ms, cost, created_at.

## 30.7 Ties

Engineering workspace (29) is the primary UI; security model (37) covers the boundary; testing (44) includes sandbox escape scenarios.
