# 14 — Team & Council System

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 14.1 Teams

A Team is a group of employees bound to an objective (R-ORG-2).

| Type | Lifecycle | Example |
|------|-----------|---------|
| Permanent | Lives with department | Core platform team |
| Temporary | Project-scoped; archived on completion | Kenya Market Expansion Team |
| Cross-functional | Spans departments | Launch squad |
| Council (14.3) | Decision-scoped; dissolved after recommendation | Investment Committee |

Assembly: a manager (or the Executive Agent) selects members, defines roles, mission, stop conditions, and budget. Members work in parallel; dependencies tracked in the Task Engine (15).

Temporary teams archive with: project results, decisions, lessons → memory, performance notes, and member releases (temporary agents offboarded per 10).

## 14.2 Council Flow (§15)

```
Question → Select members → Independent analysis → Challenge/disagreement → Synthesis
        → Recommendation → Human approval where required
```

- **Independent analysis:** members research without sharing intermediate reasoning (reduces groupthink).
- **Debate:** members challenge assumptions and each other; disagreements are recorded as Deliberations with evidence, assumptions, confidence, unresolved questions.
- **No forced consensus:** positions (for/against/abstain) are preserved in the record.
- **Synthesis:** Executive Agent produces one recommendation with confidence + required approval (explain-why, 19/35).
- Private chain-of-thought is never exposed (R-ORG-4).

## 14.3 Council Types (configurable templates)

Executive Council · Investment Committee · Product Council · Architecture Council · Risk Committee · Hiring Committee

## 14.4 Conflict Detection (§16)

The system identifies disagreements, evidence, assumptions, confidence, unresolved questions. The Executive Agent surfaces conflicts and recommends resolution order (e.g., "resolve the compliance risk before spend authorization").

## 14.5 Data Model

`teams`, `team_members`, `councils`, `council_members`, `deliberations`, `recommendations`, `decisions` (34). Events: `council.convened`, `council.member_position`, `council.deliberated`, `council.concluded`, `decision.created`.
