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

  // GitHub OAuth (docs — Task 1). Server-side credentials for the ORQ8 GitHub
  // OAuth App. The authorization-code exchange happens here, never client-side.
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Platform-admin bootstrap (docs/34.x): comma-separated emails that may act as
  // platform admins (users.platform_role = 'admin') without a DB write. Intended
  // to promote the first operator account; afterwards promote in the DB.
  PLATFORM_ADMIN_EMAILS: z.string().optional(),
});

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

export function allowedOrigins(config: AppConfig): string[] {
  return config.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
