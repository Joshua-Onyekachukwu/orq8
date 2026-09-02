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
  OLLAMA_BASE_URL: z.string().url().optional(),

  // NVIDIA NIM — direct provider (docs/22). When set, ORQ8 calls NVIDIA NIM
  // directly without needing a LiteLLM gateway. Free tier: 1000 credits.
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_BASE_URL: z.string().url().default('https://integrate.api.nvidia.com/v1'),
  NVIDIA_MODEL: z.string().default('nvidia/llama-3.1-nemotron-70b-instruct'),

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
});

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
