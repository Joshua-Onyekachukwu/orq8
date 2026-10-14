# ORQ8 Data-Flow Map (Phase 0 — verified against code, not vendor dashboards)

| # | Flow | Information | Purpose | AuthZ boundary | Owner | Stored at | Third parties | Retention/deletion | Controls | If compromised |
|---|------|-------------|---------|----------------|-------|-----------|---------------|--------------------|----------|----------------|
| 1 | Browser → Web → API | Credentials, session token (cookie/Bearer) | Signup/login/session | Email-verification gate; brute-force lockout | ORQ8 | API sessions table + Redis cache | None | Session expiry; revoke on logout (DB + cache evict) | HttpOnly cookie; server sessions; lockout | Account takeover |
| 2 | API → Postgres | All company data (depts, agents, tasks, memory, docs, credits) | Product persistence | Session orgId scoping; RLS | Customer (company data) | Supabase Postgres | Supabase (processor) | Per-table; deletion propagation UNVERIFIED (Phase 4.5) | RLS 0033/0049/0052; service-role server-only | Cross-company exposure |
| 3 | API → AI providers | Prompts, task context, company memory excerpts | Agent execution | Org API keys; EA budget; approval policy | Customer | Provider (retention per vendor — UNVERIFIED) | NVIDIA/OpenRouter/LiteLLM/Ollama | Vendor terms UNVERIFIED (Phase 9) | Router fallback; budget; kill switch | Confidential-data training/retention |
| 4 | Tools/integrations → API | OAuth tokens, Gmail/Linear/etc. data | Connected work | Per-org credential scoping; approval for external actions | Customer | Encrypted credential store (verify enc. in Phase 2) | Integration vendors | Revocation path UNVERIFIED (Phase 3 test list) | Least-privilege tool schemas (verify Phase 3.3) | Third-party breach pivot |
| 5 | Workers/queues → API/DB | Job claims, task runs, retries | Async execution | Queue claim scoping (tested) | ORQ8 | DB + logs | GitHub Actions runner | Log retention UNVERIFIED | Claim-scope tests; idempotency (verify) | Duplicate spend/work |
| 6 | API → logs/monitoring | Audit events, errors, diagnostics | Ops + forensics | Access-controlled; redaction UNVERIFIED | ORQ8 | Vercel/Supabase logs | Hosts | UNVERIFIED (Phase 7) | `appendAudit` trail; no-secret rule (verify) | Secret/PII leak via logs |
| 7 | API → email | Verification, invitations (acceptUrl carries raw token), notifications | Identity + onboarding | Single-use hashed invite tokens; expiry | ORQ8 | Mail provider | Resend/SMTP (verify Phase 9) | Link expiry | Token hashing; invitee-email match | Org intrusion via leaked link |

Mermaid source of truth: `docs/ORQ8_CURRENT_ARCHITECTURE.md` (infra track). This
table is the security-annotated overlay; update both together.
