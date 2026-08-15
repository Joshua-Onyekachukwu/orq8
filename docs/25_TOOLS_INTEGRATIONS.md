# 25 — Tools & Integrations

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 25.1 Principle (§40)

Build an **integration framework**, not hard-coded apps. A registered Integration exposes a **capability catalog**; agents hold capability-level grants (read yes / write yes / pr yes / merge no — never one big "GitHub access").

## 25.2 Integration Lifecycle

1. **Catalog entry** (`integrations`): key, name, definition_ref, capability catalog, status.
2. **Connect:** OAuth where available (scoped, encrypted refresh tokens, revocation); API-key where OAuth absent. `integration_accounts` stores encrypted token + scopes.
3. **Use:** agents invoke tools backed by the account; every call passes Tool Layer (permission + approval + limits + audit).
4. **Monitor:** health checks; `tool.failed`; auto-disconnect on auth failure with alert.
5. **Revoke:** disconnect revokes tokens; dependent workflows fall back or need-human.

## 25.3 Integration Categories (§40)

| Category | Examples | Auth |
|----------|----------|------|
| Communication | Gmail, Outlook, Slack, Teams | OAuth |
| Project management | Trello, Linear, Jira, Asana, Notion | OAuth |
| Development | GitHub, GitLab, Bitbucket, Vercel, CI/CD, cloud | OAuth/pat |
| CRM/Sales | HubSpot, Salesforce | OAuth |
| Analytics | Google Analytics, product analytics | OAuth/API key |
| Finance | accounting, payment providers, expense systems | OAuth/API key |
| Voice | telephony/voice provider (Phase 13) | API key |

Google APIs use standard OAuth 2.0 with scoped permissions, secure refresh-token storage, revocation — credentials never hard-coded (brief §40).

## 25.4 Tool Registry

`tools` (builtin | integration | internal) + `internal_tools` (27) + `tool_permissions` (actor × tool × capability × effect). Discovery: internal marketplace search (27.4) — "do we already have something that extracts PDF data?"

## 25.5 Safety

- Untrusted external results are tagged; never treated as governance (37).
- Rate limits per tool; command allow/deny for execution tools; sandbox for code (30).
- Every execution: `tool.connected/disconnected/failed`, audit rows, cost attribution.

## 25.6 Phase 8 Scope (initial high-value)

GitHub (read/write/branch/PR — merge approval-gated) · email (Gmail/Outlook: draft vs send separated) · Linear/Jira (read/sync/create) · calendar. Everything else follows the roadmap (48). Endpoints/scopes verified against current official docs at implementation (§65).
