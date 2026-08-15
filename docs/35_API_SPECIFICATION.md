# 35 — API Specification

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 35.1 Conventions

- Base URL: `/v1`. JSON over HTTPS. SSE at `/v1/events`.
- Auth: `Authorization: Bearer <session_token>` (server-side sessions, ADR-007).
- Validation: Zod schemas shared from `packages/domain` (source of truth for contracts).
- Idempotency: `Idempotency-Key` header required on all mutating endpoints that trigger side effects; responses replayed on retry.
- Pagination: cursor-based (`?cursor=...&limit=50`, `next_cursor` in response) for lists; `limit` ≤ 100.
- Errors: HTTP status + envelope `{ "error": { "code", "message", "details?", "policy_ref?" } }`. Denials include the governing policy/constitution reference (§18.9).
- Success: `{ "data": ... }` (or `204`).
- Tracing: `X-Request-Id` echoed; every request logs audit/access events where relevant.
- All endpoints are tenant-scoped by session; `org_id` comes from the session, never the client.

## 35.2 Modules & Route Groups

| Module | Prefix | Key resources |
|--------|--------|---------------|
| auth | `/v1/auth` | register, login, logout, sessions, me |
| organizations | `/v1/orgs` | org, members, settings, constitution, plan |
| departments | `/v1/departments` | departments, teams, team_members, positions, org chart |
| agents | `/v1/agents` | agents, versions, employment, templates, authority profiles |
| hiring | `/v1/hiring` | business cases, proposals, pre-hire checks, approve |
| goals | `/v1/goals` | goals, objectives, kpis, strategies, stop conditions |
| projects | `/v1/projects` | projects, tasks, dependencies, blocks, commitments |
| workflows | `/v1/workflows` | specs, runs, steps, cancel/resume |
| decisions | `/v1/decisions` | decisions, councils, deliberations, recommendations |
| approvals | `/v1/approvals` | queue, approve, reject, modify, delegate, expire |
| memory | `/v1/memory` | entries, search, documents, precedents, lessons |
| tools | `/v1/tools` | registry, internal tools, capabilities, permissions |
| integrations | `/v1/integrations` | catalog, connect (OAuth), accounts, health |
| models | `/v1/models` | providers, user keys, model registry, policies, routing rules |
| usage | `/v1/usage` | model usage, cost entries, weekly/monthly cost views |
| reports | `/v1/reports` | weekly/monthly reports, metrics, org health |
| audit | `/v1/audit` | audit trail queries |
| simulations | `/v1/simulations` | org/workforce/cost/risk simulation runs |
| intelligence | `/v1/intelligence` | intent execution, executive actions |
| emergency | `/v1/emergency` | kill switches, org pause, action limits |
| events | `/v1/events` | SSE stream |

## 35.3 Representative Endpoints (contracts)

### Auth
- `POST /v1/auth/register` `{ email, password, org_name }` → org + owner membership + session
- `POST /v1/auth/login` `{ email, password }` → session
- `POST /v1/auth/logout`
- `GET /v1/auth/me` → user + memberships + active org

### Intelligence (golden entry point)
- `POST /v1/intelligence/execute`
  ```json
  { "input": { "type": "text|url|document|repository", "content": "..." }, "org_id": "..." }
  ```
  → `202 { "intent_id", "status": "classified", "summary": "I believe you want X...", "next": "council" }`
  The durable Executive workflow runs; outcome events stream via SSE.

### Agents
- `GET /v1/agents?department_id=&status=&cursor=`
- `GET /v1/agents/:id` → profile incl. current version, authority, performance summary
- `POST /v1/agents` (hiring) `{ business_case_id, ... }` → `202` → hiring flow
- `GET /v1/agents/:id/versions`
- `POST /v1/agents/:id/versions` (publish new version, requires evaluation note)
- `POST /v1/agents/:id/offboard` (approval-gated)

