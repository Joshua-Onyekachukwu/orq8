/**
 * ORQ8 Model Router — Multi-Provider AI Model Routing Layer
 *
 * Architecture:
 *   Agent → ModelRouter → ProviderAdapter → Model API
 *
 * The router intelligently selects providers/models based on:
 *   - Task requirements (reasoning, tool_calling, vision, etc.)
 *   - Provider availability and health
 *   - Key pool state (rate limits, cooldowns, concurrency)
 *   - Model capabilities and compatibility
 *
 * Providers, in the order they are tried (see PROVIDER_PRIORITY below and
 * docs/22 §22.9 for the decision):
 *   - OpenRouter   — primary. One key fronts many vendors, so a pinned model id
 *                    is honoured exactly, and routing stays deterministic.
 *   - NVIDIA NIM   — first fallback, used when a workspace has NIM credentials.
 *   - LiteLLM      — development only.
 *   - Ollama       — development only.
 *   Future providers join through the adapter pattern.
 */

import type { AppConfig } from '@orq8/core';
import type { ChatMessage, ChatCompletionResponse } from './llm.js';

// ─── Model Capability Registry ──────────────────────────────────────────────

/**
 * Capabilities that a model can support.
 * The router uses these to match task requirements to model capabilities.
 */
export type ModelCapability =
  | 'reasoning'
  | 'tool_calling'
  | 'structured_output'
  | 'vision'
  | 'coding'
  | 'fast_response'
  | 'research'
  | 'summarization'
  | 'creative_writing';

/**
 * Model definition with capabilities and metadata.
 */
export interface ModelDefinition {
  id: string;
  provider: ProviderId;
  displayName: string;
  capabilities: ModelCapability[];
  contextWindow: number; // max tokens
  maxOutput: number; // max output tokens
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsStructuredOutput: boolean;
  supportsVision: boolean;
  costPer1kInput: number; // USD per 1K input tokens
  costPer1kOutput: number; // USD per 1K output tokens
  speedRating: 'fast' | 'medium' | 'slow'; // relative latency
  status: 'available' | 'deprecated' | 'experimental';
}

/**
 * Task requirements that the router evaluates.
 */
export interface TaskRequirements {
  /** Required capabilities (model must have ALL of these) */
  requiredCapabilities: ModelCapability[];
  /** Preferred capabilities (nice to have, affects ranking) */
  preferredCapabilities?: ModelCapability[];
  /** Minimum context window needed */
  minContextWindow?: number;
  /** Maximum acceptable cost per 1K tokens (input) */
  maxCostPer1k?: number;
  /** Speed preference */
  speedPreference?: 'fast' | 'medium' | 'slow' | 'any';
  /** Whether structured output is needed */
  needsStructuredOutput?: boolean;
  /** Whether tool calling is needed */
  needsToolCalling?: boolean;
}

// ─── Provider Types ─────────────────────────────────────────────────────────

export type ProviderId = 'nvidia' | 'openrouter' | 'litellm' | 'ollama';

/**
 * The order providers are attempted in. This is the single source of truth for
 * the routing priority — `getProviderChain` reads it, and so do the tests.
 *
 * **OpenRouter is primary.** One credential fronts many vendors, so a caller
 * that  pins a model id gets that exact model, and the default route is one
 * behaviour rather than "whichever provider happens to be configured". An
 * earlier revision had NVIDIA first, which meant an unpinned request was served
 * by NIM — whose model entitlements vary per account and which, in testing, was
 * both slower and, for a bogus model id, silently answered by a different model.
 *
 * **LiteLLM and Ollama are development providers.** They exist so a contributor
 * can run the whole stack locally, offline. They are deliberately last: neither
 * should ever serve a production request just because it is configured.
 *
 * Changing this order changes what every unpinned call in the product does, so
 * it is a decision rather than a detail (docs/22 §22.9).
 */
export const PROVIDER_PRIORITY: readonly ProviderId[] = [
  'openrouter',
  'nvidia',
  'litellm',
  'ollama',
];

/** True for providers that exist only for local development. */
export function isDevelopmentProvider(id: ProviderId): boolean {
  return id === 'litellm' || id === 'ollama';
}

/**
 * Runtime state of an API key.
 */
export interface KeyState {
  /** Last 6 chars of the key (for display, never the full key) */
  suffix: string;
  /** Whether this key is currently enabled */
  enabled: boolean;
  /** Current health status */
  health: 'healthy' | 'degraded' | 'cooldown' | 'disabled';
  /** Number of in-flight requests using this key */
  inFlight: number;
  /** Timestamp of last successful request */
  lastSuccess: number | null;
  /** Timestamp of last failure */
  lastFailure: number | null;
  /** Number of consecutive failures */
  failureCount: number;
  /** Rate limit state */
  rateLimit: {
    isLimited: boolean;
    retryAfter: number | null; // epoch-ms when rate limit lifts
    recentHits: number[]; // timestamps of recent 429s
  };
  /** Cooldown timestamp (epoch-ms) — key won't be used until this time */
  cooldownUntil: number | null;
  /** Latency tracking (moving average) */
  latencyMs: number;
  /** Success rate (rolling window) */
  successRate: number;
}

/**
 * Provider adapter interface.
 * Each provider (NVIDIA, OpenRouter, etc.) implements this.
 */
export interface ProviderAdapter {
  /** Provider identifier */
  id: ProviderId;
  /** Human-readable name */
  label: string;
  /** Base URL for API calls */
  baseUrl: string;
  /** API keys for this provider */
  keys: string[];
  /** Models configured for this provider */
  models: ModelDefinition[];
  /** Default model (used when no specific model is requested) */
  defaultModel: string;
  /** Model fallbacks (tried when default fails) */
  modelFallbacks: string[];
  /**
   * Whether this provider needs an API key to be usable. Providers that serve
   * local models without auth (Ollama) set this to `false` so they still appear
   * in the chain with an empty key pool. Defaults to `true` when omitted.
   */
  requiresAuth?: boolean;

  /**
   * Send a chat completion request.
   * Returns null on failure (after exhausting retries).
   */
  complete(options: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: 'json_object' } | { type: 'text' };
    keyIndex?: number; // specific key to use (for concurrency control)
  }): Promise<{
    response: ChatCompletionResponse | null;
    keyUsed: string; // last 6 chars
    latencyMs: number;
    error?: string;
  }>;

  /**
   * Check if a model is available (health probe).
   */
  probe(model: string, keyIndex?: number): Promise<{
    available: boolean;
    status: number;
    accountId?: string;
    error?: string;
  }>;

  /**
   * Get current state of all keys.
   */
  getKeyStates(): KeyState[];

  /**
   * Record a successful request (updates health metrics).
   */
  recordSuccess(keySuffix: string, latencyMs: number): void;

  /**
   * Record a failed request (updates health metrics).
   */
  recordFailure(keySuffix: string, error: string, statusCode?: number): void;

  /**
   * Get the best key for the next request (round-robin + health).
   */
  selectKey(): number;
}

