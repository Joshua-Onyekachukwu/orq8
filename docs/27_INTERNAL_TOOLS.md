# 27 — Internal Tools

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 27.1 Purpose (§22)

Engineering builds tools for other departments when economically justified. Every internal tool is **registered and operated** like a product: owner, docs, health, cost, permissions. Over time the organization grows its own technology ecosystem.

## 27.2 Registry Fields (§22)

name · description · owner · department · repository · deployment · API · documentation · users · permissions · infrastructure cost · maintenance status · health · version · dependencies

## 27.3 Build Request Workflow

1. Need discovered (or raised by a department).
2. **Capability resolution first** (26): internal/external/OSS alternatives checked.
3. Business case: expected workload, cost, maintenance, alternatives — approval per matrix.
4. Engineering executes in the sandbox (30) with review gates (29).
5. **Register** (`tool.registered`), document, deploy, monitor health.
6. Operate: maintenance status, dependency updates, cost attribution; retire via change management.

## 27.4 Internal Marketplace (§23)

Search: "Do we already have something that extracts PDF data?" returns ranked: internal tool · external connected tool · approved SaaS · open-source option · recommendation. This is the discovery surface for both humans and agents.

## 27.5 Governance

- Permissions: tool-level capabilities tied to Authority Profiles (18/25).
- Audit: every call recorded; cost attributed (24).
- Security: internal tools run under the same sandboxing/secret rules as external code (30/37).

## 27.6 Phase 11 Scope

Registry + marketplace + build-vs-buy analysis + engineering request workflow. Example first internal tools: PDF extraction, market-data aggregator, internal reporting scraper.
