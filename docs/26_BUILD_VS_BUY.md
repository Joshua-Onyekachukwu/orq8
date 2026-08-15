# 26 — Build vs Buy vs Adopt

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 26.1 Capability-Resolution System (§21)

When the organization needs a capability:

1. Search **existing internal tools** (registry, 27)
2. Search **connected applications** (25)
3. Search **approved external tools** (procurement registry, 80)
4. Search **open-source solutions**
5. Evaluate **build internally**
6. Compare → recommend

## 26.2 Evaluation Criteria (§21)

cost · development time · maintenance · security · reliability · scalability · privacy · integration difficulty · vendor lock-in · quality · strategic importance · expected workload

## 26.3 Outcomes

**BUY** · **ADOPT OPEN SOURCE** · **BUILD** · **USE EXISTING INTERNAL TOOL**

Each outcome is recorded in `capability_evaluations` with criteria scores, recommendation, decision, and explain-why. AppSumo-style lifetime deals may be a software-acquisition category but **never a platform dependency** (brief §21).

## 26.4 Recommendation Format (explain-why, §35)

> Recommendation: BUY
> Evidence: existing product satisfies 92% of requirements
> Alternative: build internally
> Why rejected: 3 weeks of engineering time for a non-strategic capability

## 26.5 Procurement Integration (§80)

Default evaluation path: **Already Owned → Existing Integration → Internal Tool → Open Source → External SaaS → Build**. `procurement_records` track subscriptions, domains, licenses, vendors, renewal dates, owners, spending limits, cancellation recommendations — so the org never buys what it already owns.

## 26.6 Flow

`capability needed → search registries → score options → recommendation → approval (per matrix) → action → register result`

Decisions feed Company Memory (precedent) so future agents don't re-litigate.
