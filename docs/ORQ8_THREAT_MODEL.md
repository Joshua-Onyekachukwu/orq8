# ORQ8 Threat Model (Phase 0)

## Trust boundaries

1. Founder/member browser ↔ Web app (Next.js, Vercel)
2. Web app ↔ API (`/v1/*`, session cookie/Bearer; web proxies never hold secrets)
3. API ↔ Supabase Postgres (service-role, server-side only) + Redis (sessions, locks)
4. API ↔ AI providers (NVIDIA → OpenRouter → LiteLLM → Ollama; BYOK keys org-scoped)
5. EA/employees ↔ tools (registry schemas, server-side authZ) ↔ integrations/OAuth
6. Workers/queues (GitHub Actions jobs + worker fallback) ↔ API/DB

## Priority attack paths (highest first)

1. **Cross-company data access** — forged IDs, joins/views/RPC, storage objects,
   semantic-memory retrieval across orgs. Controls: session orgId, abuse-suite
   sweep, RLS. Status: PARTIAL (R-004).
2. **Agent-governance escalation** — member mints or upgrades a privileged agent
   (spend, autonomous, no-approval) or re-arms a paused one. Controls: owner/admin
   gates added 2026-10-12 + executor-side enforcement. Status: MITIGATED (R-001);
   injection-driven escalation still OPEN (R-003).
3. **Session/identity abuse** — theft, fixation, post-logout use, privilege-change
   staleness. Controls: server sessions, revocation+cache eviction, expiry,
   email-verification gate, brute-force lockout. Status: PASS by code; re-test in
   Phase 1.2.
4. **Prompt injection → unauthorized action** — untrusted content in docs, email,
   web, memory, tool output steering EA/employees. Status: OPEN (R-003).
5. **Credential exposure** — committed secrets, bundle leaks, log leaks, broad
   keys. Status: NOT VERIFIED (R-006).
6. **Spend exhaustion** — loops, retry storms, huge inputs. Status: OPEN (R-007).

Out of scope for this programme: attacking provider/third-party infrastructure,
DoS load testing, social engineering, endpoint-device compromise.
