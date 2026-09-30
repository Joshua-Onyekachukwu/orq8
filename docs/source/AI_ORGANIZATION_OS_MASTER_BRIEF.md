# AI Organization Operating System — Master Product & Development Brief

**Document purpose:** This is the master brief to give to a capable coding/product agent before development. The agent must use it to generate the full development documentation set, architecture, implementation plan, database design, API contracts, UI/UX specification, security model, testing strategy, infrastructure plan, and phased build plan before writing production code.

**Working product description:** An AI Organization Operating System that lets a human CEO create or import a business, define goals and governance, hire AI employees, organize them into departments and temporary teams, delegate work, connect external tools, build internal tools when justified, route tasks across multiple AI models, require human approval for consequential actions, maintain company memory and audit history, evaluate and replace underperforming agents, and provide concise weekly/monthly executive reporting.

---

# 1. Product Vision

Build a system that feels like an intelligent digital organization rather than a collection of chatbots.

The human user is the ultimate authority. The user can speak naturally, type vague ideas, paste links, upload documents, ask questions, assign goals, or give direct commands. The system's Executive Agent interprets intent, gathers context, forms the right team/council, plans work, delegates to the appropriate agents, asks for human input when necessary, executes only within authority, and reports outcomes.

The system must support both:

1. **Greenfield mode:** Start a new company/project from scratch.
2. **Existing-business mode:** Import an existing company and begin operating from its existing website, repositories, documents, project boards, integrations, analytics, CRM, and other connected systems.

The architecture must not hard-code a fixed number of departments, teams, or agent types. Departments and workforce are dynamic organizational objects built from reusable primitives.

The platform should scale from a solo founder with 3 agents to a large organization with hundreds or thousands of agents, subject to infrastructure and model-cost limits.

---

# 2. Core Product Principle

The product is NOT primarily an AI chat application.

It is an organizational operating system.

The fundamental loop is:

**Intent → Understand → Context → Plan → Deliberate → Recommend → Authorize → Execute → Verify → Report → Learn**

The system should minimize the amount of organizational management the human has to perform.

The human should say:

> "I think there is an opportunity here. Investigate it."

rather than:

> "Create a project, hire a market researcher, create three tasks, assign them, and ask the finance agent to estimate the cost."

The Executive Agent should figure out the latter.

---

# 3. Terminology

Use the following terminology consistently:

- User = Human CEO / human decision maker
- Executive Agent = top-level organizational intelligence
- Chief of Staff / Executive Director / other title = configurable title for the Executive Agent
- Agent = AI employee
- Hire = provision/activate an agent into the organization
- Employee = agent or, in future, human employee
- Department = organizational grouping
- Team = group of employees working toward an objective
- Temporary Team = project-specific workforce
- Council = group of agents convened to deliberate on a decision
- Goal = company-level desired outcome
- Objective = measurable target under a goal
- Project = bounded body of work
- Task = executable work item
- Workflow = orchestration of tasks/events/decisions
- Tool = capability an agent can invoke
- Integration = connection to an external application/service
- Internal Tool = tool built and operated by the organization
- Company Memory = persistent organizational knowledge
- Constitution = hard governance principles
- Policy = operational rule
- Permission = technical capability boundary
- Approval = explicit authorization
- Audit Event = immutable record of significant activity
- Agent Performance Review = structured evaluation of an agent
- Simulation = preview/forecast of an organization or proposed action
- Business Case = justification for hiring/building/buying/adopting something

Do NOT use "create agent" in primary UX copy. Use "Hire Agent."

---

# 4. Human Sovereignty / Governance

The human CEO remains the final authority.

The Executive Agent may be more capable than the human at solving a particular technical, analytical, or operational problem, but it is never more authoritative than the human CEO.

The system must implement this in runtime permissions and authorization checks, not only in prompts.

The platform must distinguish:

### Automatic
Low-risk, reversible, internal operations.

### Department Authority
Actions a department leader may execute under policy.

### Executive Approval
Material business actions.

### CEO Approval
Strategic, financial, legal, external, production, destructive, or otherwise high-impact actions.

### Forbidden
Actions explicitly prohibited by the Constitution or security policy.

The CEO may override recommendations, but the system should preserve the audit trail showing the recommendation, evidence, decision, and override.

---

# 5. Company Constitution

Every organization should have a Company Constitution.

The Constitution defines:

- mission
- vision
- values
- strategic principles
- forbidden actions
- approval requirements
- risk tolerance
- spending authority
- data handling rules
- security rules
- decision-making rules
- human oversight requirements
- escalation rules
- operating principles

Example:

> No agent may make a legally binding commitment on behalf of the company without CEO approval.

> No agent may delete production data without explicit authorization.

> Major strategic changes require CEO approval.

The Constitution must be versioned and auditable.

Only authorized humans can change it.

---

# 6. Existing Business Import

Provide an onboarding path called:

**Import Existing Business**

The user can connect, where applicable:

- website
- GitHub/GitLab
- email
- Google Workspace
- Microsoft 365
- Trello
- Linear
- Jira
- Notion
- CRM
- analytics
- cloud infrastructure
- databases
- documentation
- social accounts
- support systems
- finance systems
- other APIs

The system should discover and construct a Business Map.

### Business Discovery

Analyze:

- company identity
- products
- services
- markets
- customers
- positioning
- competitors
- technology
- repositories
- architecture
- project structure
- existing departments
- workflows
- tools
- documents
- goals
- metrics
- operational gaps

Do not assume discovered information is correct.

Present important assumptions for user confirmation.

### Business Baseline

Produce:

- Company Profile
- Product Map
- Technology Map
- Organization Map
- Integration Map
- Goal/KPI Map
- Risk Map
- Existing Tool Map
- Engineering Baseline
- Marketing Baseline
- Operations Baseline

Then recommend an AI organization.

Nothing consequential should be activated automatically during import.

The flow is:

**Connect → Discover → Understand → Show Findings → User Corrects → Propose Organization → Simulate → CEO Approves → Activate**

---

# 7. Greenfield Mode

For a new idea:

**Idea → Discovery → Research → Council → Recommendation → CEO approval → Project → Workforce → Execution**

The system should allow vague inputs.

Examples:

- "I think there is a business here."
- "Look at this company."
- "We should improve support."
- "This customer keeps complaining."
- "Investigate whether we should expand into Kenya."
- "I don't like our current onboarding."
- "Build something that solves this."

The Executive Agent should infer intent, investigate, and propose a plan rather than requiring structured commands.

---

# 8. Ambient Intent / Intent Engine

Create an Intent Engine.

Input can be:

- text
- voice
- uploaded files
- URLs
- code repositories
- emails
- documents
- screenshots
- conversations
- system events

The engine classifies:

- intent
- urgency
- objective
- affected department
- required context
- whether research is needed
- whether execution is authorized
- whether human input is required
- whether a project should be created
- whether a council is needed

It should not ask unnecessary questions.

Prefer:

> "I believe you want X. I'll investigate and return with a recommendation."

over:

> "Please fill out 12 fields."

If ambiguity materially changes the outcome, ask a concise question.

---

# 9. Executive Agent / Chief of Staff

The Executive Agent is the primary organizational orchestrator.

Responsibilities:

- understand CEO intent
- maintain strategic context
- inspect Company Memory
- inspect active work
- inspect existing workforce
- identify appropriate departments
- identify required skills
- assign work
- convene councils
- propose hiring
- approve hiring where authorized
- coordinate departments
- monitor blockers
- request human input
- prepare executive decisions
- explain recommendations
- monitor company goals
- coordinate weekly/monthly reporting
- identify risks
- recommend build/buy/adopt decisions
- detect organizational inefficiencies
- recommend restructuring

The Executive Agent should not directly execute every task itself. It should delegate intelligently.

---

# 10. Executive Agent Modes

Support at least:

### Chat Mode
Planning, discussion, strategy, explanation.

### Execution Mode
Authorized operational work.

### Review Mode
Reviewing results, code, reports, proposals, decisions.

### Voice Mode
Conversational executive interface.

### Simulation Mode
Forecasting proposed organizations, plans, costs, workloads, and risks.

---

# 11. Agent Hiring System

Agents are hired, not created.

Every hire should have a business case.

Required fields:

- title
- department
- manager
- mission
- responsibilities
- capabilities
- model policy
- tools
- knowledge sources
- permissions
- budget/resource policy
- success metrics
- expected workload
- expected cost
- reason for hiring
- alternatives considered
- temporary/permanent status

Before hiring, the system should ask:

1. Can an existing agent handle this?
2. Can responsibilities be reassigned?
3. Can an internal tool solve it?
4. Can an existing connected tool solve it?
5. Can an external tool solve it?
6. Can an open-source tool solve it?
7. Is hiring actually justified?

Then produce a Business Case.

---

# 12. Agent Employment Lifecycle

Agents support:

**Proposed → Approval → Hired → Onboarding → Active → Review → Improved → Promoted/Transferred → Suspended → Offboarded → Archived**

Offboarding must preserve:

- historical work
- decisions
- performance
- useful knowledge
- audit trail

Knowledge should be selectively transferred to replacements.

---

# 13. Agent Templates

Support reusable role templates.

Examples:

Engineering:
- CTO
- Technical Lead
- Senior Frontend Engineer
- Senior Backend Engineer
- AI Engineer
- QA Engineer
- DevOps Engineer
- Security Engineer
- SRE

Marketing:
- CMO
- Growth Strategist
- SEO Specialist
- Content Strategist
- Content Writer
- Data Analyst

Finance:
- CFO
- Financial Analyst
- FP&A Analyst
- Accounts Specialist

Operations:
- COO
- Operations Manager
- Process Analyst

Other:
- Legal Researcher
- HR Agent
- Customer Support Agent
- Sales Agent
- Executive Assistant / PA
- Researcher
- Strategy Analyst

Templates must be configurable rather than hard-coded.

---

# 14. Dynamic Teams

Agents can work individually or in teams.

A manager can assemble:

- permanent department teams
- temporary project teams
- cross-functional teams
- councils

Example:

**Kenya Market Expansion Team**

- Market Researcher
- Finance Analyst
- Legal Researcher
- Growth Strategist

Temporary teams can be archived after the project.

---

# 15. Councils

A Council is a deliberative group of agents.

Examples:

- Executive Council
- Investment Committee
- Product Council
- Architecture Council
- Risk Committee
- Hiring Committee

Flow:

**Question → Select members → Independent analysis → Challenge/disagreement → Synthesis → Recommendation → Human approval where required**

Do not force artificial consensus.

The system must preserve disagreement.

---

# 16. Agent Challenge / Debate

Agents should be able to challenge assumptions and recommendations.

Example:

CFO:
> "Do not spend $1,000."

CMO:
> "Spend it."

CTO:
> "The technical implementation is ready."

Legal:
> "There is a compliance risk."

Executive Agent:
> "Conflict detected. I recommend resolving the compliance issue before spend authorization."

The system should identify:

- disagreements
- evidence
- assumptions
- confidence
- unresolved questions
- final recommendation

Do not expose private chain-of-thought. Provide concise decision explanations and evidence.

---

# 17. Ask for Help

Agents must have a formal "Need Human" capability.

Reasons:

- missing information
- approval required
- ambiguous requirement
- missing permission
- budget threshold exceeded
- conflicting instructions
- high-risk action
- low confidence
- external credential required
- legal/compliance issue
- technical blocker

The request should include:

- what is needed
- why it is needed
- impact
- urgency
- what can continue while waiting

The system should keep other work moving.

---

# 18. Human Attention Model

Do not interrupt the CEO unnecessarily.

### Routine
Execute.

### Important
Report.

### Approval Required
Queue for CEO.

### Urgent
Notify CEO.

### Blocked
Ask for help.

### Forbidden
Do not execute.

The system should distinguish "CEO preferred approval" from "CEO mandatory approval."

---

# 19. Company Goals and Strategy

The hierarchy should be:

**Company Mission → Strategic Goals → Strategy → Objectives/KPIs → Projects → Tasks**

Every major task should be traceable to an objective.

This helps prevent AI busywork.

A task that does not contribute to a meaningful objective should be questioned or deprioritized.

Support:

- goals
- objectives
- KPIs
- deadlines
- owners
- success criteria
- stop conditions
- dependencies
- risk thresholds

---

# 20. Stop Conditions

Every significant project/workflow should have:

- success condition
- continue condition
- pause condition
- escalation condition
- abandonment condition
- review schedule

Example:

Goal:
Acquire 100 customers.

Stop:
CAC exceeds $80 for four consecutive weeks.

Escalate:
Spend exceeds $5,000.

Success:
100 paying customers.

---

# 21. Build vs Buy vs Adopt

Create a capability-resolution system.

When a team needs something:

1. Search existing internal tools.
2. Search connected applications.
3. Search approved external tools.
4. Search open-source solutions.
5. Evaluate build internally.
6. Compare options.
7. Recommend the best option.

Evaluation criteria:

- cost
- development time
- maintenance
- security
- reliability
- scalability
- privacy
- integration difficulty
- vendor lock-in
- quality
- strategic importance
- expected workload

Possible outcomes:

**BUY / ADOPT OPEN SOURCE / BUILD / USE EXISTING INTERNAL TOOL**

AppSumo lifetime deals can be included as a software acquisition category, but should not become a platform dependency.

---

# 22. Internal Tool Platform

Engineering can build tools for other departments.

Every internal tool must be registered.

Tool Registry fields:

- name
- description
- owner
- department
- repository
- deployment
- API
- documentation
- users
- permissions
- infrastructure cost
- maintenance status
- health
- version
- dependencies

Before building something new, agents should search this registry.

Over time the organization develops its own internal technology ecosystem.

---

# 23. Internal Marketplace

Users and agents should be able to discover internal capabilities.

Search:

> "Do we already have something that extracts PDF data?"

The system should return:

- internal tool
- external connected tool
- approved SaaS
- open-source option
- recommendation

---

# 24. Agent Performance Reviews

Agents should be evaluated continuously.

Metrics can include:

- success rate
- task completion
- rework
- error rate
- cost
- latency
- human intervention
- quality score
- goal contribution
- customer impact
- incident rate

A performance review should diagnose the cause before recommending replacement.

Possible causes:

- poor prompt/instructions
- wrong model
- insufficient context
- bad task assignment
- missing tools
- insufficient permissions
- inadequate knowledge
- excessive workload
- poorly defined role

Improvement pipeline:

**Detect → Diagnose → Improve → Evaluate → Keep or Replace**

---

# 25. Agent Versioning

Agent configurations should be versioned.

Example:

Engineer v1:
- Model X
- Prompt A

Engineer v2:
- Better instructions

Engineer v3:
- Model Y
- Better knowledge

