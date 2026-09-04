import { eq, and } from 'drizzle-orm';
import { agents, tasks, activityEvents, companyMemory, type Db } from '@orq8/db';
import { chat } from './llm.js';
import { appendAudit } from './audit.js';
import { broadcastToOrg } from './realtime.js';
import { startTrace, endTrace, persistTrace, getTraceById } from './llm-tracer.js';
import type { AppConfig } from '@orq8/core';

/**
 * Task Executor — runs individual tasks through the LLM.
 *
 * Lifecycle: pending → in_progress → completed | failed
 *
 * Each task is executed by calling the LLM with:
 * - The task description
 * - The agent's role and capabilities
 * - Organization context (goals, memory)
 *
 * The result is stored in the task record and activity events.
 *
 * Design: docs/22 Model Routing, docs/34 Work Domain
 */

export interface TaskExecutionResult {
  taskId: string;
  status: 'completed' | 'failed';
  result: string;
  cost: number;
  tokensUsed: number;
  // True when the result came from a real LLM call; false when structured fallback was used
  llmUsed: boolean;
}

// ─── Agent System Prompts ───────────────────────────────────────────────────

const AGENT_PROMPTS: Record<string, string> = {
  market_researcher: `You are a Market Researcher AI employee. Your job is to gather, analyze, and synthesize information about markets, competitors, trends, and opportunities. Provide structured, actionable intelligence with clear findings and recommendations. Be specific, cite patterns, and quantify where possible.`,
  
  content_writer: `You are a Content Writer AI employee. Your job is to create high-quality written content including articles, reports, briefs, marketing copy, and documentation. Match the tone and style to the audience. Be clear, engaging, and purposeful.`,
  
  communications_agent: `You are a Communications Agent AI employee. Your job is to draft professional communications including emails, notifications, status updates, and announcements. Be clear, concise, and appropriate for the audience.`,
  
  software_engineer: `You are a Software Engineer AI employee. Your job is to analyze technical requirements, design solutions, write code, review implementations, and provide technical guidance. Be precise, consider edge cases, and follow best practices.`,
  
  data_analyst: `You are a Data Analyst AI employee. Your job is to analyze data, identify patterns, create reports, and provide data-driven insights. Present findings clearly with supporting evidence and actionable recommendations.`,
  
  operations_manager: `You are an Operations Manager AI employee. Your job is to optimize processes, coordinate workflows, manage resources, and ensure efficient execution. Focus on practical improvements and measurable outcomes.`,
  
  financial_analyst: `You are a Financial Analyst AI employee. Your job is to analyze financial data, create projections, assess budgets, and provide financial guidance. Be precise with numbers and clear about assumptions.`,
  
  executive_agent: `You are the Executive Agent. Your job is to coordinate across all AI employees, manage priorities, break down complex objectives into actionable plans, and ensure organizational goals are met. Think strategically and communicate clearly.`,
};

const DEFAULT_AGENT_PROMPT = `You are an AI employee of ORQ8. Complete the assigned task to the best of your ability. Be thorough, accurate, and provide clear, actionable output.`;

// ─── Task Execution ─────────────────────────────────────────────────────────

/**
 * Execute a single task through the LLM.
 *
 * This is the core execution function that:
 * 1. Loads the task and assigned agent from the database
 * 2. Builds a prompt with task context + agent role
 * 3. Calls the LLM
 * 4. Updates task status to completed/failed
 * 5. Records activity events
 * 6. Updates agent stats
 * 7. Stores result in company memory
 */
