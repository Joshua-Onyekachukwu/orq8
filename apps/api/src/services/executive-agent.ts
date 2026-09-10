import { eq, and, desc, sql } from 'drizzle-orm';
import { agents, departments, teams, goals, tasks, approvals, activityEvents, companyMemory, type Db } from '@orq8/db';
import { chatJson, getServedProvider, popNvidiaDiagnostics, type NVIDIAFunctionNotFoundDiagnostic } from './llm.js';
import { appendAudit } from './audit.js';
import { retrieveSemanticForContext } from './memory.js';
import { consumeCredits, hasEnoughCredits, CreditExhaustedError } from './credits.js';
import { executeTask, type TaskExecutionResult } from './task-executor.js';
import { executeWithQuality, type QualityPipelineResult } from './quality-pipeline.js';
import { broadcastToOrg } from './realtime.js';
import { getTraceSummary, type LLMTraceSummary } from './llm-tracer.js';
import { getDecisionContext } from './decision-memory.js';
import { getLineageContext } from './lineage.js';
import { listCapabilities, resolveCapabilityRequest } from './capability-registry.js';
import type { AppConfig } from '@orq8/core';
import type { Agent } from '@orq8/db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OrgStructureTeam {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  lead: string | null; // team owner
  status: string; // active | archived
  members: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
    currentTask: string | null;
  }>;
  work: {
    activeTasks: number;
    blockedTasks: number;
    overdueTasks: number;
  };
}

export interface OrgStructure {
  departments: Array<{ id: string; name: string; status: string }>;
  teams: OrgStructureTeam[];
  unassignedAgents: number;
  counts: { departments: number; teams: number; agents: number; activeAgents: number };
}

export interface ExecutiveContext {
  orgId: string;
  userId: string;
  orgName?: string;
  agents: Agent[];
  orgStructure: OrgStructure;
  activeGoals: Array<{ id: string; title: string; status: string; priority: string; progress: number }>;
  activeTasks: Array<{ id: string; title: string; status: string; agentId: string | null }>;
  pendingApprovals: number;
  recentMemory: Array<{ content: string; category: string }>;
  // Workforce coverage — real capacity/utilization data for staffing intelligence.
  workforceCoverage?: Array<{
    departmentName: string;
    coverageStatus: string;
    coveragePct: number;
    utilizationPct: number;
    activeAgentCount: number;
    totalCapacityHours: number;
    totalWorkloadHours: number;
  }>;
  unassignedAgentCount?: number;
  workforceIntelligence?: string;
  // Build-vs-buy (Phase 11): what the company already knows how to do.
  // `decision` is present when the founder's query was resolved against the
  // registry (reuse | extend | build); otherwise just the reusable catalog.
  capabilities?: Array<{ name: string; category: string; decision?: 'reuse' | 'extend' | 'build' }>;
  // Strategy chain — the layer above goals that connects strategy to execution.
  strategySummary?: {
    activeStrategies: number;
    activeObjectives: number;
    activeKeyResults: number;
    activeInitiatives: number;
    overallProgress: number;
    topPriorities: Array<{ type: string; title: string; progress: number; status: string }>;
  };
  // Decision Memory — past decisions with outcomes for learning.
  decisionMemory?: string;
  // Strategic Lineage — connection between tasks and strategy.
  lineageContext?: string;
}

export interface IntentAnalysis {
  intent: string;
  category: 'research' | 'write' | 'communicate' | 'plan' | 'analyze' | 'execute' | 'report' | 'manage' | 'unknown';
  requiresApproval: boolean;
  approvalReason?: string;
  riskLevel: 'low' | 'medium' | 'high';
  estimatedCost: number;
  suggestedAgentRole?: string;
  taskDecomposition: Array<{
    title: string;
    description: string;
    suggestedAgentRole: string;
    priority: 'low' | 'normal' | 'high';
  }>;
  toolCalls?: Array<{
    tool: string;
    params: Record<string, unknown>;
  }>;
  response: string;
}

export interface ExecutionResult {
  commandId: string;
  intent: IntentAnalysis;
  taskIds: string[];
  approvalId?: string;
  status: 'completed' | 'awaiting_approval' | 'error';
  message: string;
  agentResults?: Array<{
    agentName: string;
    taskTitle: string;
    status: 'pending' | 'completed' | 'failed';
    result?: string;
    llmUsed?: boolean;
  }>;
  creditsConsumed?: number;
  creditsRemaining?: number;
  // Which LLM provider executed this command (docs/22): 'nvidia' | 'litellm' | 'ollama' | 'none' (structured fallback)
  llmProvider?: 'nvidia' | 'openrouter' | 'litellm' | 'ollama' | 'none';
  // Warnings surfaced from the LLM provider chain (e.g. NVIDIA scope issues)
  warnings?: NVIDIAFunctionNotFoundDiagnostic[];
  // New: workflow trace for debugging
  workflowTrace?: WorkflowTrace;
  // Delegation summary — which agents were assigned tasks
  delegationSummary?: {
    directAssignments: number;
    delegations: number;
    unassigned: number;
    assignedAgents: string[];
  } | null;
  toolResults?: Array<{ tool: string; success: boolean; message: string }>;
}

// ─── Workflow Verification Types ────────────────────────────────────────────

export interface WorkflowStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: string;
  result?: unknown;
}

export interface WorkflowTrace {
  commandId: string;
  steps: WorkflowStep[];
  totalDurationMs: number;
  status: 'completed' | 'partial' | 'failed';
  errorRecoveryAttempts: number;
  llmTraceSummary?: LLMTraceSummary;
}

// ─── Progress streaming (demo-latency fix) ─────────────────────────────────
//
// The full pipeline (context → LLM intent → tools → tasks → execution) can
// take ~60s. Streaming endpoints attach a progress sink to the workflow trace
// so every stage transition is pushed to the client AS IT HAPPENS — the
// founder sees live progress instead of a frozen spinner.
//
// Design: a WeakMap keyed by trace keeps the public executeCommand() signature
// and every existing call site unchanged; non-streaming callers (REST route,
// tests, cron) behave exactly as before.

export type EAProgressEvent =
  | { type: 'step_started'; step: string }
  | { type: 'step_completed'; step: string; detail?: Record<string, unknown> }
  | { type: 'step_failed'; step: string; error: string }
  | { type: 'step_skipped'; step: string; reason?: string };

export type EAProgressSink = (event: EAProgressEvent) => void;

const progressSinks = new WeakMap<WorkflowTrace, EAProgressSink>();
/** Reverse index so completeStep (which only receives the step) can find its trace. */
const tracesByStep = new WeakMap<WorkflowStep, WorkflowTrace>();

/** Attach a progress sink to a trace before running executeCommand(). */
export function setTraceProgressSink(trace: WorkflowTrace, sink: EAProgressSink): void {
  progressSinks.set(trace, sink);
}

function emitTraceProgress(trace: WorkflowTrace, event: EAProgressEvent): void {
  const sink = progressSinks.get(trace);
  if (!sink) return;
  try {
    sink(event);
  } catch {
    // A broken stream must never break the pipeline.
  }
}

// ─── System Prompts ─────────────────────────────────────────────────────────

