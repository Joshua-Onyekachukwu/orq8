# Archive

Nothing here is a current instruction. Every file below is kept because it is
evidence — of what was decided, what was measured, and what was already true —
and reading it as guidance would be a mistake. `docs/00_INDEX.md` is the list of
documents that *are* authoritative.

Archived: 2026-09-29, during the ecosystem reconciliation (report at
`docs/69_ECOSYSTEM_RECONCILIATION_REPORT.md`).

Archived 2026-10-02, during the docs/80 Phase 0/3 work:

| File | What it was | Why it is here | Read instead |
| --- | --- | --- | --- |
| `history/74_ORQ8_AUTONOMOUS_RUN_REVIEW.md` | Review guide for one autonomous run (2026-10-01), with its own verification counts and "still open" list | A dated snapshot: its test totals, route counts and open list have moved (docs/80 Phase 0/3 landed, docs/79 phases 5–7 shipped), so reading it as current guidance would mislead | `FOUNDER-GUIDE.md` (how to look at the product now), `docs/79` §13 (phase log), `docs/80` Appendix C (what shipped since) |

| File | What it was | Why it is here | Read instead |
| --- | --- | --- | --- |
| `superseded/43_DEPLOYMENT.md` | Deployment pipeline, artifacts, rollout | Describes the pre-Supabase single-host pipeline; the live path is different | `docs/58_DEPLOYMENT.md` |
| `superseded/49_IMPLEMENTATION_PLAN.md` | Phase 0–16 plan with gates G0–G4 | The phase structure came from a greenfield assumption; the repository already contained most of the system | `docs/66_ORQ8_MVP_MASTER.md` |
| `superseded/61_ORQ8_MASTER_IMPLEMENTATION_PLAN.md` | The 2026-09-27 reconciled plan for the whole requirement base | Superseded within a day by the MVP-scoped record, which measures the same system and is updated as work lands | `docs/66` |
| `superseded/ORQ8_IMPLEMENTATION_MASTER_PLAN.md` | A second document claiming to be the persistent source of truth | Two "master plans" is the conflict this reconciliation exists to end; one ledger now (`docs/68`) | `docs/68` |
| `superseded/ORQ8_CURRENT_STATE.md` | Long-form subsystem state, edited per session | Had gone stale in place (its own test counts are annotated "superseded 2026-09-09") | `docs/66` (status), `docs/68` (matrix) |
| `superseded/ORQ8_ECOSYSTEM_AUDIT.md` | Feature matrix summary | Replaced by the canonical requirement matrix | `docs/68` |
| `superseded/57_V1_LENS.md` | Scope filter for the v1 handoff notes | The handoff it filtered is complete; its item numbering means nothing now | `docs/66` §66.7 |
| `superseded/60_PRODUCT_REDESIGN_AUDIT.md` | Information-architecture audit and migration map | The IA rebuild shipped; kept as the record of what was measured before it | `docs/67` |
| `superseded/62_ORQ8_SYSTEM_AUDIT.md` | Full system audit, 2026-09-27, with its evidence battery | A dated snapshot. Valuable as evidence, misleading as a status page — its verdicts were already amended by `docs/66.3` | `docs/66` §66.9 |
| `superseded/63_COMPANY_HUB_IMPLEMENTATION_AUDIT.md` | Pre-implementation audit for the Company Hub | The Hub shipped | `docs/67` |
| `alternatives/59_CLOUDRUN_DEPLOYMENT.md` | Google Cloud Run deployment runbook | A real, unverified alternative host. Kept for the day a container host is needed; it is not the production path | `docs/58`, `docs/66` §66.5 |
| `history/ORQ8_PROJECT_HISTORY.md` | Narrative history of the build | History, by its own definition | `docs/66` |
| `history/ORQ8-REBRANDING-DRAFT.md` | Draft rebranding and messaging strategy | A draft that was superseded by the shipped brand surface | `docs/66` §66.x brand, `README.md` |
| `plans/2026-08-15-web-ui-a11y-polish.md` | Dated session plan | Dated plans are logs, not plans | `docs/67` |
| `plans/2026-08-16-landing-a11y-ux-polish.md` | Dated session plan | Same | `docs/67` |
| `design-references/*` | Five `*-DESIGN.md` files from the `aethel` / `nexus` / `vertex` naming era | They describe interfaces for a product that was never named that, and their tokens match nothing in the shipped design system | `docs/65_COLOR_SYSTEM.md`, `docs/67` |

Also archived outside `docs/`: `archive/prototypes/` at the repository root
holds two dead prototype surfaces that were living inside the web app
(`/dashboard-prototype` and `/design/colors`). They were reachable URLs in any
build of this working tree and referenced by nothing; moving them out of
`apps/web/app/` removes them from the build without losing them. Restore with
`mv archive/prototypes/app-dashboard-prototype apps/web/app/dashboard-prototype`
if the prototype is wanted again.

Source material — the original brief and the prompt pack — lives in
`docs/source/`. It is input, not instruction: `docs/66` names the requirements'
authority as the original brief and treats this repository as the measurement.
