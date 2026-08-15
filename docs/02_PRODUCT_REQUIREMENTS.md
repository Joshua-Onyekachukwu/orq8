# 02 — Product Requirements

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

Requirements are grouped by capability. Each traces to sections of the master brief. **[M1]** marks requirements needed for the first implementable milestone (Golden Workflow MVP); the rest are phased per 49_IMPLEMENTATION_PLAN.md.

---

## 2.1 Human Sovereignty & Governance

- **R-GOV-1 [M1]** The human CEO is the final authority; the Executive Agent may be more capable but never more authoritative.
- **R-GOV-2 [M1]** Approval tiers are enforced at runtime: Automatic / Department Authority / Executive Approval / CEO Approval / Forbidden.
- **R-GOV-3 [M1]** Consequential actions are gated server-side. Never rely on frontend state, prompt instructions, or hidden UI.
- **R-GOV-4 [M1]** Every organization has a versioned, auditable Company Constitution; only authorized humans may change it.
- **R-GOV-5** The CEO may override recommendations; the system preserves the recommendation, evidence, decision, and override in the audit trail.
- **R-GOV-6 [M1]** Agents cannot: bypass approval, elevate permissions, modify governance, reveal secrets, access unauthorized data, disable audit logs, circumvent budget policy, impersonate the CEO, or change their own authority.

## 2.2 Intent Engine

- **R-INT-1 [M1]** Accepts natural, vague input: text, voice (later), uploaded files, URLs, repositories, documents, screenshots, conversations, system events.
- **R-INT-2 [M1]** Classifies intent, urgency, objective, affected department, required context, whether research is needed, whether execution is authorized, whether human input is required, whether a project should be created, and whether a council is needed.
- **R-INT-3 [M1]** Does not ask unnecessary questions; prefers "I believe you want X; I'll investigate and return with a recommendation."
- **R-INT-4** Asks a concise question only when ambiguity materially changes the outcome.

## 2.3 Executive Agent

- **R-EXE-1 [M1]** Understands CEO intent, maintains strategic context, inspects memory/work/workforce, identifies departments and skills, assigns work, convenes councils, proposes hiring, monitors blockers, requests human input, prepares executive decisions, explains recommendations, monitors goals, coordinates reporting, identifies risks, recommends build/buy/adopt and restructuring.
- **R-EXE-2 [M1]** Delegates intelligently rather than executing everything itself.
- **R-EXE-3 [M1]** Supports Chat, Execution, Review, and Simulation modes (Voice mode later).

## 2.4 Hiring & Agent Lifecycle

- **R-HIR-1 [M1]** Agents are hired, not created; "Hire Agent" is the primary UX copy.
- **R-HIR-2 [M1]** Every hire has a business case with: title, department, manager, mission, responsibilities, capabilities, model policy, tools, knowledge sources, permissions, budget/resource policy, success metrics, expected workload/cost, reason, alternatives considered, temp/permanent status.
- **R-HIR-3 [M1]** Pre-hire questions: existing agent? reassignment? internal tool? connected tool? external tool? open source? is hiring justified?
- **R-HIR-4 [M1]** Lifecycle: Proposed → Approval → Hired → Onboarding → Active → Review → Improved → Promoted/Transferred → Suspended → Offboarded → Archived.
- **R-HIR-5 [M1]** Offboarding preserves work, decisions, performance, knowledge, audit trail; knowledge selectively transfers to replacements.
- **R-HIR-6 [M1]** Reusable, configurable agent templates (not hard-coded types).
- **R-HIR-7 [M1]** Agent configurations are versioned; never silently overwrite; performance tracked between versions.
- **R-HIR-8** Replacement pipeline: Detect → Diagnose → Improve → Evaluate → Keep or Replace, with approval and knowledge transfer.

## 2.5 Organization Structure

- **R-ORG-1 [M1]** Dynamic departments, teams, temporary teams, and councils built from reusable primitives.
- **R-ORG-2 [M1]** Managers assemble permanent department teams, temporary project teams, cross-functional teams, and councils.
- **R-ORG-3 [M1]** Councils: Question → Select members → Independent analysis → Challenge/disagreement → Synthesis → Recommendation → Human approval where required. Disagreement is preserved, not forced into consensus.
- **R-ORG-4 [M1]** Agents can challenge assumptions and recommendations; the system surfaces disagreements, evidence, assumptions, confidence, unresolved questions, final recommendation — without exposing private chain-of-thought.

## 2.6 Goals, Work, and Stop Conditions

- **R-GOA-1 [M1]** Hierarchy: Company Mission → Strategic Goals → Strategy → Objectives/KPIs → Projects → Tasks; every major task traces to an objective.
- **R-GOA-2 [M1]** Goals/objectives support KPIs, deadlines, owners, success criteria, stop conditions, dependencies, risk thresholds.
- **R-GOA-3 [M1]** Every significant project has success / continue / pause / escalation / abandonment conditions and a review schedule.
- **R-GOA-4 [M1]** Tasks, projects, workflows, dependencies, blocking, deadlines, and goal links are first-class objects.
- **R-GOA-5 [M1]** A task that does not contribute to a meaningful objective is questioned or deprioritized (anti-busywork).

