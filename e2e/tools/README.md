# e2e/tools — live verification scripts

Standalone production-rehearsal scripts used during ORQ8 launch QA. Each script
is **temporary by design**: it prints what it did and (for the browser passes)
deletes nothing from your data — they are read-mostly, but a few create real
records (deliberations, outcomes) on the demo organization. Point them at a
scratch org if that matters to you.

## Setup

```bash
pnpm install          # from repo root — @playwright/test resolves via the e2e/tools workspace package
npx playwright install chromium   # once, for the browser-based scripts
```

## Environment files (gitignored, never commit)

| File | Used by | Contents |
|---|---|---|
| `.env.e2e.local` | journey-loop, journey-outcome, smoke-live | `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, optional `BASE_URL` / `API_URL` overrides |
| `.env.demo.local` | rehearsal-56 | demo org credentials (`TEST_USER_EMAIL` / `TEST_USER_PASSWORD`) |

## Scripts

| Script | What it verifies |
|---|---|
| `journey-loop.mjs` | Full §56 journey: catalogs, EA command, deliberation → decision persistence, outcome filing, signals |
| `journey-outcome.mjs` | §29 outcome-feedback loop: file an outcome on a real council decision, read back signals |
| `rehearsal-56.mjs` | Full-company production journey (API-only, honest-output) |
| `smoke-live.mjs` | Authenticated browser smoke pass: login → dashboard → Decision Council → logout |

## Run

```bash
node e2e/tools/journey-loop.mjs
node e2e/tools/smoke-live.mjs
```
