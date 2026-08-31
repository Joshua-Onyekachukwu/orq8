import type { AppConfig } from '@orq8/core';
import { startTrace, endTrace, persistTrace } from './llm-tracer.js';
import type { Db } from '@orq8/db';

/**
 * LLM client — communicates with the LiteLLM gateway (docs/22 Model Routing).
 *
 * Uses the OpenAI-compatible chat completions endpoint that LiteLLM exposes.
 * Model selection is automatic via LiteLLM's router (simple-shuffle by default).
 *
 * Falls back gracefully if LiteLLM is unreachable — the Executive Agent will
 * return a structured "I'm unavailable" response rather than crashing.
 *
 * Every call is traced via llm-tracer for timing, token counts, and monitoring.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string | null;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' } | { type: 'text' };
  retries?: number;
  retryDelayMs?: number;
  // Tracing context — connects this LLM call to the pipeline
  _trace?: {
    orgId: string;
    phase: 'intent_analysis' | 'task_execution' | 'context_build' | 'memory_retrieval' | 'fallback';
    commandId?: string;
    taskId?: string;
    agentId?: string;
    db?: Db;
  };
}

/**
 * Send a chat completion request to the LiteLLM gateway.
 *
 * @param config - App configuration (needs LITELLM_BASE_URL and LITELLM_MASTER_KEY)
 * @param options - Chat completion options
 * @returns The completion response or null if the request fails
 */
export async function chatCompletion(
  config: AppConfig,
  options: LLMOptions,
): Promise<ChatCompletionResponse | null> {
  const baseUrl = config.LITELLM_BASE_URL;
  const masterKey = config.LITELLM_MASTER_KEY ?? 'sk-orq8-dev-litellm';
  const maxRetries = options.retries ?? 2;
  const baseDelay = options.retryDelayMs ?? 1000;
  const model = options.model ?? 'llama3.2';

  if (!baseUrl) {
    return null; // LiteLLM not configured
  }

  let lastError: string = 'unknown';

  // Start tracing if context is provided
  const traceCtx = options._trace;
  let traceId: string | undefined;
  let traceStartedAt: Date | undefined;

  if (traceCtx) {
    const trace = startTrace({
      orgId: traceCtx.orgId,
      phase: traceCtx.phase,
      model,
      temperature: options.temperature,
      maxTokens: options.max_tokens,
      commandId: traceCtx.commandId,
      taskId: traceCtx.taskId,
      agentId: traceCtx.agentId,
      maxRetries,
    });
    traceId = trace.traceId;
    traceStartedAt = trace.startedAt;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Exponential backoff with jitter on retries
      if (attempt > 0) {
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${masterKey}`,
        },
        body: JSON.stringify({
          model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens ?? 2048,
          ...(options.response_format ? { response_format: options.response_format } : {}),
        }),
        signal: AbortSignal.timeout(120_000), // 2-minute timeout
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        // Don't retry on 4xx client errors (except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          if (traceId) {
            endTrace(traceId, { success: false, error: lastError });
            if (traceCtx?.db) await persistTrace(traceCtx.db, recentTrace(traceId));
          }
          return null;
        }
        continue; // Retry on 5xx or 429
      }

      const data = (await response.json()) as ChatCompletionResponse;

      // Record successful trace
      if (traceId) {
        const usage = data.usage;
        endTrace(traceId, {
          success: true,
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
          model: data.model,
          responsePreview: data.choices?.[0]?.message?.content,
        });
        if (traceCtx?.db) await persistTrace(traceCtx.db, recentTrace(traceId));
      }

      return data;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'network error';
      // Don't retry on abort/timeout — fail fast
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (traceId) {
          endTrace(traceId, { success: false, error: 'timeout' });
          if (traceCtx?.db) await persistTrace(traceCtx.db, recentTrace(traceId));
        }
        return null;
      }
    }
  }

  // All retries exhausted
  if (traceId) {
    endTrace(traceId, { success: false, error: `all ${maxRetries + 1} attempts failed: ${lastError}` });
    if (traceCtx?.db) await persistTrace(traceCtx.db, recentTrace(traceId));
  }

  return null;
}

/**
 * Convenience: send a single user message and get the assistant's text response.
 * Returns null if LLM is unavailable.
 */
export async function chat(
  config: AppConfig,
  systemPrompt: string,
  userMessage: string,
  options: { model?: string; temperature?: number; max_tokens?: number; retries?: number; _trace?: LLMOptions['_trace'] } = {},
): Promise<string | null> {
  const response = await chatCompletion(config, {
    model: options.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 2048,
    retries: options.retries,
    _trace: options._trace,
  });

  return response?.choices?.[0]?.message?.content ?? null;
}

/**
 * Convenience: send a JSON-structured request and parse the response.
 * Returns the parsed JSON object or null if parsing fails.
 */
export async function chatJson<T = unknown>(
  config: AppConfig,
  systemPrompt: string,
  userMessage: string,
  options: { model?: string; temperature?: number; max_tokens?: number; retries?: number; _trace?: LLMOptions['_trace'] } = {},
): Promise<T | null> {
  const text = await chat(config, systemPrompt, userMessage, {
    ...options,
    temperature: options.temperature ?? 0.3, // Lower temp for structured output
    retries: options.retries ?? 1, // JSON needs higher success rate
    _trace: options._trace,
  });

  if (!text) return null;

  // Try to extract JSON from the response (LLMs sometimes wrap in markdown code blocks)
  try {
    // First try direct parse
    return JSON.parse(text) as T;
  } catch {
    // Try extracting from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch?.[1]) {
      try {
        return JSON.parse(jsonMatch[1]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── Tracing Helpers ───────────────────────────────────────────────────────

import { getTraceById } from './llm-tracer.js';
import type { LLMTraceEntry } from './llm-tracer.js';

/**
 * Retrieve the most recent trace entry by ID (for persisting after completion).
 */
function recentTrace(id: string): LLMTraceEntry {
  const found = getTraceById(id);
  // Return a minimal entry if not found (shouldn't happen in practice)
  return found ?? {
    id,
    orgId: '',
    phase: 'fallback' as const,
    model: 'unknown',
    provider: 'unknown',
    startedAt: new Date(),
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    success: false,
    retryAttempt: 0,
    maxRetries: 0,
    temperature: 0,
    maxTokens: 0,
  };
}
