// agent_jobs — the durable queue service (docs/75, backend phase, first slice).
//
// A queue is the seam along which the monolith becomes microservices: today a
// request handler runs agent work inline; with JOB_QUEUE_MODE=workers the
// handler only ENQUEUES and a background worker drains the table. The claim
// uses FOR UPDATE SKIP LOCKED, so N workers (in one process or across
// containers) can drain one table without double-executing. Retries use
// exponential backoff; locks left by crashed workers are reaped by their
// own liveness timestamp.
//
// The service stays storage-honest: plain parameterized SQL through the pool,
// no ORM magic on the hot path, every claim/complete/fail is one statement.

import { and, desc, eq, sql } from 'drizzle-orm';
import { agentJobs, agents, tasks, type Db } from '@orq8/db';

export type AgentJobType = 'task.execute' | 'command.run';
export type AgentJobStatus = 'pending' | 'running' | 'done' | 'failed' | 'dead';

export interface EnqueueJobInput {
  orgId: string;
  type: AgentJobType;
  payload: Record<string, unknown>;
  taskId?: string | null;
  priority?: number;
  runAt?: Date;
}

/**
 * Enqueue one job. Idempotent per (type, task): if an executable job for the
 * same task already waits, return it instead of stacking duplicates — a founder
 * double-clicking Retry, or the batch runner and a user racing, must not run
 * the same task twice.
 */
export async function enqueueJob(
  db: Db,
  input: EnqueueJobInput,
): Promise<{ id: string; reused: boolean }> {
  if (input.taskId) {
    const [existing] = await db
      .select({ id: agentJobs.id })
      .from(agentJobs)
      .where(
        and(
          eq(agentJobs.orgId, input.orgId),
          eq(agentJobs.type, input.type),
          eq(agentJobs.taskId, input.taskId),
          sql`${agentJobs.status} in ('pending', 'running')`,
        ),
      )
      .limit(1);
    if (existing) return { id: existing.id, reused: true };
  }
  try {
    const [row] = await db
      .insert(agentJobs)
      .values({
        orgId: input.orgId,
        type: input.type,
        payload: input.payload,
        taskId: input.taskId ?? null,
        priority: input.priority ?? 0,
        runAt: input.runAt ?? new Date(),
      })
      .returning({ id: agentJobs.id });
    if (!row) throw new Error('enqueueJob: insert returned no row');
    return { id: row.id, reused: false };
  } catch (err) {
    // The check-then-insert above races: two concurrent executes can both see
    // no open job and both insert. `agent_jobs_open_task_uniq` (migration 0046)
    // owns the invariant — on conflict, the winner already exists, so report it
    // as reused instead of surfacing a 500 for a double-click.
    if ((err as { code?: string }).code === '23505' && input.taskId) {
      const [existing] = await db
        .select({ id: agentJobs.id })
        .from(agentJobs)
        .where(
          and(
            eq(agentJobs.orgId, input.orgId),
            eq(agentJobs.type, input.type),
            eq(agentJobs.taskId, input.taskId),
            sql`${agentJobs.status} in ('pending', 'running')`,
          ),
        )
        .limit(1);
      if (existing) return { id: existing.id, reused: true };
    }
    throw err;
  }
}

/**
 * How many jobs one agent has generated in the last hour (docs/80 §3.3,
 * per-agent layer). Counted from the durable queue rather than a volatile
 * counter: a restart or a Redis flush must not forget a loop already running.
 */
export async function countAgentJobsLastHour(
  db: Db,
  orgId: string,
  agentId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(agentJobs)
    .innerJoin(tasks, eq(tasks.id, agentJobs.taskId))
    .where(
      and(
        eq(agentJobs.orgId, orgId),
        eq(tasks.agentId, agentId),
        sql`${agentJobs.createdAt} > now() - interval '1 hour'`,
      ),
    );
  return row?.n ?? 0;
}

/** Must match the worker's stale-lock reaper window (job-worker.ts). */
const RUNNING_LOCK_WINDOW_SECONDS = 300;

/**
 * Claim the next eligible job (SKIP LOCKED → safe with any number of workers).
 *
 * `maxConcurrentPerOrg` bounds how many jobs ONE org may have running at once
 * (docs/80 §3.3, job-level layer): a runaway org cannot occupy every worker,
 * so other companies keep draining. 0 disables the cap.
 */
