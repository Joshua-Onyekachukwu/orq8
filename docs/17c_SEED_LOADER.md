# 17c — Phase 5 Constitution Seed Loader (Spec)

**Product:** ORQ8 · **Status:** Phase 0 spec (implementation target: Phase 5, docs/49)
**Input:** `docs/17b_CONSTITUTION_SEED.json` (canonical; moves to `packages/db/seeds/constitution_default.json` at implementation)
**Consumes:** 17a (§Seed Format) · 18 (Governance & Authorization) · 19 (Approval Engine) · 34.3 (schema) · ADR-019 (permission namespace) · 20 (audit)
**Outputs:** `constitutions` · `approval_rules` · `permissions` · `financial_controls` · `policies` (+ `organizations.constitution_version_ref`, `audit_events`)

This spec is the **row-level contract** for converting the org-agnostic seed JSON into per-tenant governance rows at org creation. It expands 17a's coarse mapping table (each seed block → target table) into exact field mappings, row shapes, load flow, idempotency, and verification counts.

---

## 17c.1 Loader Contract

- **Invocation:** once per organization, triggered by the `org.created` domain event (Phase 5 wiring); runnable on demand for review/re-seed.
- **Scope:** copies the org-agnostic seed **per-tenant** — every row carries the new `org_id`.
- **Atomicity:** all inserts happen in **one DB transaction**. A failure anywhere rolls back the whole seed; there is never a partial constitution.
- **Idempotency:** the loader no-ops (returns `seeded: false`) if a `constitutions` row for `(org_id, version = 1)` already exists.
- **Validation:** the seed JSON is validated against a Zod contract (`constitutionSeedSchema`, source of truth in `packages/domain`) **before** any insert. Malformed seeds fail loudly, never partially.
- **Result:** `{ seeded: boolean, constitutionId?: string }`.

## 17c.2 Preprocessing (per-tenant copy)

1. **Placeholder substitution:** replace `[Company Name]` with the organization's `name` in `preamble` and in clause `I.1` / `II.1` text.
2. **Validation:** run the transformed JSON through `constitutionSeedSchema`.
3. **Normalization:** keep the seed's `seed_id` and `version` as provenance; the loader's output rows use the org's *constitution version numbering* (`version = 1` for the first load), not the seed's own `"version": "1.0"`.

## 17c.3 Mapping Overview

| 17b block | Target table(s) | Rows produced (v1) |
|-----------|-----------------|---------------------|
| `articles` (+ clause `enforcement`) | `constitutions` (body jsonb) | 1 |
| `enforcement.deny_rules` | `permissions` (effect `deny`) | 9* |
| `enforcement.approval_rules` | `approval_rules` | 14* |
| `enforcement.financial_controls.authority_defaults` | `financial_controls` (role rows) | 4 |
| `enforcement.financial_controls.levels / budget_separation / execution_layer` | `policies` (type `financial`) | 3 |
| `enforcement.permissions.data_classes` | `policies` (type `data`) | 1 |
| `enforcement.permissions.emergency_controls` | `permissions` (effect `allow`, role `owner`) | 8 |
| `enforcement.permissions.constitution_amend` | `permissions` (effect `allow`, role `owner`) | 1 |
| `enforcement.escalation_rules` | `policies` (type `approval`) | 1 |
| `enforcement.operational_limits` | `policies` (type `security`) | 1 |
| `enforcement.attention_model` | `policies` (type `communication`) | 1 |
| Platform-rule clauses (V.11 untrusted content; VI.1 tiers) | `policies` (type `security` / `approval`) | 2 |

\* derived counts — see §17c.8. **Default-deny principle:** anything not granted is denied; only allows are written as `effect: allow` rows.

---

## 17c.4 Target-Table Mappings (field-level)

### 17c.4.1 `constitutions` (from `articles` + `preamble` + header)

| Column | Value |
|--------|-------|
| `org_id` | new org |
| `version` | `1` |
| `title` | seed `title` |
| `body` (jsonb) | canonical document body — schema below |
| `status` | `draft` on load; → `published` on CEO publish (§17c.5) |
| `published_by` / `published_at` | `null` until publish |
| `supersedes_id` | `null` (v1) |

**`body` jsonb schema:**

