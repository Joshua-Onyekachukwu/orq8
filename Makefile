# ORQ8 — dev shortcuts (docs/51_ENVIRONMENT_SETUP.md)
#
# Requires: make, docker compose, pnpm (v9 via corepack).
# On Windows without make, use the equivalent pnpm scripts directly:
#   pnpm install · pnpm infra:up · pnpm db:migrate · pnpm dev:api · pnpm dev:web
# Run `make help` for the full list.

.PHONY: help install env-setup infra-up infra-down infra-logs infra-ps models db-migrate db-seed setup dev-api dev-web test typecheck build

help: ## Show all targets
	@printf 'ORQ8 dev shortcuts (docs/51_ENVIRONMENT_SETUP.md)\n\n'
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  make %-14s %s\n", $$1, $$2}'

install: ## Install workspace dependencies (pnpm install)
	pnpm install

env-setup: ## Copy .env examples (idempotent; never overwrites existing .env)
	@test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
	@test -f apps/web/.env || cp apps/web/.env.example apps/web/.env
	@test -f infra/.env || cp infra/.env.example infra/.env
	@echo "env files ready (edit apps/*/.env and infra/.env as needed)"

infra-up: ## Boot infra: Postgres+pgvector, MinIO, Ollama, LiteLLM
	pnpm infra:up

infra-down: ## Stop infra containers
	pnpm infra:down

infra-logs: ## Tail infra container logs
	docker compose -f infra/docker-compose.yml logs -f --tail=50

infra-ps: ## Show infra container status
	docker compose -f infra/docker-compose.yml ps

models: ## Pull local models for zero-cost mode (docs/51.3)
	ollama pull llama3.2
	ollama pull nomic-embed-text

db-migrate: ## Apply Drizzle migrations (packages/db)
	pnpm db:migrate

db-seed: ## Seed: default org, constitution, templates, model catalog
	pnpm db:seed

setup: install env-setup infra-up db-migrate db-seed ## One-shot bootstrap: install → env → infra → migrate → seed
	@echo "Bootstrap complete. Run 'make dev-api' (and 'make dev-web' in another shell)."

dev-api: ## Run API dev server (http://localhost:3001)
	pnpm dev:api

dev-web: ## Run web dev server (http://localhost:3000)
	pnpm dev:web

test: ## Run all workspace tests
	pnpm test

typecheck: ## Typecheck all workspace packages
	pnpm typecheck

build: ## Production-build all workspace packages
	pnpm build
