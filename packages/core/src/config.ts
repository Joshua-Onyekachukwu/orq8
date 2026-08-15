import { z } from 'zod';

// docs/42.5 — configuration via env vars, validated at boot; defaults target the free local stack.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // empty-string PORT (common in some shells/CI) falls back to the dev default
  PORT: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().positive().default(3001)),
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
  OLLAMA_BASE_URL: z.string().url().optional(),

  // Observability (docs/39)
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
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