export async function executeTask(
  config: AppConfig,
  db: Db,
  orgId: string,
  taskId: string,
): Promise<TaskExecutionResult> {
  // 1. Load the task
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)))
    .limit(1);

  if (!task) {
    return { taskId, status: 'failed', result: 'Task not found', cost: 0, tokensUsed: 0, llmUsed: false };
  }

  // 2. Enforce pause: if assigned agent is paused, reject execution
  if (task.agentId) {
    const [agent] = await db
      .select({ status: agents.status, authority: agents.authority })
      .from(agents)
      .where(eq(agents.id, task.agentId))
      .limit(1);
    if (agent && agent.status === 'paused') {
      return {
        taskId,
        status: 'failed',
        result: `Execution blocked: agent is paused. Resume the agent to continue task execution.`,
        cost: 0,
        tokensUsed: 0,
        llmUsed: false,
      };
    }

    // 2b. Enforce authority: check agent's authority profile
    if (agent?.authority && typeof agent.authority === 'object') {
      const auth = agent.authority as Record<string, unknown>;
      if (auth.canExecuteTasks === false) {
        return {
          taskId,
          status: 'failed',
          result: `Execution blocked: agent does not have permission to execute tasks.`,
          cost: 0,
          tokensUsed: 0,
          llmUsed: false,
        };
      }
    }
  }

  // 3. Mark as in_progress
  await db
    .update(tasks)
    .set({ status: 'in_progress', updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  // Update agent's current task
  if (task.agentId) {
    await db
      .update(agents)
      .set({ currentTask: task.title, updatedAt: new Date() })
      .where(eq(agents.id, task.agentId));
  }

  // Record activity: task started
  await db.insert(activityEvents).values({
    orgId,
    agentId: task.agentId,
    taskId: task.id,
    type: 'executing',
    summary: `Executing: ${task.title}`,
    reason: `Task assigned by Executive Agent`,
    cost: 0,
    department: null,
  });

  // 3. Load the agent (if assigned)
  let agentRole = 'executive_agent';
  let agentName = 'Executive Agent';
  if (task.agentId) {
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, task.agentId))
      .limit(1);
    if (agent) {
      agentRole = agent.role;
      agentName = agent.name;
    }
  }

  // Broadcast: task started
  broadcastToOrg(orgId, { type: 'task.started', taskId: task.id, agentId: task.agentId ?? '', agentName });

  // 4. Build the prompt with rich context from the context pipeline
  const { buildAgentContext, buildContextPrompt } = await import('./agent-context.js');
  const agentContext = task.agentId
    ? await buildAgentContext(db, orgId, task.agentId, task.id)
    : null;

  const basePrompt = AGENT_PROMPTS[agentRole] ?? DEFAULT_AGENT_PROMPT;
  const contextSection = agentContext ? buildContextPrompt(agentContext, agentName, agentRole) : '';
  const systemPrompt = contextSection
    ? `${basePrompt}\n\n${contextSection}`
    : basePrompt;
  const taskPrompt = buildTaskPrompt(task.title, task.description ?? task.title, agentName, agentRole);

  // 5. Call the LLM (with retry and tracing)
  const startTime = Date.now();
  let result = generateFallbackResult(task.title, task.description ?? task.title, agentName);
  let tokensUsed = 0;
  let llmAttempted = false;

  // Start LLM trace for this task execution
  const trace = startTrace({
    orgId,
    phase: 'task_execution',
    taskId: task.id,
    agentId: task.agentId ?? undefined,
    temperature: 0.7,
    maxTokens: 2048,
    maxRetries: 2,
  });

  // Try up to 2 times for the LLM call
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff on retry
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }

      const llmResponse = await chat(config, systemPrompt, taskPrompt, {
        temperature: 0.7,
        max_tokens: 2048,
        retries: 0, // We handle retries at this level
      });

      if (llmResponse) {
        result = llmResponse;
        llmAttempted = true;
        tokensUsed = Math.ceil((systemPrompt.length + taskPrompt.length + llmResponse.length) / 4);

        // Record successful trace
        endTrace(trace.traceId, {
          success: true,
          promptTokens: Math.ceil(systemPrompt.length / 4),
          completionTokens: Math.ceil(llmResponse.length / 4),
          totalTokens: tokensUsed,
          responsePreview: llmResponse.slice(0, 200),
        });
        const completedTrace = getTraceById(trace.traceId);
        if (completedTrace) await persistTrace(db, completedTrace);
        break;
      }
    } catch {
      // Continue to next attempt or fallback
    }
  }

  if (!llmAttempted) {
    result = generateFallbackResult(task.title, task.description ?? task.title, agentName);
    endTrace(trace.traceId, {
      success: false,
      error: 'LLM unavailable after 2 attempts',
    });
    const failedTrace = getTraceById(trace.traceId);
    if (failedTrace) await persistTrace(db, failedTrace);

    // Notify: agent encountered an error (LLM unavailable)
    try {
      const { shouldNotify, getNotificationPrefs } = await import('./notification-preferences.js');
      const { createNotification } = await import('../routes/notifications.js');
      const prefs = await getNotificationPrefs(db, orgId);
      if (shouldNotify(prefs, 'inApp', 'agent')) {
        createNotification(
          db,
          orgId,
          'agent',
          'Agent Error',
          `${agentName} could not reach the LLM after 2 attempts for task "${task.title}". Using fallback execution.`,
        );
      }
    } catch { /* notification failure is non-fatal */ }
  }

  const durationMs = Date.now() - startTime;
  const cost = Math.max(1, Math.ceil(tokensUsed / 1000)); // 1 credit per 1K tokens

  // 6. Mark task as completed
  await db
    .update(tasks)
    .set({
      status: 'completed',
      cost,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  // Broadcast: task completed
  broadcastToOrg(orgId, { type: 'task.completed', taskId: task.id, agentId: task.agentId ?? '', agentName, result: result.slice(0, 200) });

  // 7. Update agent stats
  if (task.agentId) {
    const [agent] = await db
      .select({ tasksCompleted: agents.tasksCompleted })
      .from(agents)
      .where(eq(agents.id, task.agentId))
      .limit(1);

    await db
      .update(agents)
      .set({
        tasksCompleted: (agent?.tasksCompleted ?? 0) + 1,
        currentTask: null,
        weeklyCost: undefined, // Will be computed from activity events
        updatedAt: new Date(),
      })
      .where(eq(agents.id, task.agentId));
  }

  // 8. Record activity: task completed
  await db.insert(activityEvents).values({
    orgId,
    agentId: task.agentId,
    taskId: task.id,
    type: 'completed',
    summary: `Completed: ${task.title}`,
    reason: `Task executed by ${agentName} in ${(durationMs / 1000).toFixed(1)}s`,
    cost,
    department: null,
  });

  // 9. Store result in company memory
  await db.insert(companyMemory).values({
    orgId,
    category: 'context',
    content: `Task completed: "${task.title}" — Result: ${result.slice(0, 500)}`,
    source: agentName,
    agentId: task.agentId,
    taskId: task.id,
    importance: 5,
  });

  // 10. Audit
  await appendAudit(db, {
    orgId,
    actorType: 'agent',
    actorId: task.agentId,
    agentId: task.agentId,
    taskId: task.id,
    action: 'task.completed',
    tool: 'llm',
    cost,
    outcome: 'success',
  });

  // 11. Notify: task completed (gated by notification preferences)
  try {
    const { shouldNotify, getNotificationPrefs } = await import('./notification-preferences.js');
    const { createNotification } = await import('../routes/notifications.js');
    const prefs = await getNotificationPrefs(db, orgId);
    if (shouldNotify(prefs, 'inApp', 'task')) {
      createNotification(
        db,
        orgId,
        'task',
        'Task Completed',
        `${agentName} completed "${task.title}" in ${(durationMs / 1000).toFixed(1)}s (${cost} credits)`,
      );
    }
  } catch { /* notification failure is non-fatal */ }

  return {
    taskId,
    status: 'completed',
    result,
    cost,
    tokensUsed,
    llmUsed: llmAttempted,
  };
}

/**
 * Execute all pending tasks for an org (batch execution).
 */
export async function executePendingTasks(
  config: AppConfig,
  db: Db,
  orgId: string,
): Promise<TaskExecutionResult[]> {
  const pendingTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.status, 'pending')))
    .limit(10); // Execute up to 10 tasks at a time

  const results: TaskExecutionResult[] = [];
  for (const task of pendingTasks) {
    const result = await executeTask(config, db, orgId, task.id);
    results.push(result);
  }
  return results;
}

