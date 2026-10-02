import { z } from 'zod';

// docs/42.5 — configuration via env vars, validated at boot; defaults target the free local stack.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // empty-string or zero PORT (common in some shells/CI/hosting) falls back to the dev default
  PORT: z.preprocess((v) => (v === '' || v === '0' ? undefined : v), z.coerce.number().int().positive().default(3001)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z
    .string()
    .default('postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8'),

  // Secrets (docs/37) — dev-only defaults; override in real environments
  SESSION_SECRET: z.string().min(16).default('dev-only-session-secret-change-me'),
  ENCRYPTION_KEY: z.string().min(16).default('dev-only-encryption-key-32-bytes!!'),
  ENCRYPTION_KEY_KID: z.string().default('v1'), // wrapping-key version stamp (docs/23.5)

  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  // Model gateway + local models (docs/22, 51.3)
  LITELLM_BASE_URL: z.string().url().optional(),
  LITELLM_MASTER_KEY: z.string().optional(),
  // Local Ollama fallback — enabled only when OLLAMA_BASE_URL is set
  // (e.g. http://localhost:11434). Tried after NVIDIA NIM and LiteLLM.
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().default('llama3.1'),

  // NVIDIA NIM — direct provider (docs/22). When set, ORQ8 calls NVIDIA NIM
  // directly without needing a LiteLLM gateway. Free tier: 1000 credits.
  //
  // Multi-key support: NVIDIA_API_KEYS accepts a comma-separated list of extra
  // keys. The full pool (NVIDIA_API_KEY + NVIDIA_API_KEYS) is rotated round-
  // robin across concurrent requests and failed-over automatically when one
  // key is rate-limited (429), invalid (401/403), or lacks a model (404).
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_API_KEYS: z.string().optional(),
  NVIDIA_BASE_URL: z.string().url().default('https://integrate.api.nvidia.com/v1'),
  NVIDIA_MODEL: z.string().default('nvidia/llama-3.1-nemotron-70b-instruct'),
  // Comma-separated models tried after NVIDIA_MODEL when the account lacks
  // access to it (404 "Function not found for account"). Account entitlements
  // vary per model, so ORQ8 walks the list before escalating to LiteLLM.
  NVIDIA_MODEL_FALLBACKS: z.string().optional(),

  // OpenRouter — multi-model gateway (docs/22.1). When set, ORQ8 can route
  // to any model available on OpenRouter (Claude, GPT-4o, Gemini, etc.).
  //
  // Multi-key support: OPENROUTER_API_KEYS accepts a comma-separated list.
  // Keys are rotated round-robin and failed-over automatically.
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_API_KEYS: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: z.string().default('openai/gpt-4o-mini'),
  // Comma-separated fallback models tried when OPENROUTER_MODEL fails.
  OPENROUTER_MODEL_FALLBACKS: z.string().optional(),

  // Job queue mode (docs/75 — backend phase, first slice). 'inline' runs agent
  // work on the request path exactly as before; 'workers' enqueues to the
  // durable agent_jobs table and a background worker drains it (retries with
  // backoff, stale-lock reaping), which is how the monolith graduates to
  // worker microservices without changing the tool/pipeline code.
  JOB_QUEUE_MODE: z.enum(['inline', 'workers']).default('inline'),
  // Worker poll interval in ms (only meaningful in 'workers' mode).
  JOB_WORKER_INTERVAL_MS: z.coerce.number().int().min(250).default(2000),

  // SerpAPI — real web search for agent research tools
  SERPAPI_KEY: z.string().optional(),

  // LLM request timeouts (docs/22) — unprovisioned provider functions
  // sometimes HANG instead of returning 404, so the chain must fail fast:
  // LLM_HEADERS_TIMEOUT_MS bounds how long we wait for the server to respond
  // at all, and LLM_TIMEOUT_MS is the overall budget including the body read.
  // Once headers arrive the request is alive, so the total can stay generous
  // for slow-but-legitimate long generations.
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  LLM_HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  // Observability (docs/39)
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),

  // Email transport — Resend (preferred) or SMTP.
  // RESEND_API_KEY unset + SMTP unset = dev mode: emails logged, not sent.
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('ORQ8 <founder@orq8.ai>'),

  // Executive Agent brand name — used in the EA system prompt so the agent
  // introduces itself consistently. Change without a code change.
  EA_DISPLAY_NAME: z.string().trim().min(1).max(60).default('Atlas'),

  // Redis — session cache, rate limiting, idempotency (docs/42)
  REDIS_URL: z.string().optional(),

  // Stripe — billing and subscriptions
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_FOUNDER_MONTHLY: z.string().optional(),
  STRIPE_PRICE_FOUNDER_ANNUAL: z.string().optional(),
  STRIPE_PRICE_TEAM_MONTHLY: z.string().optional(),
  STRIPE_PRICE_TEAM_ANNUAL: z.string().optional(),
  STRIPE_PRICE_COMPANY_MONTHLY: z.string().optional(),
  STRIPE_PRICE_COMPANY_ANNUAL: z.string().optional(),
  APP_URL: z.string().url().optional(),

  // S3/R2 — file storage (Cloudflare R2, AWS S3, or local fallback)
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  LOCAL_STORAGE_DIR: z.string().optional(),

  // Internal endpoints (e.g. POST /v1/internal/waitlist/process-due) — required
  // in production; unset disables them (local dev uses the inline timer).
  INTERNAL_TOKEN: z.string().optional(),

  // Optional LLM enrichment for Business Import (Phase 10). When 'true' and an
  // LLM provider key is present, the import pipeline may refine extracted facts
  // (never invent them) with the configured model, always preserving source
  // provenance. Core extraction works without it; enrichment is a best-effort
  // refinement stage that fails closed to the trusted extracted facts.
  BUSINESS_IMPORT_ENRICHMENT: z.string().optional(),

  // GitHub OAuth (docs — Task 1). Server-side credentials for the ORQ8 GitHub
  // OAuth App. The authorization-code exchange happens here, never client-side.
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Google (Gmail) OAuth — same server-side pattern as GitHub. Scopes request
  // gmail.modify (drafts/search/read) + gmail.send (approval-gated send).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Embeddings (ADR-012, Phase 9). EMBEDDING_BASE_URL points at any
  // OpenAI-compatible /embeddings endpoint (LiteLLM → Ollama nomic-embed-text
  // locally; a hosted provider in production). Unset = keyword-only memory
  // search — semantic retrieval degrades gracefully, never breaks writes.
  EMBEDDING_BASE_URL: z.string().url().optional(),
  EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  EMBEDDING_API_KEY: z.string().optional(),

  // Platform-admin bootstrap (docs/34.x): comma-separated emails that may act as
  // platform admins (users.platform_role = 'admin') without a DB write. Intended
  // to promote the first operator account; afterwards promote in the DB.
  PLATFORM_ADMIN_EMAILS: z.string().optional(),
});

