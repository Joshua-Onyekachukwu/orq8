-- 0023: Email verification for new signups.
--
-- Lifecycle: register → token emailed → user clicks → /verify-email?token=…
-- → one-time consumption marks users.email_verified_at.
--
-- Security model (mirrors password_reset_tokens, docs/37):
--   * Only the SHA-256 hash of the token is stored — a DB leak cannot be
--     replayed against the verify endpoint.
--   * 24-hour expiry; expired or consumed tokens are rejected.
--   * One-time use: consumedAt set transactionally on success.
--   * Resend rate limiting: an index on (user_id, created_at) supports
--     windowed counting (max 3 sends per user per hour) without a full scan.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
  ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS email_verification_tokens_hash_idx
  ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_created_idx
  ON email_verification_tokens(user_id, created_at);
