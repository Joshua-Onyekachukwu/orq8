/**
 * ORQ8 Tool Handlers — Actual implementations for each registered tool.
 *
 * These handlers are called by the tool registry's executeTool() function.
 * Each handler receives validated parameters, the execution context, config, and db.
 */

import type { AppConfig } from '@orq8/core';
import type { Db } from '@orq8/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  agents,
  goals,
  tasks,
  activityEvents,
  companyMemory,
  approvals,
  type Db as DbType,
} from '@orq8/db';
import { registerToolHandler, type ToolExecutionContext } from './tool-registry.js';
import { chat, chatJson } from './llm.js';
import { appendAudit } from './audit.js';
import { broadcastToOrg } from './realtime.js';
import { createNotification } from '../routes/notifications.js';
import { shouldNotify, getNotificationPrefs } from './notification-preferences.js';

/**
 * Register all built-in tool handlers.
 * Called after registerBuiltinTools() to wire up execution logic.
 */
export function registerBuiltinToolHandlers(): void {
  // Research tools
  registerToolHandler('web_search', handleWebSearch);
  registerToolHandler('analyze_competitor', handleAnalyzeCompetitor);
  registerToolHandler('research_market', handleResearchMarket);

  // Content tools
  registerToolHandler('write_blog_post', handleWriteBlogPost);
  registerToolHandler('write_email', handleWriteEmail);
  registerToolHandler('write_report', handleWriteReport);

  // Analysis tools
  registerToolHandler('analyze_data', handleAnalyzeData);
  registerToolHandler('financial_analysis', handleFinancialAnalysis);

  // Planning tools
  registerToolHandler('create_plan', handleCreatePlan);
  registerToolHandler('decompose_task', handleDecomposeTask);

  // Engineering tools
  registerToolHandler('review_code', handleReviewCode);
  registerToolHandler('write_code', handleWriteCode);

  // Memory tools
  registerToolHandler('store_memory', handleStoreMemory);
  registerToolHandler('search_memory', handleSearchMemory);

  // System tools
  registerToolHandler('get_org_status', handleGetOrgStatus);
  registerToolHandler('notify_founder', handleNotifyFounder);
}

// ─── Research Tool Handlers ─────────────────────────────────────────────────

