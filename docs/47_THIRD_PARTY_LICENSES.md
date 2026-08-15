# 47 — Third-Party Licenses

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 47.1 Policy

- Prefer permissive (MIT, Apache-2.0, BSD, PostgreSQL).
- **AGPL caution:** AGPL code may be *used as a separate service* (e.g., MinIO via S3 protocol, k6 for load testing) without linking obligations, but **never vendored/linked into the product**; distribution of modified AGPL code triggers obligations.
- Never copy code without verifying license compatibility (brief §92; ADR-010).
- Keep an inventory (`THIRD_PARTY.md` maintained from this table) with attribution.

## 47.2 Inventory (initial assessment — verify at implementation)

| Component | License | Use | Notes |
|-----------|---------|-----|-------|
| Next.js | MIT | web | — |
| React | MIT | web | — |
| Tailwind CSS | MIT | web | — |
| shadcn/ui | MIT | web | copy-compatible w/ attribution |
| Monaco Editor | MIT | editor (29) | — |
| TanStack Query | MIT | web state | — |
| Fastify | MIT | API | — |
| Drizzle ORM | Apache-2.0 | ORM | — |
| Zod | MIT | validation | — |
| pino | MIT | logs | — |
| Postgres + pgvector | PostgreSQL License | DB | permissive |
| MinIO | AGPL-3.0 | object storage | separate service via S3 API — OK; not linked |
| pg-boss | MIT | queues | — |
| Temporal | MIT | workflows (later) | — |
| LiteLLM | MIT | model gateway | — |
| Ollama | MIT | local models | — |
| LangGraph | MIT | (optional) graph orchestration | — |
| Docker engine | Apache-2.0 | sandbox runtime | sandbox images: pin + scan |
| Langfuse | MIT | LLM observability (optional) | self-hosted |
| OpenTelemetry | Apache-2.0 | tracing | — |
| k6 | AGPL-3.0 | load testing (16) | separate tool, not shipped |
| Playwright | Apache-2.0 | e2e tests | — |
| Vitest | MIT | tests | — |
| Whisper / whisper.cpp | MIT | STT (13) | — |
| Codebuff / OpenHands | verify | study/reuse only (42) | license must be verified before any code reuse; architecture stays platform-native |

## 47.3 Compliance Checklist

- [ ] Dependency audit in CI (`pnpm audit` + license checker).
- [ ] Attribution notices for copied components (shadcn style).
- [ ] No AGPL vendored into product code.
- [ ] License review recorded before adopting any new OSS (ADR).
- [ ] Container images scanned (trivy/anchore free tier).