## 2.7 Human Attention Model

- **R-ATT-1 [M1]** Routine → execute; Important → report; Approval required → queue for CEO; Urgent → notify; Blocked → ask for help; Forbidden → do not execute.
- **R-ATT-2 [M1]** Formal "Need Human" capability with: what is needed, why, impact, urgency, what can continue while waiting.
- **R-ATT-3 [M1]** Other work keeps moving while one task waits for a human.
- **R-ATT-4** Distinguish "CEO preferred approval" from "CEO mandatory approval"; bundle related decisions into briefings where safe; report decisions waiting, age, delegated, escalated, CEO time saved.

## 2.8 Financial Controls (Authority, Budget, Procurement)

- **R-FIN-1 [M1]** Four controls per department/project/team/agent: Allocated Budget, Spending Authority (per transaction), Cumulative Authority (day/week/month), Payment Authority (mechanisms/vendors).
- **R-FIN-2 [M1]** Budget levels: target, warning, hard ceiling — above warning = CFO/Executive review; above ceiling = approval required.
- **R-FIN-3 [M1]** Budget allocation is distinct from spend authorization; a department budget does not grant every agent access.
- **R-FIN-4 [M1]** Configurable financial approval matrix (e.g., <$50 auto; $50–250 dept head; >$250 CEO; subscriptions/vendors/contracts/transfers per policy). These are examples, not hard-coded values.
- **R-FIN-5 [M1]** Financial execution layer: Spending Request → Policy Engine → Budget Check → Authority Check → Risk/Vendor/Category Check → Approval if required → Payment Executor → Receipt/Evidence → Ledger + Audit. Agents cannot bypass by changing prompts.
- **R-FIN-6 [M1]** Hiring budget is separate from operating budget and from infrastructure/tool budgets.
- **R-FIN-7 [M1]** Budget requests include amount, allocation, spend, balance, reason, blocked work, expected outcome/ROI, confidence, alternatives, duration, proposed new budget, downside if approved/rejected.
- **R-FIN-8** Performance-linked budget recommendations (evidence-based; measured vs attributed vs estimated clearly distinguished).
- **R-FIN-9 [M1]** Procurement/Company Resource Registry: software, SaaS, domains, APIs, cloud, repos, infrastructure, licenses, datasets, internal tools, vendors, payment accounts, channels. Default evaluation: Already Owned → Existing Integration → Internal Tool → Open Source → External SaaS → Build.

## 2.9 Memory & Audit

- **R-MEM-1 [M1]** Company Memory categories: profile, decisions, strategy, goals, processes, documentation, customer knowledge, technical knowledge, project history, lessons learned, agent history, vendor/tool info.
- **R-MEM-2 [M1]** Memory is permission-aware: agents retrieve only what they are authorized to access.
- **R-MEM-3 [M1]** Evidence types distinguished: Verified Fact, User Instruction, Company Policy, Decision, Assumption, Recommendation, Unverified Information, Historical Context.
- **R-MEM-4** Decision Precedent: decision, date, participants, evidence, alternatives, reasoning, owner, expected outcome, review date, outcome — so future agents know why approaches were accepted/rejected and whether conditions changed.
- **R-AUD-1 [M1]** Every significant action records actor, actor type, org, department, agent, task, action, tool, timestamp, input reference, result, authorization, approval, policy decision, cost, outcome.
- **R-AUD-2 [M1]** Audit log is append-only / tamper-evident.

## 2.10 Model Routing & Costs

- **R-MOD-1 [M1]** No hard-coded single model; a model abstraction layer routes on task type, complexity, reasoning, latency, context, tool-use, vision/audio, cost ceiling, quality, keys, availability.
- **R-MOD-2 [M1]** User-owned provider keys (OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, Groq, OpenAI-compatible), encrypted at rest, never in frontend JS, never logged, never in prompts/responses, rotatable, revocable, org-scoped, audited.
- **R-MOD-3 [M1]** BYOK and platform-provided models both supported; OpenAI-compatible endpoints supported; model policies per department/agent.
- **R-MOD-4 [M1]** Cost-aware routing: cheap models for classification/routing/summarization/extraction/routine reports; strong models for architecture/engineering/strategy/complex reasoning/high-risk analysis.
- **R-MOD-5 [M1]** Weekly cost view (spend, prev week, % change, by dept/model/project, high-cost workflows) and monthly view (AI spend, tools, infra, voice, SaaS, internal tools, per dept/goal, trends, projection). Daily spend is not the primary executive view.
- **R-MOD-6 [M1]** Provider outage/fallback routing; model definitions are configurable, not assumed permanent.

## 2.11 Tools, Integrations, Build-vs-Buy