const EXECUTIVE_AGENT_SYSTEM_PROMPT = `You are the Executive Agent of ORQ8 — an AI executive operating system for founders and CEOs.

Your role is to understand the CEO's commands, analyze their intent, and orchestrate work across the AI employee organization.

When the CEO gives you a command, you must:

1. ANALYZE the intent — understand what they want to achieve
2. DETERMINE the category — what type of work this is
3. ASSESS if approval is needed — financial, public-facing, or irreversible actions require CEO approval
4. DECOMPOSE into tasks — break complex commands into specific, actionable tasks
5. SELECT the best AI employee — match each task to the most capable agent
6. ESTIMATE cost — rough estimate of computational resources needed
7. RESPOND clearly — tell the CEO what you plan to do

Available agent roles in the organization (you'll see them in context):
- market_researcher: Research, analysis, competitive intelligence
- content_writer: Writing, drafting, content creation
- communications_agent: Email, notifications, external communications
- software_engineer: Technical implementation, code, deployments
- data_analyst: Data analysis, reporting, metrics
- operations_manager: Process optimization, workflow management
- financial_analyst: Financial analysis, budgeting, projections
- hr_manager: People operations, hiring, team management
- legal_advisor: Legal review, compliance, contracts
- executive_agent: High-level planning, coordination, strategy

APPROVAL RULES:
- Research, analysis, planning, internal reports: NO approval needed
- Writing, drafting, content creation: NO approval needed
- Sending external communications (email, social, publish): NEEDS approval
- Financial transactions, purchases: NEEDS approval
- Deployments, production changes: NEEDS approval
- Hiring, removing agents: NEEDS approval
- Any irreversible action: NEEDS approval

RESPOND IN THIS EXACT JSON FORMAT:
{
  "intent": "clear one-sentence description of what the CEO wants",
  "category": "one of: research, write, communicate, plan, analyze, execute, report, manage",
  "requiresApproval": true/false,
  "approvalReason": "why approval is needed (if applicable)",
  "riskLevel": "low/medium/high",
  "estimatedCost": 0,
  "suggestedAgentRole": "best primary agent role for this",
  "taskDecomposition": [
    {
      "title": "specific task title",
      "description": "what exactly this task does",
      "suggestedAgentRole": "which agent handles this",
      "priority": "low/normal/high"
    }
  ],
  "response": "natural language response to the CEO explaining your plan"
}

ORGANIZATIONAL MANAGEMENT:
When the CEO asks about departments, teams, staffing, or workforce:
- Analyze the current organizational structure and workforce coverage
- Identify understaffed, overstaffed, or capability-gapped departments
- Check if existing agents can absorb additional work before recommending new hires
- Recommend consolidation, reassignment, or generalist coverage when appropriate
- Explain WHY with specific utilization percentages and capacity numbers
- Never recommend creating an agent without checking existing capacity first
- Distinguish between generalist and specialist needs
- Consider cross-department support before creating new positions
- Warn about organizational bloat when departments outnumber agents significantly

STAFFING DECISIONS:
When recommending workforce changes:
1. Check existing agent utilization and capabilities
2. Identify if the work can be absorbed by current agents
3. Only recommend new hires when there is a genuine capacity or capability gap
4. Explain the gap with specific numbers (hours/week, utilization %)
5. Recommend the minimum workforce change needed
6. Consider promotion, reassignment, or restriction before replacement
7. All hiring/replacement/retirement requires founder approval

EXECUTIVE TOOLS — YOU CAN EXECUTE ACTIONS DIRECTLY:

WHEN TO USE TOOLS vs TASKS:
- If the CEO asks to CREATE, RENAME, or MODIFY an organizational entity (department, team, agent, goal), use a TOOL directly.
- If the CEO asks to DO WORK (research, write, analyze, build), create TASKS for AI employees.
- If the CEO asks a QUESTION, just answer with analysis and recommendations.
- NEVER create tasks describing an action when a tool can execute it directly.

TOOLS AVAILABLE (include in toolCalls array):
- rename_agent: { agentId: "uuid", newName: "string" }. Safe — renames display name only.
- create_agent: { name, role, departmentId?, teamId?, capabilities? }. Requires approval.
- create_department: { name, description? }. Requires approval.
- create_team: { name, departmentId?, lead? }. Requires approval.
- create_goal: { title, description?, priority? }. Safe action.
- create_task: { title, description?, agentId?, goalId?, priority? }. Safe action.
- get_organization_summary: {}. Always safe.
- rename_department: { departmentId: "uuid", newName: "string" }. Safe — renames display name only.
- rename_team: { teamId: "uuid", newName: "string" }. Safe — renames display name only.
- update_agent: { agentId: "uuid", departmentId?, teamId?, status?, autonomyLevel? }. Safe — reassigns or changes agent status (active/paused/archived).
- update_goal: { goalId: "uuid", title?, description?, priority?, status?, departmentId?, teamId? }. Safe — updates goal properties.
- update_task: { taskId: "uuid", agentId?, priority?, status?, title?, description?, dueDate? }. Safe — updates task properties.
- rename_organization: { newName: "string" }. Safe — renames the company/organization identity.
- plan_engineering: { objective: "string", description?: "string", constraints?: "string", priority?: "low|normal|high|urgent" }. Safe — delegates a software-engineering objective to the Engineering Manager, who assembles a team and creates engineering tasks. Use when the CEO asks to build software, an app, a feature, or a technical system. Idempotent: repeating the same objective returns the existing plan.
- find_best_agent: { task: "string" }. Safe — "who should handle this?" Ranks active AI employees by capability match, current utilization and historical performance. Recommendation only; use create_task with the suggested agentId to actually assign.
- analyze_workforce: {}. Safe — real utilization and coverage numbers per department/team; identifies overloaded or understaffed units. Use for "which team is overloaded?", "do we need another agent?", "what is each department's workload?".
- archive_department: { departmentId: "uuid", restore?: boolean }. Safe — archives (or restores) a department; history, agents and tasks are preserved.
- archive_team: { teamId: "uuid", restore?: boolean }. Safe — archives (or restores) a team; history and members are preserved.
- recommend_org_stage: { stage?: 1|2|3|4|5, companyDescription?: "string" }. Safe — recommends a stage-appropriate organization from the Department Template Catalog (the same catalog as the Departments page). Use when the CEO asks to set up a company, structure the organization, or ask what departments are needed. Explains WHY each department is recommended and what is deferred.
- activate_department: { templateName: "string" }. Requires approval — activates a department from the SAME catalog (idempotent; creates the department and its teams). Use the exact department name from recommend_org_stage results. Prefer this over create_department whenever a catalog template matches, because it brings the template's full team structure.

For rename_agent: match the agentId from the AI Employees list in context.
For rename_department: match the departmentId from the Departments list in context.
For rename_team: match the teamId from the Teams list in context.
For update_agent: use agentId from context; set status to 'paused'/'archived'/'active' as appropriate.
For update_goal: use goalId from context; update the fields the CEO mentioned.
For update_task: use taskId from context; assign agentId, change priority/status as needed.
For rename_organization: use the new name the CEO specified.
For create_department/team/agent: use the name the CEO specified.
For create_goal: use the CEO's goal statement as the title.

Response format when using tools:
{
  "intent": "description",
  "category": "manage",
  "requiresApproval": true/false,
  "toolCalls": [{"tool": "tool_name", "params": {...}}],
  "taskDecomposition": [],
  "response": "what you're about to do"
}

Set taskDecomposition to [] when using tools — the tool IS the action.

IMPORTANT: Tools are executed server-side with full authorization and limit checks.

Be decisive, clear, and professional. You are the CEO's chief of staff.`;

// ─── Workflow Verification ──────────────────────────────────────────────────

/**
 * Create a workflow trace for tracking the full command lifecycle.
 */
function createWorkflowTrace(commandId: string): WorkflowTrace {
  return {
    commandId,
    steps: [],
    totalDurationMs: 0,
    status: 'completed',
    errorRecoveryAttempts: 0,
  };
}

/**
 * Start a workflow step. Returns the step for later completion.
 */
function startStep(trace: WorkflowTrace, name: string): WorkflowStep {
  const step: WorkflowStep = {
    name,
    status: 'running',
    startedAt: new Date(),
  };
  trace.steps.push(step);
  tracesByStep.set(step, trace);
  emitTraceProgress(trace, { type: 'step_started', step: name });
  return step;
}

/**
 * Complete a workflow step.
 */
function completeStep(step: WorkflowStep, result?: unknown, error?: string): void {
  step.completedAt = new Date();
  step.durationMs = step.completedAt.getTime() - (step.startedAt?.getTime() ?? step.completedAt.getTime());
  step.status = error ? 'failed' : 'completed';
  step.result = result;
  step.error = error;
  // Skips are expressed as completed-with-{skipped:true} upstream; surface
  // them as explicit skip events so the UI never shows a stage as "done work".
  const skipped =
    error == null &&
    result != null &&
    typeof result === 'object' &&
    (result as Record<string, unknown>).skipped === true;
  const trace = tracesByStep.get(step);
  if (!trace) return;
  if (error) emitTraceProgress(trace, { type: 'step_failed', step: step.name, error });
  else if (skipped)
    emitTraceProgress(trace, {
      type: 'step_skipped',
      step: step.name,
      reason: String((result as Record<string, unknown>).reason ?? ''),
    });
  else
    emitTraceProgress(trace, {
      type: 'step_completed',
      step: step.name,
      detail: result as Record<string, unknown> | undefined,
    });
}

/**
 * Validate that the workflow context is sane before proceeding.
 * Returns null if valid, or an error message if not.
 */
function validateContext(ctx: ExecutiveContext): string | null {
  if (!ctx.orgId) return 'Missing organization ID';
  if (!ctx.userId) return 'Missing user ID';
  // Context is valid even with no agents — the agent can recommend hiring one
  return null;
}

/**
 * Validate that an intent analysis result is complete and sane.
 */
function validateIntent(intent: IntentAnalysis): string | null {
  if (!intent.intent) return 'Missing intent description';
  if (!intent.category || intent.category === 'unknown') return 'Could not determine command category';
  // A detected organizational tool IS the complete intent — the action happens
  // in tool execution, so no task decomposition is required for it. (Engineering
  // delegation, rename, create-department etc. all route through here.)
  const hasToolAction = Array.isArray(intent.toolCalls) && intent.toolCalls.length > 0;
  if (!hasToolAction && (!intent.taskDecomposition || intent.taskDecomposition.length === 0)) {
    return 'No tasks decomposed from command';
  }
  if (intent.estimatedCost < 0) return 'Invalid cost estimate';

  // Validate each task
  for (const task of intent.taskDecomposition) {
    if (!task.title) return 'Task missing title';
    if (!task.suggestedAgentRole) return `Task "${task.title}" missing agent role`;
  }

  return null;
}

// ─── Context Building ───────────────────────────────────────────────────────

/**
 * Build the full Executive Agent context from the database.
 * This gives the LLM awareness of the organization's current state.
 */
/** Statuses that count as "in flight" for team work summaries. */
const ACTIVE_TASK_STATUSES = new Set(['pending', 'in_progress']);
const CLOSED_TASK_STATUSES = new Set(['completed', 'cancelled']);

/**
 * Build a compact, deterministic org-structure view: departments, teams with
 * owners and members, per-team work status. This is the ONLY org-structure
 * representation the Executive Agent receives — never the raw tables.
 */