// ─── Router Result ──────────────────────────────────────────────────────────

export interface RouterResult {
  response: ChatCompletionResponse | null;
  provider: ProviderId;
  model: string;
  keySuffix: string;
  latencyMs: number;
  fallbacksUsed: number;
  /**
   * Every provider/model pair attempted, in order, with the reason each failed.
   * This is the audit trail for one model call: without it a request that fell
   * through three providers looks identical to one that succeeded first try.
   */
  attempts?: Array<{ provider: ProviderId; model: string; error?: string }>;
  error?: string;
  /** Warnings surfaced during routing (e.g. NVIDIA scope issues) */
  warnings?: Array<{
    model: string;
    keySuffix: string;
    accountId?: string;
    hint: string;
  }>;
}

// ─── Built-in Model Registry ────────────────────────────────────────────────

/**
 * Known models with their capabilities.
 * This registry is used for capability-aware routing.
 */
// Exported for the model-intelligence layer (tier classification must be
// derived from the real registry — never fabricated availability).
export const MODEL_REGISTRY: ModelDefinition[] = [
  // NVIDIA models
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    provider: 'nvidia',
    displayName: 'Nemotron 3 Super 120B',
    capabilities: ['reasoning', 'tool_calling', 'structured_output', 'coding', 'research'],
    contextWindow: 128000,
    maxOutput: 4096,
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    supportsVision: false,
    costPer1kInput: 0.00035,
    costPer1kOutput: 0.0014,
    speedRating: 'medium',
    status: 'available',
  },
  {
    id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    provider: 'nvidia',
    displayName: 'Nemotron 3.5 Lightning 30B',
    capabilities: ['fast_response', 'summarization', 'structured_output'],
    contextWindow: 32000,
    maxOutput: 4096,
    supportsStreaming: true,
    supportsToolCalling: false,
    supportsStructuredOutput: true,
    supportsVision: false,
    costPer1kInput: 0.00014,
    costPer1kOutput: 0.00056,
    speedRating: 'fast',
    status: 'available',
  },
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    provider: 'nvidia',
    displayName: 'Nemotron 3 Nano Omni 30B (Reasoning)',
    capabilities: ['reasoning', 'coding', 'research'],
    contextWindow: 32000,
    maxOutput: 4096,
    supportsStreaming: true,
    supportsToolCalling: false,
    supportsStructuredOutput: false,
    supportsVision: false,
    costPer1kInput: 0.00014,
    costPer1kOutput: 0.00056,
    speedRating: 'medium',
    status: 'available',
  },
  {
    id: 'meta/llama-3.2-11b-vision-instruct',
    provider: 'nvidia',
    displayName: 'Llama 3.2 11B Vision',
    capabilities: ['vision', 'summarization', 'fast_response'],
    contextWindow: 128000,
    maxOutput: 4096,
    supportsStreaming: true,
    supportsToolCalling: false,
    supportsStructuredOutput: false,
    supportsVision: true,
    costPer1kInput: 0.00014,
    costPer1kOutput: 0.00056,
    speedRating: 'fast',
    status: 'available',
  },

  // OpenRouter models (popular choices)
  {
    id: 'anthropic/claude-3.5-sonnet',
    provider: 'openrouter',
    displayName: 'Claude 3.5 Sonnet',
    capabilities: ['reasoning', 'tool_calling', 'structured_output', 'coding', 'research', 'creative_writing'],
    contextWindow: 200000,
    maxOutput: 8192,
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    supportsVision: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    speedRating: 'medium',
    status: 'available',
  },
  {
    id: 'openai/gpt-4o',
    provider: 'openrouter',
    displayName: 'GPT-4o',
    capabilities: ['reasoning', 'tool_calling', 'structured_output', 'coding', 'research', 'vision'],
    contextWindow: 128000,
    maxOutput: 4096,
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    supportsVision: true,
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
    speedRating: 'medium',
    status: 'available',
  },
  {
    id: 'openai/gpt-4o-mini',
    provider: 'openrouter',
    displayName: 'GPT-4o Mini',
    capabilities: ['fast_response', 'structured_output', 'summarization'],
    contextWindow: 128000,
    maxOutput: 4096,
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    supportsVision: true,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    speedRating: 'fast',
    status: 'available',
  },
  {
    id: 'google/gemini-2.0-flash-001',
    provider: 'openrouter',
    displayName: 'Gemini 2.0 Flash',
    capabilities: ['fast_response', 'reasoning', 'vision', 'structured_output'],
    contextWindow: 1048576,
    maxOutput: 8192,
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsStructuredOutput: true,
    supportsVision: true,
    costPer1kInput: 0.000075,
    costPer1kOutput: 0.0003,
    speedRating: 'fast',
    status: 'available',
  },
  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    provider: 'openrouter',
    displayName: 'Llama 3.1 70B',
    capabilities: ['reasoning', 'coding', 'research', 'structured_output'],
    contextWindow: 128000,
    maxOutput: 4096,
    supportsStreaming: true,
    supportsToolCalling: false,
    supportsStructuredOutput: true,
    supportsVision: false,
    costPer1kInput: 0.00052,
    costPer1kOutput: 0.00075,
    speedRating: 'medium',
    status: 'available',
  },
];

// ─── Utility Functions ──────────────────────────────────────────────────────

/**
 * Dedupe and drop empty entries from a key list.
 */
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
 * Extract last 6 chars of a key for display (never expose the full key).
 */
function keySuffix(key: string): string {
  return key.slice(-6);
}

/**
 * A provider is configured when it has at least one usable credential — or when
 * it needs no credential at all (Ollama serves local models without auth).
 */
function isConfiguredProvider(provider: ProviderAdapter | undefined): provider is ProviderAdapter {
  if (!provider) return false;
  return provider.keys.length > 0 || provider.requiresAuth === false;
}

/**
 * Check if a model satisfies the required capabilities.
 */
