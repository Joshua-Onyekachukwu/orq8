import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships, decisions, tasks, llmPerformance, agents } from '@orq8/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getCostOptimizationInsights, getModelStats, MIN_CALLS_FOR_RELIABILITY } from '../src/services/model-insights.js';
import {
  findDecisionsDueForReview,
  reviewDecisionOutcome,
  runOutcomeFeedbackLoop,
} from '../src/services/decision-feedback.js';
import { runSignalSync, signalSummary, MIN_CALLS_FOR_SIGNAL } from '../src/services/decision-signals.js';
import type { AppDeps } from '../src/types.js';

/**
 * §7/§20/§32 verification: model performance memory produces data-grounded
 * insights (never fabricated), and the decision outcome feedback loop files
 * measured outcomes into Decision Memory. All numbers in assertions come from
 * rows the test itself inserted — the same guarantee the product makes.
 */

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

let dbUp = false;
let pool: Pool | undefined;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
  dbUp = true;
} catch {
  dbUp = false;
}
const run = dbUp ? describe : describe.skip;

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

let orgId: string;
let userId: string;

async function seedCall(overrides: Partial<{ model: string; provider: string; phase: string; success: boolean; durationMs: number; totalTokens: number }>) {
  await deps.db.insert(llmPerformance).values({
    orgId,
    phase: overrides.phase ?? 'task_execution',
    model: overrides.model ?? 'test-model-a',
    provider: overrides.provider ?? 'test',
    success: overrides.success ?? true,
    durationMs: overrides.durationMs ?? 500,
    totalTokens: overrides.totalTokens ?? 1000,
  });
}

beforeAll(async () => {
  if (!dbUp) return;
  const [orgRow] = await deps.db
    .insert(organizations)
    .values({ name: `intel-${randomUUID()}`, slug: `intel-${randomUUID()}` })
    .returning();
  orgId = orgRow!.id;
  const [userRow] = await deps.db
    .insert(users)
    .values({ email: `intel-${randomUUID()}@example.com`, name: 'Owner', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userId = userRow!.id;
  await deps.db.insert(memberships).values({ orgId, userId, role: 'owner' });
});

afterAll(async () => {
  if (dbUp) {
    await deps.pool!.query('delete from llm_performance where org_id = $1', [orgId]);
    await deps.pool!.query('delete from decisions where org_id = $1', [orgId]);
    await deps.pool!.query('delete from tasks where org_id = $1', [orgId]);
    await deps.pool!.query('delete from company_memory where org_id = $1', [orgId]);
    await deps.pool!.query('delete from notifications where org_id = $1', [orgId]);
    await deps.pool!.query('delete from audit_events where org_id = $1', [orgId]);
    await deps.pool!.query("delete from job_runs where job = 'decision_outcome_review' and started_at > now() - interval '1 hour'");
    await deps.pool!.query('delete from memberships where org_id = $1', [orgId]);
    await deps.pool!.query('delete from agents where org_id = $1', [orgId]);
    await deps.pool!.query('delete from organizations where id = $1', [orgId]);
    await deps.db.delete(users).where(eq(users.id, userId));
  }
  await deps.pool.end();
  await pool?.end();
});

run('Model performance memory (§7) and cost insights (§32)', () => {
  it('reports insufficient data honestly below the threshold', async () => {
    const insights = await getCostOptimizationInsights(deps.db, orgId);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0]!.kind).toBe('insufficient_data');
  });

  it('aggregates real per-model stats from recorded calls', async () => {
    for (let i = 0; i < 15; i++) await seedCall({ model: 'cheap-model', totalTokens: 800 });
    for (let i = 0; i < 15; i++) await seedCall({ model: 'expensive-model', totalTokens: 3000 });

    const summary = await getModelStats(deps.db, orgId);
    expect(summary.totalCalls).toBe(30);
    const cheap = summary.models.find((m) => m.model === 'cheap-model');
    const expensive = summary.models.find((m) => m.model === 'expensive-model');
    expect(cheap?.calls).toBe(15);
    expect(expensive?.avgTotalTokens).toBe(3000);
    expect(cheap?.successRate).toBe(1);
  });

  it('flags equal-reliability + higher-cost models (redundant_reliability)', async () => {
    const insights = await getCostOptimizationInsights(deps.db, orgId);
    const redundant = insights.find((i) => i.kind === 'redundant_reliability');
    expect(redundant).toBeTruthy();
    // The expensive model must be the one flagged (higher avg tokens, equal success).
    expect(redundant!.evidence.model).toBe('expensive-model');
    expect(redundant!.evidence.referenceModel).toBe('cheap-model');
  });

  it('flags a genuinely failing model (high_failure_rate)', async () => {
    for (let i = 0; i < 12; i++) await seedCall({ model: 'flaky-model', success: false });
    const insights = await getCostOptimizationInsights(deps.db, orgId);
    const failing = insights.find((i) => i.kind === 'high_failure_rate');
    expect(failing).toBeTruthy();
    expect(failing!.evidence.model).toBe('flaky-model');
  });
});