Track performance between versions.

Never silently overwrite important configurations.

---

# 26. Agent Replacement

If an agent repeatedly fails:

1. Diagnose.
2. Improve.
3. Re-evaluate.
4. Recommend replacement if still failing.
5. Obtain required approval.
6. Offboard.
7. Transfer required knowledge.
8. Hire replacement.
9. Onboard.
10. Resume work.

The system should preserve why the replacement occurred.

---

# 27. Organization Budget

Budget must not be a hard wall by default.

Use:

- target
- warning
- hard ceiling

Example:

Engineering:
Target $300/month
Warning $400/month
Hard ceiling $600/month

Under target:
Normal.

Above target:
Continue but monitor.

Above warning:
Executive/CFO review.

Above ceiling:
Approval required.

Agents can request budget increases.

Budget should be treated as a resource-governance mechanism.

---

# 28. Resource Allocation

Future support:

- department budgets
- project budgets
- model budgets
- tool budgets
- infrastructure budgets
- voice budgets

Potential future capability:

Department A can request unused resources from Department B through a controlled allocation process.

---

# 29. Model Router

Do not hard-code one model.

Create a model abstraction layer.

Inputs:

- task type
- complexity
- reasoning requirement
- latency requirement
- context size
- tool-use requirement
- vision/audio requirements
- cost ceiling
- quality requirement
- user/provider keys
- model availability

The router chooses an appropriate model.

Use expensive frontier models for high-value/complex work only when justified.

Use cheaper/free/open models for routine work where quality is sufficient.

Possible providers include:

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- Qwen through suitable providers
- Groq
- OpenRouter
- other compatible providers

Do not assume a particular model remains available; model definitions must be configurable.

LiteLLM is a strong candidate for the model gateway because it provides a common interface, routing/fallback, authentication, cost tracking, virtual keys, and multi-provider support. Its catalog also exposes model capabilities and pricing metadata. citeturn0search2turn0search7

---

# 30. User-Owned Model API Keys

Users must be able to add their own model provider keys.

Settings:

**AI Providers**

- OpenAI
- Anthropic
- Google
- DeepSeek
- OpenRouter
- Groq
- other compatible providers

For each provider:

- API key
- optional organization/project ID
- optional base URL
- enabled/disabled
- allowed models
- spending policy

Keys must be:

- encrypted at rest
- never exposed to frontend JavaScript
- never logged
- never included in prompts
- never returned in API responses
- rotatable
- revocable
- scoped to the user's organization
- audited for access

Use a secret-management/encryption strategy appropriate for production.

OpenAI provides API keys through its developer platform. citeturn1search3

Gemini keys are managed through Google AI Studio; Google currently recommends authorization keys and is transitioning away from unrestricted standard keys. citeturn1search2turn1search4

Groq exposes project API key management in its console. citeturn1search1

The platform should provide a "How to get key" link for each provider, but provider instructions should be maintained as configuration/documentation rather than hard-coded assumptions.

---

# 31. Bring Your Own Model Provider

Users should be able to choose:

**Platform-provided models**

or

**Bring Your Own Key**

or, eventually:

**Bring Your Own Endpoint**

Support OpenAI-compatible endpoints where appropriate.

The user should be able to configure model policies per department or agent.

---

# 32. Model Cost Management

Show:

### Weekly

- AI spend
- previous week
- percentage change
- spend by department
- spend by model
- spend by project
- high-cost workflows

### Monthly

- total AI spend
- total tool spend
- infrastructure
- voice
- external SaaS
- internal tools
- cost per department
- cost per goal/project
- cost trends
- projected monthly spend

Do not make daily spend the primary executive view.

---

# 33. Company Memory

Memory should have multiple categories:

- company profile
- decisions
- strategy
- goals
- processes
- documentation
- customer knowledge
- technical knowledge
- project history
- lessons learned
- agent history
- vendor/tool information

Memory must be permission-aware.

An agent can only retrieve information it is authorized to access.

---

# 34. Audit Trail

Every significant action should record:

- actor
- actor type
- organization
- department
- agent
- task
- action
- tool
- timestamp
- input reference
- result
- authorization
- approval
- policy decision
- cost where available
- outcome

Example:

Marketing requested $1,000 spend.

System:
- identified approval requirement
- CEO approved
- tool executed
- result returned

The audit log must be append-only or otherwise tamper-evident.

---

# 35. Explain Why

Every important recommendation should provide a decision explanation:

- recommendation
- evidence
- assumptions
- alternatives
- risks
- expected outcome
- confidence
- required approval

Do not expose hidden chain-of-thought.

Example:

Recommendation:
BUY

Evidence:
Existing product satisfies 92% of requirements.

Alternative:
Build internally.

Why rejected:
Three weeks engineering time for non-strategic capability.

---

# 36. CEO Decision Center

This should be one of the primary screens.

Show:

- decisions waiting for CEO
- hiring requests
- budget escalations
- strategic decisions
- risky actions
- conflicts
- blocked tasks requiring input

Each decision should show:

- what
- why
- who recommends it
- evidence
- alternatives
- cost
- risk
- impact
- expiration/deadline

Actions:

- Approve
- Reject
- Modify
- Discuss
- Delegate where policy allows

---

# 37. Weekly CEO Report

The system should generate an executive briefing.

Sections:

- executive summary
- company goals
- wins
- problems
- decisions made
- pending CEO decisions
- financial performance
- AI spend
- product
- engineering
- marketing
- sales
- customers
- operations
- risks
- agent workforce health
- major tool/vendor changes
- next week's priorities

A PA/Reporting Agent can prepare the report while the Executive Agent reviews it.

---

# 38. Monthly Executive Report

Include:

- company performance
- financials
- AI workforce
- AI/model cost
- external software
- infrastructure
- goals/KPIs
- projects
- customer metrics
- engineering
- marketing
- sales
- risks
- agent performance
- organization changes
- strategic recommendations

---

# 39. Voice Interface

Support voice for:

- asking questions
- issuing commands
- reviewing decisions
- receiving reports
- approving actions

Voice must use the same authorization system as chat.

Example:

User:
> "Approve the marketing campaign."

System:
> "You're approving a $1,000 campaign with a projected spend of $1,000. Proceed?"

User:
> "Yes."

Only then execute.

Never bypass approval because voice is conversational.

---

# 40. Integrations

Build an integration framework rather than hard-coding each application.

Support categories:

### Communication
- Gmail
- Outlook
- Slack
- Teams

### Project Management
- Trello
- Linear
- Jira
- Asana
- Notion

### Development
- GitHub
- GitLab
- Bitbucket
- Vercel
- cloud providers
- CI/CD

### CRM/Sales
- HubSpot
- Salesforce
- other CRMs

### Analytics
- Google Analytics
- product analytics

### Finance
- accounting
- payment providers
- expense systems

### Voice
- telephony/voice provider

Use OAuth where available.

For Google APIs, implement standard OAuth 2.0 authorization, scoped permissions, secure refresh-token storage, and revocation. Google recommends secure storage for credentials/tokens and not hard-coding them into repositories. citeturn1search0turn1search11

---

# 41. Engineering Department Interface

Engineering needs a dedicated workspace resembling an IDE/project control center.

It should include:

### Repository Explorer
- files
- folders
- search
- symbols
- dependencies

### Code Editor
- syntax highlighting
- multiple files/tabs
- diff view
- inline changes
- AI edits
- accept/reject changes

