import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { count, eq } from 'drizzle-orm';
import { providers, users, type NewProvider } from './schema.js';

// docs/51.2 — `pnpm --filter @orq8/db seed`
// Phase 1 static seed: the provider catalog (docs/23.1). User + org data is
// created at registration; Phase 2+ adds constitution/agent/model seeds.
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8';

// docs/23.1/23.3 — catalog is configuration (incl. “how to get a key” links),
// not hard-coded assumptions; upsert by slug so re-seeding is idempotent.
const PROVIDER_CATALOG: NewProvider[] = [
  { slug: 'openai', name: 'OpenAI', kind: 'byok', baseUrl: 'https://api.openai.com/v1', docUrl: 'https://platform.openai.com/api-keys', defaultModels: ['gpt-4o-mini', 'gpt-4o'] },
  { slug: 'anthropic', name: 'Anthropic', kind: 'byok', baseUrl: 'https://api.anthropic.com/v1', docUrl: 'https://console.anthropic.com/settings/keys', defaultModels: ['claude-sonnet-4-5', 'claude-haiku-4-5'] },
  { slug: 'gemini', name: 'Google Gemini', kind: 'byok', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', docUrl: 'https://aistudio.google.com/apikey', defaultModels: ['gemini-2.0-flash'] },
  { slug: 'deepseek', name: 'DeepSeek', kind: 'byok', baseUrl: 'https://api.deepseek.com/v1', docUrl: 'https://platform.deepseek.com/api_keys', defaultModels: ['deepseek-chat'] },
  { slug: 'groq', name: 'Groq', kind: 'byok', baseUrl: 'https://api.groq.com/openai/v1', docUrl: 'https://console.groq.com/keys', defaultModels: ['llama-3.3-70b-versatile'] },
  { slug: 'openrouter', name: 'OpenRouter', kind: 'byok', baseUrl: 'https://openrouter.ai/api/v1', docUrl: 'https://openrouter.ai/keys', defaultModels: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4.5'] },
  { slug: 'ollama', name: 'Ollama (local)', kind: 'local', baseUrl: 'http://localhost:11434', docUrl: 'https://ollama.com/library', defaultModels: ['llama3.2', 'nomic-embed-text'] },
];

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  for (const p of PROVIDER_CATALOG) {
    const existing = await db.select().from(providers).where(eq(providers.slug, p.slug)).limit(1);
    if (existing.length === 0) {
      await db.insert(providers).values(p);
    }
  }
  const [row] = await db.select({ n: count() }).from(users);
  const [prov] = await db.select({ n: count() }).from(providers);
  console.log(`[db] seed: ${prov?.n ?? 0} providers in catalog, ${row?.n ?? 0} users.`);
  await pool.end();
}

main().catch((err) => {
  console.error('[db] seed failed:', err);
  process.exit(1);
});