/**
 * The configuration surface, in declaration order.
 *
 * This is the single source of truth for "what can be configured", so the
 * `.env.example` files can be checked against it instead of drifting from it
 * (docs/62.13 found 35 keys that no example mentioned, which is a deployer
 * being unable to learn the surface rather than a cosmetic gap).
 */
export function envSurface(): string[] {
  return Object.keys(envSchema.shape).sort();
}

/**
 * The keys a real deployment must set, as opposed to the ones that may keep
 * their development default.
 *
 * Only `DATABASE_URL` is boot-critical (everything else is optional or
 * defaulted, which is what lets the API start and degrade in a minimal
 * environment). The two secrets are not "boot-critical" but they are
 * "deploy-critical": `loadConfig` refuses to boot in production while they
 * still hold the dev-only values below, so a deployment that forgets them does
 * not start at all.
 */
export function envRequiredInProduction(): string[] {
  return ['DATABASE_URL', 'SESSION_SECRET', 'ENCRYPTION_KEY'];
}

export function platformAdminEmails(config: AppConfig): Set<string> {
  return new Set(
    (config.PLATFORM_ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type AppConfig = z.infer<typeof envSchema>;

const DEV_ONLY_SECRETS = [
  'dev-only-session-secret-change-me',
  'dev-only-encryption-key-32-bytes!!',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(fields)}`);
  }
  const config = parsed.data;

  // docs/37.2 — dev-only secret defaults must never reach a real environment.
  // Fail at boot instead of silently running with known keys in production.
  if (config.NODE_ENV === 'production') {
    const live = [config.SESSION_SECRET, config.ENCRYPTION_KEY];
    if (live.some((v) => (DEV_ONLY_SECRETS as readonly string[]).includes(v))) {
      throw new Error(
        'Refusing to boot in production with dev-only secrets: set SESSION_SECRET and ENCRYPTION_KEY (docs/58).',
      );
    }
  }

  return config;
}

/**
 * Capability readiness — the activation model, as data.
 *
 * docs/19 asks integrations to be switched on by configuration rather than by a
 * code change. This is that contract in one place: every product capability
 * that depends on external configuration names the environment keys it needs,
 * so a deployment can be asked "what is not activated yet?" and answer
 * truthfully without a developer reading the source (docs/69 §"infrastructure
 * to build").
 *
 * Two rules the shape enforces:
 *   - only KEY NAMES cross the boundary, never a value (docs/37: never expose
 *     secrets), so a readiness report is safe to render in the product;
 *   - `ready` is computed from the environment, so it cannot be claimed by
 *     declaration alone.
 */
export type CapabilityStatus = 'ready' | 'configuration_required' | 'dev_only';

export interface CapabilityReadiness {
  id: string;
  label: string;
  status: CapabilityStatus;
  /** Every key in this list must be set. */
  requires: string[];
  /** Each group is satisfied by any one of its keys (e.g. Resend OR SMTP). */
  anyOf: string[][];
  /** Keys that are set here (names only). */
  configured: string[];
  /** Keys this deployment is missing (names only). */
  missing: string[];
  /** Without it the product cannot serve the founder, so it blocks a release. */
  productionCritical: boolean;
  /** The product still runs, but a named behaviour is unavailable. */
  degraded: boolean;
  /** What the founder loses while this is not configured. */
  impact: string;
  /** Where the activation is documented. */
  docs: string;
}

export interface CapabilityReadinessReport {
  ready: number;
  configurationRequired: number;
  devOnly: number;
  /** Ids of production-critical capabilities that are not ready. */
  blocking: string[];
  capabilities: CapabilityReadiness[];
}

type CapabilityDefinition = Omit<
  CapabilityReadiness,
  'status' | 'configured' | 'missing'
> & { devAlternative?: string[] };

const CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'database',
    label: 'Database',
    requires: ['DATABASE_URL'],
    anyOf: [],
    productionCritical: true,
    degraded: false,
    impact: 'The API cannot start.',
    docs: 'docs/58',
  },
  {
    id: 'secrets',
    label: 'Session and encryption keys',
    requires: ['SESSION_SECRET', 'ENCRYPTION_KEY'],
    anyOf: [],
    productionCritical: true,
    degraded: false,
    impact:
      'A production boot refuses to start, and stored integration credentials cannot be decrypted.',
    docs: 'docs/37',
  },
  {
    id: 'web_origin',
    label: 'Browser origin and CORS',
    requires: ['APP_URL', 'ALLOWED_ORIGINS'],
    anyOf: [],
    productionCritical: true,
    degraded: false,
    impact:
      'The deployed web app is not an allowed origin, so every request from the product is refused by the API.',
    docs: 'docs/58.5',
  },
  {
    id: 'model_gateway',
    label: 'Model gateway (OpenRouter primary, NVIDIA fallback)',
    requires: [],
    anyOf: [
      ['OPENROUTER_API_KEY', 'OPENROUTER_API_KEYS'],
      ['NVIDIA_API_KEY', 'NVIDIA_API_KEYS'],
    ],
    productionCritical: true,
    degraded: false,
    impact:
      'AI employees cannot think: execution falls back to structured output and the work is marked failed.',
    docs: 'docs/22',
  },
  {
    id: 'email',
    label: 'Transactional email',
    requires: [],
    anyOf: [['RESEND_API_KEY'], ['SMTP_HOST']],
    productionCritical: true,
    degraded: false,
    impact:
      'Confirmation and invitation mail is written to the log instead of delivered, so a new account can never confirm its address.',
    docs: 'docs/66.18',
  },
  {
    id: 'embeddings',
    label: 'Embeddings (semantic memory)',
    requires: ['EMBEDDING_BASE_URL'],
    anyOf: [],
    productionCritical: false,
    degraded: true,
    impact:
      'Memory retrieval is keyword-only: relevant knowledge can be missed when the wording differs.',
    docs: 'docs/21',
  },
  {
    id: 'storage',
    label: 'File storage',
    requires: ['S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET'],
    anyOf: [],
    devAlternative: ['LOCAL_STORAGE_DIR'],
    productionCritical: false,
    degraded: true,
    impact:
      'Uploads land on the instance disk and are lost when it is replaced.',
    docs: 'docs/42',
  },
  {
    id: 'realtime',
    label: 'Realtime fan-out',
    requires: ['REDIS_URL'],
    anyOf: [],
    productionCritical: false,
    degraded: true,
    impact:
      'Live updates are published in-process only, so a second API instance does not see them.',
    docs: 'docs/36',
  },
  {
    id: 'scheduler',
    label: 'Scheduled jobs',
    requires: ['INTERNAL_TOKEN'],
    anyOf: [],
    productionCritical: false,
    degraded: true,
    impact:
      'Scheduled jobs cannot authenticate, so consolidation, briefings and anomaly scans do not run.',
    docs: 'docs/52',
  },
  {
    id: 'search',
    label: 'Web search',
    requires: ['SERPAPI_KEY'],
    anyOf: [],
    productionCritical: false,
    degraded: true,
    impact: 'Research and prospecting tools refuse with a configuration error.',
    docs: 'docs/25',
  },
  {
    id: 'github_oauth',
    label: 'GitHub (connect a repository)',
    requires: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    anyOf: [],
    productionCritical: false,
    degraded: true,
    impact: 'The engineering workspace cannot connect a repository.',
    docs: 'docs/58.6',
  },
  {
    id: 'google_oauth',
    label: 'Google sign-in',
    requires: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    anyOf: [],
    productionCritical: false,
    degraded: true,
    impact: 'Only email and password sign-in is offered.',
    docs: 'docs/37',
  },
  {
    id: 'billing',
    label: 'Billing (Stripe)',
    requires: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    anyOf: [],
    productionCritical: false,
    degraded: true,
    impact: 'Plans cannot be purchased; credits can only be granted by hand.',
    docs: 'docs/24',
  },
  {
    id: 'observability',
    label: 'Tracing export',
    requires: ['OTEL_EXPORTER_OTLP_ENDPOINT'],
    anyOf: [],
    productionCritical: false,
    degraded: true,
    impact: 'Traces stay in the process log; nothing is exported to a collector.',
    docs: 'docs/39',
  },
];

/**
 * Which capabilities this configuration can actually serve.
 *
 * `dev_only` is deliberately distinct from `ready`: a capability kept alive by
 * a local substitute (disk storage, an in-process queue, a LiteLLM or Ollama
 * gateway on the developer's machine) works here and would not work once the
 * deployment moves, and that difference must not be hidden.
 */
export function capabilityReadiness(config: AppConfig): CapabilityReadinessReport {
  const env = config as unknown as Record<string, unknown>;
  const present = (key: string): boolean => {
    const value = env[key];
    return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;
  };

  const capabilities: CapabilityReadiness[] = CAPABILITIES.map((definition) => {
    const { devAlternative, ...rest } = definition;
    const keys = [...definition.requires, ...definition.anyOf.flat()];
    const configured = keys.filter(present);
    const missing = keys.filter((key) => !present(key));
    const requiresSatisfied = definition.requires.every(present);
    // Each entry is one alternative provider (OpenRouter *or* NVIDIA, Resend
    // *or* SMTP), so one satisfied group is enough; the unsatisfied ones are
    // the fallbacks that are still open, and they stay in `missing` so a
    // deployment can see its fallback path is untested.
    const anyOfSatisfied = definition.anyOf.length === 0 || definition.anyOf.some((group) => group.some(present));
    const devOnly =
      !(requiresSatisfied && anyOfSatisfied) &&
      (devAlternative ?? []).some(present);

    return {
      ...rest,
      status: requiresSatisfied && anyOfSatisfied ? 'ready' : devOnly ? 'dev_only' : 'configuration_required',
      configured,
      missing,
    };
  });

  return {
    ready: capabilities.filter((c) => c.status === 'ready').length,
    configurationRequired: capabilities.filter((c) => c.status === 'configuration_required').length,
    devOnly: capabilities.filter((c) => c.status === 'dev_only').length,
    blocking: capabilities
      .filter((c) => c.productionCritical && c.status !== 'ready')
      .map((c) => c.id),
    capabilities,
  };
}

export function allowedOrigins(config: AppConfig): string[] {
  return config.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