async function handleWebSearch(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const query = String(params.query || '');
  const depth = String(params.depth || 'standard');
  const serpApiKey = config.SERPAPI_KEY ?? '';

  let searchResults: Array<{ title: string; url: string; snippet: string }> = [];
  let rawResults: string = '';

  // Try real web search via SerpAPI if available
  if (serpApiKey) {
    try {
      const params_url = new URL('https://serpapi.com/search.json');
      params_url.searchParams.set('q', query);
      params_url.searchParams.set('api_key', serpApiKey);
      params_url.searchParams.set('num', depth === 'deep' ? '10' : '5');
      params_url.searchParams.set('engine', 'google');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(params_url.toString(), { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json() as { organic_results?: Array<{ title: string; link: string; snippet: string }> };
        searchResults = (data.organic_results ?? []).map((r) => ({
          title: r.title,
          url: r.link,
          snippet: r.snippet,
        }));
        rawResults = searchResults
          .map((r) => `- **${r.title}** (${r.url})\n  ${r.snippet}`)
          .join('\n\n');
      }
    } catch {
      // SerpAPI failed — fall through to LLM synthesis
    }
  }

  // Use LLM to synthesize search results into a structured response
  const context = rawResults
    ? `\n\nHere are real search results for this query:\n\n${rawResults}`
    : '';

  const prompt = `You are a research assistant. Search for current information about: "${query}"${context}

${depth === 'deep' ? 'Provide a deep, comprehensive analysis.' : 'Provide a concise summary of key findings.'}

Format your response as:
## Key Findings
- Finding 1
- Finding 2
...

## Sources
- Source 1 (URL if applicable)
...

## Summary
Brief summary of the most important information.`;

  const result = await chat(config, 'You are a knowledgeable research assistant. Provide accurate, current information.', prompt, {
    temperature: 0.3,
    max_tokens: 2048,
  });

  // Store as memory
  if (result) {
    await db.insert(companyMemory).values({
      orgId: ctx.orgId,
      category: 'context',
      content: `Research: "${query}" — ${result.slice(0, 500)}`,
      source: ctx.agentName,
      agentId: ctx.agentId,
      taskId: ctx.taskId ?? null,
      importance: 5,
    }).catch(() => {});
  }

  return {
    query,
    depth,
    results: result || 'Search completed. No detailed results available.',
    timestamp: new Date().toISOString(),
  };
}

async function handleAnalyzeCompetitor(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const competitorName = String(params.competitor_name || '');
  const focusAreas = Array.isArray(params.focus_areas) ? params.focus_areas.join(', ') : 'general positioning';

  const prompt = `Analyze the competitor "${competitorName}" focusing on: ${focusAreas}

Provide a structured analysis covering:
1. **Company Overview** — What they do, their market position
2. **Strengths** — What they do well
3. **Weaknesses** — Where they fall short
4. **Target Market** — Who they serve
5. **Pricing** — Their pricing strategy (if known)
6. **Technology** — Their tech stack or approach
7. **Recent Activity** — Recent moves, launches, or changes
8. **Threat Level** — How they compare to us
9. **Opportunities** — Where we can differentiate
10. **Recommendations** — How to respond to this competitor`;

  const result = await chat(config, 'You are a competitive intelligence analyst. Provide thorough, actionable competitive analysis.', prompt, {
    temperature: 0.3,
    max_tokens: 3000,
  });

  // Store as memory
  if (result) {
    await db.insert(companyMemory).values({
      orgId: ctx.orgId,
      category: 'fact',
      content: `Competitor analysis: ${competitorName} — ${result.slice(0, 800)}`,
      source: ctx.agentName,
      agentId: ctx.agentId,
      taskId: ctx.taskId ?? null,
      importance: 7,
    }).catch(() => {});
  }

  return {
    competitor: competitorName,
    focusAreas,
    analysis: result || 'Competitor analysis completed.',
    timestamp: new Date().toISOString(),
  };
}

async function handleResearchMarket(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const market = String(params.market || '');
  const questions = Array.isArray(params.specific_questions) ? params.specific_questions.join('\n- ') : 'General market overview';

  const prompt = `Research the "${market}" market. Answer these questions:\n- ${questions}

Also cover:
1. Market size and growth rate
2. Key trends shaping the market
3. Major players and their market share
4. Customer segments and their needs
5. Technology trends affecting the market
6. Regulatory considerations
7. Opportunities for new entrants
8. Risks and challenges

Provide specific data points where possible. Be thorough but actionable.`;

  const result = await chat(config, 'You are a market research analyst. Provide data-driven, actionable market intelligence.', prompt, {
    temperature: 0.3,
    max_tokens: 4000,
  });

  // Store as memory
  if (result) {
    await db.insert(companyMemory).values({
      orgId: ctx.orgId,
      category: 'fact',
      content: `Market research: ${market} — ${result.slice(0, 800)}`,
      source: ctx.agentName,
      agentId: ctx.agentId,
      taskId: ctx.taskId ?? null,
      importance: 7,
    }).catch(() => {});
  }

  return {
    market,
    research: result || 'Market research completed.',
    timestamp: new Date().toISOString(),
  };
}

// ─── Content Tool Handlers ──────────────────────────────────────────────────

async function handleWriteBlogPost(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const topic = String(params.topic || '');
  const tone = String(params.tone || 'professional');
  const wordCount = Number(params.word_count) || 800;
  const audience = String(params.audience || 'general audience');

  const prompt = `Write a ${tone} blog post about "${topic}" for ${audience}.

Target length: approximately ${wordCount} words.

Structure:
1. Compelling title
2. Introduction that hooks the reader
3. ${wordCount > 600 ? '3-5' : '2-3'} main sections with clear headings
4. Actionable takeaways
5. Strong conclusion with call-to-action

Write in a ${tone} tone. Be engaging, informative, and purposeful.
Use specific examples and actionable advice where possible.`;

  const result = await chat(config, 'You are an expert content writer. Create engaging, high-quality content.', prompt, {
    temperature: 0.7,
    max_tokens: 4096,
  });

  return {
    topic,
    tone,
    wordCount,
    content: result || 'Blog post drafted.',
    timestamp: new Date().toISOString(),
  };
}

async function handleWriteEmail(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const recipient = String(params.recipient || '');
  const purpose = String(params.purpose || '');
  const tone = String(params.tone || 'professional');
  const keyPoints = Array.isArray(params.key_points) ? params.key_points.join('\n- ') : '';

  const prompt = `Draft a ${tone} email to ${recipient} about: ${purpose}

${keyPoints ? `Key points to include:\n- ${keyPoints}` : ''}

Structure:
1. Subject line (compelling and clear)
2. Professional greeting
3. Brief context/purpose
4. Main content with key points
5. Clear call-to-action
6. Professional closing

Keep it concise and ${tone} in tone.`;

  const result = await chat(config, 'You are a professional communications specialist. Write clear, effective emails.', prompt, {
    temperature: 0.5,
    max_tokens: 2048,
  });

  return {
    recipient,
    purpose,
    email: result || 'Email drafted.',
    timestamp: new Date().toISOString(),
  };
}

async function handleWriteReport(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const topic = String(params.topic || '');
  const findings = Array.isArray(params.findings) ? params.findings : ['Analysis completed'];
  const recommendations = Array.isArray(params.recommendations) ? params.recommendations : [];
  const format = String(params.format || 'standard');

  const prompt = `Create a ${format} report on "${topic}".

## Key Findings
${findings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

${recommendations.length > 0 ? `## Recommendations\n${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : ''}

Structure the report with:
1. Executive Summary (2-3 sentences)
2. Findings (detailed analysis of each finding)
3. Analysis (what the findings mean)
4. Recommendations (actionable next steps)
5. Conclusion

${format === 'executive' ? 'Keep it concise — focus on key insights and decisions.' : ''}
${format === 'detailed' ? 'Be thorough — include supporting evidence and methodology.' : ''}`;

  const result = await chat(config, 'You are a senior analyst. Create clear, actionable reports.', prompt, {
    temperature: 0.3,
    max_tokens: 4096,
  });

  return {
    topic,
    format,
    report: result || 'Report generated.',
    timestamp: new Date().toISOString(),
  };
}

// ─── Analysis Tool Handlers ─────────────────────────────────────────────────

async function handleAnalyzeData(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const dataDescription = String(params.data_description || '');
  const analysisType = String(params.analysis_type || 'general');
  const questions = Array.isArray(params.questions) ? params.questions.join('\n- ') : 'What are the key insights?';

  const prompt = `Perform a ${analysisType} analysis on the following data/information:

${dataDescription}

Answer these questions:\n- ${questions}

Provide:
1. Key patterns and trends identified
2. Statistical insights (where applicable)
3. Anomalies or outliers
4. Actionable recommendations
5. Confidence level in findings
6. Additional data that would strengthen the analysis`;

  const result = await chat(config, 'You are a data analyst. Provide thorough, evidence-based analysis.', prompt, {
    temperature: 0.3,
    max_tokens: 3000,
  });

  return {
    analysisType,
    analysis: result || 'Analysis completed.',
    timestamp: new Date().toISOString(),
  };
}

async function handleFinancialAnalysis(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const analysisType = String(params.analysis_type || 'budget');
  const data = String(params.data || '');
  const period = String(params.period || 'current');

  const prompt = `Perform a ${analysisType} financial analysis for the ${period} period.

${data ? `Financial data:\n${data}` : 'Use available company context.'}

Provide:
1. Current financial position
2. Key metrics and trends
3. Variance analysis (actual vs expected)
4. Risk assessment
5. Recommendations for optimization
6. Forward-looking projections (if data supports it)

Be precise with numbers. Clearly state any assumptions.`;

  const result = await chat(config, 'You are a financial analyst. Provide precise, actionable financial analysis.', prompt, {
    temperature: 0.2,
    max_tokens: 3000,
  });

  return {
    analysisType,
    period,
    analysis: result || 'Financial analysis completed.',
    timestamp: new Date().toISOString(),
  };
}

// ─── Planning Tool Handlers ─────────────────────────────────────────────────

async function handleCreatePlan(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const objective = String(params.objective || '');
  const timeframe = String(params.timeframe || 'not specified');
  const constraints = Array.isArray(params.constraints) ? params.constraints : [];
  const resources = Array.isArray(params.resources) ? params.resources : [];

  const prompt = `Create a structured plan to achieve: "${objective}"

Timeframe: ${timeframe}
${constraints.length > 0 ? `Constraints:\n${constraints.map(c => `- ${c}`).join('\n')}` : ''}
${resources.length > 0 ? `Available resources:\n${resources.map(r => `- ${r}`).join('\n')}` : ''}

Structure the plan as:
1. **Objective** — Clear statement of what we're achieving
2. **Approach** — High-level strategy
3. **Phases** — Break into 2-4 phases with:
   - Phase name and goal
   - Key tasks
   - Dependencies
   - Success criteria
   - Estimated effort
4. **Milestones** — Key checkpoints
5. **Risks** — What could go wrong and mitigation
6. **Success Metrics** — How we'll know we succeeded
7. **Next Steps** — Immediate actions`;

  const result = await chat(config, 'You are a strategic planner. Create clear, actionable plans.', prompt, {
    temperature: 0.3,
    max_tokens: 4096,
  });

  return {
    objective,
    timeframe,
    plan: result || 'Plan created.',
    timestamp: new Date().toISOString(),
  };
}

async function handleDecomposeTask(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const objective = String(params.objective || '');
  const maxTasks = Number(params.max_tasks) || 5;

  // Get available agents
  const availableAgents = await db
    .select({ name: agents.name, role: agents.role, status: agents.status })
    .from(agents)
    .where(eq(agents.orgId, ctx.orgId))
    .limit(20);

  const agentList = availableAgents
    .filter(a => a.status === 'active')
    .map(a => `${a.name} (${a.role.replace(/_/g, ' ')})`)
    .join('\n- ');

  const prompt = `Decompose this objective into ${maxTasks} or fewer specific, actionable tasks:

"${objective}"

${agentList ? `Available AI employees:\n- ${agentList}` : 'No AI employees currently available.'}

For each task, provide:
1. **Title** — Clear, specific task title
2. **Description** — What exactly needs to happen
3. **Assigned to** — Which agent role should handle it
4. **Priority** — low/normal/high
5. **Dependencies** — What needs to happen first (if any)

Keep tasks specific and actionable. Each task should be completable independently where possible.`;

  const result = await chatJson(config, 'You are an operations manager. Decompose complex objectives into clear, actionable tasks.', prompt, {
    temperature: 0.3,
    max_tokens: 3000,
  });

  return {
    objective,
    tasks: result || 'Task decomposition completed.',
    timestamp: new Date().toISOString(),
  };
}

// ─── Engineering Tool Handlers ──────────────────────────────────────────────

async function handleReviewCode(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const code = String(params.code || '');
  const language = String(params.language || 'auto-detect');
  const focus = Array.isArray(params.focus) ? params.focus.join(', ') : 'general quality';

  const prompt = `Review the following ${language} code. Focus on: ${focus}

\`\`\`
${code}
\`\`\`

Provide:
1. **Overall Assessment** — Quality score and summary
2. **Issues Found** — Categorized by severity (critical/major/minor)
3. **Security Concerns** — Any security vulnerabilities
4. **Performance** — Performance considerations
5. **Best Practices** — Adherence to best practices
6. **Recommendations** — Specific improvements
7. **Refactoring Suggestions** — Code organization improvements

Be specific with line references and concrete suggestions.`;

  const result = await chat(config, 'You are a senior software engineer performing a code review. Be thorough and specific.', prompt, {
    temperature: 0.2,
    max_tokens: 4096,
  });

  return {
    language,
    focus,
    review: result || 'Code review completed.',
    timestamp: new Date().toISOString(),
  };
}

async function handleWriteCode(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const description = String(params.description || '');
  const language = String(params.language || 'typescript');
  const context = String(params.context || '');

  const prompt = `Write ${language} code for: "${description}"

${context ? `Additional context:\n${context}` : ''}

Requirements:
1. Clean, well-structured code
2. Proper error handling
3. Clear comments where helpful
4. Follow ${language} best practices
5. Include usage example

Provide the complete implementation with:\n- The code in a code block\n- Brief explanation of the approach\n- Usage example\n- Any important notes or caveats`;

  const result = await chat(config, `You are an expert ${language} developer. Write clean, production-quality code.`, prompt, {
    temperature: 0.3,
    max_tokens: 4096,
  });

  return {
    language,
    description,
    code: result || 'Code generated.',
    timestamp: new Date().toISOString(),
  };
}

// ─── Memory Tool Handlers ───────────────────────────────────────────────────

async function handleStoreMemory(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const content = String(params.content || '');
  const category = String(params.category || 'context');
  const importance = Number(params.importance) || 5;

  const [entry] = await db.insert(companyMemory).values({
    orgId: ctx.orgId,
    category: category as any,
    content,
    source: ctx.agentName,
    agentId: ctx.agentId,
    taskId: ctx.taskId ?? null,
    importance: Math.min(10, Math.max(1, importance)),
  }).returning();

  return {
    stored: true,
    entryId: entry?.id,
    category,
    importance,
    timestamp: new Date().toISOString(),
  };
}

async function handleSearchMemory(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const query = String(params.query || '');
  const category = params.category ? String(params.category) : undefined;
  const limit = Number(params.limit) || 10;

  const conditions = [eq(companyMemory.orgId, ctx.orgId)];
  if (category) conditions.push(eq(companyMemory.category, category as any));

  const entries = await db
    .select()
    .from(companyMemory)
    .where(and(...conditions))
    .orderBy(desc(companyMemory.importance), desc(companyMemory.createdAt))
    .limit(limit);

  // Filter by query relevance if provided
  const filtered = query
    ? entries.filter(e =>
        e.content.toLowerCase().includes(query.toLowerCase()) ||
        e.source?.toLowerCase().includes(query.toLowerCase())
      )
    : entries;

  return {
    query,
    category,
    results: filtered.map(e => ({
      id: e.id,
      content: e.content,
      category: e.category,
      importance: e.importance,
      source: e.source,
      createdAt: e.createdAt,
    })),
    totalFound: filtered.length,
    timestamp: new Date().toISOString(),
  };
}

// ─── System Tool Handlers ───────────────────────────────────────────────────

async function handleGetOrgStatus(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const [agentCount, taskStats, goalStats, memoryCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(agents).where(eq(agents.orgId, ctx.orgId)),
    db.select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
      inProgress: sql<number>`count(*) filter (where ${tasks.status} = 'in_progress')::int`,
      failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')::int`,
    }).from(tasks).where(eq(tasks.orgId, ctx.orgId)),
    db.select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${goals.status} = 'active')::int`,
      completed: sql<number>`count(*) filter (where ${goals.status} = 'completed')::int`,
    }).from(goals).where(eq(goals.orgId, ctx.orgId)),
    db.select({ count: sql<number>`count(*)::int` }).from(companyMemory).where(eq(companyMemory.orgId, ctx.orgId)),
  ]);

  const pendingApprovals = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(approvals)
    .where(and(eq(approvals.orgId, ctx.orgId), eq(approvals.status, 'pending')));

  return {
    agents: {
      total: agentCount[0]?.count ?? 0,
    },
    tasks: {
      total: taskStats[0]?.total ?? 0,
      completed: taskStats[0]?.completed ?? 0,
      inProgress: taskStats[0]?.inProgress ?? 0,
      failed: taskStats[0]?.failed ?? 0,
    },
    goals: {
      total: goalStats[0]?.total ?? 0,
      active: goalStats[0]?.active ?? 0,
      completed: goalStats[0]?.completed ?? 0,
    },
    memory: {
      entries: memoryCount[0]?.count ?? 0,
    },
    approvals: {
      pending: pendingApprovals[0]?.count ?? 0,
    },
    timestamp: new Date().toISOString(),
  };
}

async function handleNotifyFounder(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  config: AppConfig,
  db: Db,
): Promise<unknown> {
  const title = String(params.title || 'Update from AI Employee');
  const message = String(params.message || '');
  const type = String(params.type || 'info');

  try {
    const prefs = await getNotificationPrefs(db, ctx.orgId);
    if (shouldNotify(prefs, 'inApp', 'agent')) {
      createNotification(db, ctx.orgId, 'agent', title, `${ctx.agentName}: ${message}`);
    }
  } catch {
    // Notification failure is non-fatal
  }

  broadcastToOrg(ctx.orgId, {
    type: 'agent.notification',
    agentName: ctx.agentName,
    title,
    message,
    notificationType: type,
  });

  return {
    sent: true,
    title,
    timestamp: new Date().toISOString(),
  };
}