```jsonc
{
  "seed_id": "constitution_default_v1",   // provenance
  "seed_version": "1.0",
  "preamble": "<text, placeholders substituted>",
  "articles": [
    {
      "id": "V", "title": "Forbidden Actions", "enforcement": "deny_rule",
      "clauses": [
        { "id": "V.1", "text": "...", "enforcement": { "type": "deny_rule", "rule_ref": "deny:legal_commitment", "tier": "forbidden" } }
      ]
    }
  ],
  "notes": "<seed notes>"
}
```

The body is the **human-readable, versioned text**. Enforcement metadata in clause `enforcement` is *provenance* — it does not drive enforcement; the compiled rows below do.

**Amendments (later versions):** the Constitution editor creates `version = N+1` rows with `supersedes_id = previous id`; the previous row flips to `status = superseded`; `organizations.constitution_version_ref` points at the current published row.

### 17c.4.2 `approval_rules` (from `enforcement.approval_rules`)

**Flattening rules:**
- **`rows[]`** (spend matrix) → one row **per matrix row**.
- **`patterns[]`** (org_actions) → one row **per pattern** (name shared).
- **`pattern`** (singular) → one row.
- **Note-only rules** (`approval:mandatory_defaults`) → no rows; their semantics are **derived**: every created rule whose `action_pattern` starts with `finance:`, `legal:`, or `external:` gets `conditions.mandatory = true` (mandatory = no automatic passage).

| Column | Value |
|--------|-------|
| `org_id` | new org |
| `name` | rule `id` (e.g., `approval:spend_matrix`, `approval:org_actions`) |
| `action_pattern` | flattened pattern (ADR-019 namespace, e.g., `finance:spend`) |
| `required_tier` | `automatic` \| `department` \| `executive` \| `ceo` (18.1) |
| `amount_range` (jsonb) | `{ "min": 0, "max": 50 }` — `max` omitted when open-ended (`{ "min": 250 }`) |
| `conditions` (jsonb) | seed `conditions` merged with `{ "mandatory": bool, "rule_ref": "<id>", "note": "…" }` |
| `enabled` | `true` |

**Worked example — the spend matrix (VI.2) produces 3 rows:**

```jsonc
[
  { "name": "approval:spend_matrix", "action_pattern": "finance:spend", "required_tier": "automatic", "amount_range": { "min": 0, "max": 50 },  "conditions": { "category_approved": true, "mandatory": false } },
  { "name": "approval:spend_matrix", "action_pattern": "finance:spend", "required_tier": "department", "amount_range": { "min": 50, "max": 250 }, "conditions": { "mandatory": false } },
  { "name": "approval:spend_matrix", "action_pattern": "finance:spend", "required_tier": "ceo",        "amount_range": { "min": 250 },          "conditions": { "mandatory": true } }
]
```

Note the derivation in action: the `> $250` row and `finance:*`-prefixed rules carry `mandatory: true`.

### 17c.4.3 `permissions` (from `enforcement.deny_rules` + `enforcement.permissions`)

| Column | Value |
|--------|-------|
| `org_id` | new org |
| `actor_type` | `role` \| `agent` \| `user` (18.8 sketch) |
| `actor_id` | `null` for seed rows (scope-wide); `owner`/`admin` role ids go in `actor_id` when `actor_type = role` |
| `resource_type` | first namespace segment (e.g., `finance`, `data`, `constitution`) — informational |
| `resource_id` | `null` (all resources of that type; scoped grants are Phase 5+ additions) |
| `action` | full ADR-019 action, e.g. `finance:commitment:*` |
| `effect` | `allow` \| `deny` |
| `created_by` | `null` (system seed) |

**A. Hard denies (from `deny_rules` — the §17c.3 "deny registry"):**
- One row per `pattern`; `|`-separated patterns expand to one row each (`deny:secret_personal_data_exfil` → 2 rows).
- `actor_type` = rule `actor` when present (`deny:governance_modification` → `agent`), else `agent`.
- `action` = the full pattern. **No approval path is derivable from these rows** — a matching deny short-circuits (§17c.7).