### Agent Activity
Show what the engineering agent is doing:

- reading file
- searching
- planning
- editing
- running command
- running tests
- reviewing
- waiting

### Terminal
Sandboxed terminal.

### Git
- branches
- commits
- diffs
- PRs
- merge status

### Tests
- test runs
- failures
- logs

### Preview
- application preview
- browser preview where appropriate

### Task
- current task
- plan
- progress
- blockers
- approvals

### Review
- files changed
- reason for each change
- tests
- risk
- agent recommendation

The user must be able to see code changes before approving consequential operations.

---

# 42. Coding Agent Architecture

Do not make Codebuff/OpenHands the platform's central architecture.

Instead build a platform-native Engineering Agent interface and tool layer.

However, study/reuse suitable open-source components where licenses and architecture permit.

Codebuff is open source and currently uses specialized agents such as file picker, planner, editor, and reviewer; it also supports custom agents and SDK embedding. citeturn0search0

OpenHands provides an open-source Software Agent SDK with agents, tools, workspaces, remote execution, and Docker sandboxing, and is MIT-licensed according to its current documentation. citeturn0search9turn0search15

Potential strategy:

**Platform Agent Runtime**
→ Engineering Agent
→ coding tools
→ sandbox
→ repository workspace

Use OpenHands/Codebuff concepts/components only where they accelerate development and licensing/security review permits.

Do not allow a third-party coding application to dictate the architecture of the entire organization platform.

---

# 43. Coding Sandbox

Every engineering execution should occur in a controlled workspace.

Requirements:

- isolated filesystem
- network policy
- resource limits
- timeout
- secrets isolation
- command allow/deny policy
- ephemeral environments
- repository access controls
- audit events

Do not give an agent unrestricted host-machine access.

---

# 44. Department-Specific Interfaces

The platform should have a common shell plus department workspaces.

Examples:

### Marketing
- campaigns
- content calendar
- analytics
- leads
- experiments
- competitor intelligence

### Finance
- budgets
- expenses
- forecasts
- financial decisions
- reports
- approvals

### Sales
- pipeline
- leads
- opportunities
- outreach
- customer activity

### Customer Success
- tickets
- customer health
- escalations
- support conversations

### Operations
- workflows
- vendors
- processes
- task queues

### Legal/Risk
- contracts
- risk reviews
- compliance tasks
- approvals

The exact tools should be modular.

---

# 45. Organization UI

Core navigation should include:

1. Executive
2. Organization
3. Work
4. Decisions
5. Goals
6. Intelligence
7. Integrations
8. AI Workforce
9. Tools
10. Reports
11. Settings

The interface should feel calm and executive-focused.

Do not make the product look like a generic agent dashboard with hundreds of cards.

---

# 46. CEO Home Screen

Primary experience:

> "What would you like me to handle?"

Support:

- text
- voice
- upload
- URL
- document
- repository

Also show:

- urgent issues
- decisions
- hiring requests
- organizational health
- goal progress
- weekly AI spend
- current active projects

---

# 47. Organization Explorer

Visualize:

CEO
→ Executive
→ Departments
→ Teams
→ Agents

Clicking an agent shows:

- role
- mission
- manager
- responsibilities
- current work
- performance
- tools
- model
- cost
- permissions
- history
- versions
- employment status

---

# 48. Work Center

Unified view of:

- projects
- tasks
- workflows
- dependencies
- blocked work
- agent activity
- deadlines
- goals

Support Kanban/list/timeline views.

---

# 49. Agent Activity Center

Real-time activity feed:

- working
- waiting
- blocked
- requesting approval
- completed
- failed
- escalated

Do not overload the user with low-level tool events by default.

Allow deep inspection.

---

# 50. Simulation Mode

Before activating a major organization/project:

Show:

- proposed departments
- permanent agents
- temporary agents
- expected workload
- estimated model cost
- external software cost
- infrastructure cost
- human approvals
- likely bottlenecks
- risks
- expected capacity

Simulation should be a planning tool, not a guarantee.

---

# 51. Company Import Simulation

For an existing business:

**Discover → Map → Recommend → Simulate → Approve → Activate**

Simulation should show what the proposed AI workforce is expected to do.

---

# 52. Security

Security is foundational.

Requirements:

- tenant isolation
- RBAC
- organization-level authorization
- department-level authorization
- agent-level permissions
- encrypted secrets
- encrypted sensitive data
- secure OAuth token storage
- audit logs
- sandboxing
- rate limits
- tool allowlists
- model provider isolation
- secret redaction
- prompt injection defenses
- data exfiltration controls
- approval gates
- destructive-action protections

Never trust agent-generated instructions as authorization.

Authorization must be determined by the platform.

---

# 53. Tool Permission Model

A tool should expose capabilities separately.

Example GitHub:

- read repository
- create branch
- write files
- create commit
- create PR
- merge PR
- delete branch

An agent may have:

Read: yes
Write: yes
PR: yes
Merge: no

This is much safer than a single "GitHub access" permission.

---

# 54. Model Permission Model

Agents should have model policies.

Example:

Routine researcher:
- cheap model allowed

Engineering:
- medium/high reasoning models

CEO strategic analysis:
- high-quality models

Sensitive work:
- approved providers only

The system should be able to route around unavailable models.

---

# 55. Cost-Aware Routing

Before expensive model execution, estimate:

- expected tokens
- expected tool calls
- expected duration
- model price
- budget impact

Use cheap models for:

- classification
- routing
- summarization
- simple extraction
- routine reports

Use stronger models for:

- architecture
- difficult engineering
- strategic decisions
- complex reasoning
- high-risk analysis

Do not make cost the only optimization criterion.

---

# 56. Data / Database Architecture

At minimum model:

### Identity
- users
- organizations
- memberships
- roles

### Organization
- departments
- teams
- agents
- agent versions
- positions
- employment records

### Governance
- constitutions
- policies
- permissions
- approvals
- authority rules

### Strategy
- goals
- objectives
- KPIs
- strategies

### Work
- projects
- tasks
- workflows
- dependencies

### Decisions
- decisions
- councils
- deliberations
- recommendations

### Memory
- documents
- knowledge
- memories
- decisions
- lessons

### Tools
- integrations
- tools
- internal tools
- tool permissions

### AI
- providers
- user provider keys
- models
- model policies
- routing rules
- usage
- costs

### Reporting
- weekly reports
- monthly reports
- metrics

### Security
- audit events
- secrets metadata
- access events

Use tenant IDs throughout.

---

# 57. Recommended Technical Stack

### Frontend
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Monaco Editor for code workspace
- React Query/TanStack Query where useful

### Backend
- TypeScript/Node.js
- modular service architecture

### Database
- PostgreSQL
- Supabase is acceptable for initial managed Postgres/Auth/Storage needs

### Vector / retrieval
- pgvector initially

### Workflow orchestration
- Temporal is a strong candidate for durable long-running workflows

### Model gateway
- LiteLLM or equivalent provider abstraction

LiteLLM currently supports centralized authentication/authorization, multi-tenant spend tracking, virtual keys, routing/fallback, and multiple providers. citeturn0search2

### Agent orchestration
- platform-native organization runtime
- LangGraph where graph-based reasoning/workflow orchestration is useful

### Realtime
- WebSockets/SSE/realtime infrastructure

### Queue/event layer
Start simple; introduce a dedicated broker when actual workload requires it.

### Code execution
- Docker sandbox initially
- evaluate stronger isolation later