run('Decision outcome feedback loop (§20)', () => {
  it('does not review decisions younger than the review window', async () => {
    const [recent] = await deps.db
      .insert(decisions)
      .values({
        orgId,
        title: 'Fresh decision',
        whatWasDecided: 'Do the new thing',
        status: 'active',
        decisionMakerType: 'user',
      })
      .returning();
    const due = await findDecisionsDueForReview(deps.db, 100);
    expect(due.find((d) => d.id === recent!.id)).toBeUndefined();
  });

  it('reviews a due decision with no execution data as insufficient (no fabrication)', async () => {
    // Created 20 days ago via direct SQL (createdAt is column-defaulted).
    const inserted = await deps.pool!.query(
      `insert into decisions (org_id, title, what_was_decided, status, decision_maker_type, created_at)
       values ($1, 'Old quiet decision', 'Do something', 'active', 'user', now() - interval '20 days')
       returning id`,
      [orgId],
    );
    const id = inserted.rows[0].id as string;

    const due = await findDecisionsDueForReview(deps.db, 100);
    const target = due.find((d) => d.id === id);
    expect(target).toBeTruthy();

    const review = await reviewDecisionOutcome(deps.db, orgId, target!);
    expect(review.predictionAccuracy).toBe('insufficient_data');
  });

  it('files measured outcomes, lessons, audit and company memory for a decision backed by completed work', async () => {
    const inserted = await deps.pool!.query(
      `insert into decisions (org_id, title, what_was_decided, status, decision_maker_type, created_at)
       values ($1, 'Launch decision', 'Ship the MVP', 'active', 'user', now() - interval '20 days')
       returning id`,
      [orgId],
    );
    const id = inserted.rows[0].id as string;

    // Measured support: two completed tasks since the decision.
    await deps.db.insert(tasks).values({
      orgId,
      title: 'Shipped work 1',
      status: 'completed',
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    await deps.db.insert(tasks).values({
      orgId,
      title: 'Shipped work 2',
      status: 'completed',
      createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
    });

    const result = await runOutcomeFeedbackLoop(deps.db);
    expect(result.filed).toBeGreaterThanOrEqual(1);

    const [row] = await deps.db.select().from(decisions).where(eq(decisions.id, id)).limit(1);
    expect(row!.outcomeFiledAt).not.toBeNull();
    expect(row!.actualOutcome).toContain('2 completed');
    expect(row!.lessonsLearned).toContain('supported the decision');

    // Audit + company-memory lesson recorded.
    const audit = await deps.pool!.query(
      "select count(*)::int as n from audit_events where org_id = $1 and action = 'decision.outcome_reviewed'",
      [orgId],
    );
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(1);
    const memory = await deps.pool!.query(
      "select count(*)::int as n from company_memory where org_id = $1 and source = 'decision_feedback_loop'",
      [orgId],
    );
    expect(memory.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it('never re-reviews a decision whose outcome was already filed', async () => {
    const before = await deps.pool!.query(
      "select count(*)::int as n from audit_events where org_id = $1 and action = 'decision.outcome_reviewed'",
      [orgId],
    );
    await runOutcomeFeedbackLoop(deps.db);
    const after = await deps.pool!.query(
      "select count(*)::int as n from audit_events where org_id = $1 and action = 'decision.outcome_reviewed'",
      [orgId],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('persists a structured prediction verdict when filing (§20 phase 2)', async () => {
    const filed = await deps.pool!.query(
      "select id, prediction_accuracy from decisions where org_id = $1 and outcome_filed_at is not null",
      [orgId],
    );
    expect(filed.rows.length).toBeGreaterThanOrEqual(1);
    const withSupport = filed.rows.find((r) => r.prediction_accuracy === 'accurate');
    expect(withSupport).toBeTruthy(); // completed tasks with no failures → accurate
  });

  it('derives model signals with an explicit insufficient-data verdict below the threshold', async () => {
    // Signals measure the window SINCE the last filed review — seed calls now
    // so they fall inside that window (earlier seeds predate the filing).
    for (let i = 0; i < 3; i++) await seedCall({ model: 'flaky-model', success: false });
    const signals = await signalSummary(deps.db, orgId);
    expect(signals.decisionsReviewed).toBeGreaterThanOrEqual(1);
    // The seeded calls are all successes; the flaky-model rows are failures.
    const flaky = signals.models.find((m) => m.model === 'flaky-model');
    expect(flaky).toBeTruthy();
    if (flaky!.calls < MIN_CALLS_FOR_SIGNAL) {
      expect(flaky!.reliability).toBe('insufficient_data');
    } else {
      expect(flaky!.reliability).toBe('degraded');
    }
  });

  it('derives agent signals against the org baseline and runs the cron sync cleanly', async () => {
    await deps.db.insert(agents).values({
      orgId,
      name: 'Signals Agent',
      role: 'qa_specialist',
      status: 'active',
    });
    const [agent] = await deps.db.select().from(agents).where(eq(agents.orgId, orgId)).limit(1);
    await deps.db.insert(tasks).values({
      orgId,
      title: 'Agent-executed completed task',
      status: 'completed',
      agentId: agent!.id,
    });

    const signals = await signalSummary(deps.db, orgId);
    const sig = signals.agents.find((a) => a.agentId === agent!.id);
    expect(sig).toBeTruthy();
    expect(sig!.tasksCompleted).toBeGreaterThanOrEqual(1);
    expect(sig!.verdict).toBe('insufficient_data'); // 1 task < MIN_TASKS_FOR_SIGNAL

    const sync = await runSignalSync(deps.db);
    expect(sync.orgsSynced).toBeGreaterThanOrEqual(1);
    expect(sync.agentSignals).toBeGreaterThanOrEqual(1);
  });
});