export async function claimJob(
  db: Db,
  workerId: string,
  opts: { maxConcurrentPerOrg?: number } = {},
): Promise<{
  id: string;
  orgId: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  taskId: string | null;
  createdAt: Date;
} | null> {
  const maxPerOrg = opts.maxConcurrentPerOrg ?? 0;
  const result = await db.execute(sql`
    update agent_jobs set
      status = 'running',
      locked_at = now(),
      locked_by = ${workerId},
      attempts = attempts + 1,
      updated_at = now()
    where id = (
      select id from agent_jobs
      where status = 'pending' and run_at <= now()
        and (
          ${maxPerOrg} = 0
          or (
            select count(*) from agent_jobs job_running
            where job_running.org_id = agent_jobs.org_id
              and job_running.status = 'running'
              and job_running.locked_at > now() - (${RUNNING_LOCK_WINDOW_SECONDS} || ' seconds')::interval
          ) < ${maxPerOrg}
        )
      order by priority desc, run_at asc
      for update skip locked
      limit 1
    )
    returning id, org_id as "orgId", type, payload, attempts, max_attempts as "maxAttempts", task_id as "taskId", created_at as "createdAt"
  `);
  // drizzle's node-postgres execute returns a pg QueryResult; handle both
  // the .rows shape and the bare-array shape defensively.
  const jobs = (result as unknown as { rows?: unknown[] }).rows ?? (result as unknown as unknown[]);
  const job = (jobs as Array<Record<string, unknown>>)[0];
  if (!job) return null;
  return {
    id: String(job.id),
    orgId: String(job.orgId),
    type: String(job.type),
    payload: job.payload,
    attempts: Number(job.attempts),
    maxAttempts: Number(job.maxAttempts),
    taskId: (job.taskId as string | null) ?? null,
    createdAt: (job.createdAt as Date) ?? new Date(),
  };
}

/**
 * Complete a job that did not need to run, recording why in `last_error`.
 *
 * A skipped job is not a failure — the work was already done, or another job
 * owns it — but "done, and did nothing" is exactly the kind of row an operator
 * asks about, so the reason is stored rather than only logged.
 */
export async function skipJob(db: Db, jobId: string, reason: string): Promise<void> {
  await db.execute(sql`
    update agent_jobs set
      status = 'done',
      last_error = ${`skipped: ${reason}`.slice(0, 1000)},
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where id = ${jobId}
  `);
}

/**
 * Move a job straight to the dead-letter state, skipping the retry ladder.
 *
 * Used for failures that cannot be fixed by trying again — a job type with no
 * dispatcher, or a malformed payload. Retrying those three times only delays
 * the operator's ability to see them, so they land where triage happens.
 */
export async function deadLetterJob(db: Db, jobId: string, reason: unknown): Promise<void> {
  const message = String((reason as Error)?.message ?? reason).slice(0, 1000);
  await db.execute(sql`
    update agent_jobs set
      status = 'dead',
      last_error = ${message},
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where id = ${jobId}
  `);
}

export async function completeJob(db: Db, jobId: string): Promise<void> {
  await db.execute(sql`
    update agent_jobs set status = 'done', locked_at = null, locked_by = null, updated_at = now()
    where id = ${jobId}
  `);
}

/** Backoff doubles per attempt (5s, 10s, 20s …); dead after max_attempts. */
export async function failJob(db: Db, jobId: string, attempts: number, maxAttempts: number, error: unknown): Promise<'retry' | 'dead'> {
  const message = String((error as Error)?.message ?? error).slice(0, 1000);
  if (attempts >= maxAttempts) {
    await db.execute(sql`
      update agent_jobs set status = 'dead', last_error = ${message}, locked_at = null, locked_by = null, updated_at = now()
      where id = ${jobId}
    `);
    return 'dead';
  }
  const backoffMs = 5_000 * 2 ** Math.max(0, attempts - 1);
  await db.execute(sql`
    update agent_jobs set
      status = 'pending',
      run_at = now() + (${backoffMs} || ' milliseconds')::interval,
      last_error = ${message},
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where id = ${jobId}
  `);
  return 'retry';
}

/**
 * Reap jobs whose worker died mid-run: anything 'running' with a lock older
 * than the stale window goes back to pending so its work still happens. The
 * worker calls this each tick; the window must exceed the longest honest run.
 */
export async function reapStaleJobs(db: Db, staleSeconds: number): Promise<number> {
  const result = await db.execute(sql`
    update agent_jobs set status = 'pending', locked_at = null, locked_by = null, updated_at = now()
    where status = 'running' and locked_at < now() - (${staleSeconds} || ' seconds')::interval
  `);
  const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  return rowCount;
}