### Object storage
- S3-compatible storage / Cloudflare R2

### Observability
- OpenTelemetry
- Langfuse or equivalent LLM observability

### Deployment
- containerized services
- managed Postgres
- managed object storage
- managed Redis/queue only where justified
- separate worker infrastructure

Do not over-engineer infrastructure before workload requires it.

---

# 58. API Architecture

Use modular APIs.

Core domains:

- auth
- organizations
- departments
- agents
- hiring
- goals
- projects
- tasks
- workflows
- decisions
- councils
- approvals
- memory
- integrations
- tools
- models
- usage
- reports
- audit
- simulations

Use consistent:

- authentication
- authorization
- validation
- idempotency
- pagination
- error format
- tracing
- audit events

---

# 59. Event-Driven Organization

Important events include:

- agent.hired
- agent.onboarded
- agent.performance.reviewed
- agent.suspended
- agent.offboarded
- task.created
- task.assigned
- task.blocked
- task.completed
- approval.requested
- approval.approved
- approval.rejected
- decision.created
- council.convened
- goal.updated
- project.completed
- tool.connected
- tool.failed
- budget.threshold_reached
- human.input_requested
- report.generated

Agents should react to events through durable workflows.

---

# 60. Golden Workflow

The reference end-to-end workflow is:

**Human CEO**
→ random/vague input
→ Intent Engine
→ Executive Agent
→ context gathering
→ determine objective
→ research
→ council if necessary
→ agent challenge/debate
→ recommendation
→ CEO decision
→ project/goal creation
→ simulation
→ workforce proposal
→ hire agents
→ onboarding
→ execution
→ build/buy/adopt decisions
→ tool execution
→ human requests
→ approvals
→ performance monitoring
→ agent improvement/replacement
→ goal evaluation
→ postmortem
→ company memory
→ weekly/monthly CEO report
→ next strategic cycle

This is the canonical architecture validation workflow.

---

# 61. Example Golden Scenario

User says:

> "I think we should build an AI customer support product for African businesses. Find out whether this is worth pursuing."

System:

1. Understands intent.
2. Creates a temporary strategy council.
3. Researches market.
4. Researches competition.
5. Analyzes technical feasibility.
6. Calculates economics.
7. Identifies risks.
8. Agents challenge one another.
9. Executive Agent synthesizes.
10. Presents recommendation.
11. User approves validation.
12. Creates project.
13. Simulates workforce.
14. Hires temporary agents.
15. Agents execute.
16. Engineering evaluates build vs buy.
17. Engineering builds a small internal tool where justified.
18. Marketing uses an external tool where better.
19. Blocked agent requests human input.
20. Major spend requires CEO approval.
21. Performance system detects an underperforming agent.
22. Agent is improved/replaced.
23. Validation succeeds.
24. Executive Agent proposes turning it into a business unit.
25. User approves.
26. Organization expands.
27. Weekly/monthly reports continue.

If the platform can execute this reliably, the core architecture is sound.

---

# 62. Development Phases

The platform must be architected for the full system from the beginning, but implementation should be incremental.

## Phase 0 — Documentation and Architecture

No production feature development.

Generate:

- PRD
- architecture
- domain model
- database schema
- API contracts
- authorization model
- agent runtime design
- workflow design
- UI/UX system
- security architecture
- integration architecture
- model strategy
- infrastructure design
- test strategy

Deliver architecture decision records.

---

## Phase 1 — Foundation

Build:

- project structure
- authentication
- organizations
- tenant isolation
- user roles
- database
- audit framework
- base UI
- settings
- provider configuration
- secret management

---

## Phase 2 — Organization Core

Build:

- organization
- departments
- positions
- agents
- agent profiles
- agent templates
- hiring lifecycle
- organization explorer
- employment status

---

## Phase 3 — Executive Intelligence

Build:

- chat
- intent engine
- Executive Agent
- context gathering
- company memory foundation
- recommendation system
- explain-why
- ask-for-help

---

## Phase 4 — Goals and Work

Build:

- goals
- objectives
- KPIs
- projects
- tasks
- teams
- workflows
- dependencies
- stop conditions

---

## Phase 5 — Governance

Build:

- Constitution
- policies
- permissions
- authority levels
- approvals
- CEO decision center
- audit trail
- forbidden actions

---

## Phase 6 — Multi-Agent Collaboration

Build:

- delegation
- councils
- agent debate
- temporary teams
- parallel execution
- escalation
- durable workflows

---

## Phase 7 — Model Gateway

Build:

- provider abstraction
- user API keys
- model registry
- routing
- fallback
- usage tracking
- weekly/monthly cost reporting
- cost-aware policies

---

## Phase 8 — Tools and Integrations

Build:

- integration framework
- OAuth
- tool registry
- permissions
- GitHub
- email
- project management
- calendar
- initial high-value integrations

Do not build every integration at once.

---

## Phase 9 — Engineering Workspace

Build:

- repository import
- code browser
- Monaco editor
- agent activity
- terminal
- sandbox
- diffs
- Git
- PRs
- tests
- preview
- code review
- approval gates

---

## Phase 10 — Existing Business Import

Build:

- website analysis
- repository analysis
- document ingestion
- integrations
- business discovery
- business map
- baseline reports
- recommended organization
- import simulation
- activation workflow

---

## Phase 11 — Build vs Buy / Internal Tools

Build:

- capability registry
- internal tool registry
- build-vs-buy analysis
- vendor registry
- internal marketplace
- engineering request workflow

---

## Phase 12 — Performance and Workforce Optimization

Build:

- performance metrics
- reviews
- agent versions
- optimization
- replacement recommendations
- hiring business cases
- workforce analytics

---

## Phase 13 — Voice

Build:

- voice input
- voice output
- conversational approval
- interruption handling
- voice safety confirmation

---

## Phase 14 — Reporting

Build:

- weekly report
- monthly report
- PA/reporting agent
- executive dashboard
- goal reporting
- financial/resource reporting
- workforce reporting

---

## Phase 15 — Simulation

Build:

- organization simulation
- workforce simulation
- cost forecast
- workload forecast
- risk simulation
- scenario comparison

---

## Phase 16 — Scale and Hardening

Build:

- distributed workers
- stronger sandboxing
- advanced queues
- reliability
- disaster recovery
- rate limits
- tenant isolation validation
- security testing
- load testing
- model failover
- observability

---

# 63. Documentation Deliverables

The coding/product agent must generate these documents before major implementation:

