import type { AppConfig } from '@orq8/core';
import { startTrace, endTrace, persistTrace } from './llm-tracer.js';
import type { Db } from '@orq8/db';

/**
 * LLM client — multi-provider, multi-key chat completions with automatic
 * failover, designed to keep concurrent tasks flowing without hiccups.
 *
 * Provider chain (docs/22): NVIDIA NIM → LiteLLM → Ollama → structured fallback.
 * - NVIDIA NIM is used when NVIDIA_API_KEY / NVIDIA_API_KEYS is set.
 * - LiteLLM is used when LITELLM_BASE_URL is set (OpenAI-compatible gateway).
 * - Ollama (local models) is used when OLLAMA_BASE_URL is set.
 *
 * NVIDIA key pool:
 * - NVIDIA_API_KEY plus the comma-separated NVIDIA_API_KEYS list form a key
 *   pool. Concurrent calls rotate through the pool round-robin so no single
 *   key absorbs every request (fewer 429s under parallel task execution).
 * - Per-key 429 smoothing: each key's recent 429 rate is tracked in a sliding
 *   window; keys that have been rate-limited recently are temporarily
 *   deprioritized (sorted to the tail of the attempt order) so a hot key
 *   isn't re-picked first on every request while it cools down.
 * - If a key is invalid (401/403) or lacks a model (404), it is failed over
 *   to the next key immediately. Rate limits (429) respect Retry-After and
 *   retry on the same key before escalating. When the whole pool is
 *   exhausted, the call escalates to the next provider (LiteLLM → Ollama).
 *
 * Timeouts (docs/22): unprovisioned provider functions sometimes HANG instead
 * of returning 404. Each attempt uses a two-stage timeout — a short
 * "first byte" deadline (LLM_HEADERS_TIMEOUT_MS, default 30s) that aborts
 * requests the server never answers, and a generous total budget
 * (LLM_TIMEOUT_MS, default 90s) for slow-but-alive generations. A timeout is
 * treated like a 404 for NVIDIA (same-account keys share the behavior, so the
 * remaining keys are skipped for that model) — a dead model costs one
 * timeout, not one timeout per key.
 *
 * Each provider attempt is traced via llm-tracer for timing, tokens, and
 * monitoring — failed providers surface as llm.error activity events and the
 * provider that served the call is recorded on its trace.
 */

// ─── Provider chain types ───────────────────────────────────────────────────

export type LLMProviderId = 'nvidia' | 'openrouter' | 'litellm' | 'ollama';

export interface LLMProviderSpec {
  id: LLMProviderId;
  label: string;
  /** OpenAI-compatible root URL (NVIDIA base URLs typically end in /v1). */
  baseUrl: string;
  /**
   * Bearer keys tried in order for this provider. NVIDIA holds multiple keys
   * (rotation + failover); LiteLLM holds one; Ollama holds none (no auth).
   */
  apiKeys: string[];
  defaultModel: string;
  /**
   * Models tried after defaultModel when it 404s for the account (NVIDIA
   * model entitlements vary per account — see NVIDIA_MODEL_FALLBACKS).
   */
  modelFallbacks?: string[];
}

/** NVIDIA config keys used by the pool builder. */
type NvidiaConfig = Pick<
  AppConfig,
  | 'NVIDIA_API_KEY'
  | 'NVIDIA_API_KEYS'
  | 'NVIDIA_BASE_URL'
  | 'NVIDIA_MODEL'
  | 'NVIDIA_MODEL_FALLBACKS'
  | 'OPENROUTER_API_KEY'
  | 'OPENROUTER_API_KEYS'
  | 'OPENROUTER_BASE_URL'
  | 'OPENROUTER_MODEL'
  | 'OPENROUTER_MODEL_FALLBACKS'
  | 'LITELLM_BASE_URL'
  | 'LITELLM_MASTER_KEY'
  | 'OLLAMA_BASE_URL'
  | 'OLLAMA_MODEL'
