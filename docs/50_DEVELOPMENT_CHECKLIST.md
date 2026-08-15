# 50 — Development Checklist

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 50.1 Pre-Coding Gate (§64)

Before major implementation, the agent must:
1. Inspect repository/project context.
2. Understand all requirements (02).
3. Identify contradictions (ADR each one — 56).
4. Identify missing requirements.
5. Produce an architecture proposal (06).
6. Complete the documentation set (this repo).
7. Produce database/domain models (05, 34).
8. Produce API contracts (35).
9. Produce UI/UX architecture (33).
10. Produce security model (37).
11. Produce implementation dependency graph (49).
12. Identify risky technical assumptions (56 ADRs).
13. Identify third-party dependencies (46/47).
14. Identify open-source licensing concerns (47).
15. Identify external APIs/keys needed (23, 48, §65 table).
16. Identify what to build vs adopt (26).
17. Identify what stays configurable (models, providers, integrations, departments).
18. Produce the phased plan (49).
19. Only after approval begin implementation. — **Approved by CEO: pending.**

## 50.2 Per-Phase Checklist (from 49 DoDs)

- [ ] Code merged with unit + integration tests
- [ ] API contracts validated; error envelope + idempotency + audit present
- [ ] UI implemented in shared shell; no orphan screens
- [ ] Authz/approval/emergency checks tested for the phase's actions
- [ ] Events published for the phase's domains; SSE updates screens
- [ ] Docs updated where behavior diverged (ADR recorded)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` green; e2e (deterministic) green
- [ ] Runs on the free stack (no paid dependency required)

## 50.3 Golden Workflow Gates

- **v1 (Phase 6):** steps 1–13, 17–18, 21, 24 + minimal cost tracking + v1 weekly report (04.6).
- **Full (after 12–15):** all 25 steps incl. simulation, engineering build/buy, performance/replacement, business-unit expansion, full reporting.

## 50.4 Release Checklist (per deployment)

Backups verified · migrations forward-only · secrets via env · health endpoints up · alerts wired · rollback image tagged · runbook page updated (52).