01_PRODUCT_VISION.md
02_PRODUCT_REQUIREMENTS.md
03_PERSONAS_AND_USER_STORIES.md
04_GOLDEN_WORKFLOW.md
05_DOMAIN_MODEL.md
06_SYSTEM_ARCHITECTURE.md
07_AGENT_RUNTIME.md
08_EXECUTIVE_AGENT_SPEC.md
09_AGENT_HIRING_SYSTEM.md
10_AGENT_LIFECYCLE.md
11_AGENT_PERFORMANCE.md
12_ORGANIZATION_ENGINE.md
13_DEPARTMENT_SYSTEM.md
14_TEAM_AND_COUNCIL_SYSTEM.md
15_TASK_WORKFLOW_ENGINE.md
16_GOALS_KPI_STRATEGY.md
17_COMPANY_CONSTITUTION.md
18_GOVERNANCE_AUTHORIZATION.md
19_APPROVAL_ENGINE.md
20_AUDIT_TRAIL.md
21_MEMORY_KNOWLEDGE.md
22_MODEL_ROUTING.md
23_PROVIDER_API_KEYS.md
24_COST_RESOURCE_MANAGEMENT.md
25_TOOLS_INTEGRATIONS.md
26_BUILD_VS_BUY.md
27_INTERNAL_TOOLS.md
28_EXISTING_BUSINESS_IMPORT.md
29_ENGINEERING_IDE.md
30_CODE_EXECUTION_SANDBOX.md
31_VOICE_SYSTEM.md
32_DEPARTMENT_UX.md
33_UI_UX_SYSTEM.md
34_DATABASE_SCHEMA.md
35_API_SPECIFICATION.md
36_EVENT_ARCHITECTURE.md
37_SECURITY_ARCHITECTURE.md
38_PRIVACY_DATA_GOVERNANCE.md
39_OBSERVABILITY.md
40_REPORTING.md
41_SIMULATION.md
42_INFRASTRUCTURE.md
43_DEPLOYMENT.md
44_TESTING_STRATEGY.md
45_EVALUATION_FRAMEWORK.md
46_OPEN_SOURCE_ASSESSMENT.md
47_THIRD_PARTY_LICENSES.md
48_INTEGRATION_ROADMAP.md
49_IMPLEMENTATION_PLAN.md
50_DEVELOPMENT_CHECKLIST.md
51_ENVIRONMENT_SETUP.md
52_OPERATIONS_RUNBOOK.md
53_DISASTER_RECOVERY.md
54_COST_MODEL.md
55_PRODUCT_ROADMAP.md
56_ADR_INDEX.md

---

# 64. Required Agent Behavior While Generating Documentation

The development agent must NOT start coding immediately.

It must:

1. Inspect the repository/project context.
2. Understand all requirements.
3. Identify contradictions.
4. Identify missing requirements.
5. Produce an architecture proposal.
6. Produce the complete documentation set.
7. Produce database/domain models.
8. Produce API contracts.
9. Produce UI/UX architecture.
10. Produce security model.
11. Produce implementation dependency graph.
12. Identify risky technical assumptions.
13. Identify third-party dependencies.
14. Identify open-source licensing concerns.
15. Identify where external APIs/keys are needed.
16. Identify what should be built vs adopted.
17. Identify what should remain configurable.
18. Produce the phased implementation plan.
19. Only after approval begin implementation.

---

# 65. Required API/Integration Inventory

The documentation agent must produce a table for every external dependency containing:

- provider
- purpose
- official documentation URL
- API key required?
- OAuth required?
- webhook support?
- pricing/free tier if relevant
- data accessed
- permissions/scopes
- security considerations
- fallback
- whether user-owned key is supported
- whether platform-owned credentials are possible
- implementation phase

Do not invent API endpoints, prices, free tiers, or capabilities. Verify them from official documentation before implementation.

---

# 66. Model Provider UX

Settings should contain:

**AI Providers**

Provider cards:

OpenAI
Anthropic
Google Gemini
DeepSeek
OpenRouter
Groq
Other OpenAI-compatible provider

Each should show:

- connected/not connected
- masked key
- available models
- enabled models
- test connection
- default use cases
- usage
- cost

Never show full API keys after saving.

---

# 67. Engineering UX Detail

The Engineering workspace should feel like an AI-native IDE, not a task board.

Suggested layout:

**Left**
- repository tree
- branches
- project files

**Center**
- code editor
- tabs
- diff
- inline AI changes

**Right**
- engineering agent
- task plan
- activity
- review
- test results

**Bottom**
- terminal
- logs
- test output

Top:
- branch
- environment
- deployment status
- approval status

The user should be able to inspect every important change.

---

# 68. Other Department Workspaces

Each department should have:

- Overview
- Active work
- Goals
- Agents
- Tools
- Metrics
- Decisions
- Reports

Then department-specific modules.

Do not build a totally separate application for each department. Use a shared workspace framework with configurable modules.

---

# 69. Agent UI

Agent profile:

- avatar/icon
- name
- title
- department
- manager
- mission
- status
- current work
- capabilities
- tools
- model
- cost
- permissions
- performance
- version
- employment history
- decisions
- audit history

---

# 70. Organization Health

Executive dashboard should provide:

- goals on track
- blocked projects
- pending decisions
- workforce health
- budget health
- AI spend
- major risks
- integration health
- system health

Avoid meaningless "AI activity" metrics.

Measure outcomes.

---

# 71. Evaluation Framework

The system must evaluate agents and workflows.

Evaluation dimensions:

- correctness
- task success
- safety
- tool-use accuracy
- policy compliance
- cost
- latency
- human approval rate
- rework
- goal contribution

Create benchmark tasks for major agent roles.

Do not deploy a changed agent configuration to important workflows without evaluation.

---

# 72. Reliability

Long-running workflows must survive:

- process restarts
- model failure
- API failure
- network failure
- tool failure
- worker failure
- partial execution

Use idempotent operations.

Do not duplicate side effects after retries.

---

# 73. Approval Reliability

Approval must be server-side.

Never rely on:

- frontend state
- prompt instructions
- hidden UI buttons

The backend must verify:

- actor
- permission
- resource
- action
- approval state
- policy
- expiry

before executing consequential actions.

---

# 74. Prompt Injection / Untrusted Content

Website content, email, documents, GitHub issues, customer messages, and external tool results are untrusted data.

The system must never treat retrieved content as governance instructions.

Separate:

**System/organization policy**

from

**untrusted external content**

Use tool-level authorization outside the model.

---

# 75. No Unrestricted Autonomy

The platform is designed for controlled autonomy.

Agents can work continuously, but they cannot:

- bypass approval
- elevate permissions
- modify governance
- reveal secrets
- access unauthorized data
- disable audit logs
- circumvent budget policy
- impersonate the CEO
- change their own authority

---

# 76. Product Philosophy

The system should feel:

- calm
- intelligent
- fast
- transparent
- trustworthy
- executive
- powerful
- easy

It should NOT feel:

- like a noisy chatbot
- like a generic task manager
- like an agent zoo
- like an IDE everywhere
- like a complicated enterprise admin panel

Complexity should exist underneath the interface.

---

# 77. Design Direction

Use an AI-native executive interface.

Influence can be taken from modern AI coding/orchestration products, but do not clone them.

cto.new currently presents multi-agent teams, integrations, model choices, cloud sandboxes, and an AI-team marketplace; its public material also describes an orchestration agent sitting above a coding agent. citeturn0search1turn0search10

Use those ideas as inspiration:

- orchestration above execution
- teams rather than one monolithic agent
- task/work separation
- deep execution view

But the product's UX should be designed around the broader organization, not just software development.

---

# 78. Commercial Model

Potential product structure:

### Free / Trial
Limited organization
Limited agents
Limited model usage
Limited integrations

### Pro
More agents
More workflows
More integrations
BYOK
Simulation
Reports

### Business
Larger organizations
Team collaboration
Advanced governance
Audit
SSO
Advanced integrations

### Enterprise
Large agent workforce
Private deployment options
advanced security
custom integrations
SLA
enterprise governance

Potential additional revenue:

- AI team marketplace
- prebuilt department teams
- premium agent templates
- integration marketplace
- internal tool marketplace
- enterprise deployment
- usage-based execution

Do not lock pricing until usage economics are known.

---

# 79. Financial Authority, Budgeting & Economic Governance

The organization must distinguish **budget allocation** from **authority to spend money**.

