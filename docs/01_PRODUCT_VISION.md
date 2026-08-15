# 01 — Product Vision

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

---

## 1.1 The Vision

Build a system that feels like an **intelligent digital organization**, not a collection of chatbots.

A human CEO speaks naturally — types a vague idea, pastes a link, uploads a document, asks a question, assigns a goal, or gives a direct command. The system's **Executive Agent** interprets intent, gathers context, forms the right team or council, plans work, delegates to the appropriate agents, asks for human input when necessary, executes only within authority, and reports outcomes.

The human CEO remains the **ultimate authority** — more capable models may exist inside the system, but nothing is more authoritative than the human.

## 1.2 What the Product Is NOT

- Not a single chatbot
- Not only a coding agent
- Not only an agent builder
- Not only a task manager
- Not only a CRM
- Not only an IDE
- Not a replacement for every SaaS application
- Not an autonomous system with unrestricted authority

## 1.3 What the Product IS

> A programmable AI Organization Operating System where a human CEO can create or import a business, define its constitution, goals and governance, hire AI employees, organize departments and teams, define explicit authority and budgets, delegate work, manage procurement, convene councils, connect external applications, build internal tools when economically justified, route work across multiple AI models, monitor performance and ROI, request or recommend budget changes, replace or improve underperforming agents, maintain institutional memory and decision precedent, manage organizational continuity, require human approval for consequential actions, protect CEO attention, and receive concise executive intelligence while the organization continuously operates in the background.

The differentiator is not "many agents." The differentiator is:

**organization + governance + authority + budgeting + procurement + delegation + memory + tools + model routing + performance + economic intelligence + human authority + continuous operation.**

## 1.4 The Core Loop

```
Intent → Understand → Context → Plan → Deliberate → Recommend → Authorize → Execute → Verify → Report → Learn
```

The system minimizes the organizational management the human has to perform. The CEO says *"I think there is an opportunity here. Investigate it."* — the Executive Agent figures out the project, workforce, tasks, and approvals.

## 1.5 Two Operating Modes

1. **Greenfield** — start a new company/project from scratch.
   `Idea → Discovery → Research → Council → Recommendation → CEO approval → Project → Workforce → Execution`
2. **Import Existing Business** — connect website, repositories, email, PM tools, CRM, analytics, finance, and docs; discover a Business Map; present findings; propose an AI organization; simulate; CEO approves; activate.
   `Connect → Discover → Understand → Show Findings → User Corrects → Propose Organization → Simulate → CEO Approves → Activate`

Nothing consequential is activated automatically during import.

## 1.6 Scale

- Scales from a solo founder with 3 agents to a large organization with hundreds or thousands of agents.
- No fixed number of departments, teams, or agent types. Departments and workforce are **dynamic organizational objects** built from reusable primitives.
- Scale is bounded by infrastructure and model cost, not by architecture.

## 1.7 Design Direction

- **Calm, intelligent, fast, transparent, trustworthy, executive, powerful, easy.**
- Not noisy, not a generic task manager, not an "agent zoo," not an IDE everywhere, not an enterprise admin panel.
- Complexity lives underneath the interface.
- Influences may be drawn from modern AI orchestration products (multi-agent teams, orchestration above execution, deep execution views), but the UX is designed around the **broader organization**, not software development alone.

## 1.8 Commercial Model (indicative, not locked)

| Tier | Scope |
|------|-------|
| Free / Trial | Limited orgs, agents, model usage, integrations |
| Pro | More agents/workflows/integrations, BYOK, simulation, reports |
| Business | Larger orgs, team collaboration, advanced governance, audit, SSO |
| Enterprise | Large workforce, private deployment, advanced security, custom integrations, SLA |

Revenue comes from the organization operating system itself — platform tiers, organizational capacity, enterprise capabilities, and optional AI/voice/infrastructure usage — **not from commissions on agents**. ORQ8 does not operate an AI-agent marketplace; agents are hired within an organization when a business need exists (ADR-021). Platform-side ecosystem levers (non-agent): integration extensions and internal-tool sharing.

Pricing stays flexible until usage economics are known.

## 1.9 Success Criteria for the Product

The **Golden Workflow** (§04) executes reliably end-to-end:

> "I think we should build an AI customer support product for African businesses. Find out whether this is worth pursuing."

→ intent → council → research → debate → recommendation → approval → project → simulated workforce → temporary hires → execution → build-vs-buy → tool use → approvals → performance management → validation → business unit proposal → expansion → reporting.

If the platform executes this reliably, the core architecture is sound.
