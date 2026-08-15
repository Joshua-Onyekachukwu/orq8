# 48 — Integration Roadmap

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 48.1 Principle

Do not build every integration at once (brief §40). Prioritize by value to the Golden Workflow and the wedge market.

## 48.2 Tiers

| Tier | Integrations | Phase |
|------|-------------|-------|
| 1 (initial) | GitHub, Gmail/Outlook (draft vs send), Linear/Jira, calendar | 8 |
| 2 (import) | Website fetch, repo analysis, Notion, Google Drive, Slack read, CRM read | 10 |
| 3 (ops) | Slack/Teams, Asana, Trello, HubSpot/Salesforce, GA/product analytics | 11+ |
| 4 (finance) | accounting, payment providers, expense systems | 12+ |
| 5 (voice) | telephony/voice provider | 13 |

## 48.3 Capability Catalogs (per integration)

Each integration exposes capabilities (25.2) — e.g., GitHub: read repo / create branch / write files / create commit / create PR / merge PR / delete branch. Grants are per-capability; merge/deploy default approval-gated.

## 48.4 Verification Requirement (§65)

Before implementing any integration, verify from **current official documentation**: auth method, scopes, pricing/free tier, data accessed, webhook support, security considerations, fallback. Do not invent endpoints/prices. Each integration gets an inventory row (provider · purpose · docs URL · key/OAuth · webhooks · pricing · data · scopes · security · fallback · user-owned key? · platform creds? · phase).

## 48.5 Maintenance & Fallback

- Health checks per account (25.2); `tool.failed` events; fallback: workflow pauses or routes to need-human.
- Revocation handling: token expiry → alert → reconnect flow → dependent tasks queued.

## 48.6 Marketplace (later)

Integration marketplace + internal tool marketplace (27.4) as revenue/ecosystem plays (55).