- **R-TOO-1 [M1]** Integration framework, not hard-coded apps; OAuth where available; per-tool capability permissions (e.g., GitHub read/create branch/write/commit/PR/merge/delete as separate capabilities).
- **R-TOO-2 [M1]** Tool Registry: name, description, owner, department, repo, deployment, API, docs, users, permissions, infra cost, maintenance status, health, version, dependencies.
- **R-TOO-3 [M1]** Capability-resolution system: search internal tools → connected apps → approved external tools → open source → evaluate build; compare cost/time/maintenance/security/reliability/scalability/privacy/integration difficulty/vendor lock-in/quality/strategic importance/workload. Outcomes: BUY / ADOPT OPEN SOURCE / BUILD / USE EXISTING INTERNAL TOOL.
- **R-TOO-4 [M1]** Internal marketplace: "Do we already have something that extracts PDF data?" returns internal tool, external tool, approved SaaS, open-source option, recommendation.
- **R-TOO-5 [M1]** Tool permission model: capabilities exposed separately; an agent may have Read yes / Write yes / PR yes / Merge no.

## 2.12 Engineering Workspace & Sandbox

- **R-ENG-1 [M1]** Repository explorer, Monaco editor with tabs/diff/inline changes, agent activity feed, sandboxed terminal, Git (branches/commits/diffs/PRs), tests, preview, task panel, review panel (files changed, reasons, tests, risk, recommendation).
- **R-ENG-2 [M1]** User must see code changes before approving consequential operations (approval gates).
- **R-ENG-3 [M1]** Coding sandbox: isolated filesystem, network policy, resource limits, timeout, secrets isolation, command allow/deny, ephemeral environments, repo access controls, audit events. No unrestricted host access.
- **R-ENG-4 [M1]** Platform-native engineering agent interface; third-party coding apps never dictate platform architecture.

## 2.13 Import Existing Business

- **R-IMP-1** Connect: website, GitHub/GitLab, email, Google Workspace, Microsoft 365, Trello, Linear, Jira, Notion, CRM, analytics, cloud, databases, docs, social, support, finance, other APIs.
- **R-IMP-2** Discovery → Business Map (company identity, products, services, markets, customers, positioning, competitors, technology, repos, architecture, project structure, departments, workflows, tools, documents, goals, metrics, gaps).
- **R-IMP-3** Nothing consequential activated automatically; important assumptions presented for confirmation.
- **R-IMP-4** Baselines: Company Profile, Product Map, Technology Map, Organization Map, Integration Map, Goal/KPI Map, Risk Map, Existing Tool Map, Engineering/Marketing/Operations Baselines; then recommended AI organization.

## 2.14 Reporting

- **R-REP-1 [M1]** Weekly CEO report: executive summary, goals, wins, problems, decisions made, pending decisions, financials, AI spend, product/engineering/marketing/sales/customers/operations, risks, workforce health, tool/vendor changes, next week's priorities.
- **R-REP-2 [M1]** Monthly executive report: performance, financials, AI workforce, model cost, software, infrastructure, goals/KPIs, projects, customers, engineering/marketing/sales, risks, agent performance, org changes, strategic recommendations.
- **R-REP-3 [M1]** PA/Reporting agent prepares; Executive Agent reviews before delivery.
- **R-REP-4** Organizational health: goals on track, blocked projects, pending decisions, workforce health, budget health, AI spend, risks, integration health, system health — with underlying evidence, not unexplained scores.

## 2.15 Voice (later phase)

- **R-VOI-1** Voice input/output for questions, commands, decision review, reports, approvals.
- **R-VOI-2** Voice uses the same authorization system as chat; conversational approval never bypasses approval (e.g., confirm $1,000 campaign before executing).

## 2.16 Non-Functional Requirements

- **R-NFR-1 [M1]** Multi-tenant with tenant IDs throughout and organization-level isolation.
- **R-NFR-2 [M1]** Authorization (RBAC + authority profiles) enforced server-side outside the model.
- **R-NFR-3 [M1]** Secrets encrypted at rest; secure OAuth token storage; secret redaction; no secrets in logs.
- **R-NFR-4 [M1]** Durable long-running workflows survive process/model/API/network/tool/worker failure; idempotent operations; no duplicated side effects after retries.
- **R-NFR-5 [M1]** Prompt injection defenses: website/email/doc/issue/customer content is untrusted data, never governance instructions; tool-level authorization outside the model.
- **R-NFR-6 [M1]** Rate limits, tool allowlists, model provider isolation, data exfiltration controls, approval gates, destructive-action protections.
- **R-NFR-7 [M1]** Emergency controls at platform layer: pause org/department/team/agent, revoke external actions, revoke financial execution, stop outbound communication, revoke tool access, freeze deployments.
- **R-NFR-8 [M1]** Operational limits: max concurrent tasks, execution time, model spend, tool calls, retries, delegation depth, outbound comms rate, financial authority; explicit termination for agent-agent loops.
- **R-NFR-9 [M1]** FOSS-first: self-hostable, free-tier friendly, no lock-in; funded upgrade path without rework.
- **R-NFR-10 [M1]** Performance: routine interactions fast; long-running work asynchronous via events/queues; realtime updates via SSE/WebSockets.
- **R-NFR-11 [M1]** Accessibility and calm, executive-focused UI; not a dashboard of hundreds of cards.
