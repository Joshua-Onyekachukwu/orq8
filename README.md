# ORQ8 — AI Organization Operating System

**ORQ8** (pronounced "or-kate", from *orchestrate*) is an AI Organization Operating System: a platform where a human CEO can create or import a business, define its constitution, goals and governance, hire AI employees, organize them into departments and temporary teams, delegate work, connect external tools, route tasks across multiple AI models, require human approval for consequential actions, maintain company memory and audit history, evaluate and replace underperforming agents, and receive concise weekly/monthly executive reporting.

> The product is **not** primarily an AI chat application. It is an organizational operating system.

---

## What ORQ8 Does

A solo founder or lean team CEO directs their AI organization through natural language. The Executive Agent decomposes instructions into tasks, selects the right AI employees, executes work, routes sensitive actions through approval gates, records results in persistent memory, and reports outcomes at an executive level.

**Core capabilities:**

- **Executive Agent** — Central orchestration layer that plans, coordinates, and reports. Handles natural-language organization management (create departments, hire agents, assign work), strategy-aware decision-making, and autonomous tool execution with verification.
- **AI Employees** — Hire by role with capabilities, permissions, memory, and execution history. Supports pause, reassign, rename, and performance tracking.
- **Agent Templates** — 18 pre-built role templates across 9 categories (Engineering, Marketing, Sales, Customer Success, Finance, Operations, Product, Data, Executive) with recommended capabilities, tools, and autonomy levels.
- **Agent Recommendations** — "Who should handle this?" engine that scores agents by capability match, utilization, performance, and reliability.
- **Priority Recommendations** — "What should I do next?" engine that surfaces overdue tasks, stalled goals, and unassigned high-priority work.
- **Strategic Lineage** — Trace every task back to company strategy: Strategy → Objective → Key Result → Initiative → Task.
- **Decision Memory** — Record decisions with rationale, alternatives, expected outcomes, and actual outcomes for future reference.
- **AI Workforce ROI** — Track completed work, failed work, revisions, time saved, cost, quality, and ROI per agent and per department.
- **Strategy Page** — Create strategies, objectives, key results, and link them to initiatives and tasks.
- **Approval Gates** — Sensitive actions require CEO approval before execution.
- **Company Memory** — Persistent organizational knowledge that accumulates over time.
- **Work Credits** — Usage-based economic system tracking AI execution costs.
- **Billing & Subscriptions** — Plan-based access with Stripe-ready architecture.
- **Company Constitution** — Define company rules, values, and agent policies.
- **Departments & Teams** — Organize AI employees into functional groups with department/team templates.
- **Organization Explorer** — Visual org chart with departments, agents, and stats.
- **Company Health** — Real-time health score based on agent activity, task completion, credit usage, and approvals.
- **Audit Trail** — Immutable record of all organizational actions with CSV/JSON export.
- **File Management** — Upload, store, and share documents with your AI organization.
- **Notifications** — Real-time alerts with configurable preferences.
- **Collision-Aware Floating Launcher** — Executive Agent launcher with drag, snap-to-edge, collision detection, and position persistence.
- **Keyboard Shortcuts** — Meta+Shift+E opens the Executive Agent from anywhere.
- **Admin Dashboard** — Platform management for operators with user/org management, health monitoring, and security controls.

---

## Repository Layout

```
orq8/
├── apps/
│   ├── web/              # Next.js app: landing (route group `(landing)`) + product shell + admin → orq8 on Vercel
│   └── api/              # Fastify API → orq8-api on Railway
├── packages/
│   ├── db/               # Drizzle ORM schema, migrations, seed data
│   ├── domain/           # Shared domain types, Zod schemas, constants
│   ├── auth/             # Authentication + session primitives
│   ├── agents/           # Agent runtime (execution loop, tool layer)
│   └── core/             # Shared utilities, config, logging, errors
├── infra/
│   ├── docker-compose.yml   # Postgres, MinIO, Ollama, LiteLLM (local dev)
│   └── deploy/              # Deployment manifests
├── supabase/migrations/  # Production SQL migrations (applied by DB Migrate workflow)
├── docs/                 # 75+ documentation files + ADRs
└── marketing/            # Landing copy, brand guide, design-partner kit
```

## Quick Start

**Prerequisites:** Node.js ≥ 20, pnpm ≥ 9, Docker (with compose).

```bash
# 1. Install dependencies
pnpm install

# 2. Start local infrastructure (Postgres+pgvector, MinIO, Ollama, LiteLLM)
docker compose -f infra/docker-compose.yml up -d

# 3. Copy env files and fill in your provider keys
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Run database migrations
pnpm --filter @orq8/db migrate

# 5. Start the API and web app
pnpm --filter @orq8/api dev     # API at :3001
pnpm --filter @orq8/web dev     # Web at :3000
```