export async function buildOrgStructure(
  db: Db,
  orgId: string,
  orgAgents: Agent[],
): Promise<OrgStructure> {
  const [deptRows, teamRows, taskAgg, overdueAgg] = await Promise.all([
    db.select({ id: departments.id, name: departments.name, status: departments.status }).from(departments).where(eq(departments.orgId, orgId)),
    db.select({ id: teams.id, name: teams.name, departmentId: teams.departmentId, lead: teams.lead, status: teams.status }).from(teams).where(eq(teams.orgId, orgId)),
    // Task counts grouped by team + status (org-scoped).
    db
      .select({ teamId: tasks.teamId, status: tasks.status, count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.orgId, orgId), sql`${tasks.teamId} is not null`))
      .groupBy(tasks.teamId, tasks.status),
    // Overdue = not closed and due before now, grouped by team.
    db
      .select({ teamId: tasks.teamId, count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(
          eq(tasks.orgId, orgId),
          sql`${tasks.teamId} is not null`,
          sql`${tasks.dueDate} is not null and ${tasks.dueDate} < now()`,
          sql`${tasks.status} not in ('completed', 'cancelled')`,
        ),
      )
      .groupBy(tasks.teamId),
  ]);

  const deptById = new Map(deptRows.map((d) => [d.id, d]));
  const statusCounts = new Map<string, Record<string, number>>();
  for (const row of taskAgg) {
    if (!row.teamId) continue;
    const bucket = statusCounts.get(row.teamId) ?? {};
    bucket[row.status] = (bucket[row.status] ?? 0) + row.count;
    statusCounts.set(row.teamId, bucket);
  }
  const overdueByTeam = new Map(overdueAgg.filter((r) => r.teamId).map((r) => [r.teamId!, r.count]));

  const teamsView: OrgStructureTeam[] = teamRows.map((team) => {
    const members = orgAgents
      .filter((a) => a.teamId === team.id)
      .map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        status: a.status,
        currentTask: a.currentTask ?? null,
      }));
    const counts = statusCounts.get(team.id) ?? {};
    const activeTasks = Object.entries(counts)
      .filter(([status]) => ACTIVE_TASK_STATUSES.has(status))
      .reduce((n, [, c]) => n + c, 0);
    const blockedTasks = counts.failed ?? 0;
    return {
      id: team.id,
      name: team.name,
      departmentId: team.departmentId,
      departmentName: team.departmentId ? (deptById.get(team.departmentId)?.name ?? null) : null,
      lead: team.lead ?? null,
      status: team.status,
      members,
      work: {
        activeTasks,
        blockedTasks,
        overdueTasks: overdueByTeam.get(team.id) ?? 0,
      },
    };
  });

  const unassignedAgents = orgAgents.filter((a) => !a.teamId).length;
  return {
    departments: deptRows,
    teams: teamsView.sort((a, b) => a.name.localeCompare(b.name)),
    unassignedAgents,
    counts: {
      departments: deptRows.length,
      teams: teamRows.length,
      agents: orgAgents.length,
      activeAgents: orgAgents.filter((a) => a.status === 'active').length,
    },
  };
}

/**
 * Render the org structure as a compact, deterministic prompt block.
 * Pure function — unit-testable without a database.
 */
export function formatOrgStructure(structure: OrgStructure): string {
  const lines: string[] = [];
  lines.push(`### Organization Structure (${structure.counts.departments} departments, ${structure.counts.teams} teams, ${structure.counts.agents} AI employees, ${structure.unassignedAgents} unassigned)`);

  if (structure.teams.length === 0) {
    lines.push('No teams exist yet — the organization has no formal structure.');
    return lines.join('\n');
  }

  for (const dept of structure.departments) {
    if (dept.status === 'archived') continue;
    const deptTeams = structure.teams.filter((t) => t.departmentId === dept.id);
    const members = deptTeams.reduce((n, t) => n + t.members.length, 0);
    lines.push(`- Department: ${dept.name} (${deptTeams.length} teams, ${members} members)`);
  }
  // Teams without a department
  const orphanTeams = structure.teams.filter((t) => !t.departmentId);
  if (orphanTeams.length > 0) {
    lines.push(`- Teams without a department: ${orphanTeams.map((t) => t.name).join(', ')}`);
  }

  for (const team of structure.teams) {
    if (team.status === 'archived') continue;
    const owner = team.lead ? `, owner: ${team.lead}` : '';
    const memberList = team.members.map((m) => `${m.name} (${m.role}, ${m.status})${m.currentTask ? ` — ${m.currentTask}` : ''}`).join('; ');
    const workFlags: string[] = [];
    if (team.work.activeTasks > 0) workFlags.push(`${team.work.activeTasks} active`);
    if (team.work.blockedTasks > 0) workFlags.push(`BLOCKED: ${team.work.blockedTasks} failed`);
    if (team.work.overdueTasks > 0) workFlags.push(`OVERDUE: ${team.work.overdueTasks}`);
    lines.push(`- Team: ${team.name}${owner}${workFlags.length > 0 ? ` [${workFlags.join(', ')}]` : ''} — ${memberList || 'no members'}`);
  }

  return lines.join('\n');
}

export async function buildContext(db: Db, orgId: string, opts: { query?: string; config?: AppConfig } = {}): Promise<ExecutiveContext> {
  const orgAgents = await db.select().from(agents).where(eq(agents.orgId, orgId));
  const [orgGoals, orgTasks, orgApprovals, orgMemory, orgStructure] = await Promise.all([
    db.select().from(goals).where(eq(goals.orgId, orgId)).orderBy(desc(goals.createdAt)).limit(10),
    db.select().from(tasks).where(eq(tasks.orgId, orgId)).orderBy(desc(tasks.createdAt)).limit(20),
    db.select({ id: approvals.id }).from(approvals).where(
      and(eq(approvals.orgId, orgId), eq(approvals.status, 'pending')),
    ),
    // Semantic retrieval when a query is present (the founder's command);
    // falls back to importance+recency. Always org-scoped. Never a full dump.
    retrieveSemanticForContext(db, orgId, { query: opts.query, maxEntries: 10 }, opts.config),
    buildOrgStructure(db, orgId, orgAgents),
  ]);

  // Build-vs-buy: resolve the founder's request against what the company
  // already has. Bounded + org-scoped; a missing registry table (migrations
  // pending) degrades to an empty catalog rather than failing the command.
  let capabilities: ExecutiveContext['capabilities'] = [];
  try {
    if (opts.query?.trim()) {
      const resolved = await resolveCapabilityRequest(db, orgId, opts.query.trim(), { limit: 5 });
      capabilities = resolved.matches.slice(0, 5).map((m) => ({
        name: m.name,
        category: m.category,
        decision: resolved.decision,
      }));
    } else {
      const registry = await listCapabilities(db, orgId);
      capabilities = registry
        .filter((c) => c.status === 'available')
        .slice(0, 8)
        .map((c) => ({ name: c.name, category: c.category }));
    }
  } catch {
    capabilities = [];
  }

  const ctx: ExecutiveContext = {
    orgId,
    userId: '',
    agents: orgAgents,
    orgStructure,
    activeGoals: orgGoals.map(g => ({
      id: g.id,
      title: g.title,
      status: g.status,
      priority: g.priority,
      progress: g.progress,
    })),
    activeTasks: orgTasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      agentId: t.agentId,
    })),
    pendingApprovals: orgApprovals.length,
    recentMemory: orgMemory.map(m => ({
      content: m.content,
      category: m.category,
    })),
    capabilities,
  };

  // Strategy chain — lazy-loaded, non-blocking.
  try {
    const { getStrategySummary } = await import('./strategy.js');
    ctx.strategySummary = await getStrategySummary(db, orgId);
  } catch {
    // Strategy tables may not exist yet — degrade gracefully.
  }

  // Decision Memory — lazy-loaded, non-blocking.
  try {
    ctx.decisionMemory = await getDecisionContext(db, orgId, opts.query);
  } catch {
    // Decision tables may not exist yet — degrade gracefully.
  }

  // Strategic Lineage — lazy-loaded, non-blocking.
  try {
    ctx.lineageContext = await getLineageContext(db, orgId);
  } catch {
    // Lineage tables may not exist yet — degrade gracefully.
  }

  // Populate workforce coverage if available — lazy-loaded, non-blocking.
  // Failures degrade gracefully so the Executive Agent still works without it.
  try {
    const { calculateDepartmentCoverage } = await import('./workforce-engine.js');
    const coverage = await calculateDepartmentCoverage(db, orgId);
    ctx.workforceCoverage = coverage.map(c => ({
      departmentName: c.departmentName,
      coverageStatus: c.coverageStatus,
      coveragePct: c.coveragePct,
      utilizationPct: c.utilizationPct,
      activeAgentCount: c.activeAgentCount,
      totalCapacityHours: c.totalCapacityHours,
      totalWorkloadHours: c.totalWorkloadHours,
    }));
    ctx.unassignedAgentCount = orgAgents.filter(a => !a.departmentId).length;
  } catch {
    // Workforce engine not available — context degrades gracefully.
  }

  // Workforce intelligence — priority recommendations and agent availability.
  try {
    const { getWorkforceIntelligence } = await import('./agent-recommendation.js');
    ctx.workforceIntelligence = await getWorkforceIntelligence(db, orgId);
  } catch {
    // Recommendation engine not available — degrade gracefully.
  }

  return ctx;
}

/**
 * Build the context prompt for the LLM.
 */
