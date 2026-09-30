import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  activityEvents as activityEventsTable,
  agents as agentsTable,
  approvals as approvalsTable,
  repositoryPrs as repositoryPrsTable,
  tasks as tasksTable,
  type Approval,
  type Db,
} from '@orq8/db';
import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { broadcastToOrg } from '../services/realtime.js';
import * as approvals from '../services/approvals.js';
import { createNotification } from '../routes/notifications.js';
import { notifyAttentionChanged } from '../services/attention.js';
import type { AppDeps } from '../types.js';

const decideBody = z.object({
  status: z.enum(['approved', 'rejected', 'modified']),
  note: z.string().trim().max(500).optional(),
});

const createApprovalBody = z.object({
  action: z.string().trim().min(1).max(500),
  description: z.string().trim().max(2000).optional(),
  cost: z.number().int().min(0).default(0),
  risk_level: z.enum(['low', 'medium', 'high']).default('low'),
  agent_id: z.string().uuid().optional(),
});

/** An approval with the work it gates resolved to something a human reads. */
type NamedApproval = Approval & {
  /** The requesting agent's name, so a card never shows a bare uuid. */
  agentName: string | null;
  gatedWork: {
    taskId: string | null;
    taskTitle: string | null;
    taskStatus: string | null;
    toolId: string | null;
    toolParams: unknown;
  } | null;
};

/**
 * Name the work each approval gates (docs/66.14 Gap A, migration 0036).
 *
 * The decision now resumes or stops a task, but a card that shows only the
 * `action` sentence still leaves the founder guessing what moves when they press
 * approve. This resolves the gated task's title and status — and the tool, when
 * the gate came from a tool call — for the whole page in two queries rather than
 * one per row. It resolves the agent's *name* for the same reason: the page used
 * to print `Agent #1f80cc03`, an identifier the founder has never seen, on the
 * one screen whose entire job is to say who is asking to do what.
 */
async function withGatedWork(
  db: Db,
  orgId: string,
  rows: Approval[],
): Promise<NamedApproval[]> {
  const taskIds = [
    ...new Set(rows.map((row) => row.taskId).filter((id): id is string => Boolean(id))),
  ];
  const gated = new Map<string, { title: string; status: string }>();

  if (taskIds.length > 0) {
    const found = await db
      .select({ id: tasksTable.id, title: tasksTable.title, status: tasksTable.status })
      .from(tasksTable)
      .where(and(eq(tasksTable.orgId, orgId), inArray(tasksTable.id, taskIds)));
    for (const task of found) gated.set(task.id, { title: task.title, status: task.status });
  }

  const agentIds = [...new Set(rows.map((row) => row.agentId).filter((id): id is string => Boolean(id)))];
  const agents = new Map<string, string>();
  if (agentIds.length > 0) {
    const found = await db
      .select({ id: agentsTable.id, name: agentsTable.name })
      .from(agentsTable)
      .where(and(eq(agentsTable.orgId, orgId), inArray(agentsTable.id, agentIds)));
    for (const agent of found) agents.set(agent.id, agent.name);
  }

  return rows.map((row) => {
    const task = row.taskId ? gated.get(row.taskId) : undefined;
    const toolId = row.toolId ?? null;

    return {
      ...row,
      agentName: row.agentId ? (agents.get(row.agentId) ?? null) : null,
      gatedWork:
        row.taskId || toolId
          ? {
              taskId: row.taskId ?? null,
              taskTitle: task?.title ?? null,
              taskStatus: task?.status ?? null,
              toolId,
              toolParams: row.toolParams ?? null,
            }
          : null,
    };
  });
}