>;

/**
 * Build the ordered provider chain from configuration.
 * Only providers that are actually configured are included, in priority order:
 * NVIDIA NIM → LiteLLM → Ollama.
 */
export function buildProviderChain(config: NvidiaConfig): LLMProviderSpec[] {
  const chain: LLMProviderSpec[] = [];

  const nvidiaKeys = uniqueKeys([
    config.NVIDIA_API_KEY,
    ...(config.NVIDIA_API_KEYS?.split(',').map((k) => k.trim()) ?? []),
  ]);

  if (nvidiaKeys.length > 0) {
    chain.push({
      id: 'nvidia',
      label: 'NVIDIA NIM',
      baseUrl: config.NVIDIA_BASE_URL,
      apiKeys: nvidiaKeys,
      defaultModel: config.NVIDIA_MODEL,
      modelFallbacks: uniqueKeys(config.NVIDIA_MODEL_FALLBACKS?.split(',') ?? []).filter((m) => m !== config.NVIDIA_MODEL),
    });
  }

  // OpenRouter — sits between NVIDIA and LiteLLM in priority
  const openrouterKeys = uniqueKeys([
    config.OPENROUTER_API_KEY,
    ...(config.OPENROUTER_API_KEYS?.split(',').map((k) => k.trim()) ?? []),
  ]);

  if (openrouterKeys.length > 0) {
    chain.push({
      id: 'openrouter',
      label: 'OpenRouter',
      baseUrl: config.OPENROUTER_BASE_URL,
      apiKeys: openrouterKeys,
      defaultModel: config.OPENROUTER_MODEL,
      modelFallbacks: uniqueKeys(config.OPENROUTER_MODEL_FALLBACKS?.split(',') ?? []).filter((m) => m !== config.OPENROUTER_MODEL),
    });
  }

  if (config.LITELLM_BASE_URL) {
    chain.push({
      id: 'litellm',
      label: 'LiteLLM',
      baseUrl: config.LITELLM_BASE_URL,
      apiKeys: [config.LITELLM_MASTER_KEY ?? 'sk-orq8-dev-litellm'],
      defaultModel: 'llama3.2',
    });
  }

  if (config.OLLAMA_BASE_URL) {
    chain.push({
      id: 'ollama',
      label: 'Ollama',
      baseUrl: config.OLLAMA_BASE_URL,
      apiKeys: [], // local models — no auth
      defaultModel: config.OLLAMA_MODEL,
    });
  }

  return chain;
}

/**
 * The highest-priority configured provider, or null when none are configured.
 * Useful for reporting (e.g. "which provider runs this command").
 */
export function getPrimaryProviderId(config: NvidiaConfig): LLMProviderId | null {
  const chain = buildProviderChain(config);
  return chain[0]?.id ?? null;
}