export function modelSatisfiesRequirements(
  model: ModelDefinition,
  requirements: TaskRequirements,
): boolean {
  // Check required capabilities
  for (const cap of requirements.requiredCapabilities) {
    if (!model.capabilities.includes(cap)) return false;
  }

  // Check minimum context window
  if (requirements.minContextWindow && model.contextWindow < requirements.minContextWindow) {
    return false;
  }

  // Check max cost
  if (requirements.maxCostPer1k && model.costPer1kInput > requirements.maxCostPer1k) {
    return false;
  }

  // Check structured output requirement
  if (requirements.needsStructuredOutput && !model.supportsStructuredOutput) {
    return false;
  }

  // Check tool calling requirement
  if (requirements.needsToolCalling && !model.supportsToolCalling) {
    return false;
  }

  return true;
}

/**
 * Score a model for a given task (higher = better match).
 */
export function scoreModel(
  model: ModelDefinition,
  requirements: TaskRequirements,
): number {
  let score = 0;

  // Base score for satisfying requirements
  if (!modelSatisfiesRequirements(model, requirements)) return -1;

  // Preferred capabilities bonus
  if (requirements.preferredCapabilities) {
    for (const cap of requirements.preferredCapabilities) {
      if (model.capabilities.includes(cap)) score += 10;
    }
  }

  // Speed preference bonus
  if (requirements.speedPreference && requirements.speedPreference !== 'any') {
    if (model.speedRating === requirements.speedPreference) score += 5;
  }

  // Cost efficiency bonus (lower cost = higher score)
  score += Math.max(0, 10 - model.costPer1kInput * 1000);

  // Context window bonus (larger = better, up to a point)
  if (model.contextWindow >= 100000) score += 3;
  else if (model.contextWindow >= 32000) score += 2;
  else if (model.contextWindow >= 8000) score += 1;

  return score;
}

/**
 * Get the default task requirements for common ORQ8 operations.
 */
export function getDefaultRequirements(
  operation: 'intent_analysis' | 'task_execution' | 'context_build' | 'memory_retrieval' | 'fallback',
): TaskRequirements {
  switch (operation) {
    case 'intent_analysis':
      return {
        requiredCapabilities: ['structured_output'],
        preferredCapabilities: ['reasoning', 'tool_calling'],
        needsStructuredOutput: true,
        speedPreference: 'medium',
      };
    case 'task_execution':
      return {
        requiredCapabilities: [],
        preferredCapabilities: ['reasoning', 'coding', 'research'],
        speedPreference: 'medium',
      };
    case 'context_build':
      return {
        requiredCapabilities: [],
        preferredCapabilities: ['fast_response', 'summarization'],
        speedPreference: 'fast',
      };
    case 'memory_retrieval':
      return {
        requiredCapabilities: [],
        preferredCapabilities: ['fast_response'],
        speedPreference: 'fast',
      };
    case 'fallback':
      return {
        requiredCapabilities: [],
        preferredCapabilities: ['fast_response'],
        speedPreference: 'fast',
      };
    default:
      return { requiredCapabilities: [] };
  }
}

// ─── Model Router ───────────────────────────────────────────────────────────

/**
 * The main Model Router class.
 * Manages providers, selects models, handles fallbacks.
 */
export class ModelRouter {
  private providers: Map<ProviderId, ProviderAdapter> = new Map();
  private modelRegistry: Map<string, ModelDefinition> = new Map();

  constructor(config: AppConfig) {
    // Initialize model registry
    for (const model of MODEL_REGISTRY) {
      this.modelRegistry.set(model.id, model);
    }

    // Initialize providers based on config
    this.initializeProviders(config);
  }

  /**
   * Initialize providers from configuration.
   */
  private initializeProviders(config: AppConfig): void {
    // NVIDIA
    const nvidiaKeys = uniqueKeys([
      config.NVIDIA_API_KEY,
      ...(config.NVIDIA_API_KEYS?.split(',').map((k) => k.trim()) ?? []),
    ]);

    if (nvidiaKeys.length > 0) {
      const nvidiaModels = MODEL_REGISTRY.filter((m) => m.provider === 'nvidia');
      const defaultModel = config.NVIDIA_MODEL || nvidiaModels[0]?.id || '';
      const fallbacks = (config.NVIDIA_MODEL_FALLBACKS?.split(',').map((m) => m.trim()) ?? [])
        .filter((m) => m !== defaultModel);

      this.providers.set('nvidia', new NvidiaAdapter(
        config.NVIDIA_BASE_URL,
        nvidiaKeys,
        defaultModel,
        fallbacks,
        config,
      ));
    }

    // OpenRouter
    const openrouterKeys = uniqueKeys([
      config.OPENROUTER_API_KEY,
      ...(config.OPENROUTER_API_KEYS?.split(',').map((k) => k.trim()) ?? []),
    ]);

    if (openrouterKeys.length > 0) {
      const openrouterModels = MODEL_REGISTRY.filter((m) => m.provider === 'openrouter');
      const defaultModel = config.OPENROUTER_MODEL || openrouterModels[0]?.id || '';
      const fallbacks = (config.OPENROUTER_MODEL_FALLBACKS?.split(',').map((m) => m.trim()) ?? [])
        .filter((m) => m !== defaultModel);

      this.providers.set('openrouter', new OpenRouterAdapter(
        config.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        openrouterKeys,
        defaultModel,
        fallbacks,
        config,
      ));
    }

    // LiteLLM (existing)
    if (config.LITELLM_BASE_URL) {
      this.providers.set('litellm', new LiteLLMAdapter(
        config.LITELLM_BASE_URL,
        [config.LITELLM_MASTER_KEY ?? 'sk-orq8-dev-litellm'],
        'llama3.2',
        [],
        config,
      ));
    }

    // Ollama (existing)
    if (config.OLLAMA_BASE_URL) {
      this.providers.set('ollama', new OllamaAdapter(
        config.OLLAMA_BASE_URL,
        [],
        config.OLLAMA_MODEL || 'llama3.1',
        [],
        config,
      ));
    }
  }

  /**
   * Get the ordered list of providers (priority order).
   */
  getProviderChain(): ProviderAdapter[] {
    const chain: ProviderAdapter[] = [];

    for (const id of PROVIDER_PRIORITY) {
      const provider = this.providers.get(id);
      if (isConfiguredProvider(provider)) {
        chain.push(provider);
      }
    }

    return chain;
  }

