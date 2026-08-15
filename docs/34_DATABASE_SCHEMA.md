# 34 — Database Schema

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

**Source of truth:** Drizzle schema in `packages/db` (implemented in Phase 1). This document is the design reference.

## 34.1 Conventions

- **PostgreSQL 16 + pgvector.**
- Every business table carries `org_id` (tenant). `org_id` is part of most unique indexes.
- IDs: `uuid` (or `ulid` for time-ordering where useful). Audit chain uses sequential `bigint`.
- Timestamps: `created_at`, `updated_at` everywhere; `deleted_at` for soft-delete where retention matters.
- Enums as Postgres enums or constrained text (text + check preferred for evolution).
- JSONB for flexible structured data (authority profiles, policies, evidence, conditions).
- Immutable tables: `audit_events`, `agent_versions`, `constitutions` (published rows), `cost_entries`.
- **Embedding dimension** (`EMBED_DIM`) is deployment-configurable — default matches the configured embedding model (768 for Ollama nomic-embed-text; 1536 for OpenAI text-embedding-3-small). Never hard-coded (ADR-012).
- **Employee polymorphism (v1):** managers/owners are agents; the `employee_type (agent|user)` pattern (as in `team_members`) is reserved for future human employees (ADR-011).

## 34.2 ERD (summary)

```
users ──< memberships >── organizations
organizations 1─N departments 1─N positions 1─N agents
agents 1─N agent_versions · agents 1─1 authority_profiles
organizations 1─N goals 1─N objectives 1─N projects 1─N tasks
tasks N─N tasks (dependencies)
agents N─M councils (council_members) · councils 1─N deliberations 1─N recommendations
organizations 1─N workflows 1─N workflow_runs 1─N workflow_steps
organizations 1─N decisions 1─N evidence_items
organizations 1─N memory_entries · memory_entries N─M evidence_items
organizations 1─N integrations 1─N integration_accounts · integrations 1─N tools
tools N─M agents (tool_permissions)
organizations 1─N providers · providers 1─N models
organizations 1─N user_provider_keys · organizations 1─N model_usages · 1─N cost_entries
organizations 1─N approvals · 1─N delegations · 1─N emergency_controls · 1─N financial_controls
organizations 1─N audit_events (chained) · 1─N reports · 1─N metric_snapshots
```

## 34.3 Tables (per domain)

### Identity
- `users` (id, email, name, password_hash, status, created_at, updated_at)
- `organizations` (id, name, slug, plan, status, constitution_version_ref, settings jsonb, created_at)
- `memberships` (id, org_id, user_id, role [owner|admin|member|viewer], status, created_at)
- `sessions` (id, user_id, org_id, token_hash, expires_at, revoked_at, created_at, ip, user_agent)

### Organization
- `departments` (id, org_id, name, slug, head_position_id, parent_id, status, created_at)  — budgets live only in `financial_controls` (ADR-015)
- `teams` (id, org_id, name, team_type [permanent|temporary|cross_functional], project_id, status, archived_at)
- `team_members` (id, team_id, employee_type [agent|user], employee_id, role, joined_at, left_at)
- `positions` (id, org_id, department_id, title, manager_position_id, employee_type, employee_id, status)
- `agents` (id, org_id, name, title, department_id, manager_agent_id, mission, responsibilities jsonb, capabilities jsonb, employment_type, status, current_version_id, template_id, hire_business_case_id, created_at)
- `agent_versions` (id, org_id, agent_id, version, instructions text, model_policy_id, knowledge_sources jsonb, tool_grants jsonb, authority_profile_id, supersedes_id, published_at, status)
- `employment_records` (id, org_id, agent_id, event [proposed|hired|onboarding|active|restricted|under_review|suspended|offboarded|archived], at, by, note)
- `agent_templates` (id, org_id, name, category, base_config jsonb, status)
- `authority_profiles` (id, org_id, agent_id, version, profile jsonb, status, supersedes_id, approved_by, approved_at)

### Governance
- `constitutions` (id, org_id, version, title, body jsonb, status [draft|published|superseded], published_by, published_at, supersedes_id)
- `policies` (id, org_id, name, type [financial|approval|communication|security|data], body jsonb, version, status, supersedes_id)
- `permissions` (id, org_id, actor_type, actor_id, resource_type, resource_id, action, effect, created_by, created_at)
- `approval_rules` (id, org_id, name, action_pattern, required_tier, amount_range, conditions jsonb, enabled)
- `approvals` (id, org_id, resource_type, resource_id, action, requested_by, required_tier, status, approver, decision_note, evidence_refs jsonb, expires_at, decided_at)
- `delegations` (id, org_id, grantor_actor, grantee_actor, scope jsonb, amount_limit, action_types jsonb, time_limit, conditions jsonb, status, revoked_at)
- `emergency_controls` (id, org_id, scope, scope_id, control_type, active, activated_by, activated_at, deactivated_at)
- `financial_controls` (id, org_id, entity_type, entity_id, period, allocated, warning, ceiling, per_txn_authority, daily_authority, weekly_authority, monthly_authority, payment_authority jsonb, version)

