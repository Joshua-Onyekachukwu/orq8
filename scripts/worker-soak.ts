/**
 * Worker soak (docs/80 Phase 3/6) — drive the real queue under sustained load
 * and prove the safety properties the queue exists for.
 *
 * What runs for real (no mocks):
 *   • an embedded PostgreSQL with the production migration lineage (booted,
 *     used and deleted by this script — no system install);
 *   • the REAL `startJobWorker` loop, N of them, claiming the real `agent_jobs`
 *     table through `claimJob`'s `FOR UPDATE SKIP LOCKED`;
 *   • a producer that keeps the queue deep for the whole run, so claims overlap
 *     across workers instead of draining a fixed list once.
 *
 * What it asserts at the end:
 *   • the queue DRAINS — no `pending` and no `running` rows remain;
 *   • no job is CLAIMED TWICE — every job's `attempts` stays 1 (SKIP LOCKED is
 *     the whole point; an attempts > 1 row is a double-claim);
 *   • no LEAKED LOCKS — no row holds a lock (`locked_at`) outside `running`;
 *   • a deliberately leaked lock is REAPED and its job still finishes;
 *   • nothing FAILED on the retry ladder, and the only dead rows are the ones
 *     this script seeded on purpose.
 *
 * The jobs are `task.execute` jobs whose tasks are already `completed`, so the
 * worker's preflight skips them (done, no model call): the soak is deterministic
 * and credential-free while still exercising the exact claim/complete/reap path
 * under concurrency. Real task execution is covered by the integration suite.
 *
 * Usage:
 *   pnpm exec tsx scripts/worker-soak.ts                 # 5-minute soak
 *   pnpm exec tsx scripts/worker-soak.ts --seconds 30    # short run
 *   pnpm exec tsx scripts/worker-soak.ts --workers 8 --keep-db
 *
 * Exit code is 1 if any assertion fails.
 */

import { randomUUID } from "node:crypto";
import { createLogger, loadConfig } from "@orq8/core";
import { agents, createDb, memberships, organizations, tasks, users } from "@orq8/db";
import { bootEmbeddedDatabase, killStaleEmbeddedPostgres } from "./lib/embedded-db.js";
import { enqueueJob, jobsHealth } from "../apps/api/src/services/jobs.js";
import { startJobWorker, type JobWorkerHandle } from "../apps/api/src/services/job-worker.js";

// ─── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (name: string, dflt: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? parseInt(args[i + 1] ?? "", 10) || dflt : dflt;
};
const DURATION_SECONDS = opt("seconds", 300);
const WORKERS = opt("workers", 4);
const BATCH_SIZE = opt("batch", 10);
const LOW_WATER = opt("low-water", 250); // top the queue up below this
const WAVE_SIZE = opt("wave", 60);
const KEEP_DB = args.includes("--keep-db");
const DEAD_JOBS = 5; // jobs pointing at a task that does not exist → dead-letter

const DATA_ROOT = ".worker-soak-data";
const DB_NAME = "orq8_soak";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