  /**
   * Select the best model for a task based on requirements.
   * Returns the model definition and provider.
   */
  selectModel(requirements: TaskRequirements): {
    model: ModelDefinition;
    provider: ProviderAdapter;
  } | null {
    const chain = this.getProviderChain();
    let bestScore = -1;
    let bestModel: ModelDefinition | null = null;
    let bestProvider: ProviderAdapter | null = null;

    for (const provider of chain) {
      for (const modelDef of provider.models) {
        const score = scoreModel(modelDef, requirements);
        if (score > bestScore) {
          bestScore = score;
          bestModel = modelDef;
          bestProvider = provider;
        }
      }
    }

    if (bestModel && bestProvider) {
      return { model: bestModel, provider: bestProvider };
    }

    return null;
  }

  /**
   * Execute a chat completion through the router.
   * Handles provider fallback, key rotation, and error recovery.
   */
  async complete(
    options: {
      model?: string;
      messages: ChatMessage[];
      temperature?: number;
      max_tokens?: number;
      response_format?: { type: 'json_object' } | { type: 'text' };
      requirements?: TaskRequirements;
      /** Specific provider to try first (for targeted fallback) */
      providerHint?: ProviderId;
    },
  ): Promise<RouterResult> {
    const chain = this.getProviderChain();
    if (chain.length === 0) {
      return {
        response: null,
        provider: 'openrouter',
        model: options.model || 'unknown',
        keySuffix: '',
        latencyMs: 0,
        fallbacksUsed: 0,
        error: 'No providers configured',
      };
    }

    // If a specific model is requested, find it
    let targetModel = options.model;
    let targetProvider: ProviderAdapter | undefined;

    if (targetModel) {
      // Find which provider has this model
      for (const provider of chain) {
        const modelDef = provider.models.find((m) => m.id === targetModel);
        if (modelDef) {
          targetProvider = provider;
          break;
        }
      }
    }

    // A caller-supplied hint is authoritative: it decides the first provider
    // attempted. The hint used to be accepted and then ignored, so a caller
    // asking for OpenRouter was served by whichever provider happened to sit
    // first in the static priority list.
    const hintedProvider = options.providerHint
      ? this.providers.get(options.providerHint)
      : undefined;
    const hintedIsUsable = isConfiguredProvider(hintedProvider);

    // If no specific model, use requirements to select
    if (!targetProvider && options.requirements) {
      const selected = this.selectModel(options.requirements);
      if (selected) {
        targetModel = selected.model.id;
        targetProvider = selected.provider;
      }
    }

    // A hinted provider comes before the static priority order, and carries the
    // pinned model through so the caller's model id is what gets requested.
    if (!targetProvider && hintedIsUsable) {
      targetProvider = hintedProvider;
      targetModel = targetModel || hintedProvider!.defaultModel;
    }

    // If still no provider, use the first in chain
    if (!targetProvider && chain.length > 0) {
      targetProvider = chain[0];
      targetModel = targetModel || chain[0]?.defaultModel;
    }

    // Build the attempt order: target provider first, then fallbacks
    const attempts: Array<{ provider: ProviderAdapter; model: string }> = [];
    const pinnedModel = Boolean(options.model);

    // Add target provider with its model
    if (targetModel && targetProvider) {
      attempts.push({ provider: targetProvider, model: targetModel });

      // Add fallback models from the same provider
      for (const fallback of targetProvider.modelFallbacks) {
        if (fallback !== targetModel) {
          attempts.push({ provider: targetProvider, model: fallback });
        }
      }
    }

    // Cross-provider fallback is only allowed when the router chose the model
    // itself. When the caller pinned a model id, answering from another
    // provider's default model is not a fallback — it is a different model
    // reported as success. Those requests must fail with a real error instead.
    if (!pinnedModel) {
      for (const provider of chain) {
        if (!targetProvider || provider.id !== targetProvider.id) {
          attempts.push({ provider, model: provider.defaultModel });
        }
      }
    }

    // Execute attempts
    let fallbacksUsed = 0;
    let lastError = '';
    const attemptLog: Array<{ provider: ProviderId; model: string; error?: string }> = [];

    for (const attempt of attempts) {
      const startTime = Date.now();

      try {
        const result = await attempt.provider.complete({
          model: attempt.model,
          messages: options.messages,
          temperature: options.temperature,
          max_tokens: options.max_tokens,
          response_format: options.response_format,
        });

        const latencyMs = Date.now() - startTime;

        if (result.response) {
          // Success
          attempt.provider.recordSuccess(result.keyUsed, latencyMs);
          attemptLog.push({ provider: attempt.provider.id, model: attempt.model });

          return {
            response: result.response,
            provider: attempt.provider.id,
            model: attempt.model,
            keySuffix: result.keyUsed,
            latencyMs,
            fallbacksUsed,
            attempts: attemptLog,
          };
        }

        // Failure — record and continue
        if (result.error) {
          attempt.provider.recordFailure(result.keyUsed, result.error);
          lastError = result.error;
          attemptLog.push({ provider: attempt.provider.id, model: attempt.model, error: result.error });
        } else {
          attemptLog.push({ provider: attempt.provider.id, model: attempt.model, error: 'empty response' });
        }

        fallbacksUsed++;
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : 'unknown error';
        lastError = errorMsg;
        attemptLog.push({ provider: attempt.provider.id, model: attempt.model, error: errorMsg });
        fallbacksUsed++;
      }
    }

    // All attempts failed
    return {
      response: null,
      provider: targetProvider?.id ?? chain[0]?.id ?? 'openrouter',
      model: targetModel || 'unknown',
      keySuffix: '',
      latencyMs: 0,
      fallbacksUsed,
      attempts: attemptLog,
      error: lastError || 'All providers failed',
    };
  }

  /**
   * Get health status of all providers.
   */
  getHealthStatus(): Array<{
    provider: ProviderId;
    label: string;
    healthy: boolean;
    keys: KeyState[];
    models: string[];
  }> {
    const result: Array<{
      provider: ProviderId;
      label: string;
      healthy: boolean;
      keys: KeyState[];
      models: string[];
    }> = [];

    for (const [id, adapter] of this.providers) {
      const keyStates = adapter.getKeyStates();
      const healthyKeys = keyStates.filter((k) => k.health === 'healthy').length;

      result.push({
        provider: id,
        label: adapter.label,
        healthy: healthyKeys > 0,
        keys: keyStates,
        models: adapter.models.map((m) => m.id),
      });
    }

    return result;
  }

  /**
   * Get the model registry.
   */
  getModelRegistry(): ModelDefinition[] {
    return Array.from(this.modelRegistry.values());
  }
}

// ─── NVIDIA Adapter ─────────────────────────────────────────────────────────

