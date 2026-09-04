/**
 * ORQ8 Tool/Action Architecture
 *
 * Every capability available to AI employees is registered as a Tool.
 * Tools define: name, description, inputs, outputs, permissions, risk level,
 * approval requirements, cost, and execution logic.
 *
 * Architecture:
 *   ToolRegistry → Tool → ExecutionContext → Result → Audit
 *
 * Agents never receive unrestricted access. Every tool call is:
 *   1. Registered and validated
 *   2. Permission-checked against the agent's authority profile
 *   3. Budget-checked against the agent's spending limit
 *   4. Approval-gated if the tool requires it
 *   5. Executed with timeout and error handling
 *   6. Audited with full context
 *   7. Cost-tracked against the organization's credits
 */

import type { AppConfig } from '@orq8/core';
import { appendAudit } from './audit.js';
import { consumeCredits, hasEnoughCredits, CreditExhaustedError } from './credits.js';
import { broadcastToOrg } from './realtime.js';
import type { Db } from '@orq8/db';
import { eq, and } from 'drizzle-orm';
import { agents } from '@orq8/db';

// ─── Tool Definition Types ──────────────────────────────────────────────────

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export type ToolCategory =
  | 'research'
  | 'content'
  | 'analysis'
  | 'planning'
  | 'communication'
  | 'engineering'
  | 'data'
  | 'memory'
  | 'system';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  defaultValue?: unknown;
  enum?: string[];
}

export interface ToolDefinition {
  /** Unique tool identifier (e.g. 'web_search', 'write_blog_post') */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this tool does */
  description: string;
  /** Category for grouping */
  category: ToolCategory;
  /** Input parameters */
  parameters: ToolParameter[];
  /** Expected output description */
  outputDescription: string;
  /** Risk level — determines approval requirements */
  riskLevel: RiskLevel;
  /** Whether this tool requires founder approval before execution */
  requiresApproval: boolean;
  /** Reason approval is required (shown to founder) */
  approvalReason?: string;
  /** Credit cost for using this tool (0 = free) */
  creditCost: number;
  /** Estimated execution time in ms */
  estimatedDurationMs: number;
  /** Maximum execution time before timeout */
  timeoutMs: number;
  /** Which agent roles can use this tool (empty = all roles) */
  allowedRoles: string[];
  /** Which agent roles are forbidden from using this tool */
  forbiddenRoles: string[];
  /** Whether this tool modifies external state */
  hasSideEffects: boolean;
  /** Whether this tool can be retried on failure */
  retryable: boolean;
  /** Maximum retry attempts */
  maxRetries: number;
}

export interface ToolExecutionContext {
  orgId: string;
  userId: string;
  agentId: string;
  agentRole: string;
  agentName: string;
  taskId?: string;
  goalId?: string;
  /** Agent's authority profile from the database */
  authority: AgentAuthority;
}

export interface AgentAuthority {
  canCreateTasks: boolean;
  canExecuteTasks: boolean;
  canAccessCompanyInfo: boolean;
  canCommunicateExternally: boolean;
  canModifyResources: boolean;
  spendingLimitCents: number;
  requiresApprovalFor: string[];
  forbiddenActions: string[];
}

export interface ToolExecutionResult {
  success: boolean;
  output: unknown;
  error?: string;
  creditsConsumed: number;
  durationMs: number;
  toolId: string;
  approvalRequired: boolean;
  approvalId?: string;
}

// ─── Tool Registry ──────────────────────────────────────────────────────────

const toolRegistry = new Map<string, ToolDefinition>();

/** Register a tool definition. */
export function registerTool(tool: ToolDefinition): void {
  toolRegistry.set(tool.id, tool);
}

/** Get a tool definition by ID. */
export function getTool(toolId: string): ToolDefinition | undefined {
  return toolRegistry.get(toolId);
}

/** Get all registered tools. */
export function getAllTools(): ToolDefinition[] {
  return Array.from(toolRegistry.values());
}