With Ollama running locally you can operate with **zero model cost**. To use frontier models, add your own provider keys (OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter) in Settings → AI Providers — keys are encrypted at rest and never exposed to the frontend.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Backend | Fastify, TypeScript, Drizzle ORM |
| Database | PostgreSQL + pgvector (Supabase or self-hosted) |
| Auth | Argon2id password hashing, session tokens, cookie-based |
| AI Routing | LiteLLM (OpenAI, Anthropic, Gemini, Ollama, etc.) |
| File Storage | MinIO (S3-compatible) |
| Deployment | Vercel (web/landing), Railway (API), GitHub Actions (CI/CD) |
| Testing | Vitest, React Testing Library, Playwright (E2E specs) |

---

## Project Status

### Platform Stats

| Metric | Count |
|--------|-------|
| Database tables | 63+ |
| API endpoints | 300+ |
| Test files | 84 (unit + integration + E2E specs) |
| Documentation files | 75+ |
| User-facing app pages | 70 |
| Admin pages | 14 |
| Agent templates | 18 (across 9 categories) |
| Migrations | 23 (auto-applied by the DB Migrate workflow on push to main) |
| Security score | 9/10 (CSRF, brute-force lockout, rate limiting, CSP, HSTS) |

### Feature Status

| Feature | Status | Details |
|---------|--------|---------|
| Landing Page | ✅ Production | Responsive, animated, conversions-optimized |
| Authentication | ✅ Production | Register, login, logout, forgot/reset password, brute-force lockout, **email verification** (hashed one-time tokens, 24h expiry, resend rate-limited, verification-gated UX) |
| Onboarding | ✅ Production | Multi-step flow, backend-persisted, resume on login |
| CEO Dashboard | ✅ Production | Real API data, SSE live updates, company progress, health score, activity feed |
| Command Center | ✅ Production | Real LLM execution, credit tracking, live status |
| AI Employees | ✅ Production | Hire, configure, assign, monitor, pause, rename, plan-enforced limits |
| Agent Templates | ✅ Production | 18 templates, create-from-template, recommended capabilities/tools/autonomy |
| Executive Agent | ✅ Production | Real LLM integration, tool execution pipeline, org management, strategy-aware |
| EA Tool Execution | ✅ Production | Org management (create/rename departments & teams, create/update agents, goals, tasks, org rename) + `plan_engineering` delegation to the Engineering Manager |
| EA Recommendations | ✅ Production | "Who should handle this?" + "What should I do next?" + workforce intelligence |
| Strategic Lineage | ✅ Production | Task → Initiative → KR → Objective → Strategy trace, visual tree, lineage score |
| Decision Memory | ✅ Production | Record decisions, rationale, alternatives, outcomes; EA can retrieve history |
| AI Workforce ROI | ✅ Production | Per-agent/dept/company ROI with quality-adjusted metrics |
| Strategy Page | ✅ Production | Strategy → Objectives → Key Results, progress tracking, EA awareness |
| Approval Gates | ✅ Production | Create, approve, reject, audit trail, organization-scoped |
| Goals & Tasks | ✅ Production | CRUD, priority, status, due dates, agent assignment, initiative linking |
| Work Credits | ✅ Production | Balance, consumption, alerts, atomic guard, history |
| Billing/Entitlements | ✅ Ready | Plan enforcement, limits, Stripe skeleton (keys needed) |
| Company Memory | ✅ Production | Create, view, delete, stats, agent-driven, org-scoped |
| Company Health | ✅ Production | Real-time health score, department progress, attention items |
| Constitution | ✅ Production | Company rules, agent policies, budget limits |
| Departments | ✅ Production | Department management, agent counts, budgets, templates |
| Teams | ✅ Production | Team management, agent assignment, department linking |
| Org Explorer | ✅ Production | Visual org chart, departments, agents, goals, stats |
| Business Import | ✅ Production | Describe company + URL → auto-creates org structure |
| Files & Documents | ✅ Production | Upload, list, download, delete |
| Notifications | ✅ Production | Bell, unread badge, preferences, 30s polling |
| Settings | ✅ Production | Real profile data, notification preferences, provider keys |
| Profile | ✅ Production | Real user data, inline name edit, job title + timezone editing, **avatar upload** (file picker, MIME + magic-byte + 2 MB validation, **512px client-side downscaling with EXIF orientation**, renders across profile/sidebar/top-bar with initials fallback), unified identity across all surfaces |
| Legal & Compliance | ✅ Production | Privacy Policy, Terms, Security Practices, AI Transparency Notice, cookie consent banner + `/settings/cookies` preferences page |
| Account Security UX | ✅ Production | Password visibility toggle (focus/cursor preserved), client-side password strength meter, POST-based logout, sidebar + top-bar account menus |
| Admin Governance | ✅ Production | Server-side access-denied audit logging (hashed IP, request id), Access Denied page, platform-role gating |
| Audit Trail | ✅ Production | Activity log, CSV/JSON export |
| Activity | ✅ Production | Real API data, filtering |
| Reports | ✅ Production | CEO weekly/monthly briefings |
| Knowledge Graph | ✅ Production | Entity/relation management, EA-aware |
| Quality & Learning | ✅ Production | QA scoring, revision tracking, learning loops |
| Performance | ✅ Production | Agent performance, reliability, workload analysis |
| Workforce ROI | ✅ Production | Per-agent/dept/company ROI with quality metrics |
| Floating Launcher | ✅ Production | Collision-aware, draggable, snap-to-edge, position-persistent EA launcher |
| Keyboard Shortcuts | ✅ Production | Meta+Shift+E opens EA from anywhere |
| Admin Dashboard | ✅ Production | Users, organizations, agents, execution, health, errors, security |
| Security | ✅ Hardened | CSRF, brute-force, rate limiting, CSP, HSTS, IDOR protection |
| Error Resilience | ✅ Production | React ErrorBoundary, graceful API errors |
| CI/CD | ✅ Active | GitHub Actions, automated testing, Vercel/Railway deploy, DB migration workflow |

