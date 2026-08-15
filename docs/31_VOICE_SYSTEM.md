# 31 — Voice System

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 31.1 Purpose (§39)

Voice for: asking questions · issuing commands · reviewing decisions · receiving reports · approving actions. **Voice uses the same authorization system as chat — conversational approval never bypasses approval.**

## 31.2 Capabilities (Phase 13)

- Voice input: STT
- Voice output: TTS (reports, confirmations, summaries)
- Conversational approval with spoken confirmation
- Interruption handling (user can interrupt; system confirms intent)
- Voice safety confirmation for consequential actions

## 31.3 Approval Flow (§39)

> User: "Approve the marketing campaign."
> System: "You're approving a $1,000 campaign with projected spend of $1,000. Proceed?"
> User: "Yes."
> → Approval Engine executes (19) — same checks, same audit.

Never execute a consequential action from a single unconfirmed utterance; always confirm amount, scope, and side effects.

## 31.4 Provider Options (free-first, configurable)

- **STT:** local Whisper (Ollama/whisper.cpp — free, private) → Groq/OpenAI Whisper API (BYOK) → platform provider later.
- **TTS:** local (Piper/edge-tts — free) → provider TTS (BYOK) later.
- Voice provider integrations (telephony) via integration framework (25) later.

## 31.5 UX

- CEO Home (33.3) and Executive screen support voice input alongside text.
- Reports can be read aloud; decision confirmations are spoken back.
- Voice transcripts are treated as task input — same Intent Engine, same audit, same permissions.

## 31.6 Safety

- Voice command history is auditable; spoken approvals record the confirmation utterance + approval record.
- **Default operational limits (editable):** max 5 spoken approvals per 15 min per user; max 60s of continuous utterance; voice input disabled after 3 consecutive failed confirmations (requires text re-auth); per-org voice kill switch (voice-off) honored at the platform layer. All limits configurable per org (18.5).
- Voice sessions carry the same rate limits, spend limits, and audit as chat; no new approval path exists via voice.