### Strategy
- `goals` (id, org_id, title, description, status, owner_agent_id, deadline, success_criteria jsonb, created_at)
- `objectives` (id, org_id, goal_id, title, owner_agent_id, deadline, status)
- `strategies` (id, org_id, goal_id, title, body, status, version)
- `stop_conditions` (id, org_id, entity_type, entity_id, success jsonb, continue jsonb, pause jsonb, escalate jsonb, abandon jsonb, review_schedule)
- `kpis` (id, org_id, objective_id, name, metric_key, target, current_value, unit, source, status, created_at)  — first-class KPI records (ADR-013); feed metric_snapshots, health, reports

### Work
- `projects` (id, org_id, objective_id, name, description, status, start_at, end_at, budget_allocation_id, stop_condition_id, created_at)
- `tasks` (id, org_id, project_id, objective_id, title, description, status, assignee_agent_id, priority, due_at, effort_estimate, output_refs jsonb, workflow_run_id, created_at, updated_at)
- `task_dependencies` (id, org_id, task_id, depends_on_task_id, kind [blocked_by|requires])
- `workflows` (id, org_id, name, spec jsonb, version, status) — spec = steps/branches/approvals/events (WorkflowSpec)
- `workflow_runs` (id, org_id, workflow_id, trigger, state jsonb, status, started_at, ended_at, error)
- `workflow_steps` (id, org_id, run_id, step_key, status, input_ref, output_ref, attempts, started_at, ended_at, error)
- `commitments` (id, org_id, kind [customer|deadline|contract|financial|vendor|product|internal], subject, description, owner_actor, status, due_at, monitor_policy jsonb, created_at)
- `blocks` (id, org_id, entity_type, entity_id, reason, blocker_type, resolver, status, created_at, resolved_at)

### Decisions
- `decisions` (id, org_id, question, status, requester, owner, date, participants jsonb, evidence_refs jsonb, alternatives jsonb, reasoning, expected_outcome, review_date, outcome)
- `councils` (id, org_id, question, status, convened_by, convened_at, concluded_at, decision_id)
- `council_members` (id, council_id, agent_id, role, analysis_ref, position [for|against|abstain], confidence)
- `deliberations` (id, council_id, challenger_id, target_id, disagreement, evidence_refs jsonb, assumptions jsonb, confidence, unresolved_questions jsonb)
- `recommendations` (id, org_id, decision_id, recommendation, evidence, assumptions, alternatives, risks, expected_outcome, confidence, required_approval, created_by)
- `evidence_items` (id, org_id, kind [doc|url|event|tool_result|metric|memory], ref, summary, captured_at)

### Memory
- `memory_entries` (id, org_id, category, title, body, evidence_type, confidence, permissions jsonb, source_refs jsonb, tags, author_type, author_id, embedding vector(1536), created_at, updated_at)
- `memory_revisions` (id, entry_id, body, changed_by, changed_at)
- `documents` (id, org_id, name, mime, storage_key, extracted_text, chunked, status, source_refs jsonb, created_at)
- `lessons_learned` (id, org_id, project_id, lesson, category, severity, created_at)
- `decision_precedents` (id, org_id, decision_id, topic, decision, accepted_approach, rejected_approaches jsonb, reasoning, conditions_at_time jsonb, still_valid_check, review_date, outcome, source_memory_id)

### Tools
- `integrations` (id, org_id, key [github|gmail|slack|linear|notion|...], name, definition_ref, capability_catalog jsonb, status)
- `integration_accounts` (id, org_id, integration_id, account_label, token_encrypted, token_kid, scopes jsonb, status, connected_at, revoked_at)
- `tools` (id, org_id, name, kind [builtin|integration|internal], integration_id, internal_tool_id, capability_schema jsonb, status)
- `internal_tools` (id, org_id, name, description, owner_agent_id, department_id, repository_ref, deployment_ref, api_ref, documentation_ref, users jsonb, permissions jsonb, infra_cost, maintenance_status, health, version, dependencies jsonb, status)
- `tool_permissions` (id, org_id, actor_type, actor_id, tool_id, capability, effect)
- `capability_evaluations` (id, org_id, need_description, options jsonb, criteria_scores jsonb, recommendation, decision, decided_by, decided_at)
- `procurement_records` (id, org_id, kind [subscription|saas|domain|api|cloud|repo|infra|license|dataset|internal_tool|vendor|payment|channel], name, cost, billing_period, renewal_date, owner, approved_users jsonb, spending_limit, status, cancellation_recommendation)