### Hiring
- `POST /v1/hiring/business-cases` `{ title, department, mission, responsibilities, capabilities, model_policy, tools, permissions, budget, reason, alternatives, temporary }`
- `POST /v1/hiring/pre-check` → `{ answers: [existing agent?, reassign?, internal tool?, connected tool?, external tool?, open source?, justified?] }`
- `POST /v1/hiring/:id/approve` | `/reject`

### Goals & Work
- `POST /v1/goals` · `GET /v1/goals/:id` · `POST /v1/goals/:id/objectives`
- `POST /v1/projects` `{ objective_id, name, stop_conditions, budget_allocation }`
- `POST /v1/projects/:id/tasks` `{ title, description, assignee_agent_id, due_at, priority }`
- `GET /v1/projects/:id/tasks?status=`
- `POST /v1/tasks/:id/block` · `/unblock`

### Decisions & Councils
- `POST /v1/decisions` `{ question, council?: { members: [agent_ids], prompt } }`
- `GET /v1/councils/:id` → independent analyses + deliberations (positions preserved)
- `GET /v1/decisions/:id` → recommendation with explain-why

### Approvals
- `GET /v1/approvals?status=pending` → Decision Center queue
- `POST /v1/approvals/:id/approve` `{ note }` · `/reject` · `/modify` `{ modification }` · `/delegate` `{ to }`

### Memory
- `POST /v1/memory` `{ category, title, body, evidence_type, permissions, source_refs }`
- `GET /v1/memory/search?q=&category=&evidence_type=`
- `GET /v1/memory/precedents?topic=`

### Tools & Integrations
- `GET /v1/tools?q=` (internal marketplace search)
- `POST /v1/tools/:id/permissions` `{ actor, capability, effect }`
- `POST /v1/integrations/:key/connect` → OAuth start; `GET /v1/integrations/:key/callback` → account stored encrypted
- `POST /v1/capabilities/evaluate` `{ need }` → `{ options, scores, recommendation }`

### Models & Usage
- `POST /v1/models/keys` `{ provider, label, api_key }` → masked confirmation; `POST /v1/models/keys/:id/test`
- `POST /v1/models/policies` `{ scope, allowed_models, cost_ceiling, fallback_order }`
- `GET /v1/usage/costs/weekly?org_id=` → `{ total, prev_total, delta_pct, by_department, by_model, by_project, high_cost_workflows }`
- `GET /v1/usage/costs/monthly?org_id=` → `{ ai, tools, infra, voice, saas, internal, per_department, per_goal, trends, projection }`

### Reporting
- `GET /v1/reports/weekly?period=` · `GET /v1/reports/monthly?period=`
- `POST /v1/reports/weekly/generate` (triggers reporting flow)

### Audit
- `GET /v1/audit?actor=&action=&from=&to=&cursor=` → hash-chained records
- `GET /v1/audit/:id` → full record

### Emergency
- `POST /v1/emergency/pause` `{ scope, scope_id }` · `POST /v1/emergency/resume` · `GET /v1/emergency/state`
- `POST /v1/emergency/limits` (configure operational limits)

### Simulations
- `POST /v1/simulations` `{ kind: "organization"|"workforce"|"cost"|"risk", proposal }` → `{ results, assumptions, confidence }` (never authoritative)

## 35.4 Error Codes (initial set)

- `auth.unauthorized` · `auth.session_expired` · `auth.forbidden` (denial, with policy_ref)
- `validation.failed` (details from Zod)
- `not_found` · `conflict` (unique/state conflict)
- `approval.required` (action queued: `approval_id` in details)
- `approval.expired` · `approval.rejected`
- `budget.ceiling_reached` · `budget.warning` (details: threshold type)
- `emergency.paused` (org/dept/agent paused)
- `limit.exceeded` (rate/spend/concurrency/iteration)
- `provider.unavailable` (with fallback info) · `model.insufficient`
- `tool.denied` (capability) · `integration.failed`
- `idempotency.replay` (same key, different payload) · `idempotency.conflict`

## 35.5 Webhooks (later)

Outbound webhooks for orgs that want events externally; inbound webhooks per integration (GitHub events, email, etc.) mapped to domain events via the event architecture.