class NvidiaAdapter implements ProviderAdapter {
  id: ProviderId = 'nvidia';
  label = 'NVIDIA NIM';
  baseUrl: string;
  keys: string[];
  models: ModelDefinition[];
  defaultModel: string;
  modelFallbacks: string[];

  private keyStates: Map<string, KeyState> = new Map();
  private keyCursor = 0;
  private config: AppConfig;

  constructor(
    baseUrl: string,
    keys: string[],
    defaultModel: string,
    modelFallbacks: string[],
    config: AppConfig,
  ) {
    this.baseUrl = baseUrl;
    this.keys = keys;
    this.defaultModel = defaultModel;
    this.modelFallbacks = modelFallbacks;
    this.config = config;

    // Initialize key states
    for (const key of keys) {
      const suffix = keySuffix(key);
      this.keyStates.set(suffix, {
        suffix,
        enabled: true,
        health: 'healthy',
        inFlight: 0,
        lastSuccess: null,
        lastFailure: null,
        failureCount: 0,
        rateLimit: { isLimited: false, retryAfter: null, recentHits: [] },
        cooldownUntil: null,
        latencyMs: 0,
        successRate: 1.0,
      });
    }

    // Filter models to those available for this provider
    this.models = MODEL_REGISTRY.filter((m) => m.provider === 'nvidia');
  }

  async complete(options: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: 'json_object' } | { type: 'text' };
    keyIndex?: number;
  }): Promise<{
    response: ChatCompletionResponse | null;
    keyUsed: string;
    latencyMs: number;
    error?: string;
  }> {
    const startTime = Date.now();
    const endpoint = this.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1/chat/completions';

    // Select key
    const keyIdx = options.keyIndex ?? this.selectKey();
    const key = this.keys[keyIdx] ?? '';
    const suffix = keySuffix(key);

    try {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error('timeout')),
        this.config.LLM_HEADERS_TIMEOUT_MS,
      );

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) headers.Authorization = `Bearer ${key}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens ?? 2048,
          ...(options.response_format ? { response_format: options.response_format } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const detail = await readProviderError(response);
        const error = `HTTP ${response.status}${detail ? `: ${detail}` : ''}`;
        this.recordFailure(suffix, error, response.status);
        return { response: null, keyUsed: suffix, latencyMs: Date.now() - startTime, error };
      }

      const data = (await response.json()) as ChatCompletionResponse;

      // A 200 with no usable choice is still a failure: reporting it as success
      // would let an empty reply be persisted as real agent work.
      if (!data.choices?.length) {
        const error = 'provider returned no choices';
        this.recordFailure(suffix, error);
        return { response: null, keyUsed: suffix, latencyMs: Date.now() - startTime, error };
      }

      this.recordSuccess(suffix, Date.now() - startTime);

      return {
        response: data,
        keyUsed: suffix,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'network error';
      this.recordFailure(suffix, error);
      return { response: null, keyUsed: suffix, latencyMs: Date.now() - startTime, error };
    }
  }

  async probe(model: string, keyIndex?: number): Promise<{
    available: boolean;
    status: number;
    accountId?: string;
    error?: string;
  }> {
    const keyIdx = keyIndex ?? 0;
    const key = this.keys[keyIdx] ?? '';
    const endpoint = this.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1/chat/completions';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) headers.Authorization = `Bearer ${key}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.status === 404) {
        // Try to extract Account ID
        const text = await response.text();
        let accountId: string | undefined;
        try {
          const body = JSON.parse(text);
          const detail = typeof body.detail === 'string' ? body.detail : '';
          const match = detail.match(/Account\s+ID:\s*([\w.-]+)/i);
          accountId = match?.[1];
        } catch {}

        return { available: false, status: 404, accountId };
      }

      return { available: response.ok, status: response.status };
    } catch (err) {
      return { available: false, status: 0, error: err instanceof Error ? err.message : 'timeout' };
    }
  }

  getKeyStates(): KeyState[] {
    return Array.from(this.keyStates.values());
  }

  recordSuccess(keySuffix: string, latencyMs: number): void {
    const state = this.keyStates.get(keySuffix);
    if (!state) return;

    state.lastSuccess = Date.now();
    state.failureCount = 0;
    state.health = 'healthy';
    state.cooldownUntil = null;
    state.inFlight = Math.max(0, state.inFlight - 1);

    // Update latency (exponential moving average)
    state.latencyMs = state.latencyMs * 0.8 + latencyMs * 0.2;

    // Update success rate
    state.successRate = Math.min(1.0, state.successRate + 0.1);
  }

  recordFailure(keySuffix: string, error: string, statusCode?: number): void {
    const state = this.keyStates.get(keySuffix);
    if (!state) return;

    state.lastFailure = Date.now();
    state.failureCount++;
    state.inFlight = Math.max(0, state.inFlight - 1);

    // Update success rate
    state.successRate = Math.max(0, state.successRate - 0.2);

    // Handle specific error types
    if (statusCode === 429) {
      // Rate limit
      state.rateLimit.isLimited = true;
      state.rateLimit.recentHits.push(Date.now());

      // Prune old hits (> 60s)
      const cutoff = Date.now() - 60_000;
      state.rateLimit.recentHits = state.rateLimit.recentHits.filter((t) => t > cutoff);

      // If too many recent hits, cooldown
      if (state.rateLimit.recentHits.length >= 3) {
        state.health = 'cooldown';
        state.cooldownUntil = Date.now() + 30_000; // 30s cooldown
      }
    } else if (statusCode === 401 || statusCode === 403) {
      // Invalid key
      state.health = 'disabled';
      state.enabled = false;
    } else if (statusCode === 404) {
      // Model not found — disable key for this model
      state.health = 'degraded';
    } else if (state.failureCount >= 3) {
      // Too many failures
      state.health = 'cooldown';
      state.cooldownUntil = Date.now() + 60_000; // 60s cooldown
    }
  }

  selectKey(): number {
    const now = Date.now();

    // Find available keys (not in cooldown, not disabled)
    const available: Array<{ index: number; state: KeyState }> = [];

    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      if (!key) continue;
      const suffix = keySuffix(key);
      const state = this.keyStates.get(suffix);
      if (!state) continue;

      // Skip disabled keys
      if (!state.enabled || state.health === 'disabled') continue;

      // Skip keys in cooldown
      if (state.cooldownUntil && state.cooldownUntil > now) continue;

      // Skip rate-limited keys
      if (state.rateLimit.isLimited && state.rateLimit.retryAfter && state.rateLimit.retryAfter > now) {
        continue;
      }

      available.push({ index: i, state });
    }

    if (available.length === 0) {
      // All keys unavailable — fall back to round-robin and hope for the best
      return this.keyCursor++ % this.keys.length;
    }

    // Sort by health (healthy first), then by in-flight (least busy first)
    available.sort((a, b) => {
      // Healthy keys first
      if (a.state.health === 'healthy' && b.state.health !== 'healthy') return -1;
      if (a.state.health !== 'healthy' && b.state.health === 'healthy') return 1;

      // Then by in-flight count (least busy)
      return a.state.inFlight - b.state.inFlight;
    });

    // Select the best available key
    const selected = available[0];
    if (selected) {
      selected.state.inFlight++;
      return selected.index;
    }

    // Fallback
    return this.keyCursor++ % this.keys.length;
  }
}