/** Get tools available to a specific agent role. */
export function getToolsForRole(role: string): ToolDefinition[] {
  return getAllTools().filter((tool) => {
    if (tool.forbiddenRoles.includes(role)) return false;
    if (tool.allowedRoles.length > 0 && !tool.allowedRoles.includes(role)) return false;
    return true;
  });
}

// ─── Authority Enforcement ──────────────────────────────────────────────────

/**
 * Check if an agent is authorized to use a specific tool.
 * Returns null if authorized, or an error message if not.
 */
export function checkAuthority(
  tool: ToolDefinition,
  ctx: ToolExecutionContext,
): string | null {
  const auth = ctx.authority;

  // Check forbidden actions
  if (auth.forbiddenActions.includes(tool.id)) {
    return `Tool "${tool.name}" is explicitly forbidden for this agent.`;
  }

  // Check role-based restrictions
  if (tool.forbiddenRoles.includes(ctx.agentRole)) {
    return `Agent role "${ctx.agentRole}" is not permitted to use "${tool.name}".`;
  }
  if (tool.allowedRoles.length > 0 && !tool.allowedRoles.includes(ctx.agentRole)) {
    return `Agent role "${ctx.agentRole}" is not in the allowed roles for "${tool.name}".`;
  }

  // Check external communication permission
  if (tool.category === 'communication' && !auth.canCommunicateExternally) {
    return `Agent does not have permission for external communications.`;
  }

  // Check resource modification permission
  if (tool.hasSideEffects && !auth.canModifyResources) {
    return `Agent does not have permission to modify resources.`;
  }

  // Check task execution permission
  if (!auth.canExecuteTasks) {
    return `Agent does not have permission to execute tasks.`;
  }

  // Check spending limit
  if (auth.spendingLimitCents > 0 && tool.creditCost > auth.spendingLimitCents) {
    return `Tool cost (${tool.creditCost} credits) exceeds agent spending limit (${auth.spendingLimitCents} credits).`;
  }

  return null; // Authorized
}

/**
 * Check if a tool requires approval for this agent.
 */
export function needsApproval(
  tool: ToolDefinition,
  ctx: ToolExecutionContext,
): boolean {
  // Tool explicitly requires approval
  if (tool.requiresApproval) return true;

  // Agent authority requires approval for this tool category
  const auth = ctx.authority;
  if (tool.riskLevel === 'critical') return true;
  if (tool.riskLevel === 'high' && auth.requiresApprovalFor.includes('high_impact_decisions')) return true;
  if (tool.category === 'communication' && auth.requiresApprovalFor.includes('external_communications')) return true;
  if (tool.creditCost > 5 && auth.requiresApprovalFor.includes('financial_commitments')) return true;

  return false;
}

// ─── Tool Execution ─────────────────────────────────────────────────────────

/**
 * Execute a tool with full permission checking, budget enforcement, and audit.
 *
 * This is the main entry point for all tool execution.
 * Every tool call goes through this function.
 */
