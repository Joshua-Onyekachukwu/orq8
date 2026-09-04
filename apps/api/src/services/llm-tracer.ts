/**
 * LLM Call Tracer — structured logging for every LLM interaction.
 *
 * Tracks: timing, token usage, model, success/failure, retry attempts,
 * and provides aggregate statistics for monitoring.
 *
 * Design: Every LLM call in the Executive Agent pipeline goes through
 * this tracer so we have full visibility into model usage and costs.
 */

import { activityEvents, type Db } from '@orq8/db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LLMTraceEntry {
  id: string;
  orgId: string;
  commandId?: string;
  taskId?: string;
  agentId?: string;
  phase: 'intent_analysis' | 'task_execution' | 'context_build' | 'memory_retrieval' | 'fallback';
  model: string;
  provider: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  success: boolean;
  error?: string;
  retryAttempt: number;
  maxRetries: number;
  temperature: number;
  maxTokens: number;
  responsePreview?: string;
}

export interface LLMTraceSummary {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalTokens: number;
  totalDurationMs: number;
  averageDurationMs: number;
  tokensPerSecond: number;
  byPhase: Record<string, { calls: number; tokens: number; avgDurationMs: number }>;
  byModel: Record<string, { calls: number; tokens: number }>;
  retryRate: number;
  errorRate: number;
}

// ─── In-memory trace store (recent traces for dashboard) ────────────────────

const recentTraces: LLMTraceEntry[] = [];
const MAX_RECENT_TRACES = 200;

// ─── Tracing Functions ──────────────────────────────────────────────────────

let traceCounter = 0;

/**
 * Generate a unique trace ID.
 */
function traceId(): string {
  traceCounter++;
  return `trace_${Date.now()}_${traceCounter}`;
}

/**
 * Start tracing an LLM call. Returns a trace context that must be passed
 * to `endTrace` when the call completes.
 */
export function startTrace(params: {
  orgId: string;
  phase: LLMTraceEntry['phase'];
  model?: string;
  /** Actual provider serving the call (e.g. 'nvidia', 'litellm', 'ollama'). */
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  commandId?: string;
  taskId?: string;
  agentId?: string;
  retryAttempt?: number;
  maxRetries?: number;
}): { traceId: string; startedAt: Date } {
  const id = traceId();
  const startedAt = new Date();

  const entry: LLMTraceEntry = {
    id,
    orgId: params.orgId,
    commandId: params.commandId,
    taskId: params.taskId,
    agentId: params.agentId,
    phase: params.phase,
    model: params.model ?? 'unknown',
    provider: params.provider ?? extractProvider(params.model),
    startedAt,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    success: false,
    retryAttempt: params.retryAttempt ?? 0,
    maxRetries: params.maxRetries ?? 2,
    temperature: params.temperature ?? 0.7,
    maxTokens: params.maxTokens ?? 2048,
  };

  recentTraces.push(entry);
  if (recentTraces.length > MAX_RECENT_TRACES) {
    recentTraces.shift();
  }

  return { traceId: id, startedAt };
}

/**
 * End a trace, recording the result.
 */
export function endTrace(
  traceId: string,
  result: {
    success: boolean;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    error?: string;
    responsePreview?: string;
    model?: string;
  },
): void {
  const entry = recentTraces.find(t => t.id === traceId);
  if (!entry) return;

  entry.completedAt = new Date();
  entry.durationMs = entry.completedAt.getTime() - entry.startedAt.getTime();
  entry.success = result.success;
  entry.promptTokens = result.promptTokens ?? 0;
  entry.completionTokens = result.completionTokens ?? 0;
  entry.totalTokens = result.totalTokens ?? 0;
  entry.error = result.error;
  entry.responsePreview = result.responsePreview?.slice(0, 200);
  if (result.model) entry.model = result.model;
}

/**
 * Record an LLM trace as a database activity event for permanent storage.
 */