### AI
- `providers` (id, org_id, key, name, base_url, supports_byok, status, created_at)
- `user_provider_keys` (id, org_id, provider_id, label, key_encrypted, key_kid, org_id_optional, enabled, allowed_models jsonb, spending_policy jsonb, last_verified_at, created_at, rotated_at, revoked_at)
- `models` (id, provider_id, model_id, capabilities jsonb, pricing jsonb, availability, default_use_cases jsonb, enabled)
- `model_policies` (id, org_id, scope, scope_id, allowed_models jsonb, cost_ceiling, fallback_order jsonb, version)
- `routing_rules` (id, org_id, name, task_class, characteristics jsonb, model_priority jsonb, cost_ceiling, enabled)
- `model_usages` (id, org_id, provider_id, model_id, task_id, agent_id, tokens_in, tokens_out, duration_ms, cost, created_at)
- `cost_entries` (id, org_id, kind [ai|tool|infra|voice|saas|internal], entity_type, entity_id, amount, currency, period, meta jsonb, created_at)

### Reporting
- `reports` (id, org_id, kind [weekly|monthly], period, body jsonb, status [draft|reviewed|delivered], prepared_by_agent_id, reviewed_by_agent_id, delivered_at, created_at)
- `metric_snapshots` (id, org_id, metric_key, value, unit, entity_type, entity_id, captured_at)

### Security
- `audit_events` (id bigserial, org_id, actor_type, actor_id, department_id, agent_id, task_id, action, tool, input_ref, result_ref, authorization, approval_id, policy_ref, cost, outcome, occurred_at, prev_hash, hash) — **append-only, hash-chained** (§34.4)
- `secret_records` (id, org_id, kind, masked_ref, key_kid, rotated_at, accessed_at, status) — never the value
- `access_events` (id, org_id, actor_type, actor_id, resource_type, resource_id, action, decision [granted|denied], reason, at)

### Runtime records (added in the Phase 0 full set, ADR-016)

- `business_cases` (id, org_id, title, department_id, manager ref, mission, responsibilities jsonb, capabilities jsonb, model_policy_id, tool_grants jsonb, permissions jsonb, budget_policy jsonb, success_metrics jsonb, expected_workload, expected_cost, reason, alternatives jsonb, temporary, status [draft|proposed|approved|rejected|hired|cancelled], precheck jsonb, recommendation_ref, decided_by, decided_at)
- `import_runs` (id, org_id, status [connecting|discovering|mapping|findings|correcting|proposing|simulating|approved|activated|cancelled], sources jsonb, findings_refs, assumptions jsonb, baselines_refs, proposal_ref, activated_at)
- `sandbox_runs` (id, org_id, task_id, agent_id, repo_ref, image, command_allowlist jsonb, limits jsonb, status, exit_code, output_ref, duration_ms, cost, created_at)
- `simulation_runs` (id, org_id, kind, proposal_ref, inputs jsonb, results jsonb, assumptions jsonb, confidence, status, created_at)
- `agent_eval_runs` (id, org_id, agent_id, agent_version_id, model_policy_id, benchmark_id, metrics jsonb, score, status, created_at)

## 34.4 Append-Only Audit with Hash Chain

`audit_events.hash = sha256(prev_hash || org_id || actor || action || payload || occurred_at)`.

- `prev_hash` = hash of the previous row (per-org chain seed `org_id` + genesis salt).
- Any modification to an older row invalidates the chain — tamper-evident without external services (free-first; external immutable ledger optional later).
- Audit writes go through a dedicated service with no update/delete path.

## 34.5 Indexes & Performance

- All FK columns indexed; unique `(org_id, slug/name)` where applicable.
- `memory_entries.embedding` → ivfflat index (pgvector); tune for dataset size.
- `model_usages` / `cost_entries` partitioned by month at scale.
- `audit_events` partitioned by month; `org_id + occurred_at` composite index.
- `approvals` index on `(org_id, status, created_at)` for the Decision Center queue.
- `tasks` index on `(org_id, status, assignee_agent_id)` for work queues.

## 34.6 Migrations & Dev

- Drizzle migrations in `packages/db`; `pnpm --filter @orq8/db migrate` (dev) / `migrate:prod`.
- Seeds: default admin org, constitution template, agent templates, model/provider catalog, example departments.