async function main(): Promise<number> {
  console.log(`[soak] booting embedded Postgres + production lineage …`);
  await killStaleEmbeddedPostgres(DATA_ROOT);
  const pg = await bootEmbeddedDatabase({ dbName: DB_NAME, dataRoot: DATA_ROOT, dirPrefix: "soak" });
  // One pool for the whole harness: the workers, the producer and the raw
  // assertions all share it, and it is closed before the server stops (a pool
  // left open when Postgres goes away throws 'Connection terminated').
  const { db, pool } = createDb(pg.databaseUrl);
  pool.on("error", () => undefined);

  const logger = createLogger({ NODE_ENV: "test", LOG_LEVEL: "silent" });
  const baseEnv: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: pg.databaseUrl,
    JOB_QUEUE_MODE: "workers",
    JOB_WORKER_INTERVAL_MS: "250",
    JOB_BATCH_SIZE: String(BATCH_SIZE),
    JOB_TIMEOUT_MS: "30000",
  };

  const workers: JobWorkerHandle[] = [];
  let produced = 0;
  let stopProducing = false;

  const count = async (query: string): Promise<number> => {
    const res = await pool.query<{ n: string }>(query);
    return Number(res.rows[0]?.n ?? 0);
  };

  try {
    // ─── Seed one org with a completed-task factory ─────────────────────────
    const [org] = await db
      .insert(organizations)
      .values({ name: `soak-${randomUUID().slice(0, 8)}`, slug: `soak-${randomUUID().slice(0, 12)}` })
      .returning({ id: organizations.id });
    const orgId = org!.id;
    const [user] = await db
      .insert(users)
      .values({ email: `soak-${randomUUID().slice(0, 8)}@example.com`, name: "Soak", passwordHash: "x", status: "active" })
      .returning({ id: users.id });
    await db.insert(memberships).values({ orgId, userId: user!.id, role: "owner" });
    const [agent] = await db
      .insert(agents)
      .values({ orgId, name: "Soak Worker", role: "operations_manager" })
      .returning({ id: agents.id });

    /** Create `n` completed tasks and enqueue one `task.execute` job for each. */
    const produce = async (n: number): Promise<void> => {
      const rows = await db
        .insert(tasks)
        .values(
          Array.from({ length: n }, () => ({
            orgId,
            agentId: agent!.id,
            title: `soak task ${randomUUID().slice(0, 8)}`,
            description: "completed before enqueue so the worker preflight skips it",
            status: "completed",
          })),
        )
        .returning({ id: tasks.id });
      for (const t of rows) {
        await enqueueJob(db, { orgId, type: "task.execute", taskId: t.id, payload: { taskId: t.id } });
        produced += 1;
      }
    };

    // ─── A deliberately leaked lock: running, locked 10 minutes ago ─────────
    await produce(1);
    await pool.query(
      `update agent_jobs set status = 'running', locked_at = now() - interval '10 minutes', locked_by = 'ghost-worker'
        where id = (select id from agent_jobs order by created_at limit 1)`,
    );

    // ─── A few permanently-dead jobs (missing task) ────────────────────────
    for (let i = 0; i < DEAD_JOBS; i += 1) {
      const bogus = randomUUID();
      await enqueueJob(db, { orgId, type: "task.execute", taskId: bogus, payload: { taskId: bogus } });
      produced += 1;
    }

    // ─── Initial backlog, then workers ─────────────────────────────────────
    await produce(300);
    const start = Date.now();
    for (let i = 0; i < WORKERS; i += 1) {
      const workerConfig = loadConfig({ ...baseEnv, WORKER_ID: `soak-worker-${i}` } as NodeJS.ProcessEnv);
      workers.push(startJobWorker(workerConfig, db, logger));
    }
    console.log(`[soak] ${WORKERS} workers up; running for ${DURATION_SECONDS}s (produced ${produced} so far)`);

    // Producer: keep the queue deep for the whole duration so claims overlap.
    const producer = (async () => {
      while (!stopProducing) {
        const health = await jobsHealth(db);
        if (health.pending < LOW_WATER) await produce(WAVE_SIZE);
        await sleep(100);
      }
    })();

    await sleep(DURATION_SECONDS * 1000);
    stopProducing = true;
    await producer;
    const elapsed = Math.round((Date.now() - start) / 1000);

    // ─── Stop workers, then drain ──────────────────────────────────────────
    // Drain while the workers still run, THEN stop them: stopping first would
    // leave whatever was queued at the cut-off unclaimed and fail the drain
    // check for the wrong reason.
    const drainDeadline = Date.now() + 60_000;
    let health = await jobsHealth(db);
    while ((health.pending > 0 || health.running > 0) && Date.now() < drainDeadline) {
      await sleep(250);
      health = await jobsHealth(db);
    }
    await Promise.all(workers.map((w) => w.stop()));
    health = await jobsHealth(db);

    // ─── Assertions ────────────────────────────────────────────────────────
    const leakedLocks = await count(
      `select count(*)::text as n from agent_jobs where locked_at is not null and status <> 'running'`,
    );
    const multiClaims = await count(`select count(*)::text as n from agent_jobs where attempts > 1`);
    const runningNoLock = await count(
      `select count(*)::text as n from agent_jobs where status = 'running' and locked_at is null`,
    );
    const claimed = workers.reduce((acc, w) => acc + w.stats.claimed, 0);
    const failedRetries = health.failed;
    const done = health.counts.done ?? 0;

    const checks: Check[] = [
      { name: "queue drained", ok: health.pending === 0 && health.running === 0, detail: `pending=${health.pending} running=${health.running}` },
      { name: "no leaked locks", ok: leakedLocks === 0, detail: `${leakedLocks} rows hold a lock outside running` },
      { name: "no double-claims", ok: multiClaims === 0, detail: `${multiClaims} rows have attempts > 1` },
      { name: "every running row has a lock", ok: runningNoLock === 0, detail: `${runningNoLock} running rows with null lock` },
      { name: "no failed jobs", ok: failedRetries === 0, detail: `${failedRetries} failed` },
      { name: "only intended dead-letter", ok: health.dead === DEAD_JOBS, detail: `dead=${health.dead} expected=${DEAD_JOBS}` },
      { name: "every produced job reached a terminal state", ok: done + health.dead === produced, detail: `done+dead=${done + health.dead} produced=${produced}` },
      { name: "claims match produced jobs", ok: claimed === produced, detail: `claimed=${claimed} produced=${produced}` },
    ];

    // ─── Report ────────────────────────────────────────────────────────────
    console.log("");
    console.log(`[soak] ran ${elapsed}s, produced ${produced} jobs, ${WORKERS} workers`);
    console.log(`[soak] done=${done} dead=${health.dead} pending=${health.pending} running=${health.running}`);
    for (const c of checks) {
      console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name} — ${c.detail}`);
    }
    const failed = checks.filter((c) => !c.ok);
    console.log("");
    if (failed.length > 0) {
      console.log(`[soak] RESULT: FAIL (${failed.length} check${failed.length === 1 ? "" : "s"})`);
      return 1;
    }
    console.log("[soak] RESULT: PASS");
    return 0;
  } finally {
    await Promise.all(workers.map((w) => w.stop().catch(() => undefined)));
    await pool.end().catch(() => undefined);
    if (KEEP_DB) {
      console.log(`[soak] --keep-db: data dir left at ${pg.dataDir}`);
    } else {
      await pg.stop();
    }
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[soak] crashed:", err);
    process.exit(1);
  });
