-- 0024: Fix system agent-template duplication (docs/§42, workforce P0 audit)
--
-- Root cause: migrate-supabase.ts re-applies every migration file on each
-- deploy (multi-pass idempotency by design). 0020's catalog insert guarded
-- with `on conflict (org_id, slug)` — but org_id is NULL for system rows and
-- Postgres treats NULLs as distinct, so the guard never fired and every
-- deploy appended another copy of the full catalog (18× on production).
--
-- Fix, in order (dedupe must precede the unique index):
--   1. Collapse duplicate system rows to the oldest copy per slug
--      (deterministic tiebreak on id; execution history references nothing
--      here — no FKs point at agent_templates).
--   2. Partial unique index on (slug) for system rows so a stray unguarded
--      insert fails loudly instead of silently duplicating the catalog.
--
-- Both statements are idempotent: this file re-runs on every deploy like the
-- rest of the lineage.

-- ── 1. Dedupe: keep the oldest row per system slug ───────────────────────
delete from public.agent_templates a
where a.is_system = true
  and a.org_id is null
  and exists (
    select 1
    from public.agent_templates b
    where b.is_system = true
      and b.org_id is null
      and b.slug = a.slug
      and (b.created_at < a.created_at
           or (b.created_at = a.created_at and b.id < a.id))
  );

-- ── 2. Real uniqueness for system templates ──────────────────────────────
-- Partial (not a full unique on slug) so org-scoped custom templates may
-- reuse a system slug or share slugs across orgs. NULLs in a normal unique
-- index are distinct — the `where` clause here is what gives system rows a
-- conflict target at all.
create unique index if not exists agent_templates_system_slug_unique
  on public.agent_templates (slug)
  where is_system = true and org_id is null;