export async function persistTrace(
  db: Db,
  trace: LLMTraceEntry,
): Promise<void> {
  if (!trace.completedAt) return;

  const summary = [
    `[${trace.phase}]`,
    trace.success ? '✅' : '❌',
    `${trace.model}`,
    `${trace.durationMs}ms`,
    `${trace.totalTokens} tokens`,
    trace.retryAttempt > 0 ? `(retry ${trace.retryAttempt}/${trace.maxRetries})` : '',
  ].filter(Boolean).join(' ');

  try {
    await db.insert(activityEvents).values({
      orgId: trace.orgId,
      agentId: trace.agentId ?? null,
      taskId: trace.taskId ?? null,
      type: trace.success ? 'llm.success' : 'llm.error',
      summary,
      reason: trace.error ?? `LLM call completed in ${trace.durationMs}ms`,
      cost: Math.max(0, Math.ceil(trace.totalTokens / 1000)),
      department: null,
    });
  } catch {
    // Trace persistence should not block the pipeline
  }
}

/**
 * Get a trace entry by its ID.
 */
export function getTraceById(traceId: string): LLMTraceEntry | undefined {
  return recentTraces.find(t => t.id === traceId);
}

/**
 * Get recent traces for an organization.
 */
export function getRecentTraces(
  orgId: string,
  limit: number = 50,
): LLMTraceEntry[] {
  return recentTraces
    .filter(t => t.orgId === orgId)
    .slice(-limit);
}

/**
 * Get trace summary statistics for an organization.
 */
export function getTraceSummary(orgId: string): LLMTraceSummary {
  const traces = recentTraces.filter(t => t.orgId === orgId && t.completedAt);

  const totalCalls = traces.length;
  const successfulCalls = traces.filter(t => t.success).length;
  const failedCalls = totalCalls - successfulCalls;
  const totalTokens = traces.reduce((sum, t) => sum + t.totalTokens, 0);
  const totalDurationMs = traces.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  const averageDurationMs = totalCalls > 0 ? totalDurationMs / totalCalls : 0;
  const tokensPerSecond = totalDurationMs > 0 ? (totalTokens / (totalDurationMs / 1000)) : 0;

  const byPhase: Record<string, { calls: number; tokens: number; avgDurationMs: number }> = {};
  const byModel: Record<string, { calls: number; tokens: number }> = {};

  for (const t of traces) {
    // By phase
    let phaseEntry = byPhase[t.phase];
    if (!phaseEntry) { phaseEntry = { calls: 0, tokens: 0, avgDurationMs: 0 }; byPhase[t.phase] = phaseEntry; }
    phaseEntry.calls++;
    phaseEntry.tokens += t.totalTokens;
    phaseEntry.avgDurationMs += t.durationMs ?? 0;

    // By model
    let modelEntry = byModel[t.model];
    if (!modelEntry) { modelEntry = { calls: 0, tokens: 0 }; byModel[t.model] = modelEntry; }
    modelEntry.calls++;
    modelEntry.tokens += t.totalTokens;
  }

  // Compute averages
  for (const phase of Object.values(byPhase)) {
    phase.avgDurationMs = phase.calls > 0 ? phase.avgDurationMs / phase.calls : 0;
  }

  const retryCalls = traces.filter(t => t.retryAttempt > 0).length;

  return {
    totalCalls,
    successfulCalls,
    failedCalls,
    totalTokens,
    totalDurationMs,
    averageDurationMs,
    tokensPerSecond,
    byPhase,
    byModel,
    retryRate: totalCalls > 0 ? retryCalls / totalCalls : 0,
    errorRate: totalCalls > 0 ? failedCalls / totalCalls : 0,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractProvider(model?: string): string {
  if (!model) return 'unknown';
  const lower = model.toLowerCase();
  if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3')) return 'openai';
  if (lower.includes('claude')) return 'anthropic';
  if (lower.includes('llama') || lower.includes('mistral') || lower.includes('mixtral')) return 'meta';
  if (lower.includes('gemini')) return 'google';
  return 'litellm';
}