export async function executeTool(
  config: AppConfig,
  db: Db,
  toolId: string,
  ctx: ToolExecutionContext,
  params: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const startTime = Date.now();

  // 1. Look up the tool
  const tool = getTool(toolId);
  if (!tool) {
    return {
      success: false,
      output: null,
      error: `Tool "${toolId}" not found.`,
      creditsConsumed: 0,
      durationMs: Date.now() - startTime,
      toolId,
      approvalRequired: false,
    };
  }

  // 2. Validate parameters
  const validationError = validateParams(tool, params);
  if (validationError) {
    return {
      success: false,
      output: null,
      error: validationError,
      creditsConsumed: 0,
      durationMs: Date.now() - startTime,
      toolId,
      approvalRequired: false,
    };
  }

  // 3. Check authority
  const authError = checkAuthority(tool, ctx);
  if (authError) {
    // Audit the denied attempt
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'agent',
      actorId: ctx.agentId,
      action: 'tool.denied',
      tool: toolId,
      cost: 0,
      outcome: 'denied',
      inputRef: JSON.stringify({ params, reason: authError }),
    }).catch(() => {});

    return {
      success: false,
      output: null,
      error: authError,
      creditsConsumed: 0,
      durationMs: Date.now() - startTime,
      toolId,
      approvalRequired: false,
    };
  }

  // 4. Check credits
  if (tool.creditCost > 0) {
    const creditCheck = await hasEnoughCredits(db, ctx.orgId, `tool.${toolId}`);
    if (!creditCheck.allowed) {
      return {
        success: false,
        output: null,
        error: `Insufficient credits. ${tool.creditCost} required, ${creditCheck.balance.remaining} remaining.`,
        creditsConsumed: 0,
        durationMs: Date.now() - startTime,
        toolId,
        approvalRequired: false,
      };
    }
  }

  // 5. Check if approval is needed
  const approvalRequired = needsApproval(tool, ctx);
  if (approvalRequired) {
    // Create approval request
    const { approvals } = await import('@orq8/db');
    const [approval] = await db.insert(approvals).values({
      orgId: ctx.orgId,
      agentId: ctx.agentId,
      action: `Tool: ${tool.name}`,
      description: `Agent "${ctx.agentName}" wants to use tool "${tool.name}". ${tool.approvalReason ?? ''}`,
      cost: tool.creditCost,
      riskLevel: tool.riskLevel === 'critical' ? 'high' : tool.riskLevel === 'high' ? 'high' : 'medium',
      status: 'pending',
    }).returning();

    // Notify founder
    broadcastToOrg(ctx.orgId, {
      type: 'approval.required',
      approvalId: approval?.id,
      agentName: ctx.agentName,
      toolName: tool.name,
      riskLevel: tool.riskLevel,
    });

    return {
      success: true,
      output: { message: `Approval required for "${tool.name}". Request sent to founder.` },
      creditsConsumed: 0,
      durationMs: Date.now() - startTime,
      toolId,
      approvalRequired: true,
      approvalId: approval?.id,
    };
  }

  // 6. Execute the tool
  let result: unknown;
  let executionError: string | undefined;

  try {
    const handler = toolHandlers.get(toolId);
    if (!handler) {
      executionError = `No handler registered for tool "${toolId}".`;
    } else {
      result = await Promise.race([
        handler(params, ctx, config, db),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Tool "${toolId}" timed out after ${tool.timeoutMs}ms`)), tool.timeoutMs)
        ),
      ]);
    }
  } catch (err) {
    executionError = err instanceof Error ? err.message : 'Unknown execution error';

    // Retry if allowed
    if (tool.retryable && tool.maxRetries > 0) {
      for (let attempt = 1; attempt <= tool.maxRetries; attempt++) {
        try {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          const handler = toolHandlers.get(toolId);
          if (handler) {
            result = await handler(params, ctx, config, db);
            executionError = undefined;
            break;
          }
        } catch (retryErr) {
          executionError = retryErr instanceof Error ? retryErr.message : 'Retry failed';
        }
      }
    }
  }

  // 7. Consume credits
  let creditsConsumed = 0;
  if (tool.creditCost > 0 && !executionError) {
    try {
      const creditResult = await consumeCredits(
        db,
        ctx.orgId,
        `tool.${toolId}`,
        `Tool: ${tool.name} by ${ctx.agentName}`,
        ctx.taskId,
        'tool',
      );
      creditsConsumed = creditResult.consumed;
    } catch (err) {
      if (err instanceof CreditExhaustedError) {
        executionError = `Credits exhausted during tool execution: ${err.message}`;
      }
    }
  }

  const durationMs = Date.now() - startTime;
  const success = !executionError;

  // 8. Audit the execution
  await appendAudit(db, {
    orgId: ctx.orgId,
    actorType: 'agent',
    actorId: ctx.agentId,
    action: success ? 'tool.executed' : 'tool.failed',
    tool: toolId,
    cost: creditsConsumed,
    outcome: success ? 'success' : 'failure',
    inputRef: JSON.stringify({ params }),
    resultRef: success ? JSON.stringify({ output: result }).slice(0, 500) : executionError,
  }).catch(() => {});

  // 9. Broadcast activity
  broadcastToOrg(ctx.orgId, {
    type: success ? 'tool.completed' : 'tool.failed',
    toolId,
    toolName: tool.name,
    agentName: ctx.agentName,
    durationMs,
    creditsConsumed,
  });

  // 10. Update agent credits
  if (creditsConsumed > 0) {
    await db
      .update(agents)
      .set({
        creditsUsed: sql`${agents.creditsUsed} + ${creditsConsumed}`,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, ctx.agentId))
      .catch(() => {});
  }

  return {
    success,
    output: success ? result : null,
    error: executionError,
    creditsConsumed,
    durationMs,
    toolId,
    approvalRequired: false,
  };
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

type ToolHandler = (
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
) => Promise<unknown>;

const toolHandlers = new Map<string, ToolHandler>();

/** Register a tool execution handler. */
export function registerToolHandler(toolId: string, handler: ToolHandler): void {
  toolHandlers.set(toolId, handler);
}

// ─── Parameter Validation ───────────────────────────────────────────────────

function validateParams(tool: ToolDefinition, params: Record<string, unknown>): string | null {
  for (const param of tool.parameters) {
    if (param.required && !(param.name in params) && param.defaultValue === undefined) {
      return `Missing required parameter "${param.name}" for tool "${tool.name}".`;
    }
    if (param.name in params && param.enum && !param.enum.includes(String(params[param.name]))) {
      return `Parameter "${param.name}" must be one of: ${param.enum.join(', ')}.`;
    }
  }
  return null;
}

// ─── Import for SQL template ────────────────────────────────────────────────
import { sql } from 'drizzle-orm';

// ─── Default Tool Definitions ───────────────────────────────────────────────

/**
 * Register all built-in tools.
 * Called once at server startup.
 */
export function registerBuiltinTools(): void {
  // ── Research Tools ──
  registerTool({
    id: 'web_search',
    name: 'Web Search',
    description: 'Search the web for current information on any topic. Returns relevant results with titles, URLs, and content snippets.',
    category: 'research',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'depth', type: 'string', description: 'Search depth', required: false, defaultValue: 'standard', enum: ['standard', 'deep'] },
    ],
    outputDescription: 'Search results with titles, URLs, and content snippets',
    riskLevel: 'safe',
    requiresApproval: false,
    creditCost: 1,
    estimatedDurationMs: 3000,
    timeoutMs: 15000,
    allowedRoles: [],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: true,
    maxRetries: 2,
  });

  registerTool({
    id: 'analyze_competitor',
    name: 'Analyze Competitor',
    description: 'Research and analyze a specific competitor. Returns their positioning, strengths, weaknesses, and market strategy.',
    category: 'research',
    parameters: [
      { name: 'competitor_name', type: 'string', description: 'Name of the competitor', required: true },
      { name: 'focus_areas', type: 'array', description: 'Specific areas to focus on', required: false },
    ],
    outputDescription: 'Competitive analysis with positioning, strengths, weaknesses, and strategy',
    riskLevel: 'safe',
    requiresApproval: false,
    creditCost: 2,
    estimatedDurationMs: 5000,
    timeoutMs: 30000,
    allowedRoles: ['market_researcher', 'data_analyst', 'executive_agent'],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: true,
    maxRetries: 1,
  });

  registerTool({
    id: 'research_market',
    name: 'Research Market',
    description: 'Research a market or industry. Returns size, trends, growth, key players, and opportunities.',
    category: 'research',
    parameters: [
      { name: 'market', type: 'string', description: 'Market or industry to research', required: true },
      { name: 'specific_questions', type: 'array', description: 'Specific questions to answer', required: false },
    ],
    outputDescription: 'Market research report with size, trends, players, and opportunities',
    riskLevel: 'safe',
    requiresApproval: false,
    creditCost: 3,
    estimatedDurationMs: 8000,
    timeoutMs: 45000,
    allowedRoles: ['market_researcher', 'data_analyst', 'financial_analyst', 'executive_agent'],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: true,
    maxRetries: 1,
  });

  // ── Content Tools ──
  registerTool({
    id: 'write_blog_post',
    name: 'Write Blog Post',
    description: 'Write a complete blog post on a given topic with title, sections, and call-to-action.',
    category: 'content',
    parameters: [
      { name: 'topic', type: 'string', description: 'Blog post topic', required: true },
      { name: 'tone', type: 'string', description: 'Writing tone', required: false, defaultValue: 'professional', enum: ['professional', 'casual', 'technical', 'persuasive', 'educational'] },
      { name: 'word_count', type: 'number', description: 'Target word count', required: false, defaultValue: 800 },
      { name: 'audience', type: 'string', description: 'Target audience', required: false },
    ],
    outputDescription: 'Complete blog post with title, introduction, body sections, and conclusion',
    riskLevel: 'low',
    requiresApproval: false,
    creditCost: 2,
    estimatedDurationMs: 5000,
    timeoutMs: 30000,
    allowedRoles: ['content_writer', 'executive_agent'],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: true,
    maxRetries: 2,
  });

  registerTool({
    id: 'write_email',
    name: 'Write Email',
    description: 'Draft a professional email with subject line, body, and call-to-action.',
    category: 'content',
    parameters: [
      { name: 'recipient', type: 'string', description: 'Who the email is for', required: true },
      { name: 'purpose', type: 'string', description: 'Purpose of the email', required: true },
      { name: 'tone', type: 'string', description: 'Email tone', required: false, defaultValue: 'professional' },
      { name: 'key_points', type: 'array', description: 'Key points to include', required: false },
    ],
    outputDescription: 'Complete email with subject line and body',
    riskLevel: 'medium',
    requiresApproval: true,
    approvalReason: 'External communications require founder approval',
    creditCost: 1,
    estimatedDurationMs: 3000,
    timeoutMs: 15000,
    allowedRoles: ['communications_agent', 'executive_agent'],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: true,
    maxRetries: 1,
  });

  registerTool({
    id: 'write_report',
    name: 'Write Report',
    description: 'Create a structured report with executive summary, findings, analysis, and recommendations.',
    category: 'content',
    parameters: [
      { name: 'topic', type: 'string', description: 'Report topic', required: true },
      { name: 'findings', type: 'array', description: 'Key findings to include', required: true },
      { name: 'recommendations', type: 'array', description: 'Recommendations', required: false },
      { name: 'format', type: 'string', description: 'Report format', required: false, defaultValue: 'standard', enum: ['standard', 'executive', 'detailed'] },
    ],
    outputDescription: 'Structured report with executive summary, findings, and recommendations',
    riskLevel: 'low',
    requiresApproval: false,
    creditCost: 3,
    estimatedDurationMs: 8000,
    timeoutMs: 45000,
    allowedRoles: ['data_analyst', 'financial_analyst', 'market_researcher', 'executive_agent'],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: true,
    maxRetries: 1,
  });

  // ── Analysis Tools ──
  registerTool({
    id: 'analyze_data',
    name: 'Analyze Data',
    description: 'Analyze structured or unstructured data to identify patterns, trends, and insights.',
    category: 'analysis',
    parameters: [
      { name: 'data_description', type: 'string', description: 'Description of the data to analyze', required: true },
      { name: 'analysis_type', type: 'string', description: 'Type of analysis', required: false, defaultValue: 'general', enum: ['general', 'trend', 'comparison', 'forecast', 'sentiment'] },
      { name: 'questions', type: 'array', description: 'Specific questions to answer', required: false },
    ],
    outputDescription: 'Data analysis with patterns, trends, insights, and actionable recommendations',
    riskLevel: 'safe',
    requiresApproval: false,
    creditCost: 2,
    estimatedDurationMs: 5000,
    timeoutMs: 30000,
    allowedRoles: ['data_analyst', 'financial_analyst', 'executive_agent'],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: true,
    maxRetries: 1,
  });

  registerTool({
    id: 'financial_analysis',
    name: 'Financial Analysis',
    description: 'Analyze financial data, create projections, assess budgets, and provide financial guidance.',
    category: 'analysis',
    parameters: [
      { name: 'analysis_type', type: 'string', description: 'Type of financial analysis', required: true, enum: ['budget', 'revenue', 'cost', 'projection', 'comparison'] },
      { name: 'data', type: 'string', description: 'Financial data or description', required: true },
      { name: 'period', type: 'string', description: 'Time period', required: false },
    ],
    outputDescription: 'Financial analysis with projections and recommendations',
    riskLevel: 'low',
    requiresApproval: false,
    creditCost: 3,
    estimatedDurationMs: 5000,
    timeoutMs: 30000,
    allowedRoles: ['financial_analyst', 'executive_agent'],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: true,
    maxRetries: 1,
  });

  // ── Planning Tools ──
  registerTool({
    id: 'create_plan',
    name: 'Create Plan',
    description: 'Create a structured plan with phases, milestones, dependencies, and success criteria.',
    category: 'planning',
    parameters: [
      { name: 'objective', type: 'string', description: 'What the plan should achieve', required: true },
      { name: 'timeframe', type: 'string', description: 'Timeframe for the plan', required: false },
      { name: 'constraints', type: 'array', description: 'Known constraints or limitations', required: false },
      { name: 'resources', type: 'array', description: 'Available resources', required: false },
    ],
    outputDescription: 'Structured plan with phases, milestones, and success criteria',
    riskLevel: 'safe',
    requiresApproval: false,
    creditCost: 2,
    estimatedDurationMs: 4000,
    timeoutMs: 20000,
    allowedRoles: ['executive_agent', 'operations_manager'],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: true,
    maxRetries: 2,
  });

  registerTool({
    id: 'decompose_task',
    name: 'Decompose Task',
    description: 'Break a complex objective into specific, actionable sub-tasks with clear assignments.',
    category: 'planning',
    parameters: [
      { name: 'objective', type: 'string', description: 'The objective to decompose', required: true },
      { name: 'available_roles', type: 'array', description: 'Available agent roles', required: false },
      { name: 'max_tasks', type: 'number', description: 'Maximum number of sub-tasks', required: false, defaultValue: 5 },
    ],
    outputDescription: 'List of sub-tasks with titles, descriptions, and role assignments',
    riskLevel: 'safe',
    requiresApproval: false,
    creditCost: 1,
    estimatedDurationMs: 3000,
    timeoutMs: 15000,
    allowedRoles: ['executive_agent', 'operations_manager'],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: true,
    maxRetries: 2,
  });

  // ── Engineering Tools ──
  registerTool({
    id: 'review_code',
    name: 'Review Code',
    description: 'Review code for quality, security, performance, and best practices. Returns findings and recommendations.',
    category: 'engineering',
    parameters: [
      { name: 'code', type: 'string', description: 'Code to review', required: true },
      { name: 'language', type: 'string', description: 'Programming language', required: false },
      { name: 'focus', type: 'array', description: 'Specific areas to focus on', required: false },
    ],
    outputDescription: 'Code review with findings, severity, and recommendations',
    riskLevel: 'safe',
    requiresApproval: false,
    creditCost: 3,
    estimatedDurationMs: 8000,
    timeoutMs: 45000,
    allowedRoles: ['software_engineer', 'executive_agent'],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: true,
    maxRetries: 1,
  });

  registerTool({
    id: 'write_code',
    name: 'Write Code',
    description: 'Generate code for a specific task. Returns implementation with comments and usage examples.',
    category: 'engineering',
    parameters: [
      { name: 'description', type: 'string', description: 'What the code should do', required: true },
      { name: 'language', type: 'string', description: 'Programming language', required: true },
      { name: 'context', type: 'string', description: 'Additional context (existing code, patterns)', required: false },
    ],
    outputDescription: 'Code implementation with comments and examples',
    riskLevel: 'medium',
    requiresApproval: false,
    creditCost: 5,
    estimatedDurationMs: 10000,
    timeoutMs: 60000,
    allowedRoles: ['software_engineer', 'executive_agent'],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: true,
    maxRetries: 2,
  });

  // ── Memory Tools ──
  registerTool({
    id: 'store_memory',
    name: 'Store Company Memory',
    description: 'Store important information in company memory for future reference.',
    category: 'memory',
    parameters: [
      { name: 'content', type: 'string', description: 'Information to store', required: true },
      { name: 'category', type: 'string', description: 'Memory category', required: true, enum: ['fact', 'decision', 'lesson', 'preference', 'workflow', 'context'] },
      { name: 'importance', type: 'number', description: 'Importance level (1-10)', required: false, defaultValue: 5 },
    ],
    outputDescription: 'Confirmation that memory was stored',
    riskLevel: 'safe',
    requiresApproval: false,
    creditCost: 0,
    estimatedDurationMs: 1000,
    timeoutMs: 5000,
    allowedRoles: [],
    forbiddenRoles: [],
    hasSideEffects: true,
    retryable: true,
    maxRetries: 2,
  });

  registerTool({
    id: 'search_memory',
    name: 'Search Company Memory',
    description: 'Search company memory for relevant information.',
    category: 'memory',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'category', type: 'string', description: 'Filter by category', required: false },
      { name: 'limit', type: 'number', description: 'Maximum results', required: false, defaultValue: 10 },
    ],
    outputDescription: 'Relevant memory entries with content, category, and importance',
    riskLevel: 'safe',
    requiresApproval: false,
    creditCost: 0,
    estimatedDurationMs: 500,
    timeoutMs: 3000,
    allowedRoles: [],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: false,
    maxRetries: 0,
  });

  // ── System Tools ──
  registerTool({
    id: 'get_org_status',
    name: 'Get Organization Status',
    description: 'Get the current status of the organization including agents, tasks, goals, and credits.',
    category: 'system',
    parameters: [],
    outputDescription: 'Organization status summary',
    riskLevel: 'safe',
    requiresApproval: false,
    creditCost: 0,
    estimatedDurationMs: 500,
    timeoutMs: 3000,
    allowedRoles: [],
    forbiddenRoles: [],
    hasSideEffects: false,
    retryable: false,
    maxRetries: 0,
  });

  registerTool({
    id: 'notify_founder',
    name: 'Notify Founder',
    description: 'Send a notification to the founder about important updates, results, or issues.',
    category: 'system',
    parameters: [
      { name: 'title', type: 'string', description: 'Notification title', required: true },
      { name: 'message', type: 'string', description: 'Notification message', required: true },
      { name: 'type', type: 'string', description: 'Notification type', required: false, defaultValue: 'info', enum: ['info', 'success', 'warning', 'error'] },
    ],
    outputDescription: 'Confirmation that notification was sent',
    riskLevel: 'safe',
    requiresApproval: false,
    creditCost: 0,
    estimatedDurationMs: 500,
    timeoutMs: 3000,
    allowedRoles: [],
    forbiddenRoles: [],
    hasSideEffects: true,
    retryable: true,
    maxRetries: 2,
  });
}