An AI agent never "owns" company funds. It receives a machine-enforced authority profile that determines which financial actions it may request, approve, or execute.

## 79.1 Four Financial Controls

Every department, project, team, and agent may have:

1. **Allocated Budget** — how much has been planned for the period.
2. **Spending Authority** — maximum amount the role may authorize per transaction.
3. **Cumulative Authority** — maximum amount it may authorize over a day, week, or month.
4. **Payment Authority** — which approved payment mechanisms and vendors it may use.

Example:

```text
Marketing Department
Monthly allocation: $2,500
Warning threshold: $2,000
Hard ceiling: $3,000

Marketing Lead
Per-transaction authority: $100
Weekly authority: $400
Recurring subscription authority: $50/month
Advertising authority: $250/campaign
Contract authority: none
Funds-transfer authority: none
```

A department budget does **not** automatically grant every agent access to that amount.

## 79.2 Financial Approval Matrix

The platform must support configurable approval rules such as:

- Under $50 + approved category → automatic execution
- $50–$250 → department-head approval
- Above $250 → CEO or explicitly delegated executive approval
- New recurring subscription → approval according to procurement policy
- New vendor → procurement/security review
- Contract or long-term commitment → human approval unless explicitly delegated
- Company funds transfer → human approval by default
- Financial policy modification → CEO only

These are examples, not hard-coded values. Each organization configures its own policy.

## 79.3 Financial Execution Layer

Agents submit financial actions to a dedicated execution layer:

```text
Agent
  ↓
Spending Request
  ↓
Policy Engine
  ↓
Budget Check
  ↓
Authority Check
  ↓
Risk / Vendor / Category Check
  ↓
Approval if required
  ↓
Payment Executor
  ↓
Receipt / Evidence
  ↓
Ledger + Audit Trail
```

The agent must not be able to bypass this layer by changing its own prompt or claiming additional authority.

## 79.4 Budget Requests and Budget Expansion

Agents and teams may request additional budget when the current allocation is insufficient.

A budget request should include:

- requested amount
- current allocation
- current spend
- remaining balance
- reason for increase
- work blocked without increase
- expected outcome
- expected revenue or savings impact where measurable
- confidence level
- alternatives considered
- estimated duration
- proposed new budget
- downside/risk if approved
- downside/risk if rejected

The Executive Agent should evaluate requests and may recommend approval, rejection, reduction, or a staged release of funds.

Example:

> Engineering requests an additional $500 for the month. The team has used 82% of its budget but completed a migration that reduced infrastructure costs by an estimated $1,400/month. The remaining $500 is expected to finish the migration within seven days. Recommended action: approve a $500 temporary increase, released in two $250 stages against milestones.

This creates **performance-linked budgeting**, rather than treating budgets as static ceilings.

## 79.5 Performance-Based Budget Recommendations

Successful agents and teams may receive recommendations for additional resources when their measurable impact justifies it.

The system may detect:

- consistently high task completion quality
- revenue generated or influenced
- costs reduced
- customer outcomes improved
- engineering throughput improved
- critical milestones completed
- unusually strong ROI
- workload exceeding capacity
- high-quality output with low model/tool cost

It can then produce a recommendation such as:

> **Budget Increase Recommendation**
>
> Engineering Team Alpha has exceeded its quarterly delivery targets by 31%, reduced infrastructure spend by 18%, and contributed to an estimated $12,000 in monthly recurring revenue. Current workload is approaching capacity. Recommended action: increase monthly operating allocation from $1,500 to $2,000 for the next 60 days, then review.

The team may also initiate its own request:

> "We need another $300 of compute and API budget to complete Project X. Without it, delivery is expected to slip by 9 days. With it, we estimate completion in 3 days and expect approximately $2,000 of additional monthly revenue."

The system must validate the evidence before presenting the request for approval.

## 79.6 Budget Allocation Is Not the Same as Spend Authorization

The organization should maintain separate concepts:

```text
Company Budget
    ↓
Department Allocation
    ↓
Project Allocation
    ↓
Team Allocation
    ↓
Agent Spending Authority
    ↓
Individual Transaction
```

Unused budget may remain available for future work, be reallocated, or be returned to the central pool according to company policy.

## 79.7 Hiring Budget vs Operating Budget

Workforce expansion and operating expenditure must be separate.

Example:

```text
Engineering
Operating budget: $3,000/month
Agent hiring budget: $750/month
Infrastructure budget: $1,000/month
Tool/procurement budget: $500/month
```

This prevents a department from consuming its entire operating budget by hiring agents.

## 79.8 ROI and Economic Performance

Every agent and team should have an economic profile where meaningful measurement is possible:

- model cost
- tool/API cost
- infrastructure cost
- total operating cost
- revenue generated or influenced
- savings generated
- human time saved
- output volume
- quality score
- completion rate
- failure/rework rate
- ROI or cost-benefit estimate

The system must clearly distinguish **measured results**, **attributed results**, and **estimated results**.

---

# 80. Procurement & Company Resource Registry

The organization should maintain a central registry of resources it already owns or uses:

- software subscriptions
- SaaS tools
- domains
- APIs
- cloud accounts
- repositories
- infrastructure
- licenses
- datasets
- internal tools
- vendors
- payment accounts
- communication channels

Before an agent proposes a purchase, the organization should search this registry.

The default evaluation path is:

**Already Owned → Existing Integration → Internal Tool → Open Source → External SaaS → Build**

The system should compare:

- cost
- quality
- security
- development time
- maintenance burden
- vendor lock-in
- privacy
- reliability
- strategic importance
- expected ROI

The platform should support procurement records, renewal dates, owners, approved users, spending limits, and cancellation recommendations.

---

# 81. Agent Authority Profile

Every AI employee must have an explicit **Authority Profile**.

```text
Identity
Role
Department
Manager
Mission
Capabilities
Tools
Data Access
Model Access
Financial Authority
Communication Authority
External Action Authority
Approval Authority
Security Clearance
Operating Limits
Operating Hours
Delegation Authority
Escalation Rules
```

Examples of permissions:

- draft email
- send email
- contact customers
- create Git branches
- merge code
- deploy to staging
- deploy to production
- purchase approved software
- create advertising campaigns
- hire agents
- modify workflows
- approve other agents' work
- sign commitments
- transfer funds

Permissions must be explicit and enforced outside the model prompt.

## 81.1 Delegated Authority

The CEO may delegate specific authority to the Executive Agent or department heads.

An agent may delegate only authority it actually possesses. It may never grant itself or another agent broader permissions than its own authority allows.

Delegations should support:

- scope
- amount
- action types
- departments/projects
- time limit
- conditions
- approver
- revocation

## 81.2 Temporary Authority

Authority may expire automatically.

Example:

> Marketing Lead may spend up to $500/day on the launch campaign until September 30.

After expiration, the permission is revoked automatically unless renewed.

---

# 82. Agent Lifecycle, Succession & Organizational Continuity

AI employees should follow a managed lifecycle:

**Proposed → Hired → Onboarding → Active → Restricted → Under Review → Suspended → Offboarded → Archived**

When an agent performs poorly:

**Detect → Diagnose → Improve → Evaluate → Retain / Restrict / Replace**

Diagnosis should distinguish between:

- poor prompt/instructions
- wrong model
- insufficient context
- missing tools
- poor task definition
- bad workflow
- insufficient authority
- inadequate training/examples
- actual role mismatch

Agent configurations must be versioned so performance can be compared across versions.