// ─── OpenRouter Adapter ─────────────────────────────────────────────────────

/**
 * Providers put the real reason in the error envelope —
 * {"error":{"message":"...","code":400}} — while the status code alone cannot
 * tell an invalid model id from a rate limit or an upstream outage. Reading the
 * body turns an opaque "HTTP 400" into something a log or the founder can act
 * on. The body never contains the API key.
 */
async function readProviderError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return '';
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string; code?: string | number } | string;
        message?: string;
      };
      const err = parsed.error;
      if (typeof err === 'string') return err;
      if (err?.message) {
        return typeof err.code !== 'undefined' ? `${err.message} (code ${err.code})` : err.message;
      }
      if (parsed.message) return parsed.message;
    } catch {
      // Not JSON — fall through to the raw body.
    }
    return text.replace(/\s+/g, ' ').slice(0, 300);
  } catch {
    return '';
  }
}

class OpenRouterAdapter implements ProviderAdapter {
  id: ProviderId = 'openrouter';
  label = 'OpenRouter';
  baseUrl: string;
  keys: string[];
  models: ModelDefinition[];
  defaultModel: string;
  modelFallbacks: string[];

  private keyStates: Map<string, KeyState> = new Map();
  private keyCursor = 0;
  private config: AppConfig;

  constructor(
    baseUrl: string,
    keys: string[],
    defaultModel: string,
    modelFallbacks: string[],
    config: AppConfig,
  ) {
    this.baseUrl = baseUrl;
    this.keys = keys;
    this.defaultModel = defaultModel;
    this.modelFallbacks = modelFallbacks;
    this.config = config;

    // Initialize key states
    for (const key of keys) {
      const suffix = keySuffix(key);
      this.keyStates.set(suffix, {
        suffix,
        enabled: true,
        health: 'healthy',
        inFlight: 0,
        lastSuccess: null,
        lastFailure: null,
        failureCount: 0,
        rateLimit: { isLimited: false, retryAfter: null, recentHits: [] },
        cooldownUntil: null,
        latencyMs: 0,
        successRate: 1.0,
      });
    }

    // Filter models to those available for this provider
    this.models = MODEL_REGISTRY.filter((m) => m.provider === 'openrouter');
  }

  async complete(options: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: 'json_object' } | { type: 'text' };
    keyIndex?: number;
  }): Promise<{
    response: ChatCompletionResponse | null;
    keyUsed: string;
    latencyMs: number;
    error?: string;
  }> {
    const startTime = Date.now();
    const endpoint = this.baseUrl.replace(/\/+$/, '') + '/chat/completions';

    // Select key
    const keyIdx = options.keyIndex ?? this.selectKey();
    const key = this.keys[keyIdx] ?? '';
    const suffix = keySuffix(key);

    try {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error('timeout')),
        this.config.LLM_HEADERS_TIMEOUT_MS,
      );

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://orq8.ai',
        'X-Title': 'ORQ8 AI Executive OS',
      };
      if (key) headers.Authorization = `Bearer ${key}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens ?? 2048,
          ...(options.response_format ? { response_format: options.response_format } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const detail = await readProviderError(response);
        const error = `HTTP ${response.status}${detail ? `: ${detail}` : ''}`;
        this.recordFailure(suffix, error, response.status);
        return { response: null, keyUsed: suffix, latencyMs: Date.now() - startTime, error };
      }

      const data = (await response.json()) as ChatCompletionResponse;

      // A 200 with no usable choice is still a failure: reporting it as success
      // would let an empty reply be persisted as real agent work.
      if (!data.choices?.length) {
        const error = 'provider returned no choices';
        this.recordFailure(suffix, error);
        return { response: null, keyUsed: suffix, latencyMs: Date.now() - startTime, error };
      }

      this.recordSuccess(suffix, Date.now() - startTime);

      return {
        response: data,
        keyUsed: suffix,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'network error';
      this.recordFailure(suffix, error);
      return { response: null, keyUsed: suffix, latencyMs: Date.now() - startTime, error };
    }
  }

  async probe(model: string, keyIndex?: number): Promise<{
    available: boolean;
    status: number;
    accountId?: string;
    error?: string;
  }> {
    const keyIdx = keyIndex ?? 0;
    const key = this.keys[keyIdx] ?? '';
    const endpoint = this.baseUrl.replace(/\/+$/, '') + '/chat/completions';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://orq8.ai',
        'X-Title': 'ORQ8 AI Executive OS',
      };
      if (key) headers.Authorization = `Bearer ${key}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      return { available: response.ok, status: response.status };
    } catch (err) {
      return { available: false, status: 0, error: err instanceof Error ? err.message : 'timeout' };
    }
  }

  getKeyStates(): KeyState[] {
    return Array.from(this.keyStates.values());
  }

  recordSuccess(keySuffix: string, latencyMs: number): void {
    const state = this.keyStates.get(keySuffix);
    if (!state) return;

    state.lastSuccess = Date.now();
    state.failureCount = 0;
    state.health = 'healthy';
    state.cooldownUntil = null;
    state.inFlight = Math.max(0, state.inFlight - 1);

    // Update latency (exponential moving average)
    state.latencyMs = state.latencyMs * 0.8 + latencyMs * 0.2;

    // Update success rate
    state.successRate = Math.min(1.0, state.successRate + 0.1);
  }

  recordFailure(keySuffix: string, error: string, statusCode?: number): void {
    const state = this.keyStates.get(keySuffix);
    if (!state) return;

    state.lastFailure = Date.now();
    state.failureCount++;
    state.inFlight = Math.max(0, state.inFlight - 1);

    // Update success rate
    state.successRate = Math.max(0, state.successRate - 0.2);

    // Handle specific error types
    if (statusCode === 429) {
      // Rate limit
      state.rateLimit.isLimited = true;
      state.rateLimit.recentHits.push(Date.now());

      // Prune old hits (> 60s)
      const cutoff = Date.now() - 60_000;
      state.rateLimit.recentHits = state.rateLimit.recentHits.filter((t) => t > cutoff);

      // If too many recent hits, cooldown
      if (state.rateLimit.recentHits.length >= 3) {
        state.health = 'cooldown';
        state.cooldownUntil = Date.now() + 30_000; // 30s cooldown
      }
    } else if (statusCode === 401 || statusCode === 403) {
      // Invalid key
      state.health = 'disabled';
      state.enabled = false;
    } else if (state.failureCount >= 3) {
      // Too many failures
      state.health = 'cooldown';
      state.cooldownUntil = Date.now() + 60_000; // 60s cooldown
    }
  }

  selectKey(): number {
    const now = Date.now();

    // Find available keys (not in cooldown, not disabled)
    const available: Array<{ index: number; state: KeyState }> = [];

    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      if (!key) continue;
      const suffix = keySuffix(key);
      const state = this.keyStates.get(suffix);
      if (!state) continue;

      // Skip disabled keys
      if (!state.enabled || state.health === 'disabled') continue;

      // Skip keys in cooldown
      if (state.cooldownUntil && state.cooldownUntil > now) continue;

      // Skip rate-limited keys
      if (state.rateLimit.isLimited && state.rateLimit.retryAfter && state.rateLimit.retryAfter > now) {
        continue;
      }

      available.push({ index: i, state });
    }

    if (available.length === 0) {
      // All keys unavailable — fall back to round-robin
      return this.keyCursor++ % this.keys.length;
    }

    // Sort by health (healthy first), then by in-flight (least busy first)
    available.sort((a, b) => {
      // Healthy keys first
      if (a.state.health === 'healthy' && b.state.health !== 'healthy') return -1;
      if (a.state.health !== 'healthy' && b.state.health === 'healthy') return 1;

      // Then by in-flight count (least busy)
      return a.state.inFlight - b.state.inFlight;
    });

    // Select the best available key
    const selected = available[0];
    if (selected) {
      selected.state.inFlight++;
      return selected.index;
    }

    // Fallback
    return this.keyCursor++ % this.keys.length;
  }
}