/** Dedupe and drop empty entries from a key pool, preserving order. */
function uniqueKeys(keys: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    const trimmed = k?.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Normalize any provider base URL to the OpenAI-compatible chat completions
 * endpoint. Handles both conventions:
 *   "https://integrate.api.nvidia.com/v1"  → /v1/chat/completions (no double /v1)
 *   "http://localhost:4000"                → /v1/chat/completions
 */
export function chatCompletionsEndpoint(baseUrl: string): string {
  const root = baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
  return `${root}/v1/chat/completions`;
}

// ─── Chat types ─────────────────────────────────────────────────────────────

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

// ─── Key rotation state ─────────────────────────────────────────────────────

// Round-robin cursor so concurrent requests spread across the NVIDIA key pool
// instead of hammering one key into rate limits.
let nvidiaKeyCursor = 0;

/**
 * Internal test hook — resets the round-robin cursor so tests can assert
 * deterministic key ordering. Not used by application code.
 */
export function __resetNvidiaKeyCursor(): void {
  nvidiaKeyCursor = 0;
}

// ─── Per-key health (429 smoothing) ────────────────────────────────────────
// Under sustained parallel load a rate-limited key keeps getting picked by the
// round-robin, burning a 429 + backoff before failing over. We track each
// key's recent 429 rate and DEPRIORITIZE hot keys (stable-sort them to the
// tail of the attempt order) until they cool down. Every key is still tried —
// a hot key is never excluded, so an all-hot pool (or a recovered key) keeps
// working.

const KEY_HEALTH_WINDOW_MS = 60_000; // 429s older than this no longer count
const KEY_HOT_THRESHOLD = 2; // 429s within the window marks a key hot

interface KeyHealth {
  /** Epoch-ms timestamps of recent 429 responses for this key. */
  rateLimitHits: number[];
}

const keyHealth = new Map<string, KeyHealth>();

/** Internal test hook — clears all recorded health. Not used by application code. */
export function __resetNvidiaKeyHealth(): void {
  keyHealth.clear();
}

/** Record a 429 on a key (cheap; pruning happens lazily on read). */
function recordRateLimit(key: string, now = Date.now()): void {
  let h = keyHealth.get(key);
  if (!h) {
    h = { rateLimitHits: [] };
    keyHealth.set(key, h);
  }
  h.rateLimitHits.push(now);
}

function isKeyHot(key: string, now = Date.now()): boolean {
  const h = keyHealth.get(key);
  if (!h) return false;
  const cutoff = now - KEY_HEALTH_WINDOW_MS;
  // Lazy pruning: drop hits older than the window (noUncheckedIndexedAccess
  // makes [0] possibly-undefined, hence the guard).
  while (h.rateLimitHits.length > 0) {
    const oldest = h.rateLimitHits[0];
    if (oldest === undefined || oldest >= cutoff) break;
    h.rateLimitHits.shift();
  }
  if (h.rateLimitHits.length === 0) {
    keyHealth.delete(key); // fully cooled — drop the entry
    return false;
  }
  return h.rateLimitHits.length >= KEY_HOT_THRESHOLD;
}

/**
 * Build the attempt order for a multi-key provider: round-robin rotation
 * first (spreads parallel load), then a stable partition so keys that have
 * been rate-limited recently sink to the tail. Stable sorting preserves the
 * round-robin order within both the cool and hot groups.
 */
function orderKeysForAttempt(keys: string[], startIdx: number, now = Date.now()): string[] {
  // Keys are deduped/non-empty upstream, so the index reads can't be undefined
  // (noUncheckedIndexedAccess); filter narrows the type without changing data.
  const rotated = keys
    .map((_, i) => keys[(startIdx + i) % keys.length] as string)
    .filter((k): k is string => k !== undefined);
  // Cool keys first, hot keys last (stable sort preserves round-robin order
  // within each group). A key is only ever deprioritized, never excluded.
  return rotated.sort((a, b) => Number(isKeyHot(a, now)) - Number(isKeyHot(b, now)));
}

/** Read a Retry-After header (seconds, or HTTP-date) and cap it. */
// ─── Diagnostics collector ─────────────────────────────────────────────────
// Stores the most recent NVIDIA 404 diagnostics per org so callers can
// surface actionable warnings after a chat/chatJson call.  Scoped by orgId
// to avoid cross-tenant leakage; the map is bounded (last N orgs).

const MAX_DIAGNOSTIC_ORGS = 100;
const nvidiaDiagnosticsStore = new Map<string, NVIDIAFunctionNotFoundDiagnostic[]>();

/**
 * Record 404 diagnostics from the most recent LLM call for an org.
 */
function storeNvidiaDiagnostics(orgId: string, diags: NVIDIAFunctionNotFoundDiagnostic[]): void {
  if (diags.length === 0) return;
  nvidiaDiagnosticsStore.set(orgId, diags);
  // Simple LRU-ish eviction: when the map gets large, drop the oldest entries.
  if (nvidiaDiagnosticsStore.size > MAX_DIAGNOSTIC_ORGS) {
    const firstKey = nvidiaDiagnosticsStore.keys().next().value;
    if (firstKey !== undefined) nvidiaDiagnosticsStore.delete(firstKey);
  }
}

/**
 * Retrieve the most recent NVIDIA 404 diagnostics for an org, then clear them
 * (one-shot read).  Returns an empty array when no diagnostics are pending.
 */
export function popNvidiaDiagnostics(orgId: string): NVIDIAFunctionNotFoundDiagnostic[] {
  const diags = nvidiaDiagnosticsStore.get(orgId) ?? [];
  nvidiaDiagnosticsStore.delete(orgId);
  return diags;
}

/** Internal test hook — clears all stored diagnostics. */
export function __resetNvidiaDiagnostics(): void {
  nvidiaDiagnosticsStore.clear();
}

function retryAfterMs(headers: Headers): number {
  const raw = headers.get('retry-after');
  if (!raw) return 0;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.min(Math.max(secs, 0), 5) * 1000;
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), 5000);
  return 0;
}

