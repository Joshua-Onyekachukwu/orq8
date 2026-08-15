// ORQ8 executive overview PDF — one page, dependency-free (Node >= 14).
// Output: ORQ8_OVERVIEW.pdf (US Letter). Run: node tools/pdf_build.js

const path = require('path');
const { title, subtitle, h1, h2, p, bullet, table, spacer, rule, yPos, build } = require('./pdf_engine');

const OUT = path.join(__dirname, '..', 'ORQ8_OVERVIEW.pdf');

// ================= CONTENT =================
title('ORQ8');
subtitle('The AI Organization Operating System — an executive overview. Tell ORQ8 what you want. It hires the team, does the work, and reports back.');

h1('What is ORQ8?');
p('ORQ8 is a platform that lets a human CEO build and run a real company staffed by AI employees. It is not a chatbot, not a task manager, and not an "agent zoo." It is an operating system for an organization: the CEO speaks naturally — a vague idea, a question, a goal, a command — and the system forms teams, hires agents, plans work, governs every action, and reports results.');
p('The human CEO remains the final authority. Everything consequential requires approval, everything significant is audited, and every dollar is tracked.');

h1('The problem');
bullet('Everyone is building AI agents; nobody is building the system that makes agents safe, governed, and accountable.');
bullet('Gartner predicts over 40% of agentic AI projects will be canceled by 2027 — due to cost control, unclear value, and missing risk controls, not model quality.');
bullet('Solo founders and small operators have no middle management to delegate to; they drown in operations while agent tools add noise, not structure.');

h1('How it works — the Golden Workflow');
p('The core loop: Intent, Understand, Context, Plan, Deliberate, Recommend, Authorize, Execute, Verify, Report, Learn.');
p('Example. The CEO says: "I think we should build an AI customer support product for African businesses. Find out whether this is worth pursuing." ORQ8: (1) classifies the intent; (2) convenes a temporary strategy council — market researcher, finance analyst, legal researcher, growth strategist; (3) members research independently and challenge one another; (4) the Executive Agent synthesizes a recommendation with evidence, alternatives, confidence, and the approval required; (5) the CEO approves in the Decision Center; (6) a project is created, the workforce is simulated, and temporary agents are hired and onboarded; (7) agents execute — using tools, requesting approvals, flagging blockers; (8) the organization learns, writes to Company Memory, and reports weekly. All of it — every step, decision, and cost — is audited.');

h1('What is inside');
h2('Governance in code, not prompts');
bullet('Every organization has a Company Constitution: forbidden actions, approval tiers (Automatic, Department, Executive, CEO, Forbidden), spending authority, and escalation rules.');
bullet('Consequential actions require server-side approval. Agents cannot bypass approval, elevate their own permissions, modify governance, or access secrets.');
bullet('A tamper-evident, append-only audit trail records every significant action, approval, and cost.');
h2('Executive Agent & intent engine');
bullet('Understands vague requests, gathers context, plans, delegates, convenes councils, and asks for human input only when it truly matters.');
h2('An AI workforce');
bullet('Agents are hired with business cases, organized into departments, teams, temporary project teams, and councils — with performance reviews, versioning, and knowledge transfer on replacement.');
h2('Money & budget control');
bullet('Budget allocation is separate from spending authority; target, warning, and ceiling levels; per-agent spending limits; hiring budget kept apart from operating budget.');
bullet('Every dollar of model and tool spend is attributed to a department, project, and agent.');
h2('Company memory & decision precedent');
bullet('Persistent institutional knowledge. Agents must consult precedent before re-proposing an approach that was already rejected — and explain what changed.');
h2('Model-agnostic and cost-aware');
bullet('Routes every task to the cheapest adequate model. Runs on free local models today; Bring-Your-Own-Key for OpenAI, Anthropic, Gemini, DeepSeek, Groq, and OpenRouter.');
h2('Executive reporting');
bullet('A CEO Decision Center instead of notification noise; weekly briefings and monthly executive reports prepared by a reporting agent and reviewed by the Executive Agent.');

h1('Why now — the market');
bullet('AI agents market: ~$7.6B in 2025, projected ~$183B by 2033 (Grand View Research, ~50% CAGR). Gartner projects ~$202B of agentic AI spending in 2026.');
bullet('The governance gap is the #1 complaint across agent deployments — which is exactly what ORQ8 builds: the operating system layer everyone is missing.');
bullet('The "one-person company powered by AI" wave is mainstream, and the category is producing multi-billion-dollar companies (Sierra $10B, Cognition $10B+, Decagon $4.5B, Thinking Machines $12B).');

h1('Business model');
table(['Tier', 'Includes'],
  [
    ['Free', '1 organization, 3 agents, free/local models — $0'],
    ['Pro', '10 agents, BYOK, full governance, weekly report — $49/mo'],
    ['Business', '50 agents, audit, integrations, monthly report — $199/mo'],
    ['Enterprise', 'Private deployment, SLA, custom integrations — custom']
  ]);
p('Users pay for the platform (governance, orchestration, memory, reporting); model costs pass through via Bring-Your-Own-Key. Clean margins, no lock-in, free to start.');

h1('Status & next steps');
bullet('Phase 0 complete: full product specification — architecture, security model, database schema, API contracts, and go-to-market plan (58 documents + architecture decision records), all versioned and public.');
bullet('Building Phase 1 (Foundation): monorepo, database, authentication, API shell — on a free, self-hosted local stack.');
bullet('Target: the Golden Workflow working end-to-end on free models, then design partners, paid beta, and general availability.');

spacer(6);
rule(yPos() - 4);

build(OUT, 'ORQ8  |  The AI Organization Operating System');
