-- 0030 — Founder verdict on decisions (§24 "Decision: Founder decision" beat).
--
-- The council deliberation ends in a recommendation; the founder's actual
-- verdict (approve / reject) lived nowhere. updateDecision could flip status,
-- but there was no explicit, attributable record of WHO decided and WHAT they
-- decided, and the Council UI had nothing to render for it.
--
-- Three nullable columns on decisions:
--   founder_verdict      'approved' | 'rejected'  (null = not yet decided)
--   founder_verdict_note optional founder note recorded with the verdict
--   founder_verdict_at   when the verdict was recorded
--
-- Historical rows stay null (never decided via this path). Idempotent guarded
-- ADD COLUMN: no-op where present (fresh + CI lineage both need it; production
-- gets it via the DB Migrate workflow).

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS founder_verdict text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS founder_verdict_note text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS founder_verdict_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'decisions' AND column_name = 'founder_verdict'
  ) THEN
    EXECUTE 'ALTER TABLE decisions ADD CONSTRAINT decisions_founder_verdict_check CHECK (founder_verdict IN (''approved'', ''rejected''))';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- constraint already exists
END $$;