/**
 * Raised when a provider attempt is aborted because it hung (docs/22).
 * Distinct from other network errors so the fallback chain can treat a
 * timeout the same way it treats a 404: move on, don't burn the remaining
 * same-account keys on a function that will never answer.
 */
export class LLMTimeoutError extends Error {
  constructor(
    public readonly kind: 'headers' | 'total',
    timeoutMs: number,
  ) {
    super(`LLM ${kind} timeout after ${timeoutMs}ms`);
    this.name = 'LLMTimeoutError';
  }
}

/**
 * Fetch with a two-stage deadline (docs/22):
 *
 * 1. Headers deadline — abort if the server hasn't responded at all within
 *    `headersTimeoutMs`. Unprovisioned provider functions hang here (no 404),
 *    so this is what keeps a dead model from stalling the chain.
 * 2. Total deadline — the overall budget covering the body read. Once headers
 *    arrive the request is alive, so this stays generous for long
 *    generations. Call `cancelTotal()` once the body has been consumed to
 *    release the timer.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  opts: { headersTimeoutMs: number; totalTimeoutMs: number },
): Promise<{ response: Response; cancelTotal: () => void }> {
  const controller = new AbortController();
  const headersTimer = setTimeout(
    () => controller.abort(new LLMTimeoutError('headers', opts.headersTimeoutMs)),
    opts.headersTimeoutMs,
  );
  const totalTimer = setTimeout(
    () => controller.abort(new LLMTimeoutError('total', opts.totalTimeoutMs)),
    opts.totalTimeoutMs,
  );
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(headersTimer);
    return {
      response,
      // Total budget still applies to the body read; clear it once done.
      cancelTotal: () => clearTimeout(totalTimer),
    };
  } finally {
    clearTimeout(headersTimer);
  }
}

/**
 * Diagnostics surfaced when a NVIDIA key hits a 404 "Function not found for
 * account" response.  The Account ID is extracted from NVIDIA's error body so
 * the caller can verify scope/entitlement on build.nvidia.com without
 * leaving the app.
 */
export interface NVIDIAFunctionNotFoundDiagnostic {
  /** The exact model that triggered the 404. */
  model: string;
  /** Last 6 characters of the key that was tried (for identification). */
  keySuffix: string;
  /** Account ID parsed from the 404 response body, if available. */
  accountId?: string;
  /** Raw NVIDIA error detail message. */
  nvidiaDetail?: string;
  /** Actionable hint shown to the user. */
  hint: string;
}

export interface LLMCallResult {
  response: ChatCompletionResponse | null;
  /** Structured diagnostics collected during the provider chain traversal. */
  diagnostics: {
    nvidiaFunctionNotFound: NVIDIAFunctionNotFoundDiagnostic[];
  };
}