// ─── LiteLLM Adapter ────────────────────────────────────────────────────────

class LiteLLMAdapter implements ProviderAdapter {
  id: ProviderId = 'litellm';
  label = 'LiteLLM';
  baseUrl: string;
  keys: string[];
  models: ModelDefinition[];
  defaultModel: string;
  modelFallbacks: string[];

  private keyStates: Map<string, KeyState> = new Map();
  private keyCursor = 0;
  private config: AppConfig;

  constructor(
    baseUrl: string,
    keys: string[],
    defaultModel: string,
    modelFallbacks: string[],
    config: AppConfig,
  ) {
    this.baseUrl = baseUrl;
    this.keys = keys;
    this.defaultModel = defaultModel;
    this.modelFallbacks = modelFallbacks;
    this.config = config;

    // Initialize key states
    for (const key of keys) {
      const suffix = keySuffix(key);
      this.keyStates.set(suffix, {
        suffix,
        enabled: true,
        health: 'healthy',
        inFlight: 0,
        lastSuccess: null,
        lastFailure: null,
        failureCount: 0,
        rateLimit: { isLimited: false, retryAfter: null, recentHits: [] },
        cooldownUntil: null,
        latencyMs: 0,
        successRate: 1.0,
      });
    }

    // LiteLLM doesn't have a fixed model registry — it proxies to whatever's configured
    this.models = [];
  }

  async complete(options: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: 'json_object' } | { type: 'text' };
    keyIndex?: number;
  }): Promise<{
    response: ChatCompletionResponse | null;
    keyUsed: string;
    latencyMs: number;
    error?: string;
  }> {
    const startTime = Date.now();
    const endpoint = this.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1/chat/completions';

    const keyIdx = options.keyIndex ?? this.selectKey();
    const key = this.keys[keyIdx] ?? '';
    const suffix = keySuffix(key);

    try {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error('timeout')),
        this.config.LLM_HEADERS_TIMEOUT_MS,
      );

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) headers.Authorization = `Bearer ${key}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens ?? 2048,
          ...(options.response_format ? { response_format: options.response_format } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const detail = await readProviderError(response);
        const error = `HTTP ${response.status}${detail ? `: ${detail}` : ''}`;
        this.recordFailure(suffix, error, response.status);
        return { response: null, keyUsed: suffix, latencyMs: Date.now() - startTime, error };
      }

      const data = (await response.json()) as ChatCompletionResponse;

      // A 200 with no usable choice is still a failure: reporting it as success
      // would let an empty reply be persisted as real agent work.
      if (!data.choices?.length) {
        const error = 'provider returned no choices';
        this.recordFailure(suffix, error);
        return { response: null, keyUsed: suffix, latencyMs: Date.now() - startTime, error };
      }

      this.recordSuccess(suffix, Date.now() - startTime);

      return {
        response: data,
        keyUsed: suffix,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'network error';
      this.recordFailure(suffix, error);
      return { response: null, keyUsed: suffix, latencyMs: Date.now() - startTime, error };
    }
  }

  async probe(model: string, keyIndex?: number): Promise<{
    available: boolean;
    status: number;
    accountId?: string;
    error?: string;
  }> {
    const keyIdx = keyIndex ?? 0;
    const key = this.keys[keyIdx] ?? '';
    const endpoint = this.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1/chat/completions';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) headers.Authorization = `Bearer ${key}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      return { available: response.ok, status: response.status };
    } catch (err) {
      return { available: false, status: 0, error: err instanceof Error ? err.message : 'timeout' };
    }
  }

  getKeyStates(): KeyState[] {
    return Array.from(this.keyStates.values());
  }

  recordSuccess(keySuffix: string, latencyMs: number): void {
    const state = this.keyStates.get(keySuffix);
    if (!state) return;

    state.lastSuccess = Date.now();
    state.failureCount = 0;
    state.health = 'healthy';
    state.cooldownUntil = null;
    state.inFlight = Math.max(0, state.inFlight - 1);
    state.latencyMs = state.latencyMs * 0.8 + latencyMs * 0.2;
    state.successRate = Math.min(1.0, state.successRate + 0.1);
  }

  recordFailure(keySuffix: string, error: string, statusCode?: number): void {
    const state = this.keyStates.get(keySuffix);
    if (!state) return;

    state.lastFailure = Date.now();
    state.failureCount++;
    state.inFlight = Math.max(0, state.inFlight - 1);
    state.successRate = Math.max(0, state.successRate - 0.2);

    if (statusCode === 429) {
      state.rateLimit.isLimited = true;
      state.rateLimit.recentHits.push(Date.now());
      const cutoff = Date.now() - 60_000;
      state.rateLimit.recentHits = state.rateLimit.recentHits.filter((t) => t > cutoff);
      if (state.rateLimit.recentHits.length >= 3) {
        state.health = 'cooldown';
        state.cooldownUntil = Date.now() + 30_000;
      }
    } else if (statusCode === 401 || statusCode === 403) {
      state.health = 'disabled';
      state.enabled = false;
    } else if (state.failureCount >= 3) {
      state.health = 'cooldown';
      state.cooldownUntil = Date.now() + 60_000;
    }
  }

  selectKey(): number {
    const now = Date.now();
    const available: Array<{ index: number; state: KeyState }> = [];

    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      if (!key) continue;
      const suffix = keySuffix(key);
      const state = this.keyStates.get(suffix);
      if (!state) continue;
      if (!state.enabled || state.health === 'disabled') continue;
      if (state.cooldownUntil && state.cooldownUntil > now) continue;
      if (state.rateLimit.isLimited && state.rateLimit.retryAfter && state.rateLimit.retryAfter > now) continue;
      available.push({ index: i, state });
    }

    if (available.length === 0) {
      return this.keyCursor++ % this.keys.length;
    }

    available.sort((a, b) => {
      if (a.state.health === 'healthy' && b.state.health !== 'healthy') return -1;
      if (a.state.health !== 'healthy' && b.state.health === 'healthy') return 1;
      return a.state.inFlight - b.state.inFlight;
    });

    const selected = available[0];
    if (selected) {
      selected.state.inFlight++;
      return selected.index;
    }

    return this.keyCursor++ % this.keys.length;
  }
}