export function registerApprovalRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Create a new approval request (from command bar or agents). */
  app.post('/v1/approvals', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = createApprovalBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const approval = await approvals.createApproval(db, {
      orgId: ctx.orgId,
      agentId: parsed.data.agent_id ?? null,
      action: parsed.data.action,
      description: parsed.data.description ?? null,
      cost: parsed.data.cost,
      riskLevel: parsed.data.risk_level,
      status: 'pending',
    });

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'agent',
      actorId: parsed.data.agent_id ?? ctx.userId,
      action: 'approval.created',
      outcome: 'success',
    });

    // Create in-app notification for the new approval request
    try {
      const { shouldNotify, getNotificationPrefs } = await import('../services/notification-preferences.js');
      const prefs = await getNotificationPrefs(db, ctx.orgId);
      if (shouldNotify(prefs, 'inApp', 'approval')) {
        createNotification(
          db,
          ctx.orgId,
          'approval',
          'Approval Required',
          `An AI employee requests your decision: ${parsed.data.action.slice(0, 120)}`,
        );
      }
    } catch { /* notification failure is non-fatal */ }

    // The founder's attention queue gained an item.
    notifyAttentionChanged(ctx.orgId, 'approval.created');

    reply.code(201);
    return { data: approval };
  });

  /** List approvals for the current org, optionally filtered by status. */
  app.get('/v1/approvals', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const status = url.searchParams.get('status') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);
    const conditions = [eq(approvalsTable.orgId, ctx.orgId)];
    if (status) conditions.push(eq(approvalsTable.status, status));
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalsTable)
      .where(and(...conditions));
    const list = await approvals.findByOrg(db, ctx.orgId, { status, limit, offset });
    return {
      data: await withGatedWork(db, ctx.orgId, list),
      meta: { limit, offset, total: totalRow?.count ?? 0 },
    };
  });

  /** Get a single approval. */
  app.get<{ Params: { id: string } }>('/v1/approvals/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const approval = await approvals.findById(db, ctx.orgId, request.params.id);
    if (!approval) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Approval not found' } };
    }
    const [named] = await withGatedWork(db, ctx.orgId, [approval]);
    return { data: named };
  });

  /** Decide on an approval (approve/reject/modify). */
  app.patch<{ Params: { id: string }; Body: { status: string; note?: string } }>(
    '/v1/approvals/:id',
    async (request, reply) => {
      const ctx = await requireAuth(request, deps);
      const parsed = decideBody.safeParse(request.body);
      if (!parsed.success) throw validation(parsed.error.flatten());

      const existing = await approvals.findById(db, ctx.orgId, request.params.id);
      if (!existing) {
        reply.code(404);
        return { error: { code: 'not_found', message: 'Approval not found' } };
      }

      // Stopping a piece of work without saying why is the thing that makes an
      // autonomous organization feel arbitrary. If this decision is the one
      // holding a task, the founder has to give a reason — the agent reads it
      // and so does the next person who asks what happened here.
      if (parsed.data.status === 'rejected' && existing.taskId && !parsed.data.note) {
        reply.code(400);
        return {
          error: {
            code: 'reason_required',
            message: 'Give a reason for stopping this work: the AI employee is told why, and the task record keeps it.',
          },
        };
      }

      const decided = await approvals.decide(
        db,
        ctx.orgId,
        request.params.id,
        parsed.data.status,
        parsed.data.note,
      );

      if (!decided) {
        reply.code(404);
        return { error: { code: 'not_found', message: 'Approval not found or already decided' } };
      }

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: `approval.${parsed.data.status}`,
        outcome: 'success',
      });

      // ── Release the work this decision gates (Gap A, docs/66 §66.14) ──
      //
      // Before this, a decision was recorded and went nowhere: the founder
      // approved a request and the task it was about stayed exactly where it
      // was. Every resolved gate now leaves the task in a settled state — it
      // either runs, or it is cancelled with the reason attached. `modified`
      // releases the work like `approved` does, so no gate can strand a task in
      // `awaiting_approval` after its only decision has been spent.
      let resumed: { taskId: string; status: string } | null = null;
      if (decided.taskId) {
        if (parsed.data.status === 'rejected') {
          const reason = `Rejected by founder: ${parsed.data.note}`;
          await db
            .update(tasksTable)
            .set({ status: 'cancelled', result: reason.slice(0, 2000), updatedAt: new Date() })
            .where(and(eq(tasksTable.id, decided.taskId), eq(tasksTable.orgId, ctx.orgId)));
          await db.insert(activityEventsTable).values({
            orgId: ctx.orgId,
            agentId: decided.agentId,
            taskId: decided.taskId,
            type: 'rejected',
            summary: reason.slice(0, 500),
            reason: parsed.data.note ?? null,
            cost: 0,
            department: null,
          });
          broadcastToOrg(ctx.orgId, { type: 'task.cancelled', taskId: decided.taskId, reason });
          notifyAttentionChanged(ctx.orgId, 'task.cancelled');

          // The mirror of `approval.resumed_work`. A decision that stops work is
          // as consequential as one that releases it, and the audit row has to
          // name the work it stopped — otherwise the trail says a question was
          // answered and never says what that answer did.
          await appendAudit(db, {
            orgId: ctx.orgId,
            actorType: 'user',
            actorId: ctx.userId,
            action: 'approval.stopped_work',
            outcome: 'success',
            // Structured references, not only a string: the audit row can be
            // queried by approval or by task, so "what did this decision stop?"
            // is answerable without parsing prose.
            approvalId: decided.id,
            taskId: decided.taskId,
            resultRef: `approval:${decided.id} → task:${decided.taskId} (cancelled)`,
          });
        } else {
          // Resume the stopped task. The executor consumes this same approval as
          // it proceeds (single-use), so an autonomy gate cannot re-block it.
          try {
            const { executeTask } = await import('../services/task-executor.js');
            const outcome = await executeTask(deps.config, db, ctx.orgId, decided.taskId);
            resumed = { taskId: decided.taskId, status: outcome.status };
            await appendAudit(db, {
              orgId: ctx.orgId,
              actorType: 'user',
              actorId: ctx.userId,
              action: 'approval.resumed_work',
              outcome: 'success',
              approvalId: decided.id,
              taskId: decided.taskId,
              resultRef: `approval:${decided.id} → task:${decided.taskId} (${outcome.status})`,
            });
          } catch (error) {
            // The decision is already persisted and the task stays awaiting —
            // the founder can retry the work without re-deciding the question.
            request.log.error({ err: error }, 'resuming approved work failed');
          }
        }
      }

      // Engineering merge approvals: an approved decision advances the linked PR
      // to 'approved' (the merge itself stays gated on this approval record and
      // is performed by a separate, audited PATCH). Sync is best-effort.
      if (parsed.data.status === 'approved' && decided.action.startsWith('Merge PR:')) {
        try {
          const { updatePrStatus } = await import('../services/engineering.js');
          const [prRow] = await db
            .select({ id: repositoryPrsTable.id })
            .from(repositoryPrsTable)
            .where(eq(repositoryPrsTable.approvalId, decided.id))
            .limit(1);
          if (prRow) {
            await updatePrStatus(db, prRow.id, 'approved', decided.id, ctx.userId);
            await appendAudit(db, {
              orgId: ctx.orgId,
              actorType: 'user',
              actorId: ctx.userId,
              action: 'pr.approved_via_approval',
              outcome: 'success',
              resultRef: `${prRow.id} → approval:${decided.id}`,
            });
          }
        } catch {
          // Non-fatal — the approval decision itself is already persisted.
        }
      }

      // Broadcast approval decision
      broadcastToOrg(ctx.orgId, { type: 'approval.decided', approvalId: request.params.id, status: parsed.data.status });
      notifyAttentionChanged(ctx.orgId, 'approval.decided');

      // Create in-app notification for the decision
      try {
        const { shouldNotify, getNotificationPrefs } = await import('../services/notification-preferences.js');
        const prefs = await getNotificationPrefs(db, ctx.orgId);
        if (shouldNotify(prefs, 'inApp', 'approval')) {
          const statusLabel = parsed.data.status === 'approved' ? 'Approved' : parsed.data.status === 'rejected' ? 'Rejected' : 'Modified';
          createNotification(
            db,
            ctx.orgId,
            'approval',
            `Approval ${statusLabel}`,
            `Your decision on the approval request has been recorded.${parsed.data.note ? ` Note: ${parsed.data.note.slice(0, 100)}` : ''}`,
          );
        }
      } catch { /* notification failure is non-fatal */ }

      return { data: decided, resumed };
    },
  );
}