/**
 * Parse a NVIDIA 404 response body to extract the Account ID.
 *
 * NVIDIA returns bodies like:
 *   { "detail": "Function not found for account [Account ID: org-abc123]" }
 * or:
 *   { "detail": "Function not found for account." }
 *
 * Returns `{ accountId, nvidiaDetail }` when the body matches the expected
 * shape, or `undefined` when the body is unreadable or doesn't contain an
 * account reference.
 */
export async function parseNvidia404Body(response: Response): Promise<
  { accountId?: string; nvidiaDetail?: string } | undefined
> {
  try {
    const text = await response.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return undefined; // not JSON
    }
    const detail = typeof body.detail === 'string' ? body.detail : undefined;
    if (!detail) return undefined;
    // Extract account ID from patterns like:
    //   "Function not found for account [Account ID: org-abc123]"
    //   "Function not found for account (Account ID: org-abc123)"
    const match = detail.match(/Account\s+ID:\s*([\w.-]+)/i);
    return {
      accountId: match?.[1],
      nvidiaDetail: detail,
    };
  } catch {
    return undefined; // best-effort — never block the chain
  }
}

/**
 * Build an actionable hint from a 404 diagnostic.
 */
export function buildNvidia404Hint(accountId?: string): string {
  const accountPart = accountId
    ? ` Your NVIDIA Account ID is **${accountId}** — log in to [build.nvidia.com](https://build.nvidia.com) and verify that this account has the **"Public API Endpoints"** scope enabled under *Account Settings → API Keys*.`
    : ' Log in to [build.nvidia.com](https://build.nvidia.com) and verify your API key has the **"Public API Endpoints"** scope enabled under *Account Settings → API Keys*.';
  return `NVIDIA returned 404 "Function not found for account", which usually means the API key lacks access to this model.${accountPart}`;
}

/**
 * Send a chat completion request through the provider + key fallback chain.
 *
 * Order: for each configured provider (NVIDIA → LiteLLM → Ollama), try its key
 * pool — starting at a round-robin cursor for NVIDIA so concurrent calls use
 * different keys. Within a key, up to `retries + 1` attempts with exponential
 * backoff; 429s respect Retry-After; other 4xx and timeouts fail that key fast
 * and move to the next key / provider. Returns `null` response when everything
 * failed so the Executive Agent can fall back to a structured response.
 *
 * The `diagnostics` field carries structured warnings (e.g. 404 Account ID
 * extraction) so callers can surface actionable guidance instead of silently
 * failing over.
 */
