-- 0032 — Routing-source observability (§31 model routing).
--
-- selectMeasuredModel consults this org's measured llm_performance history to
-- route away from degraded models and toward proven ones — but nothing recorded
-- WHICH selection path served a call, so "routing improves from measured
-- outcomes" was not measurable. This migration adds the missing column:
--
--   • routing_source  — 'static' (registry default) | 'measured' (deviated by
--     llm_performance history) | 'default' (caller never consulted the router)
--
-- Backfill: rows before this migration predate the routing layer; 'default' is
-- the honest label for them (we did not measure what chose them).
--
-- Idempotent, matching the 0031 house style.

ALTER TABLE llm_performance
  ADD COLUMN IF NOT EXISTS routing_source text NOT NULL DEFAULT 'default';

-- The models widget and the routing-shift read both group by routing_source
-- with the same (org_id, created_at) window predicate as the existing stats.
CREATE INDEX IF NOT EXISTS llm_performance_routing_idx
  ON llm_performance (org_id, routing_source, created_at);