**B. Allows (from `permissions`):**
- `emergency_controls` → one row each: `actor_type: role, actor_id: owner, action: "<control>"` (e.g., `org:pause`, `deploy:freeze`), `effect: allow`.
- `constitution_amend` → one row: `actor_type: role, actor_id: owner, action: constitution:amend, effect: allow`, with `default_roles: ["owner"]` and `delegable_to: ["admin"]` carried in the row's audit/conditions context (resolved by the Phase 5 role resolver).
- `perm:comm_external` (V.9) → **not** a permission row: external-comm grants live in Authority Profiles. The loader records the rule in `policies` (type `security`) so the principle is documented; runtime enforcement reads profiles (18.2).
- `data_classes` → platform-enforced enum (`public|internal|confidential|restricted`, default agent access `internal`) stored in `policies` (type `data`); memory/document rows carry a permission class checked by Authz (34.3 Memory).

### 17c.4.4 `financial_controls` (from `enforcement.financial_controls.authority_defaults`)

One row **per role class**; role rows carry authority, never allocation:

| Column | executive_agent | department_head | standard_agent | temporary_agent |
|--------|-----------------|-----------------|----------------|-----------------|
| `org_id` | new org | new org | new org | new org |
| `entity_type` | `role` | `role` | `role` | `role` |
| `entity_id` | `null` | `null` | `null` | `null` |
| `allocated` / `warning` / `ceiling` | `null` | `null` | `null` | `null` |
| `per_txn_authority` | `250` | `100` | `0` | `0` |
| `weekly_authority` | `500` | `400` | `0` | `0` |
| `payment_authority` (jsonb) | `{ "role": "executive_agent", "requires_delegation": true }` | `{ "role": "department_head" }` | `{ "role": "standard_agent" }` | `{ "role": "temporary_agent" }` |
| `version` | `1` | `1` | `1` | `1` |

**Allocations, levels, and separation are org-wide defaults, not per-entity controls** → they land in `policies` (type `financial`), keeping `financial_controls` as the per-entity authority table (ADR-015 single source of truth):

- `budget_levels` — `{ levels: { target: "normal", warning: 0.8, ceiling: 1.0 } }` (ratios of allocation)
- `budget_separation` — `{ hiring: "separate", infrastructure: "separate", tools: "separate" }`
- `execution_layer` — the canonical flow string (VIII.7)

### 17c.4.5 `policies` (remaining blocks)

| 17b block | `name` | `type` (34.3 enum) | `body` (jsonb) |
|-----------|--------|--------------------|----------------|
| escalation_rules | `escalation_rules` | `approval` | `{ rules: [{ trigger, action, threshold? }] }` |
| operational_limits | `operational_limits` | `security` | `{ limits: { max_concurrent_tasks_per_agent: 5, … } }` (18.5 defaults) |
| attention_model | `attention_model` | `communication` | `{ model: { routine: "execute", … } }` (18.7) |
| permissions.data_classes | `data_classes` | `data` | `{ classes: [...], default_agent_access: "internal" }` |
| VI.1 tiers | `approval_tiers` | `approval` | canonical tier definitions (18.1) |
| V.11 untrusted content | `untrusted_content_rule` | `security` | platform rule text |

Every policy row: `version = 1`, `status = draft` (published with the constitution), `supersedes_id = null`.

---

## 17c.5 Load Flow (org creation)

```
org.created
  └─► SeedLoader.run(db, { orgId, actorId = system })
        ├─ guard: constitutions (org_id, version=1) exists? → { seeded: false }   [idempotent]
        ├─ preprocess: substitute [Company Name] · validate (constitutionSeedSchema)
        ├─ BEGIN TRANSACTION
        │   ├─ INSERT constitutions        (v1, status=draft)
        │   ├─ INSERT approval_rules       (14 rows)
        │   ├─ INSERT permissions          (9 deny + 9 allow)
        │   ├─ INSERT financial_controls   (4 role rows)
        │   ├─ INSERT policies             (7 rows)
        │   └─ appendAudit                 (org_id, actor=system, action=constitution.seeded)
        ├─ COMMIT
        └─► return { seeded: true, constitutionId }
```

**Publish (CEO review, before any governance is enforced):**
`POST /v1/orgs/:orgId/constitution/publish` → `constitutions.status = published`, `published_by` = CEO user id, `published_at = now()`, `organizations.constitution_version_ref = constitutionId`, audit `constitution.published`. **Nothing enforces the constitution until publish** (17a: "shown to the CEO for review, then published as version 1").