function buildContextPrompt(ctx: ExecutiveContext): string {
  const agentList = ctx.agents.length > 0
    ? ctx.agents.map(a => `- ${a.name} (${a.role}) — ${a.status}, ${a.tasksCompleted} tasks completed, currently: ${a.currentTask ?? 'idle'}`).join('\n')
    : 'No AI employees have been hired yet.';

  const goalList = ctx.activeGoals.length > 0
    ? ctx.activeGoals.map(g => `- [${g.status}] ${g.title} (${g.priority}, ${g.progress}% complete)`).join('\n')
    : 'No active goals set.';

  const taskList = ctx.activeTasks.length > 0
    ? ctx.activeTasks.map(t => `- [${t.status}] ${t.title}`).join('\n')
    : 'No active tasks.';

  const memoryList = ctx.recentMemory.length > 0
    ? ctx.recentMemory.map(m => `- [${m.category}] ${m.content}`).join('\n')
    : 'No company memory yet.';

  const structureBlock = formatOrgStructure(ctx.orgStructure);

  // Workforce coverage summary — gives the LLM real capacity/utilization data
  // so it can make informed staffing recommendations.
  let workforceBlock = '';
  if (ctx.workforceCoverage && ctx.workforceCoverage.length > 0) {
    const wfLines: string[] = ['\n### Workforce Coverage'];
    for (const wf of ctx.workforceCoverage) {
      const status = wf.coverageStatus === 'healthy' ? '🟢' :
        wf.coverageStatus === 'near_capacity' ? '🟡' :
        wf.coverageStatus === 'over_capacity' ? '🔴' : '⚪';
      wfLines.push(
        `- ${wf.departmentName}: ${status} ${wf.coveragePct}% coverage, ${wf.utilizationPct}% utilization, ${wf.activeAgentCount} active agents, ${Math.round(wf.totalWorkloadHours)}h/${Math.round(wf.totalCapacityHours)}h capacity`,
      );
    }
    if (ctx.unassignedAgentCount && ctx.unassignedAgentCount > 0) {
      wfLines.push(`- Unassigned agents: ${ctx.unassignedAgentCount} (consider assigning to departments with gaps)`);
    }
    workforceBlock = wfLines.join('\n');
  }

  // Workforce intelligence summary.
  if (ctx.workforceIntelligence) {
    workforceBlock += '\n\n### Workforce Status\n' + ctx.workforceIntelligence;
  }

  // Build-vs-buy guidance: reuse-before-building catalog + resolution when the
  // founder's query was matched against the registry. Built with concatenation
  // (no nested templates) to keep the parser simple.
  let capabilityBlock = '';
  if (ctx.capabilities && ctx.capabilities.length > 0) {
    const parts: string[] = ['\n### Reusable Company Capabilities'];
    for (const c of ctx.capabilities) parts.push('- ' + c.name + ' [' + c.category + ']');
    const first = ctx.capabilities[0];
    if (first?.decision) {
      const d = first.decision;
      let line: string;
      if (d === 'reuse') line = 'an existing capability matches; recommend reuse before building.';
      else if (d === 'extend') line = 'a partial match exists; prefer extending it over building in parallel.';
      else line = 'no adequate existing match; if the work is genuinely needed, propose a new capability.';
      parts.push('Resolution for the founder\'s request: ' + d.toUpperCase() + ' — ' + line);
    } else {
      parts.push('Before proposing new agents, tools or workflows, check this list and reuse what already exists.');
    }
    capabilityBlock = parts.join('\n');
  }

  // Strategy block — gives the LLM awareness of the company's strategic direction.
  let strategyBlock = '';
  if (ctx.strategySummary && ctx.strategySummary.activeStrategies > 0) {
    const s = ctx.strategySummary;
    const lines: string[] = [
      '\n### Strategy & Objectives',
      `- Active strategies: ${s.activeStrategies}`,
      `- Active objectives: ${s.activeObjectives}`,
      `- Key results: ${s.activeKeyResults}`,
      `- Active initiatives: ${s.activeInitiatives}`,
      `- Overall strategic progress: ${s.overallProgress}%`,
    ];
    if (s.topPriorities.length > 0) {
      lines.push('Top priorities:');
      for (const p of s.topPriorities) {
        lines.push(`  - [${p.status}] ${p.title} (${p.progress}%)`);
      }
    }
    strategyBlock = lines.join('\n');
  }

  return '## ORGANIZATION CONTEXT\n\n' +
    '### AI Employees\n' + agentList + '\n\n' +
    structureBlock + '\n\n' +
    (strategyBlock ? strategyBlock + '\n\n' : '') +
    (ctx.decisionMemory ? ctx.decisionMemory + '\n\n' : '') +
    (ctx.lineageContext ? ctx.lineageContext + '\n\n' : '') +
    '### Active Goals\n' + goalList + '\n\n' +
    '### Active Tasks\n' + taskList + '\n\n' +
    '### Pending Approvals: ' + ctx.pendingApprovals + '\n\n' +
    '### Company Memory\n' + memoryList +
    capabilityBlock + workforceBlock + '\n\n' +
    '### Instructions\n' +
    'You have full awareness of the organization\'s current state, including its departments, teams, team owners, members and where work is blocked or overdue.\n' +
    'Use this context to make informed decisions about task decomposition and agent selection.\n' +
    'When the founder asks who owns work or who is responsible, answer from the organization structure above.\n' +
    'If no suitable agent exists, recommend hiring one.\n' +
    'Always be specific about which agent should handle each task.\n' +
    'Before proposing to build anything new (a new agent, tool, workflow or capability), first search the Reusable Company Capabilities above — if the company can already do the work, recommend reusing the existing capability instead of building a parallel one.\n' +
    'When the founder asks about strategy or priorities, reference the Strategy & Objectives section above.\n' +
    'Connect tasks and goals to strategic objectives where possible.';
}

// ─── Intent Analysis ────────────────────────────────────────────────────────

/**
 * Analyze a CEO command using the LLM with tracing.
 * Falls back to a basic rule-based analysis if LLM is unavailable.
 */
export async function analyzeIntent(
  config: AppConfig,
  ctx: ExecutiveContext,
  command: string,
  commandId?: string,
  contextNote?: string,
): Promise<IntentAnalysis> {
  const contextPrompt = buildContextPrompt(ctx);
  const fullSystemPrompt = `${EXECUTIVE_AGENT_SYSTEM_PROMPT}\n\n${contextPrompt}`;

  // Context-aware commands: if the founder is viewing a goal/agent/page, make
  // the intent analysis aware of it so "break this down" resolves correctly.
  const userMessage = contextNote
    ? `[Current founder context: ${contextNote}]\n\nCommand: ${command}`
    : command;

  // Try LLM with tracing
  const llmResult = await chatJson<IntentAnalysis>(config, fullSystemPrompt, userMessage, {
    temperature: 0.3,
    max_tokens: 1024,
    _trace: {
      orgId: ctx.orgId,
      phase: 'intent_analysis',
      commandId,
    },
  });

  if (llmResult && llmResult.intent && llmResult.category) {
    // Validate the LLM response
    const validationError = validateIntent(llmResult);
    if (!validationError) {
      return llmResult;
    }
    // LLM returned invalid structure — fall through to fallback
  }

  // Fallback: rule-based analysis (when LLM is unavailable or returned invalid JSON)
  return fallbackAnalysis(command, ctx);
}

// ─── Tool Detection (rule-based) ──────────────────────────────────────────

/**
 * Detect if a command maps to a direct tool action.
 * Returns toolCalls if detected, null otherwise.
 * Used by both the LLM path (post-processing) and the fallback path.
 */
