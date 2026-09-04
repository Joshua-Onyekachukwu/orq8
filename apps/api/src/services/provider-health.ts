/**
 * ORQ8 Provider Health Probe
 *
 * Actually pings each configured provider to determine real-time health.
 * Uses lightweight requests (models list or minimal completion) to test connectivity.
 *
 * Returns healthy/degraded/down status with latency and error details.
 */

import type { AppConfig } from '@orq8/core';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'down' | 'not_configured';

export interface ProviderHealthResult {
  provider: string;
  slug: string;
  status: ProviderHealthStatus;
  latencyMs: number;
  configured: boolean;
  keyCount: number;
  modelsAvailable: string[];
  error?: string;
  lastChecked: string;
  baseUrl: string;
}

// ─── Probe Functions ────────────────────────────────────────────────────────

/**
 * Probe NVIDIA NIM by requesting the models list.
 */
async function probeNvidia(config: AppConfig): Promise<ProviderHealthResult> {
  const keys: string[] = [];
  if (config.NVIDIA_API_KEY) keys.push(config.NVIDIA_API_KEY);
  if (config.NVIDIA_API_KEYS) {
    for (const k of config.NVIDIA_API_KEYS.split(',')) {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
    }
  }

  if (keys.length === 0) {
    return {
      provider: 'NVIDIA NIM',
      slug: 'nvidia',
      status: 'not_configured',
      latencyMs: 0,
      configured: false,
      keyCount: 0,
      modelsAvailable: [],
      lastChecked: new Date().toISOString(),
      baseUrl: config.NVIDIA_BASE_URL,
    };
  }

  const startTime = Date.now();
  try {
    // Use the first key to probe — try a minimal models list request
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(`${config.NVIDIA_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${keys[0]}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;

    if (res.ok) {
      const data = await res.json() as { data?: Array<{ id: string }> };
      const models = (data.data ?? []).map((m: any) => m.id ?? '').filter(Boolean);
      return {
        provider: 'NVIDIA NIM',
        slug: 'nvidia',
        status: 'healthy',
        latencyMs,
        configured: true,
        keyCount: keys.length,
        modelsAvailable: models.slice(0, 20),
        lastChecked: new Date().toISOString(),
        baseUrl: config.NVIDIA_BASE_URL,
      };
    }

    // Non-200 but server responded — degraded (key may lack model access)
    return {
      provider: 'NVIDIA NIM',
      slug: 'nvidia',
      status: res.status === 401 || res.status === 403 ? 'degraded' : 'down',
      latencyMs,
      configured: true,
      keyCount: keys.length,
      modelsAvailable: [],
      error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      lastChecked: new Date().toISOString(),
      baseUrl: config.NVIDIA_BASE_URL,
    };
  } catch (err) {
    return {
      provider: 'NVIDIA NIM',
      slug: 'nvidia',
      status: 'down',
      latencyMs: Date.now() - startTime,
      configured: true,
      keyCount: keys.length,
      modelsAvailable: [],
      error: err instanceof Error ? err.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
      baseUrl: config.NVIDIA_BASE_URL,
    };
  }
}

/**
 * Probe OpenRouter by requesting the models list.
 */
async function probeOpenRouter(config: AppConfig): Promise<ProviderHealthResult> {
  const keys: string[] = [];
  if (config.OPENROUTER_API_KEY) keys.push(config.OPENROUTER_API_KEY);
  if (config.OPENROUTER_API_KEYS) {
    for (const k of config.OPENROUTER_API_KEYS.split(',')) {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
    }
  }

  if (keys.length === 0) {
    return {
      provider: 'OpenRouter',
      slug: 'openrouter',
      status: 'not_configured',
      latencyMs: 0,
      configured: false,
      keyCount: 0,
      modelsAvailable: [],
      lastChecked: new Date().toISOString(),
      baseUrl: config.OPENROUTER_BASE_URL,
    };
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(`${config.OPENROUTER_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${keys[0]}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;

    if (res.ok) {
      const data = await res.json() as { data?: Array<{ id: string }> };
      const models = (data.data ?? []).map((m: any) => m.id ?? '').filter(Boolean);
      return {
        provider: 'OpenRouter',
        slug: 'openrouter',
        status: 'healthy',
        latencyMs,
        configured: true,
        keyCount: keys.length,
        modelsAvailable: models.slice(0, 20),
        lastChecked: new Date().toISOString(),
        baseUrl: config.OPENROUTER_BASE_URL,
      };
    }

    return {
      provider: 'OpenRouter',
      slug: 'openrouter',
      status: res.status === 401 || res.status === 403 ? 'degraded' : 'down',
      latencyMs,
      configured: true,
      keyCount: keys.length,
      modelsAvailable: [],
      error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      lastChecked: new Date().toISOString(),
      baseUrl: config.OPENROUTER_BASE_URL,
    };
  } catch (err) {
    return {
      provider: 'OpenRouter',
      slug: 'openrouter',
      status: 'down',
      latencyMs: Date.now() - startTime,
      configured: true,
      keyCount: keys.length,
      modelsAvailable: [],
      error: err instanceof Error ? err.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
      baseUrl: config.OPENROUTER_BASE_URL,
    };
  }
}

/**
 * Probe Ollama (local) by hitting the /api/tags endpoint.
 */
async function probeOllama(config: AppConfig): Promise<ProviderHealthResult> {
  if (!config.OLLAMA_BASE_URL) {
    return {
      provider: 'Ollama (Local)',
      slug: 'ollama',
      status: 'not_configured',
      latencyMs: 0,
      configured: false,
      keyCount: 0,
      modelsAvailable: [],
      lastChecked: new Date().toISOString(),
      baseUrl: '',
    };
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    const res = await fetch(`${config.OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;

    if (res.ok) {
      const data = await res.json() as { models?: Array<{ name: string }> };
      const models = (data.models ?? []).map((m: any) => m.name ?? '').filter(Boolean);
      return {
        provider: 'Ollama (Local)',
        slug: 'ollama',
        status: 'healthy',
        latencyMs,
        configured: true,
        keyCount: 0, // No API keys needed
        modelsAvailable: models,
        lastChecked: new Date().toISOString(),
        baseUrl: config.OLLAMA_BASE_URL,
      };
    }

    return {
      provider: 'Ollama (Local)',
      slug: 'ollama',
      status: 'down',
      latencyMs,
      configured: true,
      keyCount: 0,
      modelsAvailable: [],
      error: `HTTP ${res.status}`,
      lastChecked: new Date().toISOString(),
      baseUrl: config.OLLAMA_BASE_URL,
    };
  } catch (err) {
    return {
      provider: 'Ollama (Local)',
      slug: 'ollama',
      status: 'down',
      latencyMs: Date.now() - startTime,
      configured: true,
      keyCount: 0,
      modelsAvailable: [],
      error: err instanceof Error ? err.message : 'Connection failed — is Ollama running?',
      lastChecked: new Date().toISOString(),
      baseUrl: config.OLLAMA_BASE_URL,
    };
  }
}

/**
 * Probe LiteLLM by hitting the /health endpoint.
 */
async function probeLiteLLM(config: AppConfig): Promise<ProviderHealthResult> {
  if (!config.LITELLM_BASE_URL) {
    return {
      provider: 'LiteLLM',
      slug: 'litellm',
      status: 'not_configured',
      latencyMs: 0,
      configured: false,
      keyCount: 0,
      modelsAvailable: [],
      lastChecked: new Date().toISOString(),
      baseUrl: '',
    };
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    const res = await fetch(`${config.LITELLM_BASE_URL}/health`, {
      headers: {
        Authorization: `Bearer ${config.LITELLM_MASTER_KEY ?? ''}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;

    if (res.ok) {
      return {
        provider: 'LiteLLM',
        slug: 'litellm',
        status: 'healthy',
        latencyMs,
        configured: true,
        keyCount: 1,
        modelsAvailable: [],
        lastChecked: new Date().toISOString(),
        baseUrl: config.LITELLM_BASE_URL,
      };
    }

    return {
      provider: 'LiteLLM',
      slug: 'litellm',
      status: 'down',
      latencyMs,
      configured: true,
      keyCount: 1,
      modelsAvailable: [],
      error: `HTTP ${res.status}`,
      lastChecked: new Date().toISOString(),
      baseUrl: config.LITELLM_BASE_URL,
    };
  } catch (err) {
    return {
      provider: 'LiteLLM',
      slug: 'litellm',
      status: 'down',
      latencyMs: Date.now() - startTime,
      configured: true,
      keyCount: 1,
      modelsAvailable: [],
      error: err instanceof Error ? err.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
      baseUrl: config.LITELLM_BASE_URL,
    };
  }
}

// ─── Main Probe Function ────────────────────────────────────────────────────

/**
 * Probe all configured providers and return health status.
 * Runs probes in parallel for speed.
 */
export async function probeAllProviders(config: AppConfig): Promise<{
  providers: ProviderHealthResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
    notConfigured: number;
  };
}> {
  const results = await Promise.all([
    probeNvidia(config),
    probeOpenRouter(config),
    probeOllama(config),
    probeLiteLLM(config),
  ]);

  return {
    providers: results,
    summary: {
      total: results.length,
      healthy: results.filter((r) => r.status === 'healthy').length,
      degraded: results.filter((r) => r.status === 'degraded').length,
      down: results.filter((r) => r.status === 'down').length,
      notConfigured: results.filter((r) => r.status === 'not_configured').length,
    },
  };
}
