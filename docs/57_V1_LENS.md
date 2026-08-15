# 57 — V1 Lens (scope filter for the development handoff notes)

**Product:** ORQ8 — AI Organization Operating System
**Status:** Phase 1 · Adopted as a *supplement* to docs/49, not a parallel plan

This doc maps the **12 v1 items** from the development handoff notes onto our existing phase plan, and records the additive items we adopted. Where the handoff and docs/49 differ, the resolution is stated here so there is one source of truth. It does **not** re-plan the product — it filters and sharpens the existing plan.

---

## 57.1 The 12 v1 items → phases

| # | Handoff item | Where it lives | Status |
|---|---|---|---|
| 1 | CEO Home Screen (one screen) | Phase 3 (Executive screen chat mode) + Phase 4 (Work Center) | Planned |
| 2 | Executive Agent | Phase 3 (Executive Agent workflow) | Planned |
| 3 | Hiring Flow (max 5 agents, "Hire" never "Create") | Phase 2 (hiring lifecycle, business_cases, agent templates 17d) | Planned |
| 4 | Org Explorer (tree: CEO → Executive → Depts → Agents) | Phase 2 (organization explorer UI) | Planned |
| 5 | Goals + Tasks (status: ready/running/blocked/done) | Phase 4 (goals, projects, tasks, kanban/list) | Planned |
| 6 | One Approval Gate (server-side, one level) | Phase 5 (Approval Engine) — Phase 1–3 queue approvals structurally | Planned |
| 7 | Model Router with BYOK (encrypted, masked, never logged) | Phase 7 (Model Gateway) — **provider config + encrypted secrets already built (Phase 1, docs/23/37)** | 🔶 Built (key mgmt), routing in 7 |
| 8 | Basic Company Memory (pgvector, permission-aware) | Phase 3 (Company Memory, configurable EMBED_DIM) | Planned |
| 9 | Audit Trail (append-only) | Phase 1 (audit hash chain) + Phase 5 (audit UI) | ✅ Built (append-only) |
| 10 | Weekly Report (one page) | **Pulled forward to Phase 3** (see 57.3) | Planned (moved) |
| 11 | One Integration (GitHub) | Phase 8 (GitHub integration — the v1 engineering path) | Planned |
| 12 | Constitution (minimal, 3–5 rules, code-enforced) | Phase 5 (Constitution editor + enforcement); seed 17b/17c ready | Planned |

**Verdict:** all 12 are already inside docs/49's phases. Nothing in the handoff requires a new phase — the only changes are the two pull-forwards below and the two corrections in 57.4.

---

## 57.2 Progressive disclosure (adopted)

From the handoff §2.1: *the UI grows as the org grows*. Navigation for a workspace only appears when its first object exists:

- 1 agent → CEO Home + Org Explorer only.
- First goal → Goals view appears. First approval queued → Decision Center appears. First integration → Integrations tab appears.

**Consequence for builds:** empty-state pages are avoided where the feature is unearned. The `/app` shell and settings keep only what's real for the user's org state. This is a UX rule for Phases 2–5 UI work, recorded here so it isn't re-litigated.

---

## 57.3 Additive items adopted

| Handoff item | Decision | Phase |
|---|---|---|
| **Agent Activity Log** — plain-language per-agent timeline ("At 09:14 I researched… waiting for CEO") | Adopted. Part of agent profiles; events already flow through the audit framework (Phase 1), so this is a projection + copy layer | **Phase 2** (agent profile) |
| **Weekly CEO Report** (retention loop) | Adopted. Minimal version (goals progress, done/blocked, spend placeholder) built from audit trail + task tables | **Pulled forward to Phase 3** |
| **Undo / Rollback for agent actions** | Adopted as a design constraint: every consequential action records enough state to reverse (audit + outbox already capture actor/action/result). Full reversal UI with Phase 5 approvals | Phase 4–5 |
| **Cost widget on CEO Home** | Adopted (tiny, not a Finance workspace). Usage data arrives with Model Gateway (Phase 7); widget renders when data exists (progressive disclosure) | Phase 7 |
| **"Why did you do that?" explanation layer** | Adopted. One-sentence "because" inline on recommendations/delegations/approval requests; Executive generates it | Phase 3 (explain-why) |
| **Onboarding < 10 min** | Adopted as a Phase 1–2 acceptance metric: Solo Founder Starter template (Executive + Research + Writing), pre-filled constitution, BYOK paste-key flow, first-task suggestion | Phase 2 (templates) + Phase 3 (BYOK) |
| **Max 5 agents in v1** | Adopted as a soft ceiling until Phase 6 multi-agent; schema already models it | Phase 2+ |

---

## 57.4 Corrections to the handoff (where we deviate)

1. **Marketplace — "never," not "later."** The handoff lists an internal tool platform/marketplace as "Phase 11+." This contradicts **ADR-021**: ORQ8 operates **no agent marketplace, ever** — agents are hired within an organization; revenue comes from the operating system, not commissions. Any future "tool platform" is limited to in-org tools, never a cross-tenant marketplace.
2. **Supabase — hosting option, not the default backend.** The handoff says "PostgreSQL via Supabase — yes for v1." Our stack is self-hosted Postgres 16 + pgvector (docs/42), and we keep our own session auth (ADR-007). Supabase becomes the **managed production Postgres** (docs/58) — never a dependency of the app code itself.
3. **BullMQ/Redis — not adopted.** The handoff suggests a Redis job queue for v1. We already run **pg-boss on the existing Postgres** (Phase 1) — no new component, consistent with "no advanced infrastructure in v1."

---

## 57.5 How to use this doc

- **Build agent:** when scoping a Phase 2–5 issue, check the table — if it's in the handoff's 12 and not mapped, flag it. If a build exceeds a mapped item, stop and ask (handoff §1.3: "if tempted to add a 13th thing, ask whether one of the 12 is incomplete").
- **Reviewer:** this doc is the tiebreaker between the handoff and docs/49. It intentionally does not restate the brief's vision — that's docs/00–56.
- **GitHub:** milestone checklists for Phases 2–5 should reference the item numbers above (e.g., "57.1-#4 Org Explorer").
