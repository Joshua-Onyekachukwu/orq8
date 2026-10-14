# ORQ8 Credential Rotation Procedure (risk R-006)

Status: PROCEDURE — requires founder authorization per rotation. Never rotate
shared production credentials silently: each rotation below names its blast
radius, ordering, and verification. Never print secret VALUES in issues, logs,
chat, or this document — names only.

## 0. Triage a suspected exposure (first 30 minutes)

1. Scope from metadata, not values: which key, which commit/log/URL, who could
   read it (public repo? preview log? support thread?), and what it unlocks.
2. If a live production credential was readable by anyone outside the founder:
   treat as compromised and rotate per §1–§6 below. Record the decision in the
   breach decision log (see incident playbook) — do not auto-send legal notices.
3. If only a redacted/placeholder/test fixture leaked (e.g. `ghp_xx…`,
   `sk-…-test-…`): no rotation; confirm the shape cannot match a live key and
   note it beside the finding.
4. Revoke first where the provider supports it, then re-issue (shortens the
   window where two valid credentials exist).

## 1. Provider API keys (NVIDIA, OpenRouter, LiteLLM master)

Blast radius: AI spend on the founder's accounts. Org BYOK keys are
per-org/encrypted and unaffected by platform-key rotation.
Steps: provider dashboard → roll/revoke → update `NVIDIA_API_KEY` /
`OPENROUTER_API_KEY` / `LITELLM_MASTER_KEY` in Vercel prod + preview envs (or
`set-vercel-env.yml`) → redeploy API → verify `/v1/providers` health +
`provider.key_rotated`-style audit presence → confirm spend dashboards show
only new-key usage. Order: revoke-old LAST, after new key serves traffic.

## 2. `ENCRYPTION_KEY` (AES-256-GCM master for provider secrets at rest)

Blast radius: HIGHEST — every stored provider key decrypts with this key.
`ENCRYPTION_KEY_KID` versions rows; rotation MUST re-encrypt, not just swap:
1. Generate new 256-bit key; deploy code reading BOTH kids (old decrypt, new
   encrypt) — verify this dual-read exists before rotating.
2. Re-encrypt every row to the new kid (record count before/after).
3. Flip primary kid, redeploy, verify decrypt+key-test on a sample.
4. Destroy the old key only after the row count matches and tests pass.
Do NOT rotate this key under time pressure without step 1 verified.

## 3. Supabase (`SUPABASE_SERVICE_ROLE_KEY`, anon key, DB password)

Blast radius: full database bypass (service-role skips RLS).
Steps: Supabase dashboard → regenerate service-role + anon keys together →
update Vercel envs + `apps/web` server env → redeploy web + API → run
`scripts/rls-security-e2e.ts` (59 checks) + login smoke test → rotate
`DATABASE_URL` password (Supabase → database settings) → update API env →
verify jobs workflow + canary green. The anon key is public by design but
rotate it in the same window to keep the pair consistent.

## 4. Billing and mail (Stripe, Resend/SMTP)

Blast radius: charges (Stripe) / sending-as-org (mail).
Steps: provider dashboard → roll restricted keys (keep scopes minimal, as
issued) → update Vercel envs → redeploy → verify with Stripe test clock or a
`billing_unavailable`-free checkout dry-run, and the readiness mail-check
probe. Never use the Stripe live secret outside prod env storage.

## 5. OAuth clients (GitHub, Google) and `AUTH_SECRET` / `SESSION_SECRET`

Blast radius: sign-in; rotating secrets invalidates ALL sessions (forced
logout — announce it).
Steps: provider console → regenerate client secret → update envs → redeploy →
verify OAuth login round-trip on preview, then prod. Session secrets: rotate
off-peak; existing sessions die on deploy — confirm via `/v1/auth/me` 401s
turning into fresh logins, not errors.

## 6. Vercel and GitHub tokens (`VERCEL_TOKEN`, deploy hooks)

Blast radius: deploy pipeline. Rotate in the token issuer first, then GitHub
Actions secrets, then re-run `set-vercel-env.yml` canary to prove the pipe.

## 7. After every rotation

- Audit rows / provider dashboards confirm new-credential-only usage.
- Grep the exposure source again to confirm the old value is gone.
- Update this log line: date, key name, reason, authorizer, verifier.
- If customer data could have been accessed with the exposed credential,
  escalate to the incident playbook (assessment + counsel before notifying).

## Rotation log

| Date | Credential (name only) | Reason | Authorized by | Verified by |
|------|------------------------|--------|---------------|-------------|
| — | — | — | — | — |
