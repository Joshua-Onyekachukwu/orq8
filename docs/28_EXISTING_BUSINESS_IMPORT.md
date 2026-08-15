# 28 — Existing Business Import

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 28.1 Purpose (§6)

**Import Existing Business** lets an operating company connect its tools and have ORQ8 discover, map, and propose an AI organization — **without activating anything consequential** until the CEO approves.

## 28.2 Flow

```
Connect → Discover → Understand → Show Findings → User Corrects
        → Propose Organization → Simulate → CEO Approves → Activate
```

## 28.3 Connect (§6)

website · GitHub/GitLab · email · Google Workspace · Microsoft 365 · Trello/Linear/Jira · Notion · CRM · analytics · cloud · databases · docs · social · support · finance · other APIs (via integration framework, 25).

## 28.4 Discovery & Business Map

Analysis: company identity · products/services · markets · customers · positioning · competitors · technology · repositories · architecture · project structure · departments · workflows · tools · documents · goals · metrics · operational gaps.

**Assumption rule:** discovered information is never assumed correct; important assumptions are presented for CEO confirmation.

## 28.5 Baselines

Company Profile · Product Map · Technology Map · Organization Map · Integration Map · Goal/KPI Map · Risk Map · Existing Tool Map · Engineering/Marketing/Operations Baselines

## 28.6 Proposal & Activation

- Recommended AI organization (departments, agents, teams) derived from the maps.
- **Simulation** (41) shows what the proposed workforce is expected to do, its cost, and risks.
- CEO approves → activation creates org structure + hires (each hire still runs the Business Case flow, 09) → nothing runs before approval.

## 28.7 Data Model

`import_runs` (added to 34): id, org_id, status (connecting|discovering|mapping|findings|correcting|proposing|simulating|approved|activated|cancelled), sources jsonb, findings_refs, assumptions jsonb, baselines_refs, proposal_ref, activated_at. Artifacts stored as documents (parsed text) + memory entries (21).

## 28.8 Phase 10 Scope

Website + repository + documents + key integrations first; full connector breadth follows the roadmap (48).