export async function chatCompletion(
  config: AppConfig,
  options: LLMOptions,
): Promise<ChatCompletionResponse | null> {
  const chain = buildProviderChain(config);
  if (chain.length === 0) {
    return null; // No LLM provider configured → structured fallback
  }

  const maxRetries = options.retries ?? 2;
  const baseDelay = options.retryDelayMs ?? 1000;
  const traceCtx = options._trace;
  const explicitModel = options.model;

  let lastError = 'no provider reached';
  const nvidiaFunctionNotFound: NVIDIAFunctionNotFoundDiagnostic[] = [];

  // Import circuit breaker for provider failure handling
  const { isAvailable, recordSuccess, recordFailure } = await import('./circuit-breaker.js');

  for (const provider of chain) {
    // Circuit breaker: skip providers that are in open state
    if (!isAvailable(provider.id)) {
      lastError = `${provider.label} circuit breaker open (too many recent failures)`;
      continue;
    }

    const endpoint = chatCompletionsEndpoint(provider.baseUrl);
    const keys = provider.apiKeys.length > 0 ? provider.apiKeys : [''];
    // Models tried for this provider: the default first, then NVIDIA fallbacks.
    // An explicitly requested model is used as-is (no silent substitution).
    const models = explicitModel
      ? [explicitModel]
      : [provider.defaultModel, ...(provider.modelFallbacks ?? [])];
    // Round-robin start index for multi-key providers (spreads concurrent load)
    const startIdx =
      provider.id === 'nvidia' && keys.length > 1 ? (nvidiaKeyCursor++ % keys.length) : 0;

    // One trace per provider so the activity feed shows which provider served
    // the call and which providers failed and were escalated past.
    let traceId: string | undefined;
    if (traceCtx) {
      const trace = startTrace({
        orgId: traceCtx.orgId,
        phase: traceCtx.phase,
        model: models[0],
        provider: provider.id,
        temperature: options.temperature,
        maxTokens: options.max_tokens,
        commandId: traceCtx.commandId,
        taskId: traceCtx.taskId,
        agentId: traceCtx.agentId,
        maxRetries,
      });
      traceId = trace.traceId;
    }

    let providerError = 'unknown';

    // Walk the model list. NVIDIA entitlements are granted per account per
    // model, so when a model 404s ("Function not found for account") the next
    // fallback model is tried before escalating to the next provider.
    // 429 smoothing: rotate round-robin, then let hot keys sink to the tail so
    // a key that is being rate-limited isn't re-picked first on every request.
    const orderedKeys =
      provider.id === 'nvidia' && keys.length > 1 ? orderKeysForAttempt(keys, startIdx) : keys;

    for (let mi = 0; mi < models.length; mi++) {
      const model = models[mi] as string;
      let modelError = 'unknown';

      keyLoop:
      for (let ki = 0; ki < orderedKeys.length; ki++) {
        // '' is the no-auth sentinel for local providers (Ollama) — must NOT
        // be treated as a missing key. ?? '' narrows the noUncheckedIndexedAccess
        // type without changing behavior (index is always in bounds).
        const key = orderedKeys[ki] ?? '';
        const keyLabel = key ? `key…${key.slice(-6)}` : 'no-auth';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (key) headers.Authorization = `Bearer ${key}`;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              // Exponential backoff with jitter on retries
              const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
              await new Promise((r) => setTimeout(r, delay));
            }

            const { response, cancelTotal } = await fetchWithTimeout(
              endpoint,
              {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  model,
                  messages: options.messages,
                  temperature: options.temperature ?? 0.7,
                  max_tokens: options.max_tokens ?? 2048,
                  ...(options.response_format ? { response_format: options.response_format } : {}),
                }),
              },
              {
                headersTimeoutMs: config.LLM_HEADERS_TIMEOUT_MS,
                totalTimeoutMs: config.LLM_TIMEOUT_MS,
              },
            );

            try {
              if (!response.ok) {
                modelError = `${model} → ${keyLabel} HTTP ${response.status}`;
                const isRateLimited = response.status === 429;
                // 429 — retry within this key first (respecting Retry-After),
                // then move on. Every 429 feeds the per-key health tracker so
                // this key is deprioritized for subsequent calls.
                if (isRateLimited) {
                  // Only the multi-key NVIDIA pool uses health-based ordering.
                  if (provider.id === 'nvidia') recordRateLimit(key);
                  const ra = retryAfterMs(response.headers);
                  if (attempt < maxRetries) {
                    if (ra > 0) await new Promise((r) => setTimeout(r, ra));
                    continue;
                  }
                  continue keyLoop; // key rate-limited too hard — try the next key
                }
                // 401/403 are key-level (invalid key) — fail this key fast and try
                // the next key with the same model.
                if (response.status === 401 || response.status === 403) {
                  continue keyLoop;
                }
                // 404 ("Function not found for account") is account/model-level —
                // every key of the same account shares it, so skip the remaining
                // keys for this model and move to the next fallback model. Round-
                // robin rotation still gives every key a first shot across calls.
                if (response.status === 404) {
                  // Parse the NVIDIA error body to extract the Account ID so the
                  // user can verify scope/entitlement without leaving the app.
                  const parsed404 = await parseNvidia404Body(response);
                  const accountId = parsed404?.accountId;
                  const nvidiaDetail = parsed404?.nvidiaDetail;
                  const hint = buildNvidia404Hint(accountId);
                  nvidiaFunctionNotFound.push({
                    model,
                    keySuffix: key.slice(-6),
                    accountId,
                    nvidiaDetail,
                    hint,
                  });
                  modelError = `${model} unavailable: HTTP 404${nvidiaDetail ? ` — ${nvidiaDetail}` : ' (no model access for account)'}${accountId ? ` [Account ID: ${accountId}]` : ''}`;
                  break keyLoop;
                }
                continue; // 5xx — retry within this key
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

              // Store any 404 diagnostics collected during this provider's traversal
              // so callers can surface actionable warnings.
              if (traceCtx?.orgId) storeNvidiaDiagnostics(traceCtx.orgId, nvidiaFunctionNotFound);
              // Circuit breaker: record success for this provider/model
              recordSuccess(provider.id, model);
              return data;
            } finally {
              // Body read is done (success or error path) — release the total budget timer.
              cancelTotal();
            }
          } catch (err) {
            modelError = `${model} → ${keyLabel}: ${err instanceof Error ? err.message : 'network error'}`;
            // Timeout = the provider function hangs instead of 404ing. NVIDIA
            // keys share one account, so they share the hang too — skip the
            // remaining keys for this model and try the next fallback model
            // instead of burning a full timeout per key.
            if (err instanceof LLMTimeoutError) {
              modelError = `${model} → ${keyLabel}: ${err.message}`;
              if (provider.id === 'nvidia') break keyLoop;
              continue keyLoop;
            }
            // Don't retry on other aborts — fail this key fast, try the next one
            if (err instanceof DOMException && err.name === 'AbortError') {
              continue keyLoop;
            }
          }
        }
      }

      // Every key failed on this model — record it and try the next fallback
      providerError = `${model} unavailable: ${modelError}`;
    }

    // Provider exhausted — record its failure and try the next one in the chain
    if (traceId) {
      endTrace(traceId, { success: false, error: `${provider.id} unavailable: ${providerError}` });
      if (traceCtx?.db) await persistTrace(traceCtx.db, recentTrace(traceId));
    }
    // Circuit breaker: record provider failure
    recordFailure(provider.id);
    lastError = `${provider.id}: ${providerError}`;
  }

  // All providers exhausted — store any 404 diagnostics collected.
  if (traceCtx?.orgId) storeNvidiaDiagnostics(traceCtx.orgId, nvidiaFunctionNotFound);
  return null;
}

