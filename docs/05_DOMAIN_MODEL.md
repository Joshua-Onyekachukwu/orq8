# 05 — Domain Model

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 5.1 Terminology (canonical, per brief §3)

| Term | Definition |
|------|-----------|
| User | Human CEO / human decision maker |
| Executive Agent | Top-level organizational intelligence |
| Chief of Staff / Executive Director | Configurable title for the Executive Agent |
| Agent | AI employee |
| Hire | Provision/activate an agent into the organization |
| Employee | Agent or, in future, human employee |
| Department | Organizational grouping |
| Team | Group of employees working toward an objective |
| Temporary Team | Project-specific workforce |
| Council | Group of agents convened to deliberate on a decision |
| Goal | Company-level desired outcome |
| Objective | Measurable target under a goal |
| Project | Bounded body of work |
| Task | Executable work item |
| Workflow | Orchestration of tasks/events/decisions |
| Tool | Capability an agent can invoke |
| Integration | Connection to an external application/service |
| Internal Tool | Tool built and operated by the organization |
| Company Memory | Persistent organizational knowledge |
| Constitution | Hard governance principles |
| Policy | Operational rule |
| Permission | Technical capability boundary |
| Approval | Explicit authorization |
| Audit Event | Immutable record of significant activity |
| Agent Performance Review | Structured evaluation of an agent |
| Simulation | Preview/forecast of an organization or proposed action |
| Business Case | Justification for hiring/building/buying/adopting something |

UX copy uses "Hire Agent," never "create agent."

## 5.2 Domain Boundaries

```
┌──────────────────────────────────────────────────────────────┐
│                        IDENTITY                              │
│  User · Organization · Membership · Role · Session           │
├──────────────────────────────────────────────────────────────┤
│                       ORGANIZATION                           │
│  Department · Team · Position · Agent · AgentVersion ·       │
│  EmploymentRecord · AgentTemplate · AuthorityProfile         │
├──────────────────────────────────────────────────────────────┤
│                        GOVERNANCE                            │
│  Constitution · Policy · Permission · Approval · AuthorityRule│
│  Delegation · EmergencyControl · FinancialControl            │
├──────────────────────────────────────────────────────────────┤
│                         STRATEGY                             │
│  Goal · Objective · KPI · Strategy · StopCondition           │
├──────────────────────────────────────────────────────────────┤
│                           WORK                               │
│  Project · Task · Workflow · WorkflowRun · Dependency ·      │
│  Commitment · Block                        │
├──────────────────────────────────────────────────────────────┤
│                         DECISIONS                            │
│  Decision · Council · CouncilMember · Deliberation ·         │
│  Recommendation · EvidenceItem                              │
├──────────────────────────────────────────────────────────────┤
│                          MEMORY                              │
│  MemoryEntry · Document · LessonLearned · DecisionPrecedent  │
├──────────────────────────────────────────────────────────────┤
│                           TOOLS                              │
│  Integration · IntegrationAccount · Tool · InternalTool ·    │
│  ToolPermission · CapabilityEvaluation · ProcurementRecord   │
├──────────────────────────────────────────────────────────────┤
│                            AI                               │
│  Provider · UserProviderKey · Model · ModelPolicy ·          │
│  RoutingRule · ModelUsage · CostEntry                        │
├──────────────────────────────────────────────────────────────┤
│                        REPORTING                             │
│  WeeklyReport · MonthlyReport · MetricSnapshot               │
├──────────────────────────────────────────────────────────────┤
│                         SECURITY                             │
│  AuditEvent · SecretRecord · AccessEvent · RateLimitPolicy   │
└──────────────────────────────────────────────────────────────┘
```

## 5.3 Core Entities

### Identity
- **User** — human account. Has a human role (`owner`, `admin`, `member`, `viewer`) within each organization.
- **Organization** — tenant. Has name, slug, Constitution (current version), status, plan tier.
- **Membership** — user↔org link with role and status.
- **Session** — authenticated session (server-side, revocable).

