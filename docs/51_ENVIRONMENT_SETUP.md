# 51 — Environment Setup

**Product:** ORQ8 · **Status:** Phase 0 · full documentation set

## 51.1 Prerequisites

Node.js ≥ 20 · pnpm ≥ 9 · Docker (with compose) · git · (optional) Ollama for local models

## 51.2 Steps

```bash
git clone <your-orq8-repo> && cd orq8
pnpm install

# infra: Postgres+pgvector, MinIO, Ollama, LiteLLM
docker compose -f infra/docker-compose.yml up -d

# env files (examples committed; real values never)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# database
pnpm --filter @orq8/db migrate
pnpm --filter @orq8/db seed        # default org, constitution, templates, model catalog

# run
pnpm --filter @orq8/api dev        # http://localhost:3001
pnpm --filter @orq8/web dev        # http://localhost:3000
```

## 51.3 Local Models (zero-cost mode)

```bash
ollama pull llama3.2        # or qwen/phi/etc.
ollama pull nomic-embed-text # embeddings (768-dim default)
```

LiteLLM config lists local models first; the router falls back to BYOK providers if configured (22).

## 51.4 Provider Keys (optional)

Settings → AI Providers → add key (OpenAI/Anthropic/Gemini/DeepSeek/Groq/OpenRouter) → test connection. Keys encrypted at rest (23). For pure-local dev, no keys are required.

## 51.5 Verification

- `curl localhost:3001/healthz` → ok
- Login → create org → hire a template agent → run a golden-workflow-v1 smoke task (50.3).
- `pnpm lint && pnpm typecheck && pnpm test` green.

## 51.6 Editor & Tips

- VS Code: ESLint + Prettier extensions; workspace config in repo.
- Debug: pino-pretty for logs; OTel traces in dev console; optional Langfuse at `localhost:3002`.
- Troubleshooting: port conflicts (3000/3001/3002), Docker volume reset (`docker compose down -v` only for dev data), Ollama RAM requirements (≥8 GB recommended).
