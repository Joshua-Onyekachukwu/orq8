# 10 — Agent Lifecycle

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 10.1 Lifecycle States

```
Proposed → Hired → Onboarding → Active ⇄ Restricted
                                    ⇅
                              Under Review
                                    ⇅
                              Suspended → Offboarded → Archived
```

(From 05/34: `agents.status` and `employment_records` events. §82 adds Restricted and Under Review before suspension.)

| State | Meaning | Allowed |
|-------|---------|---------|
| Proposed | Business case drafted | nothing operational |
| Hired | Approved + provisioned | onboarding steps |
| Onboarding | Setup: knowledge, tools, authority, model policy, test task | onboarding tasks |
| Active | Full duty within Authority Profile | assigned tasks |
| Restricted | Reduced authority (investigation, incident) | limited actions per restriction |
| Under Review | Performance investigation | review-scoped work |
| Suspended | Work halted (temporary) | none |
| Offboarded | Removed, knowledge transferred | none |
| Archived | Historical record | none |

## 10.2 Transition Rules

- **Who can trigger:** Active↔Restricted, Suspend, Offboard = CEO (or delegated Head) via approval-gated actions. Onboarding→Active = system after onboarding checklist. Proposed→Hired = approval engine.
- Every transition writes an `employment_records` row + audit event + `agent.*` event.
- **Offboarding is not deletion.** Preserve: historical work, decisions, performance, useful knowledge, audit trail (§12). Selectively transfer approved knowledge to the replacement (memory entries + precedents + project context).

## 10.3 Onboarding Checklist (default)

1. Authority Profile published (v1) — permissions reviewed, not inherited blindly (§82.1)
2. Model policy assigned + verified routable
3. Tools granted at capability level (GitHub read only, etc.)
4. Knowledge sources: memory categories, documents, precedents relevant to role
5. Instructions v1 + success metrics defined
6. Sandbox/workspace provisioned (engineering roles)
7. Test task executed; eval score baseline recorded (45)
8. Manager + department + team links set; onboarding event emitted

## 10.4 Succession (§82.1)

Critical roles define: **Primary Agent → Backup Agent → Department Head → Executive Agent**.

- Replacement receives: active tasks, project context, decisions, responsibilities, commitments, lessons, approved knowledge.
- **Permissions are re-evaluated, not copied** (a successor's Authority Profile is a fresh review).

## 10.5 Continuity (§82.2)

The organization continues operating after: agent failure, model/provider/tool outage, replacement, restructuring, revoked credentials. Critical workflows declare recovery + handoff procedures (dependencies, who picks up blocked work, idempotency).

## 10.6 Versioning Ties

Config changes never silently overwrite: a change = new `agent_versions` row, evaluated against benchmarks (11/45) before deploy to important workflows.

## 10.7 Data Model

`agents`, `agent_versions`, `employment_records`, `authority_profiles`, `agent_templates` (34). Events: `agent.proposed/hired/onboarded/restricted/under_review/suspended/offboarded/archived/version_published`.
