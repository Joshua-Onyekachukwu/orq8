# 23 — Provider API Keys

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 23.1 Models Offered

- **Platform-provided models** (later, when platform keys exist)
- **Bring Your Own Key (BYOK)** — day one
- **Bring Your Own Endpoint** — OpenAI-compatible base URLs (day one)

Providers: OpenAI · Anthropic · Google Gemini · DeepSeek · Groq · OpenRouter · any OpenAI-compatible endpoint · Ollama (local, no key).

## 23.2 Security Requirements (§30)

Keys must be:
- encrypted at rest (AES-256-GCM; per-org data key wrapped by master key from env/KMS)
- **never exposed to frontend JavaScript** · **never logged** · **never included in prompts** · **never returned in API responses**
- rotatable · revocable · scoped to the user's organization · audited for access

## 23.3 Settings UX (§66)

Provider cards: connected/not connected · masked key (full keys never shown after save) · available models · enabled models · test connection · default use cases · usage · cost. A "How to get a key" link per provider — maintained as **configuration/docs**, not hard-coded assumptions (provider instructions change).

## 23.4 Lifecycle

1. **Add:** user pastes key → encrypt → mask → validate (test call) → store `user_provider_keys` row + `secret_records` metadata.
2. **Enable/disable models:** per key allowed_models list.
3. **Test:** `POST /v1/models/keys/:id/test`.
4. **Rotate:** new key replaces old (dual-write window optional); old key scheduled for purge; rotation is an audit event.
5. **Revoke:** immediate; dependent model policies fall back per 22.7.
6. **Spending policy per key:** optional per-key ceiling; enforced at gateway/routing layer (24).

## 23.5 Encryption Design

- `key_encrypted` + `key_kid` (which wrapping key version) on each row.
- Master key: env var (dev) → KMS (funded). KMS-ready interface from day one (ADR-006/37).
- SecretStore is the **only** place secrets live; never written to memory (21.8), logs, or prompts.

## 23.6 Data Model

`providers`, `user_provider_keys`, `secret_records` (34). Access to keys is audited (`secret_records.accessed_at` + access events).
