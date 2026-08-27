import { eq, and, desc } from 'drizzle-orm';
import { agents, goals, tasks, approvals, activityEvents, companyMemory, type Db } from '@orq8/db';
import { chatCompletion, chatJson, type ChatMessage } from './llm.js';
import { appendAudit } from './audit.js';
import { consumeCredits, hasEnoughCredits, CreditExhaustedError } from './credits.js';
import { executeTask, type TaskExecutionResult } from './task-executor.js';
import type { AppConfig } from '@orq8/core';
import type { Agent } from '@orq8/db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExecutiveContext {
  orgId: string;
  userId: string;
  orgName?: string;
  agents: Agent[];
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
  }>;
  creditsConsumed?: number;
  creditsRemaining?: number;
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

// ─── Context Building ───────────────────────────────────────────────────────

/**
 * Build the full Executive Agent context from the database.
 * This gives the LLM awareness of the organization's current state.
 */
export async function buildContext(db: Db, orgId: string): Promise<ExecutiveContext> {
  const [orgAgents, orgGoals, orgTasks, orgApprovals, orgMemory] = await Promise.all([
    db.select().from(agents).where(eq(agents.orgId, orgId)),
    db.select().from(goals).where(eq(goals.orgId, orgId)).orderBy(desc(goals.createdAt)).limit(10),
    db.select().from(tasks).where(eq(tasks.orgId, orgId)).orderBy(desc(tasks.createdAt)).limit(20),
    db.select({ id: approvals.id }).from(approvals).where(
      and(eq(approvals.orgId, orgId), eq(approvals.status, 'pending')),
    ),
    db.select().from(companyMemory).where(eq(companyMemory.orgId, orgId)).orderBy(desc(companyMemory.createdAt)).limit(10),
  ]);

  return {
    orgId,
    userId: '',
    agents: orgAgents,
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

  return `## ORGANIZATION CONTEXT

### AI Employees
${agentList}

### Active Goals
${goalList}

### Active Tasks
${taskList}

### Pending Approvals: ${ctx.pendingApprovals}

### Company Memory
${memoryList}

### Instructions
You have full awareness of the organization's current state.
Use this context to make informed decisions about task decomposition and agent selection.
If no suitable agent exists, recommend hiring one.
Always be specific about which agent should handle each task.`;
}

// ─── Intent Analysis ────────────────────────────────────────────────────────

/**
 * Analyze a CEO command using the LLM.
 * Falls back to a basic rule-based analysis if LLM is unavailable.
 */
export async function analyzeIntent(
  config: AppConfig,
  ctx: ExecutiveContext,
  command: string,
): Promise<IntentAnalysis> {
  const contextPrompt = buildContextPrompt(ctx);
  const fullSystemPrompt = `${EXECUTIVE_AGENT_SYSTEM_PROMPT}\n\n${contextPrompt}`;

  // Try LLM first
  const llmResult = await chatJson<IntentAnalysis>(config, fullSystemPrompt, command, {
    temperature: 0.3,
    max_tokens: 1024,
  });

  if (llmResult && llmResult.intent && llmResult.category) {
    return llmResult;
  }

  // Fallback: rule-based analysis (when LLM is unavailable)
  return fallbackAnalysis(command, ctx);
}

/**
 * Rule-based fallback analysis when the LLM is not available.
 */
function fallbackAnalysis(command: string, ctx: ExecutiveContext): IntentAnalysis {
  const lower = command.toLowerCase();

  // Determine category
  let category: IntentAnalysis['category'] = 'plan';
  if (lower.includes('research') || lower.includes('analyze') || lower.includes('investigate')) category = 'research';
  else if (lower.includes('write') || lower.includes('draft') || lower.includes('create content')) category = 'write';
  else if (lower.includes('send') || lower.includes('email') || lower.includes('notify') || lower.includes('publish')) category = 'communicate';
  else if (lower.includes('report') || lower.includes('summary')) category = 'report';
  else if (lower.includes('deploy') || lower.includes('release') || lower.includes('execute')) category = 'execute';
  else if (lower.includes('manage') || lower.includes('organize') || lower.includes('hire')) category = 'manage';
  else if (lower.includes('plan') || lower.includes('strategy')) category = 'plan';

  // Determine approval requirements
  const needsApproval = ['send', 'publish', 'deploy', 'buy', 'purchase', 'delete', 'remove', 'hire', 'fire', 'email'].some(w => lower.includes(w));

  // Determine best agent
  const agentRoleMap: Record<string, string> = {
    research: 'market_researcher',
    write: 'content_writer',
    communicate: 'communications_agent',
    execute: 'software_engineer',
    report: 'data_analyst',
    manage: 'operations_manager',
    plan: 'executive_agent',
    analyze: 'data_analyst',
  };

  const suggestedRole = agentRoleMap[category] ?? 'executive_agent';

  // Check if an agent with this role exists
  const matchingAgent = ctx.agents.find(a => a.role === suggestedRole && a.status === 'active');
  const agentName = matchingAgent?.name ?? 'Executive Agent';

  // Decompose into tasks
  const taskDecomposition = [{
    title: command.length > 100 ? command.slice(0, 97) + '...' : command,
    description: command,
    suggestedAgentRole: suggestedRole,
    priority: needsApproval ? 'high' as const : 'normal' as const,
  }];

  return {
    intent: command,
    category,
    requiresApproval: needsApproval,
    approvalReason: needsApproval
      ? `This action involves ${category === 'communicate' ? 'external communications' : category === 'execute' ? 'production changes' : 'significant actions'} that require your approval.`
      : undefined,
    riskLevel: needsApproval ? 'medium' : 'low',
    estimatedCost: 0,
    suggestedAgentRole: suggestedRole,
    taskDecomposition,
    response: needsApproval
      ? `I've analyzed your command and created an approval request. Once you approve, ${agentName} will handle: "${command}"`
      : `I've analyzed your command. ${agentName} will handle: "${command}"`,
  };
}

// ─── Task Creation & Agent Selection ────────────────────────────────────────

/**
 * Create tasks from the intent analysis and assign them to agents.
 */
export async function createTasksFromIntent(
  db: Db,
  orgId: string,
  intent: IntentAnalysis,
): Promise<string[]> {
  const taskIds: string[] = [];

  for (const task of intent.taskDecomposition) {
    // Find the best matching agent
    const matchingAgents = await db
      .select()
      .from(agents)
      .where(and(
        eq(agents.orgId, orgId),
        eq(agents.role, task.suggestedAgentRole),
        eq(agents.status, 'active'),
      ))
      .limit(1);

    const agentId = matchingAgents[0]?.id ?? null;

    const [created] = await db
      .insert(tasks)
      .values({
        orgId,
        title: task.title,
        description: task.description,
        agentId,
        status: 'pending',
        cost: 0,
      })
      .returning();

    if (created) {
      taskIds.push(created.id);

      // Record activity event
      await db.insert(activityEvents).values({
        orgId,
        agentId,
        taskId: created.id,
        type: 'planned',
        summary: `Task created: ${task.title}`,
        reason: `Executive Agent decomposed command into actionable task`,
        cost: 0,
        department: null,
      });
    }
  }

  return taskIds;
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

// ─── Main Execution Pipeline ────────────────────────────────────────────────

/**
 * Execute a CEO command through the full Executive Agent pipeline:
 *
 *   CEO instruction → context building → LLM intent analysis → task creation →
 *   agent selection → approval gate (if needed) → audit trail → result
 */
export async function executeCommand(
  config: AppConfig,
  db: Db,
  orgId: string,
  userId: string,
  command: string,
): Promise<ExecutionResult> {
  const commandId = crypto.randomUUID();

  // 1. Build context
  const ctx = await buildContext(db, orgId);
  ctx.userId = userId;

  // 2. Analyze intent via LLM
  const intent = await analyzeIntent(config, ctx, command);

  // 3. Check credits before creating tasks
  const operationType = `task.${intent.category}`;
  const creditCheck = await hasEnoughCredits(db, orgId, operationType);

  if (!creditCheck.allowed) {
    return {
      commandId,
      intent,
      taskIds: [],
      status: 'error' as const,
      message: `Work Credits exhausted. You have ${creditCheck.balance.remaining} credits remaining but this operation requires ${creditCheck.required}. Upgrade your plan or purchase additional credits.`,
      agentResults: [],
      creditsConsumed: 0,
      creditsRemaining: creditCheck.balance.remaining,
    };
  }

  // 4. Create tasks
  const taskIds = await createTasksFromIntent(db, orgId, intent);

  // 5. Create approval if needed
  const approvalId = await createApprovalIfNeeded(db, orgId, intent);

  // 6. Execute tasks immediately if no approval needed
  const taskExecutionResults: TaskExecutionResult[] = [];
  if (!intent.requiresApproval && taskIds.length > 0) {
    for (const taskId of taskIds) {
      try {
        const result = await executeTask(config, db, orgId, taskId);
        taskExecutionResults.push(result);
      } catch {
        taskExecutionResults.push({
          taskId,
          status: 'failed',
          result: 'Execution failed',
          cost: 0,
          tokensUsed: 0,
        });
      }
    }
  }

  // 7. Consume credits for task execution
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
  } catch (error) {
    if (error instanceof CreditExhaustedError) {
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
      };
    }
    throw error;
  }

  // 8. Audit the command
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

  // 9. Build agent results from actual execution
  const agentResults = intent.taskDecomposition.map((task, i) => {
    const executionResult = taskExecutionResults.find(r => r.taskId === taskIds[i]);
    return {
      agentName: task.suggestedAgentRole,
      taskTitle: task.title,
      status: executionResult?.status ?? (taskIds[i] ? 'pending' : 'failed') as 'pending' | 'completed' | 'failed',
      result: executionResult?.result,
    };
  });

  // 10. Determine status
  const allCompleted = taskExecutionResults.every(r => r.status === 'completed');
  const anyFailed = taskExecutionResults.some(r => r.status === 'failed');

  let status: ExecutionResult['status'];
  if (intent.requiresApproval) {
    status = 'awaiting_approval';
  } else if (anyFailed) {
    status = 'error';
  } else if (allCompleted || taskExecutionResults.length === 0) {
    status = 'completed';
  } else {
    status = 'completed';
  }

  // 11. Build response message
  let message = intent.response;
  if (taskExecutionResults.length > 0) {
    const completedCount = taskExecutionResults.filter(r => r.status === 'completed').length;
    const totalCost = taskExecutionResults.reduce((sum, r) => sum + r.cost, 0);
    message += `\n\n**Execution:** ${completedCount}/${taskExecutionResults.length} tasks completed. ${totalCost > 0 ? `${totalCost} credits consumed.` : ''}`;
  }

  // 12. Store the command result as company memory
  await db.insert(companyMemory).values({
    orgId,
    category: 'context',
    content: `CEO command: "${command}" — Intent: ${intent.intent}, Category: ${intent.category}, Tasks: ${taskIds.length}, Executed: ${taskExecutionResults.length}, Credits: ${creditsConsumed}`,
    source: 'executive_agent',
    agentId: null,
    taskId: taskIds[0] ?? null,
    importance: 5,
  });

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
