# 33 — UI/UX System

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 33.1 Design Direction (§45, §76, §77)

The interface feels **calm, intelligent, fast, transparent, trustworthy, executive, powerful, easy**. It is *not* a noisy chatbot, a generic task manager, an agent zoo, an IDE everywhere, or an enterprise admin panel. Complexity lives underneath the surface.

Visual language: AI-native executive interface. Typography-forward, restrained color, generous whitespace, dense-but-ordered information. No hundreds of cards.

## 33.2 Information Architecture (Core Navigation, §45)

1. **Executive** — CEO home: "What would you like me to handle?" + urgent issues, decisions, hiring requests, org health, goal progress, weekly AI spend, active projects.
2. **Organization** — Organization Explorer (CEO → Executive → Departments → Teams → Agents), org chart, agent profiles.
3. **Work** — Work Center: projects, tasks, workflows, dependencies, blocked work, agent activity, deadlines; Kanban/list/timeline views.
4. **Decisions** — CEO Decision Center: decisions waiting, hiring requests, budget escalations, strategic decisions, risky actions, conflicts, blocked tasks; each with what/why/who/evidence/alternatives/cost/risk/impact/deadline; actions Approve/Reject/Modify/Discuss/Delegate.
5. **Goals** — goals, objectives, KPIs, strategies, stop conditions, progress.
6. **Intelligence** — company memory, precedents, lessons, search.
7. **Integrations** — integration registry, connect/disconnect, OAuth flow, health.
8. **AI Workforce** — agents, hiring, templates, performance reviews, versions, employment lifecycle.
9. **Tools** — tool registry, internal tools, internal marketplace ("do we already have something that extracts PDF data?"), build-vs-buy records.
10. **Reports** — weekly/monthly reports, financials, cost views, org health.
11. **Settings** — profile, organization, AI Providers, constitution & governance, permissions, audit log, billing.

## 33.3 CEO Home Screen (§46)

- Prominent input: text / voice / upload / URL / document / repository → Intent Engine.
- Suggested prompts (calm, not noisy).
- At-a-glance panels: urgent issues, decisions waiting, hiring requests, organizational health, goal progress, weekly AI spend, active projects.
- Live updates via SSE; quiet, low-frequency; never overwhelming.

## 33.4 Organization Explorer (§47)

- Tree: CEO → Executive → Departments → Teams → Agents.
- Agent profile view: role, mission, manager, responsibilities, current work, performance, tools, model, cost, permissions, history, versions, employment status.

## 33.5 Work Center (§48)

- Projects/tasks/workflows with dependencies; blocked work highlighted; agent activity; deadlines; goal linkage (every task shows its objective → anti-busywork).
- Views: Kanban, list, timeline.

## 33.6 Agent Activity Center (§49)

- Real-time feed: working / waiting / blocked / requesting approval / completed / failed / escalated.
- High-level by default; drill-in for detail (never default to low-level tool events).

## 33.7 Decision Cards (§36)

Each decision shows: what, why, who recommends, evidence, alternatives, cost, risk, impact, expiration/deadline. Actions: Approve / Reject / Modify / Discuss / Delegate (per policy). Explain-why is always attached.

## 33.8 Common Shell + Department Workspaces (§44, §68)

Shared workspace framework with configurable modules — never separate apps per department. Each department workspace: Overview, Active work, Goals, Agents, Tools, Metrics, Decisions, Reports + department-specific modules:

- **Marketing:** campaigns, content calendar, analytics, leads, experiments, competitor intelligence.
- **Finance:** budgets, expenses, forecasts, financial decisions, reports, approvals.
- **Sales:** pipeline, leads, opportunities, outreach, customer activity.
- **Customer Success:** tickets, customer health, escalations, conversations.
- **Operations:** workflows, vendors, processes, task queues.
- **Legal/Risk:** contracts, risk reviews, compliance, approvals.

## 33.9 Engineering Workspace (IDE-like, §41, §67)

```
┌─────────────────────────────────────────────────────────────┐
│ Top: branch · environment · deployment status · approval    │
├──────────────┬──────────────────────────────┬───────────────┤
│ Left         │ Center                      │ Right         │
│ repo tree    │ Monaco editor (tabs, diff,  │ engineering   │
│ branches     │ inline AI changes)          │ agent chat    │
│ project files│                             │ task plan     │
│              │                             │ activity      │
│              │                             │ review (files │
│              │                             │ changed, why, │
│              │                             │ tests, risk,  │
│              │                             │ recommendation│
├──────────────┴──────────────────────────────┴───────────────┤
│ Bottom: terminal (sandboxed) · logs · test output           │
└─────────────────────────────────────────────────────────────┘
```

User must see every important change before approving consequential operations (R-ENG-2).

## 33.10 Approval Gates & Review UX

- Consequential actions render as review panels, not silent executions.
- Voice approval (later) mirrors the same confirmation flow: "You're approving a $1,000 campaign… Proceed?" → "Yes" → execute (§39).

## 33.11 Design System

- **Stack:** Next.js + Tailwind CSS + shadcn/ui (free, OSS).
- Tokens: spacing/typography/color in Tailwind config; dark-mode-ready; accessible (WCAG AA).
- Component inventory (shadcn base): button, input, dialog, dropdown, table, tabs, toast, sheet, command palette, form primitives; domain components built on top.
- Motion: restrained; loading states with progress, never spinners-only for long agent work (use activity feeds + phase indicators).
- Empty states teach ("No decisions waiting — here's what the organization is doing now").

## 33.12 Realtime UX

- SSE channel per user session: decision created/updated, urgent events, task state changes, agent activity, report ready.
- Notification precedence: urgent notify / approval queue / important report / routine silent.
