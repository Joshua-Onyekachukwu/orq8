/**
 * API integration suite runner.
 *
 * The integration suites (`apps/api/test/*.integration.test.ts`) skip unless a
 * real PostgreSQL is reachable through DATABASE_URL. CI provides one as a
 * service; locally there is often none (no Docker on this machine), so those
 * 36 suites silently skip and the verification battery is weaker than it looks.
 *
 * This runner closes that gap: it boots an embedded PostgreSQL, applies the
 * production migration lineage (drizzle + supabase, with the same pgvector and
 * auth-schema shims the E2E harnesses use), then runs vitest with DATABASE_URL
 * pointed at it. Nothing inside ORQ8 is stubbed.
 *
 * Usage:
 *   pnpm exec tsx scripts/integration-suite.ts                 (all suites)
 *   pnpm exec tsx scripts/integration-suite.ts approvals       (name filter)
 */

import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootEmbeddedDatabase } from "./lib/embedded-db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_NAME = "orq8_integration_suite";

async function main(): Promise<void> {
  const filter = process.argv[2];
  const db = await bootEmbeddedDatabase({ dbName: DB_NAME, dirPrefix: "run" });
  try {
    console.log(`[suite] embedded Postgres ready on ${db.port}, migrations applied`);

    const args = ["--filter", "@orq8/api", "exec", "vitest", "run", ...(filter ? [filter] : [])];
    const code: number = await new Promise((resolve) => {
      const child = spawn("pnpm", args, {
        cwd: ROOT,
        env: {
          ...process.env,
          DATABASE_URL: db.databaseUrl,
          NODE_ENV: "test",
          LOG_LEVEL: "silent",
        },
        stdio: "inherit",
        shell: true,
      });
      child.on("exit", (c) => resolve(c ?? 1));
    });
    console.log(`[suite] vitest exit code ${code}`);
    await db.stop();
    // The per-run data dir is gone; clear the shared root when it is empty.
    try {
      rmSync(path.join(ROOT, ".integration-suite-data"), { recursive: true, force: true });
    } catch {
      /* a leftover dir is harmless and gitignored */
    }
    // Exit explicitly: vitest workers and the pg module can hold handles open,
    // which would otherwise leave the runner hanging after the suites finish.
    process.exit(code);
  } catch (err) {
    console.error(`[suite] fatal: ${(err as Error).message}`);
    await db.stop();
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(`[suite] fatal: ${(err as Error).message}`);
  process.exit(1);
});
