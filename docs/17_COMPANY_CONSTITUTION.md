# 17 — Company Constitution

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 17.1 Purpose

Every organization on ORQ8 has a **Company Constitution**: the hard governance principles every agent, workflow, and human role operates under. It is the highest-level policy object and is **versioned and auditable**.

Only authorized humans may change it. Agents can never modify governance — even with a hostile prompt (R-GOV-6, §75).

## 17.2 Constitution Structure

| Section | Contents |
|---------|----------|
| Mission | Why the organization exists |
| Vision | Where it is going |
| Values | Operating values |
| Strategic Principles | How strategy is made and changed |
| Forbidden Actions | Absolute prohibitions |
| Approval Requirements | Which actions require which approver |
| Risk Tolerance | Risk appetite per category |
| Spending Authority | Budget/authority defaults and escalation |
| Data Handling Rules | How data is stored, used, shared |
| Security Rules | Minimum security requirements |
| Decision-Making Rules | How decisions are made and recorded |
| Human Oversight | Where human approval is mandatory |
| Escalation Rules | When/how to escalate |
| Operating Principles | Day-to-day operating rules |

## 17.3 Example Clauses (template defaults)

> No agent may make a legally binding commitment on behalf of the company without CEO approval.

> No agent may delete production data without explicit authorization.

> Major strategic changes require CEO approval.

> No agent may spend above its spending authority; all spend above the financial approval matrix threshold requires approval through the Approval Engine.

> No agent may contact external customers or send outbound communications without the communication authority granted in its Authority Profile.

> The organization must maintain an append-only audit trail of all consequential actions.

> The CEO is the final authority; any recommendation may be overridden, with the override recorded.

## 17.4 Versioning & Audit

- Constitution rows are immutable; editing creates a new version with `published_by`, `published_at`, `supersedes`.
- Only human roles with `constitution:write` permission (Owner by default) may publish.
- Every change emits `constitution.updated` and an audit event with before/after diff reference.
- Policies may reference a constitution version; enforcement reads the **currently effective** version (never a draft).

## 17.5 Enforcement Model

The Constitution is compiled into **enforcement primitives**:
- **Forbidden actions** → deterministic deny rules in the Authz Service (hard block, no approval path).
- **Approval requirements** → Approval Rules in the Approval Engine.
- **Spending authority** → Financial Controls (target/warning/ceiling, per-transaction/cumulative authority).
- **Data/security rules** → data-access permissions and secret policies.
- **Escalation rules** → workflow escalation hooks and attention-model routing.

Prompt text may *restate* the constitution, but enforcement never depends on it (ADR: authorization outside the model).

## 17.6 Onboarding Flow

1. Greenfield: CEO creates org → default Constitution template is proposed → CEO edits/accepts → published as v1.
2. Import: discovered policies from the existing business are presented as a draft for CEO review → published.

## 17.7 Schema Sketch

```
constitutions: id, org_id, version, title, body (structured sections jsonb),
               status (draft|published|superseded), published_by, published_at, supersedes_id
constitution_approvals: id, constitution_id, approver_user_id, decision, note, created_at
```

## 17.8 UI Notes

- Settings → Governance → Constitution: read-only view by default; edit creates draft → diff → publish (with approval if policy requires).
- Every agent-facing page links to relevant constitution clauses when an action is denied (explain-why for denials).