### Organization
- **Department** — grouping (e.g., Engineering, Marketing, Finance). Has head position, budget allocation, model policy defaults, status.
- **Team** — group of employees toward an objective; `team_type` ∈ {permanent, temporary, cross-functional, council-scaffold}; link to Project when temporary.
- **Position** — a role instance within a department (manager, head, member).
- **Agent** — AI employee. Fields: name, title, department, manager, mission, responsibilities, capabilities, status (`proposed`, `hired`, `onboarding`, `active`, `restricted`, `under_review`, `suspended`, `offboarded`, `archived`), employment type (temporary/permanent), current AgentVersion, AuthorityProfile ref, budget policy ref, cost tracking ref.
- **AgentVersion** — immutable snapshot of an agent's config (instructions, model policy, tools, knowledge, permissions). Performance compared across versions.
- **EmploymentRecord** — lifecycle events and dates (hired, onboarded, reviewed, suspended, offboarded, archived).
- **AgentTemplate** — reusable, configurable role template (CTO, Marketing Analyst, etc.).
- **AuthorityProfile** — explicit permissions (§81): tools, data access, model access, financial authority, communication authority, external action authority, approval authority, security clearance, operating limits, delegation authority, escalation rules.

### Governance
- **Constitution** — versioned document: mission, vision, values, principles, forbidden actions, approval requirements, risk tolerance, spending authority, data rules, security rules, decision rules, oversight, escalation, operating principles.
- **Policy** — operational rule; typed (financial, approval, communication, security, data). Versioned.
- **Permission** — capability grant `(org, scope, resource, action, effect)`.
- **Approval** — explicit authorization: type, requester, resource/action, threshold, status (pending/approved/rejected/expired/revoked), approver, decision evidence, expiry.
- **AuthorityRule** — deterministic rule for approval tiers (e.g., amount ranges → required approver).
- **Delegation** — granted authority with scope, amount, action types, time limit, conditions, approver, revocation.
- **EmergencyControl** — CEO-level kill switch state (org/department/team/agent paused, financial execution revoked, outbound comms stopped, deployments frozen).
- **FinancialControl** — per entity: allocated budget, warning, hard ceiling, per-transaction authority, cumulative authority (day/week/month), payment authority.

### Strategy
- **Goal** — company-level outcome; status, owner, deadline, success criteria.
- **Objective** — measurable target under a Goal; KPIs, owner, deadlines.
- **KPI** — metric definition + current value + target + source.
- **Strategy** — approach under a Goal.
- **StopCondition** — success / continue / pause / escalate / abandon conditions + review schedule; attached to Goal/Project/Workflow.

### Work
- **Project** — bounded body of work; links to Objective, status, start/end, stop conditions, budget allocation.
- **Task** — executable work item: title, description, status (`todo`, `ready`, `in_progress`, `blocked`, `waiting_approval`, `completed`, `failed`, `cancelled`), assignee (agent), project, objective trace, due date, priority, effort estimate, output refs.
- **Workflow** — declarative orchestration spec (steps, branches, approvals, events).
- **WorkflowRun** — instance of a Workflow; durable execution state; step history.
- **Dependency** — task/workflow dependency (blocked-by, requires).
- **Commitment** — customer promises, deadlines, contracts, financial/vendor/product obligations; monitored independently of creating agent.
- **Block** — explicit blocked-state record with reason and resolver.

### Decisions
- **Decision** — a decision record: question, status, requester, owner, date, participants, evidence, alternatives, reasoning, expected outcome, review date, outcome.
- **Council** — deliberative group instance: members, question, status, minutes.
- **CouncilMember** — member + role + independent analysis + position (for/against/abstain) + confidence.
- **Deliberation** — challenge/debate records: disagreement, evidence, assumptions, confidence, unresolved questions.
- **Recommendation** — synthesized: recommendation, evidence, assumptions, alternatives, risks, expected outcome, confidence, required approval.
- **EvidenceItem** — source reference for any claim (doc, URL, event, tool result, metric).