// ─── Ops surface (docs/75 §3, docs/78 Phase E) ──────────────────────────────
//
// The Commands tab reads the queue itself, so these reads answer the questions
// an operator actually has: how deep is the queue, is a worker alive, what is
// stuck, and what failed permanently. Every number here is a row count or an
// aggregate over agent_jobs — nothing is estimated or synthesized.

const JOB_COLUMNS = {
  id: agentJobs.id,
  orgId: agentJobs.orgId,
  type: agentJobs.type,
  status: agentJobs.status,
  priority: agentJobs.priority,
  attempts: agentJobs.attempts,
  maxAttempts: agentJobs.maxAttempts,
  runAt: agentJobs.runAt,
  createdAt: agentJobs.createdAt,
  // locked_at is the start while the job runs and is cleared on completion, so
  // the terminal timestamp is the last write (complete or fail).
  startedAt: agentJobs.lockedAt,
  updatedAt: agentJobs.updatedAt,
  lockedBy: agentJobs.lockedBy,
  lastError: agentJobs.lastError,
  taskId: agentJobs.taskId,
  taskTitle: tasks.title,
  taskStatus: tasks.status,
  agentId: tasks.agentId,
  agentName: agents.name,
} as const;

/** Rows with the task and employee they belong to, so the table is readable. */
export async function recentJobsDetailed(
  db: Db,
  opts: { status?: string; type?: string; limit?: number } = {},
) {
  const conditions = [];
  if (opts.status) conditions.push(eq(agentJobs.status, opts.status));
  if (opts.type) conditions.push(eq(agentJobs.type, opts.type));
  return db
    .select(JOB_COLUMNS)
    .from(agentJobs)
    .leftJoin(tasks, eq(tasks.id, agentJobs.taskId))
    .leftJoin(agents, eq(agents.id, tasks.agentId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(agentJobs.createdAt))
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
}

/** Jobs that will never run again on their own: dead-letter (and terminal failures). */
export async function deadLetterJobs(db: Db, limit = 50) {
  return db
    .select(JOB_COLUMNS)
    .from(agentJobs)
    .leftJoin(tasks, eq(tasks.id, agentJobs.taskId))
    .leftJoin(agents, eq(agents.id, tasks.agentId))
    .where(sql`${agentJobs.status} in ('dead', 'failed')`)
    .orderBy(desc(agentJobs.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

/**
 * Queue health: counts by status and type, eligible depth, the oldest waiting
 * job, and whether a worker is actually alive (a running row with a fresh
 * lock). Liveness is derived from claims, so it needs no heartbeat table and
 * it cannot claim a worker is up when nothing is claimed.
 */
export async function jobsHealth(db: Db) {
  const statusRows = await db
    .select({ status: agentJobs.status, n: sql<string>`count(*)::text` })
    .from(agentJobs)
    .groupBy(agentJobs.status);
  const typeRows = await db
    .select({ type: agentJobs.type, status: agentJobs.status, n: sql<string>`count(*)::text` })
    .from(agentJobs)
    .groupBy(agentJobs.type, agentJobs.status);
  const [agg] = await db
    .select({
      pending: sql<string>`count(*) filter (where ${agentJobs.status} = 'pending')::text`,
      eligible: sql<string>`count(*) filter (where ${agentJobs.status} = 'pending' and ${agentJobs.runAt} <= now())::text`,
      running: sql<string>`count(*) filter (where ${agentJobs.status} = 'running')::text`,
      staleRunning: sql<string>`count(*) filter (where ${agentJobs.status} = 'running' and ${agentJobs.lockedAt} < now() - interval '5 minutes')::text`,
      activeWorkers: sql<string>`count(distinct ${agentJobs.lockedBy}) filter (where ${agentJobs.status} = 'running' and ${agentJobs.lockedAt} > now() - interval '10 minutes')::text`,
      // Normalized to ISO so every consumer (the Commands tab, the release
      // gate, the soak harness) parses one format. The pool hands back either
      // a Date or pg's text rendering depending on the path, and a client that
      // has to guess the format eventually guesses wrong.
      //
      // TZH:TZM, not OF: OF renders a bare "+01", and `new Date("…+01")` is an
      // Invalid Date in every browser — the timestamps arrived, then rendered
      // as "—" because the client could not parse them.
      oldestPendingAt: sql<string | null>`to_char(min(${agentJobs.runAt}) filter (where ${agentJobs.status} = 'pending'), 'YYYY-MM-DD"T"HH24:MI:SS.MSTZH:TZM')`,
      lastCompletedAt: sql<string | null>`to_char(max(${agentJobs.updatedAt}) filter (where ${agentJobs.status} = 'done'), 'YYYY-MM-DD"T"HH24:MI:SS.MSTZH:TZM')`,
      lastFailureAt: sql<string | null>`to_char(max(${agentJobs.updatedAt}) filter (where ${agentJobs.status} in ('dead', 'failed')), 'YYYY-MM-DD"T"HH24:MI:SS.MSTZH:TZM')`,
    })
    .from(agentJobs);

  const counts = Object.fromEntries(statusRows.map((c) => [c.status, Number(c.n)]));
  const byType: Record<string, Record<string, number>> = {};
  for (const row of typeRows) {
    byType[row.type] = { ...(byType[row.type] ?? {}), [row.status]: Number(row.n) };
  }
  return {
    counts,
    byType,
    pending: Number(agg?.pending ?? 0),
    eligible: Number(agg?.eligible ?? 0),
    running: Number(agg?.running ?? 0),
    staleRunning: Number(agg?.staleRunning ?? 0),
    activeWorkers: Number(agg?.activeWorkers ?? 0),
    oldestPendingAt: agg?.oldestPendingAt ?? null,
    lastCompletedAt: agg?.lastCompletedAt ?? null,
    lastFailureAt: agg?.lastFailureAt ?? null,
    dead: counts.dead ?? 0,
    failed: counts.failed ?? 0,
  };
}

/** Ops view for /v1/admin/jobs — health plus the recent rows. */
export async function jobsOverview(db: Db, limit = 20) {
  const health = await jobsHealth(db);
  const recent = await recentJobsDetailed(db, { limit });
  return { counts: health.counts, health, recent };
}

export type RetryJobResult =
  | {
      ok: true;
      job: {
        id: string;
        orgId: string;
        type: string;
        status: string;
        attempts: number;
        maxAttempts: number;
        taskId: string | null;
        updatedAt: Date;
      };
      previous: { status: string; attempts: number; lastError: string | null };
    }
  | { ok: false; status: number; reason: string };

/**
 * Put a permanently failed job back in the queue.
 *
 * Retryability is decided by the job's real state, never by the button: only a
 * `dead` (or terminally `failed`) job may be requeued. A `running` job belongs
 * to a live worker — requeueing it would execute the task twice — and a
 * `pending` or `done` job is already where the operator wants it.
 *
 * The requeue itself is one conditional UPDATE, so two admins clicking Retry
 * at the same moment cannot both win: the second sees 0 rows and is told the
 * job changed. `attempts` resets for a fresh budget; `last_error` is kept as
 * the record of why it died the first time.
 */
export async function retryJob(db: Db, jobId: string): Promise<RetryJobResult> {
  const [current] = await db
    .select({
      id: agentJobs.id,
      status: agentJobs.status,
      attempts: agentJobs.attempts,
      lastError: agentJobs.lastError,
    })
    .from(agentJobs)
    .where(eq(agentJobs.id, jobId))
    .limit(1);

  if (!current) return { ok: false, status: 404, reason: 'No such job.' };
  if (current.status === 'running') {
    return {
      ok: false,
      status: 409,
      reason: 'This job is running on a worker right now. Wait for it to finish, then retry it if it fails.',
    };
  }
  if (current.status === 'pending') {
    return { ok: false, status: 409, reason: 'This job is already queued — it will run on its own.' };
  }
  if (current.status === 'done') {
    return {
      ok: false,
      status: 409,
      reason: 'This job already completed. Re-run the task instead of the job.',
    };
  }
  if (current.status !== 'dead' && current.status !== 'failed') {
    return { ok: false, status: 409, reason: `A ${current.status} job cannot be retried.` };
  }

  const [updated] = await db
    .update(agentJobs)
    .set({
      status: 'pending',
      runAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      attempts: 0,
      updatedAt: new Date(),
    })
    .where(and(eq(agentJobs.id, jobId), sql`${agentJobs.status} in ('dead', 'failed')`))
    .returning({
      id: agentJobs.id,
      orgId: agentJobs.orgId,
      type: agentJobs.type,
      status: agentJobs.status,
      attempts: agentJobs.attempts,
      maxAttempts: agentJobs.maxAttempts,
      taskId: agentJobs.taskId,
      updatedAt: agentJobs.updatedAt,
    });

  if (!updated) {
    return {
      ok: false,
      status: 409,
      reason: 'The job changed state before the retry landed. Reload and try again.',
    };
  }
  return {
    ok: true,
    job: updated,
    previous: {
      status: current.status,
      attempts: current.attempts,
      lastError: current.lastError,
    },
  };
}
