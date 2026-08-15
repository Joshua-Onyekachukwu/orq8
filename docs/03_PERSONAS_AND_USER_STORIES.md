# 03 — Personas and User Stories

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 3.1 Primary Persona: The Human CEO

**Archetype:** The Decision Maker — a solo founder or business owner who wants AI to run the *organization*, not just answer questions.

**Goals**
- Run a company without spending all day on operational management.
- Give vague, natural instructions and receive plans, recommendations, and results.
- Stay the final authority over money, risk, legal, and strategy.
- See what the organization is doing, waiting for, asking approval for, blocked by, and planning — at a glance.

**Pains**
- Micromanaging agents with structured commands and forms.
- Being interrupted for trivia, or worse, not being told about real problems.
- Not trusting a black box: no audit trail, no evidence, no "why."
- Costs spiraling from unfettered model usage.

**Needs**
- Calm, executive UX. Concise reporting. Evidence behind every recommendation. Server-enforced governance. Approval queue with full context. Transparency without noise.

## 3.2 Secondary Personas

| Persona | Role | Needs |
|---------|------|-------|
| The Operator | COO/operations-minded user managing day-to-day org | Work center, blockers, workflows, stop conditions, delegation |
| The Department Lead | User who manages one department (e.g., Engineering/Marketing) | Department workspace, team assembly, approvals within authority, metrics |
| The Reviewer | User who reviews agent output (esp. code) | Diff review, accept/reject changes, approval gates, test results |
| The Admin | Owner configuring the system | Settings, providers, integrations, constitution, permissions, audit |
| The Investor/Stakeholder | Periodic reader of reports | Weekly/monthly reports, goal progress, financial health — no operational access needed |

## 3.3 User Stories (core)

### Governance & Sovereignty
- As CEO, I want to define a Constitution, so the organization operates within my values and risk tolerance.
- As CEO, I want consequential actions to require my approval server-side, so nothing happens without authorization.
- As CEO, I want to see the recommendation, evidence, and alternatives for every decision, so I can make informed choices.
- As CEO, I want to override a recommendation and have the override audited, so my authority is real and traceable.
- As CEO, I want emergency controls (pause org/dept/agent, revoke financial execution, stop communications), so I can stop the organization instantly.

### Intent & Delegation
- As CEO, I want to say "I think there's a business here — investigate it" and have the system figure out the plan, so I never fill out forms.
- As CEO, I want the system to ask me a concise question only when ambiguity changes the outcome, so I'm not interrupted unnecessarily.
- As CEO, I want to hand the system a URL or document and have it extract context and act, so I can delegate raw material.

### Hiring & Workforce
- As CEO, I want to hire agents via a business case (title, mission, permissions, budget, alternatives), so hiring is justified and governed.
- As CEO, I want to see an organization chart of departments, teams, and agents with each agent's role, mission, current work, performance, cost, and permissions, so I understand my workforce.
- As CEO, I want to assemble temporary project teams (e.g., Kenya Market Expansion Team) and archive them after the project, so work is organized by objective.

### Councils & Debate
- As CEO, I want a council of agents to deliberate independently and challenge each other, so I get honest, adversarial analysis — with disagreement preserved.
- As CEO, I want a synthesized recommendation with confidence and required approval, so I can decide quickly.

### Work & Goals
- As CEO, I want every major task traceable to a goal/objective, so agents don't do busywork.
- As CEO, I want stop conditions on projects (success/escalate/abandon), so failing work terminates early.

### Financial Control
- As CEO, I want budgets with target/warning/ceiling and spending authority limits per role, so spend is governed, not walled.
- As CEO, I want a budget request to carry evidence and expected ROI before it reaches me, so approvals are fast and informed.
- As CEO, I want procurement to check what we already own before buying, so we don't buy duplicates.

### Models & Cost
- As CEO, I want to bring my own API keys and choose models per department, so costs are under my control.
- As CEO, I want the router to use cheap models for routine work and strong models for hard problems, so quality and cost are balanced.
- As CEO, I want weekly/monthly cost reporting by department, project, and model, so I understand AI spend.

### Memory & Audit
- As CEO, I want the organization to remember decisions and why they were made, so agents don't repeat rejected approaches.
- As CEO, I want a tamper-evident audit trail of every significant action, so I can verify what happened.

### Reporting
- As CEO, I want a weekly briefing and a monthly executive report prepared by a reporting agent and reviewed by the Executive Agent, so I stay informed in minutes.

### Engineering Workspace
- As Engineering Lead, I want to see exactly what the engineering agent changed, why, and what tests ran — and approve consequential operations — so nothing lands without review.
- As Engineering Lead, I want a sandboxed workspace (files, terminal, git, tests, preview) so agents can't touch the host machine.

### Import
- As CEO of an existing business, I want to connect my tools and have the system discover a Business Map and propose an AI organization, with nothing activated until I approve.

## 3.4 User Story Coverage of the Golden Workflow

The Golden Workflow (§04) is the integration test for these stories: every story above appears in at least one step of that workflow.