### What's Pending

| Item | Priority | Notes |
|------|----------|-------|
| Email delivery in production | P1 | Verification + reset emails are fully implemented but log to console until `RESEND_API_KEY`/`EMAIL_FROM` are set on Railway (free tier: 3,000/mo, 100/day, one domain). Full runbook: `docs/ORQ8_LAUNCH_CHECKLIST.md` §2 |
| S3-compatible storage in production | P1 | Avatars/files currently use the local-filesystem fallback — uploads work but **bytes are lost on every Railway redeploy** (DB records survive; UI falls back to initials). Configure `S3_*` vars (Cloudflare R2 / S3) for durable storage |
| Executive Agent LLM provider in production | P1 | `POST /v1/commands` hangs until an LLM provider key is live on Railway (checklist §1) — EA delegation is the demo-critical path |
| System agent-template catalog | P2 | `GET /v1/agent-templates` returns empty on production — no seed exists for `is_system=true` templates, so "Hire from Template" shows an empty catalog for every new org |
| `INTERNAL_TOKEN` in production | P2 | Scheduled jobs (daily briefings, anomaly scans, consolidation) skip until set |
| Stripe payment integration | P2 | Architecture ready, need Stripe keys (explicitly deferred) |
| Custom domain | P2 | `orq8.com` is parked; live site runs on `orq8.vercel.app` |
| Founder admin access | P2 | Set `PLATFORM_ADMIN_EMAILS` (Railway) or `users.platform_role='admin'` in DB |
| Vercel static `/images/*` 404s | P3 | Files committed but 404 live; sidebar uses inline SVG — root cause is Vercel project config |
| Live connector E2E | P3 | GitHub/Gmail/Linear OAuth apps need real client credentials |

Recently completed (was pending): **email verification lifecycle** (migration 0023, hashed tokens, rate-limited resend, banner UX — live), **avatar upload end-to-end** (picker → validation → storage → profile/sidebar/top-bar rendering, production E2E verified), **512px client-side downscaling** (EXIF-aware, oversized photos rescued instead of rejected), **authenticated live E2E journey** (Playwright against production — caught and fixed three real auth bugs), **launch checklist** (`docs/ORQ8_LAUNCH_CHECKLIST.md` — every remaining dashboard action with verification commands).

---

## Documentation

The complete documentation set lives in `docs/`. Key documents:

| # | Doc | Purpose |
|---|-----|---------|
| 00 | MARKET_GTM | Market analysis + go-to-market strategy |
| 01 | PRODUCT_VISION | Vision, positioning, differentiators |
| 02 | PRODUCT_REQUIREMENTS | Functional + non-functional requirements |
| 06 | SYSTEM_ARCHITECTURE | Services, tech stack, ADRs |
| 08 | EXECUTIVE_AGENT_SPEC | Executive Agent design and modes |
| 17 | COMPANY_CONSTITUTION | Constitution design and versioning |
| 34 | DATABASE_SCHEMA | ERD and table definitions |
| 35 | API_SPECIFICATION | API conventions and endpoint contracts |
| 37 | SECURITY_ARCHITECTURE | Security model and threat model |
| 49 | IMPLEMENTATION_PLAN | Phased plan and dependency graph |
| 55 | PRODUCT_ROADMAP | Product roadmap |

**Fundraising materials:** `docs/fundraising/`

| Doc | Purpose |
|-----|---------|
| ONE-PAGE-INVESTOR-BRIEF | One-page summary for quick investor reads |
| INVESTOR-READINESS | Full fundraising strategy, valuation, and outreach plan |
| PITCH-DECK | Complete pitch deck content and narrative |

---

## Core Principles

1. **Human sovereignty** — the human CEO is the final authority. Governance, authorization, and financial control are enforced in code, never by prompts.
2. **Organizational, not conversational** — intent → understand → context → plan → deliberate → recommend → authorize → execute → verify → report → learn.
3. **Dynamic, not hard-coded** — departments, teams, and agent roles are reusable primitives, not fixed types.
4. **Model-agnostic & provider-agnostic** — routing across providers via LiteLLM; local models (Ollama) and BYOK supported from day one.
5. **FOSS-first, no lock-in** — self-hosted Postgres/pgvector, MinIO (S3-compatible), Docker sandboxing. Every layer has a funded upgrade path that does not require rework.

---

## License

Proprietary — All rights reserved. © 2026 ORQ8 Labs.