/**
 * Convenience: send a single user message and get the assistant's text response.
 * Returns null if every provider in the chain is unavailable.
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

import { getTraceById, getRecentTraces } from './llm-tracer.js';
import type { LLMTraceEntry } from './llm-tracer.js';

/**
 * Report which provider actually served a completed LLM phase for an org.
 *
 * Reads the most recent in-memory trace for the given phase (optionally scoped
 * to a command) and returns its provider only when the call succeeded. This
 * gives honest reporting — a configured-but-down provider reports 'none'
 * rather than claiming it ran the call. Returns null when no trace exists
 * (e.g. no provider was configured at all).
 */
export function getServedProvider(
  orgId: string,
  phase: LLMTraceEntry['phase'],
  commandId?: string,
): LLMProviderId | 'none' | null {
  const traces = getRecentTraces(orgId, 50).filter(
    (t) => t.phase === phase && (commandId ? t.commandId === commandId : true),
  );
  const last = traces[traces.length - 1];
  if (!last) return null;
  if (!last.success) return 'none';
  if (last.provider === 'nvidia' || last.provider === 'openrouter' || last.provider === 'litellm' || last.provider === 'ollama') {
    return last.provider;
  }
  return 'none';
}

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

// ─── Re-exports for Model Router ───────────────────────────────────────────
// The ModelRouter provides capability-aware routing across multiple providers.
// Import from './model-router.js' for full access.
export { getModelRouter, resetModelRouter } from './model-router.js';
export type { ModelRouter, RouterResult, TaskRequirements } from './model-router.js';
