# 21 — Memory & Knowledge

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 21.1 Purpose

Company Memory is the organization's persistent institutional knowledge. It makes the organization **continuous**: decisions, lessons, and context survive agent replacement, model changes, and time. Memory is permission-aware — agents retrieve only what their Authority Profile allows (§33, R-MEM-2).

## 21.2 Memory Categories

| Category | Examples |
|----------|----------|
| company profile | identity, positioning, business model |
| decisions | decisions + reasoning + outcomes (→ Decision Precedent) |
| strategy | strategies, plans, priorities |
| goals | goals, objectives, KPIs, progress |
| processes | how we do X, runbooks, playbooks |
| documentation | product docs, architecture docs |
| customer knowledge | segments, personas, feedback, accounts |
| technical knowledge | stack, patterns, gotchas, architecture decisions |
| project history | what was built, why, results |
| lessons learned | postmortems, mistakes, wins |
| agent history | what agents did, performance, handoffs |
| vendor/tool information | subscriptions, integrations, evaluations |

## 21.3 Evidence Types (§85)

- Verified Fact
- User Instruction
- Company Policy
- Decision
- Assumption
- Recommendation
- Unverified Information
- Historical Context

Confidence is stored alongside; the system never presents an assumption as a fact.

## 21.4 Memory Entry Model

```
memory_entries: id, org_id, category, title, body (text), evidence_type, confidence,
                permissions (jsonb: who may read), source_refs (jsonb: URLs/docs/events),
                tags, author_type (user|agent|system), author_id, created_at, updated_at
memory_revisions: id, entry_id, body, changed_by, changed_at   (entry history)
```

- Written by agents, humans, and system processes — each write is audited.
- Entries link to EvidenceItem(s) for traceability.
- Retrieval: hybrid keyword + pgvector embedding search, permission-filtered, bounded context budget.

## 21.5 Decision Precedent (§85)

Structured records so future agents understand *why* an approach was accepted or rejected and whether conditions have changed:

```
decision_precedents: id, org_id, decision_id, topic, decision, accepted_approach, rejected_approaches,
                     reasoning, conditions_at_time (jsonb), still_valid_check, review_date, outcome,
                     source_memory_id
```

Agents must check precedent before re-proposing rejected approaches; the Executive Agent reviews precedent when conditions change.

## 21.6 Knowledge Sources

- Uploaded documents (parsed, chunked, embedded)
- URLs (fetched, extracted, stored with source refs)
- Repository content (indexed later, Phase 9)
- Integration data (emails, tickets, CRM — read-permission gated)
- Agent outputs (reports, proposals marked for memory)
- Imported business artifacts (Phase 10)

## 21.7 Permission-Aware Retrieval

- Retrieval pipeline: query → permission filter (actor's data access + entry permissions + department scoping) → rank → return with evidence-type labels.
- Denials of retrieval are audited (`access.denied`).
- Sensitive entries (financial, legal, HR) carry higher permission classes; Constitution data rules apply.

## 21.8 Memory Hygiene

- Entries age: review flags for stale precedents (review_date).
- Dedup on write (semantic similarity check before insert).
- Sensitive-data redaction at write time (no secrets in memory; secret values never written by agents — SecretStore is separate and never model-visible).

## 21.9 Implementation Notes (Phase 3)

- `memory` module with pgvector: `POST /v1/memory`, `GET /v1/memory/search?q=`, `GET /v1/memory/precedents?topic=`.
- Executive Agent seeds memory at org creation (profile, constitution summary).
- Golden Workflow writes: decision, project history, lessons learned → precedent for next cycle.
