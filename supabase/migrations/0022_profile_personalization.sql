-- Phase 8: Profile personalization — optional user-editable fields.
-- All nullable so existing rows are unaffected; no backfill needed.

ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