## 17c.6 Idempotency & Re-seed

- **Guard:** a `constitutions` row at `(org_id, version = 1)` blocks a second load (`seeded: false`, no-op).
- **Pre-publish re-seed (optional):** if the v1 draft is unpublished, an operator may discard the draft *transactionally* (delete v1 + its rule/policy/financial rows) and reload — the audit trail records the discard.
- **Post-publish changes:** never re-seed; they go through the amendment path (new version, §17c.4.1).

## 17c.7 Enforcement Precedence (what the rows mean at runtime)

Authz evaluates deterministic stored state, never a model (18.2). For a given `(actor, resource, action, context)`:

1. **Deny wins.** A matching `permissions` row with `effect = deny` → `deny(reason, policy_ref = constitution#V.n)` — regardless of any allow or approval rule. No approval path exists for denies (that is the point of Article V).
2. **Explicit allow** (e.g., emergency controls, constitution amend for `owner`) → execute.
3. **Approval rule match** → `requires_approval(rule, required_tier, amount_range, conditions)`; queued in the CEO Decision Center (Phase 5 Approval Engine, 19).
4. **Default deny.** No matching row → denied. Only grants are stored.

## 17c.8 Verification Counts (loader tests assert these)

| Output | v1 count | Derivation |
|--------|----------|------------|
| `constitutions` | 1 | version 1, draft |
| `approval_rules` | **14** | spend_matrix 3 + funds_transfer 1 + procurement_commit 1 + production_deploy 1 + data_export 1 + org_actions 7 |
| `permissions` (deny) | **9** | 8 deny rules, `secret_personal_data_exfil` expands to 2 patterns |
| `permissions` (allow) | **9** | 8 emergency controls + 1 constitution amend |
| `financial_controls` | **4** | executive / dept head / standard / temporary |
| `policies` | **7** | escalation, limits, attention, data_classes, tiers, untrusted_content, + comm rule (V.9) |

Loader tests: row-count assertions above · no partial seed on injected failure (transaction rollback) · second load is a no-op · placeholder substitution replaces `[Company Name]` · a mutated audit row is the only permitted mutation (20).

## 17c.9 Implementation Location & Interface

```
packages/db/seeds/constitution_default.json     # copy of docs/17b (canonical source: docs/17b)
packages/db/src/seed/constitution.ts            # loader
packages/domain/src/contracts/constitution_seed.ts  # constitutionSeedSchema (validated pre-insert)
packages/db/test/constitution.seed.test.ts      # counts + rollback + idempotency
```

```ts
// packages/db/src/seed/constitution.ts (target interface)
loadConstitutionSeed(db, { orgId, actorId? }): Promise<{ seeded: boolean; constitutionId?: string }>
```

Wired in Phase 5 from the `org.created` handler (36) and the publish endpoint (19); `seed_id`/`seed_version` provenance is preserved in `constitutions.body` for drift detection against `docs/17b`.

## 17c.10 Open Items (resolve at Phase 5 implementation)

1. **Role resolution** — `actor_type = role` rows resolve against memberships + Authority Profiles; `owner` role id per org.
2. **`amount_range` representation** — store USD as decimal amounts in jsonb `{ min, max }`; confirm cents-vs-dollars at implementation.
3. **`mandatory` column** — if the Approval Engine needs it as a first-class column on `approval_rules` (not just `conditions.mandatory`), record as ADR and migrate.
4. **Delegation seeding** — `delegable_to: ["admin"]` informs the delegation UI (Phase 5 editor) but is not auto-granted; confirm at implementation.
5. **Constitution editor diff/versioning** — amendment flow (XV) builds on this spec's versioning; exact editor contract lands with the Phase 5 UI spec.

---

*Related: 17a (§Seed Format) · 17b (seed data) · 18 (Authz, tiers, enforcement) · 19 (Approval Engine) · 20 (audit) · 34.3 (schema) · 36 (events: org.created, constitution.seeded/published) · 49 (Phase 5) · ADR-011 (employee polymorphism) · ADR-015 (financial controls single source) · ADR-019 (permission namespace).*