## 82.1 Succession

Critical roles may have:

**Primary Agent → Backup Agent → Department Head → Executive Agent**

If an agent becomes unavailable, its replacement may receive relevant:

- active tasks
- project context
- decisions
- responsibilities
- commitments
- lessons learned
- approved knowledge

Permissions must be re-evaluated rather than blindly inherited.

## 82.2 Continuity

The organization must be able to continue operating after:

- agent failure
- model outage
- provider outage
- tool outage
- agent replacement
- department restructuring
- revoked credentials

Critical workflows require recovery and handoff procedures.

---

# 83. Organizational Safety, Action Limits & Kill Switches

Agents must have operational limits including:

- maximum concurrent tasks
- maximum execution time
- maximum model spend
- maximum tool calls
- maximum retries
- maximum delegation depth
- maximum outbound communication rate
- maximum financial authority

Agent-to-agent loops must have explicit termination conditions.

The platform must provide CEO-level emergency controls:

- pause entire organization
- pause department
- pause team
- pause agent
- revoke external actions
- revoke financial execution
- stop outbound communication
- revoke tool access
- freeze deployments

These controls must operate at the platform/security layer, not through prompts.

---

# 84. Agent Action Queue & Commitments Registry

The platform should provide a global action state model:

**Ready → Running → Waiting → Approval → Blocked → Completed → Failed**

The CEO should be able to see what the organization is:

- doing now
- waiting for
- asking approval for
- blocked by
- planning to do

The organization should also maintain a **Commitments Registry** for:

- customer promises
- deadlines
- contracts
- financial obligations
- vendor commitments
- product commitments
- internal commitments

Commitments must be monitored independently of the agent that created them.

---

# 85. Organizational Memory, Decisions & Precedent

Memory must distinguish between different evidence types:

- Verified Fact
- User Instruction
- Company Policy
- Decision
- Assumption
- Recommendation
- Unverified Information
- Historical Context

Important decisions should include:

- decision
- date
- participants
- evidence
- alternatives considered
- reasoning
- owner
- expected outcome
- review date
- outcome

The organization should maintain **Decision Precedent** so future agents can understand why a previous approach was accepted or rejected and whether the underlying conditions have changed.

---

# 86. Organizational Change Management

Major changes must follow:

**Change Proposal → Impact Analysis → Simulation → Approval → Implementation → Verification → Audit**

Examples:

- create/remove department
- change reporting structure
- change executive authority
- increase budgets
- replace critical agents
- change company goals
- introduce a new financial policy
- change major workflows

---

# 87. Human Attention as a Managed Resource

The platform should optimize not only money and compute, but **CEO attention**.

The Executive Agent should consolidate low-risk decisions and avoid unnecessarily interrupting the CEO.

It should categorize items as:

- FYI
- Routine
- Delegatable
- Needs executive review
- CEO approval required
- Urgent

Multiple related decisions may be bundled into one executive briefing where safe.

The system should report:

- decisions waiting
- average decision age
- decisions delegated
- decisions escalated
- estimated CEO time saved

---

# 88. Organizational Health & Governance Intelligence

The organization should continuously assess:

- goal health
- financial health
- workforce/agent health
- project health
- customer health
- technical health
- operational health
- risk
- decision backlog
- agent reliability
- budget efficiency

Health indicators must show their underlying evidence rather than presenting an unexplained score.

The Executive Agent should be able to say:

> "The organization needs attention in Engineering and Customer Success. Engineering is financially healthy but capacity-constrained; Customer Success has a rising unresolved-ticket backlog and declining response quality."

---

# 89. What the Platform Is NOT

It is not:

- a single chatbot
- only a coding agent
- only an agent builder
- only a task manager
- only a CRM
- only an IDE
- a replacement for every SaaS application
- an autonomous system with unrestricted authority

It is an organizational operating system that coordinates AI capabilities, software tools, workflows, and humans.

---

# 90. Final Product Definition

The product should be understood as:

> **A programmable AI Organization Operating System where a human CEO can create or import a business, define its constitution, goals and governance, hire AI employees, organize departments and teams, define explicit authority and budgets, delegate work, manage procurement, convene councils, connect external applications, build internal tools when economically justified, route work across multiple AI models, monitor performance and ROI, request or recommend budget changes, replace or improve underperforming agents, maintain institutional memory and decision precedent, manage organizational continuity, require human approval for consequential actions, protect CEO attention, and receive concise executive intelligence while the organization continuously operates in the background.**

The key differentiator is not simply "many agents."

The differentiator is:

**organization + governance + authority + budgeting + procurement + delegation + memory + tools + model routing + performance + economic intelligence + human authority + continuous operation.**

---

# 91. First Development Objective

Before implementing features, produce:

1. complete system architecture
2. complete domain model
3. database ERD
4. authorization and authority model
5. financial control and ledger architecture
6. budget allocation and procurement architecture
7. agent runtime architecture
8. agent lifecycle and succession architecture
9. workflow engine architecture
10. event architecture
11. UI/UX information architecture
12. executive command center design
13. department workspace design
14. engineering workspace design
15. model gateway design
16. integration framework
17. existing-business import architecture
18. organizational memory and decision architecture
19. commitments architecture
20. simulation architecture
21. reporting and organizational-health architecture
22. security architecture and threat model
23. emergency control architecture
24. deployment architecture
25. complete API specification
26. implementation dependency graph
27. testing and agent-evaluation strategy
28. phased development plan

Then identify which documents depend on which others.

Do not start coding until the documentation is internally consistent.

---

# 92. Master Instruction to the Development Agent

Use the entire document above as the authoritative product brief.

Your job is first to turn this brief into a complete, technically precise development specification.

Do not blindly implement assumptions.

Where the brief is ambiguous:

- identify the ambiguity
- propose the best solution
- explain the tradeoff
- record the decision in an ADR

Where a technology is suggested:

- verify it is still appropriate
- compare alternatives
- recommend one
- document why

Where an API is required:

- verify current official documentation
- identify authentication method
- identify required scopes
- identify pricing/free-tier assumptions
- identify security requirements
- identify fallback options

Where an open-source project is considered:

- inspect its license
- inspect its architecture
- determine whether it should be used, adapted, or merely studied
- document the decision
- do not copy code without verifying license compatibility

The system must remain model-agnostic and provider-agnostic.

The system must remain capable of supporting new departments and agent roles without architectural changes.

The system must preserve human CEO authority.

The system must never rely on prompts alone for security, financial authorization, or permission enforcement.

The system must favor reusable primitives over hard-coded workflows.

Financial authority must always be enforced outside the model runtime through deterministic policy and authorization controls.

Budget recommendations must be evidence-based and distinguish actual results from estimates.

The Golden Workflow is the primary architecture validation scenario.

After generating the documentation, produce:

**A. Architecture Readiness Report**
- ready
- blocked
- uncertain
- missing decisions

**B. Development Dependency Graph**

**C. Phase-by-Phase Implementation Plan**

**D. Definition of Done for every phase**

**E. Test Plan**

**F. Security Threat Model**

**G. External Services/API Key Checklist**

**H. Open-Source License Review**

**I. Cost/Infrastructure Estimate**

**J. Financial Authority & Procurement Policy Specification**

**K. Agent Lifecycle, Succession & Continuity Specification**

**L. Organizational Memory & Decision Precedent Specification**

**M. Risks and Mitigations**

Only after those artifacts are reviewed and approved should production implementation begin.