### Memory
- **MemoryEntry** — typed memory (company profile, decision, strategy, goal, process, documentation, customer, technical, project history, lesson, agent history, vendor/tool). Fields: title, body (or document ref), evidence type, confidence, permissions, source refs, tags.
- **Document** — uploaded/imported document with extracted text and metadata.
- **LessonLearned** — postmortem entry.
- **DecisionPrecedent** — structured record for future agents (why accepted/rejected; conditions; still-valid check).

### Tools
- **Integration** — registered external application type (GitHub, Gmail, Slack, Linear, Notion, etc.); definition with OAuth scopes and capability catalog.
- **IntegrationAccount** — connected instance per org with token (encrypted), status, scopes.
- **Tool** — runtime capability an agent can invoke (backed by integration or internal tool or builtin).
- **InternalTool** — org-built tool registered in the Tool Registry.
- **ToolPermission** — capability-level grants (e.g., GitHub: read yes, write yes, pr yes, merge no).
- **CapabilityEvaluation** — build-vs-buy-vs-adopt record: options, criteria scores, recommendation, decision.
- **ProcurementRecord** — owned/used resource (subscription, SaaS, domain, license, vendor, account, etc.): name, cost, renewal date, owner, users, limits, status.

### AI
- **Provider** — model provider definition (OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter, Ollama, OpenAI-compatible custom).
- **UserProviderKey** — encrypted key for an org; masked display; rotation history; status; audit.
- **Model** — model definition: id, provider, capabilities (context, vision, audio, tools), pricing metadata, availability, default use cases.
- **ModelPolicy** — which models are allowed for which department/agent/task class; cost ceilings.
- **RoutingRule** — task characteristics → model choice rules (priority, fallback).
- **ModelUsage** — per-call record: model, tokens in/out, duration, cost, task, agent, org.
- **CostEntry** — cost ledger rows (AI, tool, infra, voice, SaaS, internal tools) with allocation metadata.

### Reporting & Security
- **WeeklyReport / MonthlyReport** — generated report with sections (§37/§38), status, reviewed-by.
- **MetricSnapshot** — periodic captured metric values (KPIs, health indicators).
- **AuditEvent** — append-only record with hash chain (§34).
- **SecretRecord** — metadata for encrypted secrets (kind, masked ref, rotated_at, accessed_at) — never the secret value.
- **AccessEvent** — permission check outcomes (granted/denied, actor, resource, action).

## 5.4 Key Relationships

- Organization 1—N everything; all tables carry `org_id` (tenant).
- User N—M Organization via Membership.
- Department 1—N Agent (via Position); Department N—M Team.
- Agent 1—N AgentVersion (current version ref); Agent 1—1 AuthorityProfile (versioned).
- Goal 1—N Objective 1—N Project 1—N Task.
- Task N—N Task via Dependency (blocked_by).
- Agent N—M Council via CouncilMember; Council 1—N Deliberation 1—N Recommendation.
- Task/Agent 1—N Approval (pending decisions); Approval → ApprovalRule.
- Agent 1—N MemoryEntry (author); MemoryEntry N—M EvidenceItem.
- Workflow 1—N WorkflowRun 1—N StepState.
- Integration 1—N IntegrationAccount; Integration 1—N Tool; Tool N—M Agent via ToolPermission.
- Agent 1—N ModelUsage; ModelUsage → Model → Provider.
- Organization 1—N AuditEvent (hash-chained).

## 5.5 Cross-Cutting Concepts

1. **Tenant isolation** — `org_id` on every row; app-level authz + optional Postgres RLS hardening (Phase 16).
2. **Immutability** — AuditEvent append-only; AgentVersion and Constitution immutable once published.
3. **Traceability** — every Task → Objective → Goal; every CostEntry/ModelUsage → org/dept/project/agent.
4. **Authority, not prompts** — AuthorityProfile + Permission + Approval are runtime objects enforced by the platform; the model never carries authority.
5. **Dynamic primitives** — Department, Team, Agent, Council are generic objects; no fixed count or hard-coded types.
6. **Versioning** — Agent configs, Constitutions, Policies, and AuthorityProfiles are versioned and comparable.
