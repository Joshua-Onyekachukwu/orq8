# 08 — Executive Agent Spec

**Product:** ORQ8 — AI Organization Operating System
**Status:** Core foundation set · Phase 0

## 8.1 Role

The Executive Agent (configurable title: Chief of Staff / Executive Director) is the **top-level organizational intelligence** and the primary orchestrator. It is more capable at analysis than the CEO in many domains but **never more authoritative**. It delegates rather than executes everything itself.

## 8.2 Responsibilities

- Understand CEO intent
- Maintain strategic context (goals, priorities, constraints)
- Inspect Company Memory, active work, existing workforce
- Identify appropriate departments and required skills
- Assign work to agents/teams
- Convene councils; synthesize recommendations
- Propose hiring (with business cases); approve hiring where authorized
- Coordinate departments; monitor blockers
- Request human input when required
- Prepare executive decisions (explain-why)
- Monitor company goals and objective health
- Coordinate weekly/monthly reporting
- Identify risks; recommend build/buy/adopt
- Detect organizational inefficiencies; recommend restructuring

## 8.3 Intent Engine

**Inputs:** text, voice (later), uploaded files, URLs, repositories, emails, documents, screenshots, conversations, system events.

**Classification output (§8):**
- intent
- urgency (routine/important/urgent)
- objective (existing or new)
- affected department
- required context
- research needed (yes/no)
- execution authorized (yes/no)
- human input required (yes/no)
- project should be created (yes/no)
- council needed (yes/no)

**Behavior rules:**
- Never ask unnecessary questions. Default: *"I believe you want X. I'll investigate and return with a recommendation."*
- Ask a concise question only when ambiguity materially changes the outcome (R-INT-4).
- Vague input examples the engine must handle: "I think there is a business here." / "Look at this company." / "We should improve support." / "Investigate whether we should expand into Kenya." / "I don't like our current onboarding." / "Build something that solves this."

**Implementation:** classifier via cheap model (cost-aware routing) + deterministic rules; output is a structured `IntentPlan` that seeds the Executive workflow. Human override anytime.

## 8.4 Modes

| Mode | Purpose | Side effects |
|------|---------|--------------|
| Chat | Planning, discussion, strategy, explanation | None (read-only + memory write on request) |
| Execution | Authorized operational work | Yes — under authority profile |
| Review | Review results, code, reports, proposals | Review objects only |
| Voice (later) | Conversational executive interface | Same as Chat/Execution rules (§39) |
| Simulation | Forecast org/plans/costs/workload/risks | None — preview only (§50) |

## 8.5 Delegation Model

1. Intent classified → objective determined → project created if needed.
2. Executive Agent selects: existing agent? new hire? team? council? tool?
3. Assigns tasks via Task Engine with clear success criteria and stop conditions.
4. Monitors progress; handles blockers; escalates per attention model (§18).
5. Synthesizes results into decisions/reports for the CEO.

The Executive Agent must **not** become a bottleneck: work is delegated to parallel workers; the Executive Agent handles orchestration and synthesis.

## 8.6 Council & Debate Flow

`Question → Select members → Independent analysis → Challenge/disagreement → Synthesis → Recommendation → Human approval where required`

- Members analyze **independently** (no shared context contamination).
- Challenges are explicit `Deliberation` records: disagreement, evidence, assumptions, confidence, unresolved questions.
- No artificial consensus; disagreement is preserved in the decision record (§15, §16).
- Private chain-of-thought is never exposed; the CEO sees concise decision explanations and evidence (§35).
- Conflict detection: when members disagree materially, the Executive Agent highlights the conflict and recommends a resolution path (e.g., resolve compliance before spend).

## 8.7 Decision & Explain-Why

Every important recommendation carries (§35):
- recommendation
- evidence (with references)
- assumptions (flagged as assumptions)
- alternatives considered + why rejected
- risks
- expected outcome
- confidence
- required approval level

## 8.8 Ask-for-Help (Need Human)

Formal capability (§17) triggered by: missing info, approval required, ambiguity, missing permission, budget threshold, conflicting instructions, high-risk action, low confidence, missing credential, legal/compliance, technical blocker.

Payload: what is needed, why, impact, urgency, what can continue while waiting. The waiting branch pauses; other work continues.

## 8.9 Strategic Loop (continuous)

Monitor goals → detect deviations → diagnose → propose corrective actions → update plans → feed weekly/monthly reports → propose next strategic cycle.

## 8.10 Executive Agent Configuration

- Configurable persona/title/instructions per org (e.g., "Chief of Staff" vs "Executive Director").
- Model policy: high-quality models for strategy; cheap models for classification/summarization (routing).
- Authority profile: CEO delegates specific authorities (approve hires ≤ X, approve spend ≤ Y, convene councils, etc.) — delegation is revocable, scoped, and time-limited (§81.1).
- All Executive Agent actions flow through the same approval/audit machinery as any agent.

## 8.11 Implementation Notes (Phase 3 scope)

- `intelligence` module: `POST /v1/intelligence/execute` accepts any input payload; runs Intent Engine → Executive workflow.
- Executive workflow is a `WorkflowSpec` (durable): classify → gather context → plan → (council?) → recommend → approval → project/workforce → execute → verify → report → memory.
- Reuses Task Engine, Council objects, Approval Engine, Memory — no special-casing.