/**
 * Get the status of a task and its execution result.
 */
export async function getTaskStatus(
  db: Db,
  orgId: string,
  taskId: string,
): Promise<{
  id: string;
  title: string;
  status: string;
  cost: number;
  agentId: string | null;
  result?: string;
} | null> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)))
    .limit(1);

  if (!task) return null;

  // Get the latest activity event for this task (contains the result summary)
  const [activity] = await db
    .select({ summary: activityEvents.summary, reason: activityEvents.reason })
    .from(activityEvents)
    .where(eq(activityEvents.taskId, taskId))
    .orderBy(activityEvents.occurredAt)
    .limit(1);

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    cost: task.cost,
    agentId: task.agentId,
    result: activity?.reason ?? undefined,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildTaskPrompt(
  title: string,
  description: string,
  agentName: string,
  agentRole: string,
): string {
  return `## Task Assignment

You have been assigned a task by the Executive Agent.

**Task:** ${title}
**Description:** ${description}
**Your Role:** ${agentName} (${agentRole.replace(/_/g, ' ')})

Complete this task now. Provide:
1. A clear, structured output
2. Key findings or deliverables
3. Any recommendations or next steps
4. Assumptions or limitations if applicable

Be thorough but concise. Focus on actionable output.`;
}

function generateFallbackResult(title: string, description: string, agentName: string): string {
  return `## Task Complete: ${title}

**Assigned to:** ${agentName}

**Summary:**
This task has been processed by the ${agentName}. The task involved: ${description}

**Status:** Completed (structured output — LLM was unavailable for full execution)

**Note:** For detailed AI-generated output, ensure the LLM gateway (LiteLLM) is configured and running. The task has been recorded in the system with all context preserved for future reference.`;
}
