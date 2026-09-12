# scripts/ — production verification suite

Maintained live-verification rehearsals for ORQ8. Every script prints only
claims backed by real responses from the target environment — nothing is
simulated, and failures are reported, never hidden. Some scripts create real
records (tasks, deliberations, outcomes) on the target organization; point
them at a scratch org when that matters.

## Run everything

```bash
npm run verify:prod            # from repo root — runs the full suite
```

Or run one suite:

```bash
node scripts/run.mjs smoke                  # authenticated smoke pass (browser)
node scripts/run.mjs journey                # §29/§16-17 org journey (API)
node scripts/run.mjs outcome                # decision-outcome loop (API)
node scripts/run.mjs departments            # Marketing/Product/Finance deep rehearsal (API, real LLM+QA)
node scripts/run.mjs rehearsal-56           # §56 full-company journey (API)
```

## Setup

```bash
pnpm install                      # from repo root — @playwright/test resolves via the scripts workspace package
npx playwright install chromium   # once, for the browser-based suites
```

## Environment files (gitignored, never commit)

| File | Used by | Contents |
|---|---|---|
| `.env.e2e.local` | journey-loop, journey-outcome, smoke-live, rehearse-departments, rehearsal-56 | `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, optional `BASE_URL` / `API_URL` overrides |
| `.env.demo.local` | rehearsal-56 | demo-account credentials (separate org) |

`rehearse-departments.mjs` also accepts `--base <api-url>` to target a
different environment.

## Suites

| Script | What it proves |
|---|---|
| `smoke-live.mjs` | Authenticated browser pass: login → dashboard → Decision Council renders the real session → navbar/logo → logout, with console + network capture. |
| `journey-loop.mjs` | Login → template catalog → agent hire → real council deliberation → outcome filing → EA org recommendation. |
| `journey-outcome.mjs` | Decision outcome feedback loop: file outcome on the real council decision, read back verdict + signals. |
| `rehearse-departments.mjs` | Marketing / Product / Finance workflows end-to-end: task creation assigned to a real department agent → **real LLM execution with QA evaluation** → result persisted on readback → honest failure reporting. |
| `rehearsal-56.mjs` | §56 full-company journey (EA → org build → verification). |

## Conventions

- **Honest output only.** A PASS line must be backed by a real response body.
- **Failures exit non-zero** so the runner (and any future CI wiring) fails loudly.
- Scripts create real records on the target org — use a scratch org for
  destructive experiments.