// ─── Ollama Adapter ─────────────────────────────────────────────────────────

class OllamaAdapter implements ProviderAdapter {
  id: ProviderId = 'ollama';
  label = 'Ollama (Local)';
  /** Local models — no API key required, so it stays usable with an empty pool. */
  requiresAuth = false;
  baseUrl: string;
  keys: string[];
  models: ModelDefinition[];
  defaultModel: string;
  modelFallbacks: string[];

  private keyStates: Map<string, KeyState> = new Map();
  private config: AppConfig;

  constructor(
    baseUrl: string,
    keys: string[],
    defaultModel: string,
    modelFallbacks: string[],
    config: AppConfig,
  ) {
    this.baseUrl = baseUrl;
    this.keys = keys;
    this.defaultModel = defaultModel;
    this.modelFallbacks = modelFallbacks;
    this.config = config;

    // Ollama has no keys — single "no-auth" entry
    this.keyStates.set('no-auth', {
      suffix: 'no-auth',
      enabled: true,
      health: 'healthy',
      inFlight: 0,
      lastSuccess: null,
      lastFailure: null,
      failureCount: 0,
      rateLimit: { isLimited: false, retryAfter: null, recentHits: [] },
      cooldownUntil: null,
      latencyMs: 0,
      successRate: 1.0,
    });

    // Ollama doesn't have a fixed model registry
    this.models = [];
  }

  async complete(options: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: 'json_object' } | { type: 'text' };
    keyIndex?: number;
  }): Promise<{
    response: ChatCompletionResponse | null;
    keyUsed: string;
    latencyMs: number;
    error?: string;
  }> {
    const startTime = Date.now();
    const endpoint = this.baseUrl.replace(/\/+$/, '') + '/v1/chat/completions';

    try {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error('timeout')),
        this.config.LLM_HEADERS_TIMEOUT_MS,
      );

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens ?? 2048,
          ...(options.response_format ? { response_format: options.response_format } : {}),
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const error = `HTTP ${response.status}`;
        this.recordFailure('no-auth', error, response.status);
        return { response: null, keyUsed: 'no-auth', latencyMs: Date.now() - startTime, error };
      }

      const data = (await response.json()) as ChatCompletionResponse;
      this.recordSuccess('no-auth', Date.now() - startTime);

      return {
        response: data,
        keyUsed: 'no-auth',
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'network error';
      this.recordFailure('no-auth', error);
      return { response: null, keyUsed: 'no-auth', latencyMs: Date.now() - startTime, error };
    }
  }

  async probe(model: string, keyIndex?: number): Promise<{
    available: boolean;
    status: number;
    accountId?: string;
    error?: string;
  }> {
    const endpoint = this.baseUrl.replace(/\/+$/, '') + '/v1/chat/completions';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      return { available: response.ok, status: response.status };
    } catch (err) {
      return { available: false, status: 0, error: err instanceof Error ? err.message : 'timeout' };
    }
  }

  getKeyStates(): KeyState[] {
    return Array.from(this.keyStates.values());
  }

  recordSuccess(keySuffix: string, latencyMs: number): void {
    const state = this.keyStates.get(keySuffix);
    if (!state) return;

    state.lastSuccess = Date.now();
    state.failureCount = 0;
    state.health = 'healthy';
    state.cooldownUntil = null;
    state.inFlight = Math.max(0, state.inFlight - 1);
    state.latencyMs = state.latencyMs * 0.8 + latencyMs * 0.2;
    state.successRate = Math.min(1.0, state.successRate + 0.1);
  }

  recordFailure(keySuffix: string, error: string, statusCode?: number): void {
    const state = this.keyStates.get(keySuffix);
    if (!state) return;

    state.lastFailure = Date.now();
    state.failureCount++;
    state.inFlight = Math.max(0, state.inFlight - 1);
    state.successRate = Math.max(0, state.successRate - 0.2);

    if (state.failureCount >= 3) {
      state.health = 'cooldown';
      state.cooldownUntil = Date.now() + 60_000;
    }
  }

  selectKey(): number {
    return 0; // Ollama has only one "key" (no-auth)
  }
}

// ─── Singleton Router ───────────────────────────────────────────────────────

let routerInstance: ModelRouter | null = null;

/**
 * Get or create the singleton Model Router.
 */
export function getModelRouter(config: AppConfig): ModelRouter {
  if (!routerInstance) {
    routerInstance = new ModelRouter(config);
  }
  return routerInstance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetModelRouter(): void {
  routerInstance = null;
}

// ─── Export Types ───────────────────────────────────────────────────────────

export type {
  ChatMessage,
  ChatCompletionResponse,
};
