/**
 * ORQ8 Model Registry — the static capability/pricing catalogue.
 *
 * This file used to also carry the retired `ModelRouter` class and its provider
 * adapters. That stack was never instantiated (the live path is
 * `services/llm.ts`'s provider chain plus `model-selector.ts`/`model-intelligence.ts`
 * for selection), so docs/80 Phase 4 deleted it. What remains is the part real
 * code imports: the model definitions and the types derived from them.
 */

// ─── Model Capability Registry ──────────────────────────────────────────────

/**
 * Capabilities that a model can support.
 * The selection layer uses these to match task requirements to capabilities.
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

/** Model definition with capabilities and metadata. */
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
 * Task requirements the selection layer evaluates.
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

// ─── Built-in Model Registry ────────────────────────────────────────────────

/**
 * Known models with their capabilities.
 * Exported for the model-intelligence layer (tier classification must be
 * derived from the real registry — never fabricated availability).
 */
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
