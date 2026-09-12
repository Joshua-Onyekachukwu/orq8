/**
 * Routed chat — the shared path that connects §31 model routing to §7 measured
 * outcomes for every LLM call that isn't a task execution.
 *
 * The task executor already consults `selectMeasuredModel` (measured
 * llm_performance history) and records `routing_source`. Tool handlers did
 * NEITHER: they called chat() with no model, no trace, and no persistence —
 * meaning the router could never learn from a large share of real traffic.
 * Every handler now goes through here, which:
 *
 *   1. Routes: classifies the work and consults measured per-org history so a
 *      degraded model is routed away from and a proven sibling is preferred.
 *   2. Records: traces the call and persists it to llm_performance with the
 *      routing_source label — the feedback loop closes on tool traffic too.
 */

import type { AppConfig } from '@orq8/core';
import type { Db } from '@orq8/db';
import { chat, chatJson } from './llm.js';
import { classifyTask } from './model-intelligence.js';
import { selectMeasuredModel } from './model-selector.js';
import type { ToolExecutionContext } from './tool-registry.js';

interface RoutedOptions {
  temperature?: number;
  max_tokens?: number;
  retries?: number;
  taskId?: string;
  tool?: string;
}

async function resolveRoutedModel(
  db: Db,
  ctx: ToolExecutionContext,
  options: RoutedOptions,
): Promise<{ modelId: string | undefined; source: 'static' | 'measured' | 'default' }> {
  const routing = classifyTask({
    title: ctx.agentRole,
    description: `${ctx.agentName ?? ''} ${options.tool ?? ''}`.slice(0, 500),
    agentRole: ctx.agentRole,
  });
  const { modelId, source } = await selectMeasuredModel(db, ctx.orgId, routing);
  return { modelId, source };
}

/**
 * Route + record a chat call for a tool execution.
 * Same contract as chat() but org-aware: the model is chosen with measured
 * history and the call is persisted to llm_performance.
 */
export async function routedToolChat(
  config: AppConfig,
  db: Db,
  ctx: ToolExecutionContext,
  systemPrompt: string,
  userMessage: string,
  options: RoutedOptions = {},
): Promise<string | null> {
  const { modelId, source } = await resolveRoutedModel(db, ctx, options);

  return chat(config, systemPrompt, userMessage, {
    model: modelId,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 2048,
    retries: options.retries,
    _trace: {
      orgId: ctx.orgId,
      phase: 'task_execution',
      taskId: options.taskId,
      agentId: ctx.agentId,
      db,
      routingSource: source,
    },
  });
}

/** JSON-structured variant of routedToolChat (same routing + recording). */
export async function routedToolChatJson<T = unknown>(
  config: AppConfig,
  db: Db,
  ctx: ToolExecutionContext,
  systemPrompt: string,
  userMessage: string,
  options: RoutedOptions = {},
): Promise<T | null> {
  const { modelId, source } = await resolveRoutedModel(db, ctx, options);

  return chatJson<T>(config, systemPrompt, userMessage, {
    model: modelId,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens ?? 2048,
    retries: options.retries,
    _trace: {
      orgId: ctx.orgId,
      phase: 'task_execution',
      taskId: options.taskId,
      agentId: ctx.agentId,
      db,
      routingSource: source,
    },
  });
}