function detectToolCalls(
  command: string,
  ctx: ExecutiveContext,
): Array<{ tool: string; params: Record<string, unknown> }> | null {
  const lower = command.toLowerCase().trim();

  // ── Rename agent ───────────────────────────────────────────────────────
  // "Rename X to Y" / "Call X Y" / "Change X's name to Y"
  const renameMatch = lower.match(/\b(?:rename|call|change)\b.*\b(.+?)\b\s+(?:to|as)\s+\b(.+?)$/i)
    ?? lower.match(/\bchange\b\s+\b(.+?)\b\s+(?:'s|name)\s+(?:to|as)\s+\b(.+?)$/i);
  if (renameMatch && renameMatch[1] && renameMatch[2]) {
    const oldName = renameMatch[1].trim();
    const newName = renameMatch[2].trim();
    // Find matching agent by name
    const agent = ctx.agents.find(a =>
      a.name.toLowerCase() === oldName.toLowerCase() ||
      a.name.toLowerCase().includes(oldName.toLowerCase()),
    );
    if (agent && newName.length > 0 && newName.length <= 100) {
      return [{ tool: 'rename_agent', params: { agentId: agent.id, newName } }];
    }
  }

  // ── Create department ──────────────────────────────────────────────────
  // "Create a marketing department" / "Set up engineering" / "Add a finance dept"
  const deptCreateMatch = lower.match(/\b(?:create|set up|add|open|establish|launch)\b.*\b(?:a|an|the)?\s*(.+?)\s*(?:department|dept|division)$/i)
    ?? lower.match(/\b(?:create|set up|add)\b.*\bdepartment\b\s*(?:called|named)?\s*\b(.+?)$/i);
  if (deptCreateMatch && deptCreateMatch[1]) {
    const deptName = deptCreateMatch[1].trim();
    if (deptName.length > 0 && deptName.length < 100) {
      const name = deptName.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return [{ tool: 'create_department', params: { name } }];
    }
  }

  // ── Create team ────────────────────────────────────────────────────────
  // "Create a frontend team" / "Set up a growth team under marketing"
  const teamCreateMatch = lower.match(/\b(?:create|set up|add|establish)\b.*\b(?:a|an|the)?\s*(.+?)\s*(?:team|squad|group)$/i)
    ?? lower.match(/\b(?:create|set up|add)\b.*\bteam\b\s*(?:called|named)?\s*\b(.+?)$/i);
  if (teamCreateMatch && teamCreateMatch[1]) {
    const teamName = teamCreateMatch[1].trim();
    if (teamName.length > 0 && teamName.length < 100) {
      const name = teamName.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return [{ tool: 'create_team', params: { name } }];
    }
  }

  // ── Engineering delegation (plan_engineering) ────────────────────────
  // "Build me an app for X" / "Create a feature that Y" — software-building
  // intents delegate to the Engineering Manager. Must run BEFORE the generic
  // create-agent pattern, which would otherwise misread "create an app…" as
  // hiring a person named "App". Gated on software nouns so ordinary
  // create-department/team/goal commands are never captured.
  const engIntent = lower.match(
    /\b(?:build|create|develop|make|ship)\b[^.?!]*\b(app|application|software|feature|platform|website|dashboard|saas|api|integration|mobile app|web app|tech stack|system)\b/,
  );
  if (engIntent && !lower.match(/\bdepartment\b/) && !lower.match(/\bteam\b/) && !lower.match(/\bagent\b/) && !lower.match(/\bgoal\b/)) {
    return [{ tool: 'plan_engineering', params: { objective: command.trim().slice(0, 1000) } }];
  }

  // ── Create agent ───────────────────────────────────────────────────
  // "Hire an SEO agent" / "Create a content writer" / "Add a sales agent"
  const agentCreateMatch = lower.match(/\b(?:hire|create|add|recruit|onboard)\b.*\b(?:a|an|the)?\s*(.+?)\s*(?:agent|employee|member|specialist)?$/i)
    ?? lower.match(/\b(?:hire|create|add)\b.*\bagent\b\s*(?:called|named|for)?\s*\b(.+?)$/i);
  if (agentCreateMatch && agentCreateMatch[1] && !lower.match(/\bdepartment\b/) && !lower.match(/\bteam\b/)) {
    const roleDesc = agentCreateMatch[1].trim();
    if (roleDesc.length > 0 && roleDesc.length < 100) {
      const name = roleDesc.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const role = roleDesc.toLowerCase().replace(/\s+/g, '_');
      return [{ tool: 'create_agent', params: { name, role } }];
    }
  }

  // ── Create goal ────────────────────────────────────────────────────────
  // "Set a goal to reach $1M ARR" / "Create a goal: launch v2" / "Goal: 100 customers"
  const goalMatch = lower.match(/\b(?:set|create|add|establish)\b.*\bgoal\b\s*(?:to|:)?\s*(.+)/i)
    ?? lower.match(/\bgoal\b\s*(?::|to)\s*(.+)/i);
  if (goalMatch && goalMatch[1]) {
    const goalTitle = goalMatch[1].trim();
    if (goalTitle.length > 3 && goalTitle.length < 500) {
      const title = goalTitle.charAt(0).toUpperCase() + goalTitle.slice(1);
      return [{ tool: 'create_goal', params: { title } }];
    }
  }

  // ── Get organization summary ───────────────────────────────────────────
  if (lower.match(/\b(?:organization|company|org)\b.*\b(?:summary|stats|status|overview)/i)
    || lower.match(/\bhow\s+(?:is|are)\s+(?:the\s+)?(?:company|organization|org)/i)) {
    return [{ tool: 'get_organization_summary', params: {} }];
  }

  // ── Rename department ─────────────────────────────────────────────────
  // "Rename marketing to Growth" / "Change engineering's name to Platform"
  const deptRenameMatch = lower.match(/\b(?:rename|change)\b.*\b(.+?)\b\s+(?:to|as)\s+\b(.+?)$/i)
    ?? lower.match(/\b(?:rename|change)\b.*\b(.+?)\b\s+(?:'s|name)\s+(?:to|as)\s+\b(.+?)$/i);
  if (deptRenameMatch && deptRenameMatch[1] && deptRenameMatch[2]) {
    const oldName = deptRenameMatch[1].trim();
    const newName = deptRenameMatch[2].trim();
    // Check if it matches a department (not an agent)
    const dept = ctx.orgStructure.departments.find((d: { id: string; name: string; status: string }) =>
      d.name.toLowerCase() === oldName.toLowerCase() || d.name.toLowerCase().includes(oldName.toLowerCase()),
    );
    if (dept && newName.length > 0 && newName.length <= 100) {
      return [{ tool: 'rename_department', params: { departmentId: dept.id, newName } }];
    }
  }

  // ── Rename team ───────────────────────────────────────────────────────
  const teamRenameMatch = lower.match(/\b(?:rename|change)\b.*\b(.+?)\b\s+team\s+(?:to|as)\s+\b(.+?)$/i)
    ?? lower.match(/\b(?:rename|change)\b.*\b(.+?)\b\s+(?:'s|name)\s+(?:to|as)\s+\b(.+?)\s+team$/i);
  if (teamRenameMatch && teamRenameMatch[1] && teamRenameMatch[2]) {
    const oldName = teamRenameMatch[1].trim();
    const newName = teamRenameMatch[2].trim();
    const team = ctx.orgStructure.teams.find((t: { id: string; name: string }) =>
      t.name.toLowerCase() === oldName.toLowerCase() || t.name.toLowerCase().includes(oldName.toLowerCase()),
    );
    if (team && newName.length > 0 && newName.length <= 100) {
      return [{ tool: 'rename_team', params: { teamId: team.id, newName } }];
    }
  }

  // ── Pause/retire agent ────────────────────────────────────────────────
  // "Pause Sarah" / "Retire the marketing agent" / "Archive the content writer"
  const pauseMatch = lower.match(/\b(?:pause|suspend|deactivate|retire|archive|remove)\b.*\b(.+?)$/i);
  if (pauseMatch && pauseMatch[1]) {
    const agentName = pauseMatch[1].trim();
    const agent = ctx.agents.find(a =>
      a.name.toLowerCase() === agentName.toLowerCase() || a.name.toLowerCase().includes(agentName.toLowerCase()),
    );
    if (agent) {
      const isRetire = lower.match(/\b(?:retire|archive|remove)\b/);
      return [{ tool: 'update_agent', params: { agentId: agent.id, status: isRetire ? 'archived' : 'paused' } }];
    }
  }

  // ── Resume agent ──────────────────────────────────────────────────────
  const resumeMatch = lower.match(/\b(?:resume|reactivate|activate|unpause|restore)\b.*\b(.+?)$/i);
  if (resumeMatch && resumeMatch[1]) {
    const agentName = resumeMatch[1].trim();
    const agent = ctx.agents.find(a =>
      a.name.toLowerCase() === agentName.toLowerCase() || a.name.toLowerCase().includes(agentName.toLowerCase()),
    );
    if (agent) {
      return [{ tool: 'update_agent', params: { agentId: agent.id, status: 'active' } }];
    }
  }

  // ── Rename organization (EA self-rename) ──────────────────────────────
  // "Rename yourself to Atlas" / "Call yourself Sentinel" / "Change your name to Oracle"
  const eaRenameMatch = lower.match(/\b(?:rename|call|change)\b.*\b(?:yourself|your name)\b.*\b(?:to|as)\s+\b(.+?)$/i)
    ?? lower.match(/\b(?:rename|call|change)\b.*\b(?:org(?:anization)?|company)\b.*\b(?:to|as)\s+\b(.+?)$/i);
  if (eaRenameMatch && eaRenameMatch[1]) {
    const newName = eaRenameMatch[1].trim();
    if (newName.length > 0 && newName.length <= 200) {
      return [{ tool: 'rename_organization', params: { newName } }];
    }
  }

  return null;
}

/**
 * Rule-based fallback analysis when the LLM is not available.
 * Creates multi-step task decompositions based on keyword analysis.
 */
function fallbackAnalysis(command: string, ctx: ExecutiveContext): IntentAnalysis {
  const lower = command.toLowerCase();

  // Determine category
  let category: IntentAnalysis['category'] = 'plan';
  if (lower.includes('research') || lower.includes('analyze') || lower.includes('investigate') || lower.includes('competitor') || lower.includes('market')) category = 'research';
  else if (lower.includes('write') || lower.includes('draft') || lower.includes('create content') || lower.includes('blog') || lower.includes('article')) category = 'write';
  else if (lower.includes('send') || lower.includes('email') || lower.includes('notify') || lower.includes('publish') || lower.includes('post')) category = 'communicate';
  else if (lower.includes('report') || lower.includes('summary') || lower.includes('dashboard')) category = 'report';
  else if (lower.includes('deploy') || lower.includes('release') || lower.includes('execute') || lower.includes('build')) category = 'execute';
  else if (lower.includes('manage') || lower.includes('organize') || lower.includes('hire') || lower.includes('team')) category = 'manage';
  else if (lower.includes('plan') || lower.includes('strategy') || lower.includes('roadmap')) category = 'plan';
  else if (lower.includes('financ') || lower.includes('budget') || lower.includes('revenue') || lower.includes('cost')) category = 'analyze';

  // Determine approval requirements
  const needsApproval = ['send', 'publish', 'deploy', 'buy', 'purchase', 'delete', 'remove', 'hire', 'fire', 'email', 'post'].some(w => lower.includes(w));

  // Determine best agent role
  const agentRoleMap: Record<string, string> = {
    research: 'market_researcher',
    write: 'content_writer',
    communicate: 'communications_agent',
    execute: 'software_engineer',
    report: 'data_analyst',
    manage: 'operations_manager',
    plan: 'executive_agent',
    analyze: 'financial_analyst',
  };

  const suggestedRole = agentRoleMap[category] ?? 'executive_agent';

  // Check if an agent with this role exists
  const matchingAgent = ctx.agents.find(a => a.role === suggestedRole && a.status === 'active');
  const agentName = matchingAgent?.name ?? 'Executive Agent';

  // Build multi-step task decomposition based on category
  const taskDecomposition = buildTaskDecomposition(command, category, suggestedRole, needsApproval);

  // Calculate estimated cost based on task count and complexity
  const estimatedCost = taskDecomposition.length * 2;

  // Check if this maps to a direct tool action
  const detectedTools = detectToolCalls(command, ctx);
  if (detectedTools && detectedTools.length > 0 && detectedTools[0]) {
    const tool = detectedTools[0];
    const toolName = tool.tool;
    // Determine if this tool requires approval
    const approvalTools = ['create_department', 'create_team', 'create_agent', 'activate_department'];
    const needsToolApproval = approvalTools.includes(toolName);
    const toolLabel = toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const paramSummary = Object.entries(tool.params)
      .filter(([k]) => k !== 'agentId')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return {
      intent: command,
      category: 'manage',
      requiresApproval: needsToolApproval,
      approvalReason: needsToolApproval
        ? `${toolLabel} requires your approval.`
        : undefined,
      riskLevel: needsToolApproval ? 'medium' : 'low',
      estimatedCost: 0,
      suggestedAgentRole: 'executive_agent',
      taskDecomposition: [],
      toolCalls: detectedTools,
      response: needsToolApproval
        ? `I'll ${toolLabel.toLowerCase()} (${paramSummary}). This requires your approval.`
        : `I'll ${toolLabel.toLowerCase()} (${paramSummary}). Executing now.`,
    };
  }

  // Build a descriptive response
  const taskCount = taskDecomposition.length;
  const agentList = [...new Set(taskDecomposition.map(t => t.suggestedAgentRole))];
  const agentNames = agentList.map(r => {
    const a = ctx.agents.find(ag => ag.role === r && ag.status === 'active');
    return a?.name ?? r.replace(/_/g, ' ');
  });

  return {
    intent: command,
    category,
    requiresApproval: needsApproval,
    approvalReason: needsApproval
      ? `This action involves ${category === 'communicate' ? 'external communications' : category === 'execute' ? 'production changes' : 'significant actions'} that require your approval.`
      : undefined,
    riskLevel: needsApproval ? 'medium' : 'low',
    estimatedCost,
    suggestedAgentRole: suggestedRole,
    taskDecomposition,
    response: needsApproval
      ? `I've analyzed your command and broken it into ${taskCount} tasks across ${agentNames.join(', ')}. Once you approve, execution will begin.`
      : `I've analyzed your command and created ${taskCount} tasks. ${agentNames.length === 1 ? agentNames[0] + ' will' : agentNames.join(' and ') + ' will'} handle execution.`,
  };
}

/**
 * Build a multi-step task decomposition based on command category.
 */
function buildTaskDecomposition(
  command: string,
  category: string,
  primaryRole: string,
  needsApproval: boolean,
): IntentAnalysis['taskDecomposition'] {
  const truncatedCmd = command.length > 80 ? command.slice(0, 77) + '...' : command;

  switch (category) {
    case 'research':
      return [
        { title: `Define research scope: ${truncatedCmd}`, description: 'Clarify objectives, key questions, and success criteria', suggestedAgentRole: 'executive_agent', priority: 'high' },
        { title: 'Gather primary data and sources', description: 'Collect relevant data from available sources', suggestedAgentRole: primaryRole, priority: 'high' },
        { title: 'Analyze findings and identify patterns', description: 'Synthesize data into actionable insights', suggestedAgentRole: 'data_analyst', priority: 'normal' },
        { title: 'Deliver research report with recommendations', description: 'Compile findings into a structured deliverable', suggestedAgentRole: primaryRole, priority: 'normal' },
      ];

    case 'write':
      return [
        { title: `Outline content structure: ${truncatedCmd}`, description: 'Create outline, identify key sections and messaging', suggestedAgentRole: 'executive_agent', priority: 'normal' },
        { title: 'Draft content', description: 'Write the full content following the outline', suggestedAgentRole: primaryRole, priority: 'high' },
        { title: 'Review and refine', description: 'Proofread, polish, and ensure quality', suggestedAgentRole: primaryRole, priority: 'normal' },
      ];

    case 'communicate':
      return [
        { title: `Draft communication: ${truncatedCmd}`, description: 'Compose the message with appropriate tone and content', suggestedAgentRole: primaryRole, priority: 'high' },
        { title: 'Review for accuracy and tone', description: 'Ensure the message is professional and accurate', suggestedAgentRole: 'executive_agent', priority: 'normal' },
      ];

    case 'report':
      return [
        { title: `Define report scope: ${truncatedCmd}`, description: 'Identify metrics, time range, and audience', suggestedAgentRole: 'executive_agent', priority: 'normal' },
        { title: 'Gather and analyze data', description: 'Collect relevant metrics and performance data', suggestedAgentRole: primaryRole, priority: 'high' },
        { title: 'Format and deliver report', description: 'Structure findings into a clear, actionable report', suggestedAgentRole: primaryRole, priority: 'normal' },
      ];

    case 'execute':
      return [
        { title: `Plan execution: ${truncatedCmd}`, description: 'Define steps, dependencies, and success criteria', suggestedAgentRole: 'executive_agent', priority: 'high' },
        { title: 'Execute implementation', description: 'Carry out the planned changes', suggestedAgentRole: primaryRole, priority: 'high' },
        { title: 'Verify results', description: 'Confirm the execution achieved the desired outcome', suggestedAgentRole: primaryRole, priority: 'normal' },
      ];

    case 'analyze':
      return [
        { title: `Define analysis framework: ${truncatedCmd}`, description: 'Identify metrics, data sources, and analytical approach', suggestedAgentRole: 'executive_agent', priority: 'normal' },
        { title: 'Collect and process data', description: 'Gather relevant data points for analysis', suggestedAgentRole: 'data_analyst', priority: 'high' },
        { title: 'Perform analysis and generate insights', description: 'Apply analytical methods and extract key findings', suggestedAgentRole: primaryRole, priority: 'high' },
        { title: 'Deliver findings with recommendations', description: 'Present results in an actionable format', suggestedAgentRole: primaryRole, priority: 'normal' },
      ];

    case 'manage':
      return [
        { title: `Assess requirements: ${truncatedCmd}`, description: 'Understand what needs to be managed and current state', suggestedAgentRole: 'executive_agent', priority: 'high' },
        { title: 'Develop action plan', description: 'Create a structured plan with timelines and responsibilities', suggestedAgentRole: primaryRole, priority: 'high' },
        { title: 'Execute and track', description: 'Implement the plan and monitor progress', suggestedAgentRole: primaryRole, priority: 'normal' },
      ];

    default: // plan
      return [
        { title: `Analyze objectives: ${truncatedCmd}`, description: 'Understand goals, constraints, and success criteria', suggestedAgentRole: 'executive_agent', priority: 'high' },
        { title: 'Develop strategic plan', description: 'Create a structured plan with phases and milestones', suggestedAgentRole: primaryRole, priority: 'high' },
        { title: 'Document plan and next steps', description: 'Compile the plan into an actionable deliverable', suggestedAgentRole: primaryRole, priority: 'normal' },
      ];
  }
}

// ─── Task Creation & Agent Selection ────────────────────────────────────────

/**
 * Create tasks from the intent analysis and assign them to agents.
 * Returns task IDs and validates each creation step.
 */
export async function createTasksFromIntent(
  db: Db,
  orgId: string,
  intent: IntentAnalysis,
): Promise<string[]> {
  // Use the delegation orchestrator for intelligent agent-to-agent delegation
  const { createDelegationPlan, executeDelegationPlan } = await import('./delegation-orchestrator.js');

  const plan = await createDelegationPlan(db, orgId, intent.taskDecomposition);
  const result = await executeDelegationPlan(db, orgId, plan, intent.taskDecomposition);

  return result.createdTaskIds;
}

/**
 * Create an approval request if the intent requires it.
 */
export async function createApprovalIfNeeded(
  db: Db,
  orgId: string,
  intent: IntentAnalysis,
): Promise<string | undefined> {
  if (!intent.requiresApproval) return undefined;

  const [created] = await db
    .insert(approvals)
    .values({
      orgId,
      agentId: null,
      action: intent.intent,
      description: intent.approvalReason ?? `Approval required for: ${intent.intent}`,
      cost: intent.estimatedCost,
      riskLevel: intent.riskLevel,
      status: 'pending',
    })
    .returning();

  return created?.id;
}

// ─── Error Recovery ─────────────────────────────────────────────────────────

/**
 * Execute a single task with error recovery (retry + fallback).
 * Returns a partial result if the task fails after retries.
 */
async function executeTaskWithRecovery(
  config: AppConfig,
  db: Db,
  orgId: string,
  taskId: string,
  trace: WorkflowTrace,
): Promise<TaskExecutionResult> {
  const MAX_TASK_RETRIES = 2;
  let lastError: string = '';

  for (let attempt = 0; attempt <= MAX_TASK_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        trace.errorRecoveryAttempts++;
        // Exponential backoff between retries
        const delay = 1000 * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
      }

      const qualityResult = await executeWithQuality(config, db, orgId, taskId, { skipQA: false, revisionCount: attempt });
      return qualityResult.executionResult;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'unknown error';

      // On last attempt, return a failed result instead of throwing
      if (attempt === MAX_TASK_RETRIES) {
        return {
          taskId,
          status: 'failed',
          result: `Task failed after ${MAX_TASK_RETRIES + 1} attempts: ${lastError}`,
          cost: 0,
          tokensUsed: 0,
          llmUsed: false,
        };
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  return {
    taskId,
    status: 'failed',
    result: 'Task failed: exceeded maximum retries',
    cost: 0,
    tokensUsed: 0,
    llmUsed: false,
  };
}

// ─── Main Execution Pipeline ────────────────────────────────────────────────

/**
 * Execute a CEO command through the full Executive Agent pipeline:
 *
 *   CEO instruction → context building → LLM intent analysis → task creation →
 *   agent selection → approval gate (if needed) → audit trail → result
 *
 * Each stage is verified before proceeding to the next.
 * Failures at any stage trigger error recovery or graceful fallback.
 */
export async function executeCommand(
  config: AppConfig,
  db: Db,
  orgId: string,
  userId: string,
  command: string,
  contextNote?: string,
  opts?: { onProgress?: EAProgressSink },
): Promise<ExecutionResult> {
  const commandId = crypto.randomUUID();
  const startTime = Date.now();
  const trace = createWorkflowTrace(commandId);
  if (opts?.onProgress) setTraceProgressSink(trace, opts.onProgress);

  // ── Step 1: Build Context ──
  const ctxStep = startStep(trace, 'context_building');
  let ctx: ExecutiveContext;
  try {
    ctx = await buildContext(db, orgId, { query: command, config });
    ctx.userId = userId;

    const ctxError = validateContext(ctx);
    if (ctxError) {
      completeStep(ctxStep, undefined, ctxError);
      trace.status = 'failed';
      return buildErrorResult(commandId, command, `Context validation failed: ${ctxError}`, trace, startTime);
    }
    completeStep(ctxStep, { agentCount: ctx.agents.length, goalCount: ctx.activeGoals.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    completeStep(ctxStep, undefined, msg);
    trace.status = 'failed';
    return buildErrorResult(commandId, command, `Failed to build context: ${msg}`, trace, startTime);
  }

  // ── Step 2: Analyze Intent ──
  const intentStep = startStep(trace, 'intent_analysis');
  let intent: IntentAnalysis;
  try {
    intent = await analyzeIntent(config, ctx, command, commandId, contextNote);

    const intentError = validateIntent(intent);
    if (intentError) {
      completeStep(intentStep, undefined, intentError);
      trace.status = 'failed';
      return buildErrorResult(commandId, command, `Intent analysis failed: ${intentError}`, trace, startTime);
    }
    completeStep(intentStep, { category: intent.category, taskCount: intent.taskDecomposition.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    completeStep(intentStep, undefined, msg);
    trace.status = 'failed';
    return buildErrorResult(commandId, command, `Intent analysis error: ${msg}`, trace, startTime);
  }

  // Collect any NVIDIA 404 diagnostics surfaced during intent analysis so
  // the command response can carry actionable warnings (e.g. scope missing).
  const nvidiaWarnings = popNvidiaDiagnostics(orgId);

  // ── Step 3: Check Credits ──
  const creditStep = startStep(trace, 'credit_check');
  const operationType = `task.${intent.category}`;
  let creditCheck;
  try {
    creditCheck = await hasEnoughCredits(db, orgId, operationType);
    completeStep(creditStep, { remaining: creditCheck.balance.remaining, required: creditCheck.required });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    completeStep(creditStep, undefined, msg);
    trace.status = 'failed';
    return buildErrorResult(commandId, command, `Credit check failed: ${msg}`, trace, startTime);
  }

  if (!creditCheck.allowed) {
    completeStep(creditStep, undefined, 'insufficient credits');
    trace.status = 'failed';
    return {
      commandId,
      intent,
      taskIds: [],
      status: 'error',
      message: `Work Credits exhausted. You have ${creditCheck.balance.remaining} credits remaining but this operation requires ${creditCheck.required}. Upgrade your plan or purchase additional credits.`,
      agentResults: [],
      creditsConsumed: 0,
      creditsRemaining: creditCheck.balance.remaining,
      workflowTrace: finalizeTrace(trace, startTime),
    };
  }

  // ── Step 3.5: Execute Tool Calls ──
  // If the LLM decided to use organizational tools (rename, create, etc.),
  // execute them here before creating tasks.
  const toolStep = startStep(trace, 'tool_execution');
  let toolResults: Array<{ tool: string; success: boolean; message: string }> = [];
  if (intent.toolCalls && intent.toolCalls.length > 0) {
    try {
      const eaTools = await import('./ea-tools.js');
      const toolCtx = { db, orgId, userId };
      for (const tc of intent.toolCalls) {
        let result;
        switch (tc.tool) {
          case 'rename_agent':
            result = await eaTools.renameAgent(toolCtx, tc.params as any);
            break;
          case 'create_agent':
            result = await eaTools.createAgent(toolCtx, tc.params as any);
            break;
          case 'create_department':
            result = await eaTools.createDepartment(toolCtx, tc.params as any);
            break;
          case 'create_team':
            result = await eaTools.createTeam(toolCtx, tc.params as any);
            break;
          case 'create_goal':
            result = await eaTools.createGoal(toolCtx, tc.params as any);
            break;
          case 'create_task':
            result = await eaTools.createTask(toolCtx, tc.params as any);
            break;
          case 'get_organization_summary':
            result = await eaTools.getOrganizationSummary(toolCtx);
            break;
          case 'rename_department':
            result = await eaTools.renameDepartment(toolCtx, tc.params as any);
            break;
          case 'rename_team':
            result = await eaTools.renameTeam(toolCtx, tc.params as any);
            break;
          case 'update_agent':
            result = await eaTools.updateAgent(toolCtx, tc.params as any);
            break;
          case 'update_goal':
            result = await eaTools.updateGoal(toolCtx, tc.params as any);
            break;
          case 'update_task':
            result = await eaTools.updateTask(toolCtx, tc.params as any);
            break;
          case 'rename_organization':
            result = await eaTools.renameOrganization(toolCtx, tc.params as any);
            break;
          case 'plan_engineering':
            result = await eaTools.planEngineering(toolCtx, tc.params as any);
            break;
          case 'recommend_org_stage':
            result = await eaTools.recommendOrgStage(toolCtx, tc.params as any);
            break;
          case 'activate_department':
            result = await eaTools.activateDepartmentFromCatalog(toolCtx, tc.params as any);
            break;
          case 'deliberate': {
            // Decision Council (§10–§17): route a significant question through
            // structured multi-agent deliberation instead of a single-model take.
            // Never executes anything — produces a recommendation (and a decision
            // record at council level); execution still requires the normal gates.
            const params = tc.params as { question?: string; context?: string };
            if (!params?.question || typeof params.question !== 'string' || params.question.trim().length < 8) {
              result = { success: false, tool: tc.tool, message: 'A question of at least 8 characters is required.' };
              break;
            }
            const { runDeliberation } = await import('./deliberation.js');
            const dr = await runDeliberation(config, db, orgId, userId, {
              question: params.question.trim().slice(0, 1000),
              context: typeof params.context === 'string' ? params.context.slice(0, 2000) : null,
            });
            result = {
              success: dr.stoppedReason === 'completed',
              tool: tc.tool,
              message:
                dr.stoppedReason !== 'completed'
                  ? `Deliberation stopped early (${dr.stoppedReason}) — no recommendation fabricated.`
                  : dr.synthesis.consensusReached
                    ? `Council recommendation (${dr.synthesis.confidence} confidence): ${dr.synthesis.recommendation.slice(0, 400)}`
                    : `No consensus. ${dr.synthesis.disagreements.length} disagreements preserved.${dr.synthesis.recommendation ? ` Chair summary: ${dr.synthesis.recommendation.slice(0, 300)}` : ''}`,
              ...(dr.decisionId ? { decisionId: dr.decisionId } : {}),
            } as any;
            break;
          }
          case 'find_best_agent':
            result = await eaTools.findBestAgent(toolCtx, tc.params as any);
            break;
          case 'analyze_workforce':
            result = await eaTools.analyzeWorkforce(toolCtx);
            break;
          case 'archive_department':
            result = await eaTools.archiveDepartment(toolCtx, tc.params as any);
            break;
          case 'archive_team':
            result = await eaTools.archiveTeam(toolCtx, tc.params as any);
            break;
          default:
            result = { success: false, tool: tc.tool, message: `Unknown tool: ${tc.tool}` };
        }
        toolResults.push({ tool: tc.tool, success: result.success, message: result.message });
      }
      completeStep(toolStep, { executed: toolResults.length, successful: toolResults.filter(r => r.success).length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      completeStep(toolStep, undefined, msg);
      // Tool failures are non-fatal — continue with task creation
    }
  } else {
    completeStep(toolStep, { skipped: true, reason: 'no_tool_calls' });
  }

  // ── Step 4: Create Tasks (skip when tool calls were the primary action) ──
  const taskStep = startStep(trace, 'task_creation');
  let taskIds: string[] = [];
  const hasToolResults = toolResults.length > 0 && toolResults.some(r => r.success);
  if (hasToolResults && intent.taskDecomposition.length === 0) {
    // Tool calls were the action — no additional tasks needed
    completeStep(taskStep, { skipped: true, reason: 'tool_calls_completed' });
  } else {
    try {
      taskIds = await createTasksFromIntent(db, orgId, intent);
      completeStep(taskStep, { created: taskIds.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      completeStep(taskStep, undefined, msg);
      trace.status = 'failed';
      return buildErrorResult(commandId, command, `Task creation failed: ${msg}`, trace, startTime);
    }
  }

  // ── Step 5: Create Approval if Needed ──
  const approvalStep = startStep(trace, 'approval_gate');
  let approvalId: string | undefined;
  try {
    approvalId = await createApprovalIfNeeded(db, orgId, intent);
    completeStep(approvalStep, { approvalId: approvalId ?? 'none' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    completeStep(approvalStep, undefined, msg);
    // Approval creation failure is non-fatal — continue without approval
  }

  // ── Step 6: Execute Tasks (with error recovery) ──
  const execStep = startStep(trace, 'task_execution');
  const taskExecutionResults: TaskExecutionResult[] = [];

  if (!intent.requiresApproval && taskIds.length > 0) {
    for (const taskId of taskIds) {
      const result = await executeTaskWithRecovery(config, db, orgId, taskId, trace);
      taskExecutionResults.push(result);
    }
    completeStep(execStep, {
      completed: taskExecutionResults.filter(r => r.status === 'completed').length,
      failed: taskExecutionResults.filter(r => r.status === 'failed').length,
      total: taskExecutionResults.length,
    });
  } else {
    completeStep(execStep, { skipped: true, reason: intent.requiresApproval ? 'awaiting_approval' : 'no_tasks' });
  }

  // ── Step 7: Consume Credits ──
  const consumeStep = startStep(trace, 'credit_consumption');
  let creditsConsumed = 0;
  let creditsRemaining = creditCheck.balance.remaining;
  try {
    const creditResult = await consumeCredits(
      db,
      orgId,
      operationType,
      `Command: ${command.slice(0, 100)}`,
      taskIds[0],
      'task',
    );
    creditsConsumed = creditResult.consumed;
    creditsRemaining = creditResult.balance.remaining;
    completeStep(consumeStep, { consumed: creditsConsumed, remaining: creditsRemaining });

    // Broadcast credit consumption
    broadcastToOrg(orgId, { type: 'credits.consumed', amount: creditResult.consumed, remaining: creditResult.balance.remaining, operationType });
  } catch (error) {
    if (error instanceof CreditExhaustedError) {
      completeStep(consumeStep, undefined, 'credits exhausted during consumption');
      trace.status = 'failed';
      return {
        commandId,
        intent,
        taskIds,
        approvalId,
        status: 'error',
        message: `Work Credits exhausted. ${error.message}`,
        agentResults: [],
        creditsConsumed: 0,
        creditsRemaining: error.remaining,
        workflowTrace: finalizeTrace(trace, startTime),
      };
    }
    const msg = error instanceof Error ? error.message : 'unknown error';
    completeStep(consumeStep, undefined, msg);
    // Credit consumption failure is non-fatal — tasks were already executed
  }

  // ── Step 8: Audit Trail ──
  const auditStep = startStep(trace, 'audit_trail');
  try {
    await appendAudit(db, {
      orgId,
      actorType: 'user',
      actorId: userId,
      action: 'command.received',
      tool: 'executive_agent',
      inputRef: command.slice(0, 500),
      resultRef: JSON.stringify({ intent: intent.category, taskCount: taskIds.length }),
      approvalId: approvalId ?? null,
      cost: creditsConsumed,
      outcome: 'success',
    });

    // Also store detailed workflow trace as audit
    await appendAudit(db, {
      orgId,
      actorType: 'system',
      action: 'command.workflow_trace',
      tool: 'executive_agent',
      inputRef: commandId,
      resultRef: JSON.stringify({
        steps: trace.steps.map(s => ({ name: s.name, status: s.status, durationMs: s.durationMs })),
        totalDurationMs: Date.now() - startTime,
        errorRecoveryAttempts: trace.errorRecoveryAttempts,
      }),
      cost: creditsConsumed,
      outcome: 'success',
    });
    completeStep(auditStep, { recorded: true });
  } catch {
    completeStep(auditStep, undefined, 'audit write failed (non-fatal)');
  }

  // ── Step 9: Build Response ──
  const completedCount = taskExecutionResults.filter(r => r.status === 'completed').length;
  const failedCount = taskExecutionResults.filter(r => r.status === 'failed').length;
  const totalCount = taskExecutionResults.length;

  let status: ExecutionResult['status'];
  if (intent.requiresApproval) {
    status = 'awaiting_approval';
  } else if (totalCount > 0 && completedCount === totalCount) {
    status = 'completed';
  } else if (totalCount > 0 && failedCount === totalCount) {
    status = 'error';
  } else {
    status = 'completed'; // partial success
  }

  let message = intent.response;

  // ── Enrich response with tool execution results ──
  if (toolResults.length > 0) {
    const toolParts: string[] = [];
    for (const tr of toolResults) {
      if (tr.success) {
        toolParts.push(`✅ **${tr.tool.replace(/_/g, ' ')}**: ${tr.message}`);
      } else {
        toolParts.push(`❌ **${tr.tool.replace(/_/g, ' ')}**: ${tr.message}`);
      }
    }
    if (toolParts.length > 0) {
      message += `\n\n${toolParts.join('\n')}`;
    }
  }

  if (totalCount > 0) {
    const totalCost = taskExecutionResults.reduce((sum, r) => sum + r.cost, 0);
    const parts: string[] = [];
    parts.push(`**Execution:** ${completedCount}/${totalCount} tasks completed.`);
    if (failedCount > 0) {
      parts.push(`${failedCount} task${failedCount > 1 ? 's' : ''} failed.`);
    }
    if (totalCost > 0) {
      parts.push(`${totalCost} credits consumed.`);
    }
    message += `\n\n${parts.join(' ')}`;
  }

  // ── Step 10: Store Memory ──
  const memoryParts = [
    `CEO command: "${command}"`,
    `Category: ${intent.category}`,
    `Tasks created: ${taskIds.length}`,
    `Completed: ${completedCount}`,
    failedCount > 0 ? `Failed: ${failedCount}` : null,
    `Credits consumed: ${creditsConsumed}`,
    `Duration: ${Date.now() - startTime}ms`,
  ].filter(Boolean).join(' | ');

  try {
    await db.insert(companyMemory).values({
      orgId,
      category: 'context',
      content: memoryParts,
      source: 'executive_agent',
      agentId: null,
      taskId: taskIds[0] ?? null,
      importance: failedCount > 0 ? 3 : 5,
    });
  } catch {
    // Memory storage failure is non-fatal
  }

  // ── Step 11: Build Agent Results ──
  const agentResults = intent.taskDecomposition.map((task, i) => {
    const executionResult = taskExecutionResults.find(r => r.taskId === taskIds[i]);
    return {
      agentName: task.suggestedAgentRole,
      taskTitle: task.title,
      status: executionResult?.status ?? (taskIds[i] ? 'pending' : 'failed') as 'pending' | 'completed' | 'failed',
      result: executionResult?.result,
      llmUsed: executionResult?.llmUsed ?? false,
    };
  });

  // ── Step 12: Finalize ──
  const workflowTrace = finalizeTrace(trace, startTime);

  // Get LLM trace summary for this command
  try {
    workflowTrace.llmTraceSummary = getTraceSummary(orgId);
  } catch {
    // Trace summary is optional
  }

  // ── Step 13: Get delegation summary ──
  let delegationSummary = null;
  try {
    const { createDelegationPlan } = await import('./delegation-orchestrator.js');
    const delegationPlan = await createDelegationPlan(db, orgId, intent.taskDecomposition);
    delegationSummary = {
      directAssignments: delegationPlan.directAssignments.length,
      delegations: delegationPlan.delegations.length,
      unassigned: delegationPlan.unassigned.length,
      assignedAgents: [...new Set(delegationPlan.directAssignments.map(a => a.targetAgentName))],
    };
  } catch {
    // Delegation summary is optional
  }

  return {
    commandId,
    intent,
    taskIds,
    approvalId,
    status,
    message,
    agentResults,
    creditsConsumed,
    creditsRemaining,
    // Which LLM provider actually ran this command
    llmProvider: getServedProvider(orgId, 'intent_analysis', commandId) ?? 'none',
    // Surface any NVIDIA scope/access warnings
    warnings: nvidiaWarnings.length > 0 ? nvidiaWarnings : undefined,
    workflowTrace,
    // Delegation summary — shows which agents were assigned
    delegationSummary,
    // Tool execution results
    toolResults: toolResults.length > 0 ? toolResults : undefined,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function finalizeTrace(trace: WorkflowTrace, startTime: number): WorkflowTrace {
  trace.totalDurationMs = Date.now() - startTime;
  const hasFailure = trace.steps.some(s => s.status === 'failed');
  const hasSuccess = trace.steps.some(s => s.status === 'completed');
  trace.status = hasFailure && hasSuccess ? 'partial' : hasFailure ? 'failed' : 'completed';
  return trace;
}

function buildErrorResult(
  commandId: string,
  command: string,
  errorMessage: string,
  trace: WorkflowTrace,
  startTime: number,
): ExecutionResult {
  return {
    commandId,
    intent: {
      intent: command,
      category: 'unknown',
      requiresApproval: false,
      riskLevel: 'low',
      estimatedCost: 0,
      taskDecomposition: [],
      response: errorMessage,
    },
    taskIds: [],
    status: 'error',
    message: errorMessage,
    agentResults: [],
    creditsConsumed: 0,
    creditsRemaining: 0,
    llmProvider: 'none',
    workflowTrace: finalizeTrace(trace, startTime),
  };
}

/**
 * Get recent command history for the dashboard.
 */
export async function getRecentActivity(
  db: Db,
  orgId: string,
  limit: number = 10,
): Promise<Array<{
  id: number;
  type: string;
  summary: string;
  reason: string | null;
  cost: number;
  occurredAt: Date;
}>> {
  const events = await db
    .select({
      id: activityEvents.id,
      type: activityEvents.type,
      summary: activityEvents.summary,
      reason: activityEvents.reason,
      cost: activityEvents.cost,
      occurredAt: activityEvents.occurredAt,
    })
    .from(activityEvents)
    .where(eq(activityEvents.orgId, orgId))
    .orderBy(desc(activityEvents.occurredAt))
    .limit(limit);

  return events;
}
