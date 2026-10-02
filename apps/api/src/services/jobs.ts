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
import { agentJobs, type Db } from '@orq8/db';

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
}

/** Claim the next eligible job (SKIP LOCKED → safe with any number of workers). */
export async function claimJob(
  db: Db,
  workerId: string,
): Promise<{ id: string; orgId: string; type: string; payload: unknown; attempts: number; maxAttempts: number; taskId: string | null } | null> {
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
      order by priority desc, run_at asc
      for update skip locked
      limit 1
    )
    returning id, org_id as "orgId", type, payload, attempts, max_attempts as "maxAttempts", task_id as "taskId"
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
  };
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

/** Ops view for /v1/admin/jobs — counts by status plus the recent rows. */
export async function jobsOverview(db: Db, limit = 20) {
  const counts = await db
    .select({ status: agentJobs.status, n: sql<string>`count(*)::text` })
    .from(agentJobs)
    .groupBy(agentJobs.status);
  const recent = await db
    .select()
    .from(agentJobs)
    .orderBy(desc(agentJobs.createdAt))
    .limit(Math.min(limit, 100));
  return {
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
    recent,
  };
}
