# 37 — Security Architecture

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 37.1 Security Principles (§52, §74, §75)

1. **Authorization is platform-determined, never model-determined.** Tool-level checks sit outside the model. Agent-generated instructions — from any source, including retrieved web/email/document content — are never treated as governance (§74).
2. **No unrestricted autonomy.** Agents cannot bypass approval, elevate permissions, modify governance, reveal secrets, access unauthorized data, disable audit, circumvent budget, impersonate the CEO, or change their own authority (§75).
3. **Defense in depth.** App-level authz + DB-level isolation (RLS later) + sandboxed execution + encrypted secrets + rate limits + emergency controls.
4. **Least privilege.** Granular capabilities (per-tool, per-action), temporary authority with expiry, delegation without escalation (§81).
5. **Free-first but secure.** All controls implemented with self-hosted OSS; no security feature depends on a paid tier.

## 37.2 Trust Boundaries

```
[Client] ──TLS──> [API Gateway] ──> [Services] ──> [Postgres/MinIO]
                        │
                        ├──> [Authz + Approval (trusted, deterministic)]
                        ├──> [Workflow Runtime (trusted)]
                        └──> [Agent Runtime] ──> [Model Gateway (LiteLLM)]
                                                      ├──> [Ollama (local)]
                                                      └──> [external providers]
                        └──> [Sandbox (Docker, untrusted code boundary)]
```

- **Untrusted:** client input, retrieved content, model output, sandbox code, external provider responses.
- **Trusted:** authz/approval/audit/secret stores, workflow state, policy data.

## 37.3 Threat Model (STRIDE summary)

| Threat | Mitigation |
|--------|-----------|
| **Spoofing** — impersonate CEO/agent | Server-side sessions (revocable), Argon2id passwords, token hashing, actor identity on every request and event |
| **Tampering** — alter audit/policy/approval data | Append-only hash-chained audit; immutable constitutions/policies/agent versions; DB permissions; RLS later |
| **Repudiation** — deny actions | Full audit trail with actor, action, approval, outcome |
| **Information disclosure** — exfiltrate memory/secrets/customer data | Permission-aware retrieval, tenant isolation, encrypted secrets, secret redaction, no secrets in prompts/logs/frontend, sandbox network policy, model provider isolation, data exfiltration controls |
| **DoS** — exhaust resources/spend | Rate limits, operational limits (spend/iterations/time/tool calls), budget ceilings, concurrency caps, sandbox resource limits, queue backpressure |
| **Elevation of privilege** — agent grants itself authority | Authority profiles immutable to agents; delegations cannot exceed grantor; approval/authority writes human-gated; constitution changes human-only |
| **Prompt injection** — hostile content steers agents | Untrusted-content tagging, instruction separation, tool-level authorization outside model, no governance instructions in retrieved content, sandboxing, output validation |
| **Insecure integration** — OAuth/keys misuse | Scoped OAuth, encrypted token storage, per-capability grants, revocation, audit of key access |
| **Side effects** — duplicate/unauthorized execution | Idempotency keys, approval expiry, execute-once semantics, server-side approval verification (§73) |

## 37.4 Security Controls by Layer

### Authentication & Session
- Argon2id password hashing; server-side sessions with hashed tokens; expiry + revocation (logout, password change, emergency).
- Multi-factor later (TOTP, OSS). OIDC/SSO later via adapter (ADR-007).
- Session bound to user + org; org switching re-validates membership.

### Authorization
- RBAC for humans (owner/admin/member/viewer) + Authority Profiles for agents + Permission grants (granular tool capabilities) + Approval rules + emergency controls.
- Single `AuthzService` consulted by every service; denials audited (`access_events`).
- Constitution forbidden actions compile to hard deny rules (no approval path).

### Tenant Isolation
- `org_id` on every row; API derives org from session (never client); cross-org access denied at authz layer.
- Phase 16: Postgres RLS as defense-in-depth; periodic isolation validation tests.

### Secrets
- Encryption at rest: AES-256-GCM; data key per org, wrapped by master key from environment/KMS (KMS-ready interface).
- User provider keys: encrypted, masked in UI, never in frontend JS, never logged, never in prompts, never in API responses, rotatable, revocable, access-audited.
- OAuth tokens: same encryption; scoped; revoked on disconnect.
- Secret redaction pipeline on logs and memory writes (no secret values in memory).

### Model & Prompt Security
- Model Gateway (LiteLLM) centralizes provider access; org-scoped virtual keys; no raw provider keys in agent code.
- System prompt = organization policy + task; retrieved content explicitly tagged untrusted.
- Structured tool protocol: the model emits typed tool requests; runtime validates against permission profile before execution.
- Model output: schema validation; consequential outputs (money, comms, deploy) pass through approval gates regardless of model confidence.

### Sandbox (§43)
- Ephemeral Docker containers: isolated filesystem, network policy (egress allowlist), resource limits (CPU/mem/time), secrets isolation (no host secrets), command allow/deny, repository access controls, full audit events.
- Engineering execution never runs on the host.
- gVisor/Firecracker evaluated in Phase 16 for stronger isolation.

### Rate & Operational Limits (§83)
- Per-actor: max concurrent tasks, execution time, model spend, tool calls, retries, delegation depth, outbound communication rate, financial authority.
- Agent-agent loops: explicit termination conditions.
- Emergency controls override everything at platform layer.

### Audit
- Append-only hash-chained audit (§34.4); no update/delete path; queried via `audit` module.
- Every approval, denial, spend, tool execution, config change, and emergency action recorded.

## 37.5 Compliance & Data Governance (§38 preview)

- Data classification: public/internal/confidential/restricted; memory entries carry permission classes.
- Data handling rules from Constitution enforced in retrieval + storage.
- Retention: soft-delete + purge policies configurable per org; audit trail retained per policy (append-only, exportable).
- GDPR-ready foundations: data export, org deletion workflow, consent metadata (hardening in Phase 16).

## 37.6 Security Testing (see §44)

- SAST (lint + type-check + `eslint-plugin-security`), dependency audit (`pnpm audit`), container image scanning.
- DAST on API in CI; fuzzing of untrusted content parsers.
- Red-team scenarios: prompt-injection benchmark suite, cross-tenant access tests, audit-tamper tests, approval-bypass tests.
- Third-party code reviewed for license + security before integration (ADR-010).

## 37.7 Incident Response

- Emergency controls are the first line (pause org, revoke financial execution, stop comms, freeze deploys).
- Audit trail supports reconstruction; runbook (52_ later) documents escalation.
