import { eq, and, desc, sql } from 'drizzle-orm';
import { agents, departments, teams, goals, tasks, approvals, activityEvents, companyMemory, type Db } from '@orq8/db';
import { chatJson, getServedProvider, popNvidiaDiagnostics, type NVIDIAFunctionNotFoundDiagnostic } from './llm.js';
import { appendAudit } from './audit.js';
import { consumeCredits, hasEnoughCredits, CreditExhaustedError } from './credits.js';
import { executeTask, type TaskExecutionResult } from './task-executor.js';
import { executeWithQuality, type QualityPipelineResult } from './quality-pipeline.js';
import { broadcastToOrg } from './realtime.js';
import { getTraceSummary, type LLMTraceSummary } from './llm-tracer.js';
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
  if (!intent.taskDecomposition || intent.taskDecomposition.length === 0) return 'No tasks decomposed from command';
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

export async function buildContext(db: Db, orgId: string): Promise<ExecutiveContext> {
  const orgAgents = await db.select().from(agents).where(eq(agents.orgId, orgId));
  const [orgGoals, orgTasks, orgApprovals, orgMemory, orgStructure] = await Promise.all([
    db.select().from(goals).where(eq(goals.orgId, orgId)).orderBy(desc(goals.createdAt)).limit(10),
    db.select().from(tasks).where(eq(tasks.orgId, orgId)).orderBy(desc(tasks.createdAt)).limit(20),
    db.select({ id: approvals.id }).from(approvals).where(
      and(eq(approvals.orgId, orgId), eq(approvals.status, 'pending')),
    ),
    db.select().from(companyMemory).where(eq(companyMemory.orgId, orgId)).orderBy(desc(companyMemory.createdAt)).limit(10),
    buildOrgStructure(db, orgId, orgAgents),
  ]);

  return {
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
  };
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

  return `## ORGANIZATION CONTEXT

### AI Employees
${agentList}

${structureBlock}

### Active Goals
${goalList}

### Active Tasks
${taskList}

### Pending Approvals: ${ctx.pendingApprovals}

### Company Memory
${memoryList}

### Instructions
You have full awareness of the organization's current state, including its departments, teams, team owners, members and where work is blocked or overdue.
Use this context to make informed decisions about task decomposition and agent selection.
When the founder asks who owns work or who is responsible, answer from the organization structure above.
If no suitable agent exists, recommend hiring one.
Always be specific about which agent should handle each task.`;
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
): Promise<ExecutionResult> {
  const commandId = crypto.randomUUID();
  const startTime = Date.now();
  const trace = createWorkflowTrace(commandId);

  // ── Step 1: Build Context ──
  const ctxStep = startStep(trace, 'context_building');
  let ctx: ExecutiveContext;
  try {
    ctx = await buildContext(db, orgId);
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

  // ── Step 4: Create Tasks ──
  const taskStep = startStep(trace, 'task_creation');
  let taskIds: string[];
  try {
    taskIds = await createTasksFromIntent(db, orgId, intent);
    completeStep(taskStep, { created: taskIds.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    completeStep(taskStep, undefined, msg);
    trace.status = 'failed';
    return buildErrorResult(commandId, command, `Task creation failed: ${msg}`, trace, startTime);
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
