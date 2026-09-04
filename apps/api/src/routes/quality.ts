/**
 * ORQ8 Quality System API Routes
 *
 * - GET  /v1/quality/qa/:taskId       — Get QA evaluation for a task
 * - POST /v1/quality/qa/:taskId       — Run QA on a completed task
 * - GET  /v1/quality/reliability       — Get reliability profiles for all agents
 * - GET  /v1/quality/reliability/:id   — Get reliability profile for one agent
 * - GET  /v1/quality/learning          — Get learning events for the org
 * - POST /v1/quality/learning/validate — Validate a learning event
 * - GET  /v1/quality/incidents         — Get incidents for the org
 * - GET  /v1/quality/review/:taskId    — Get review data for a task
 * - POST /v1/quality/review/:taskId    — Submit founder review (approve/reject)
 */

import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireAuth } from '../plugins/auth.js';
import { tasks, companyMemory, activityEvents, agents } from '@orq8/db';
import { evaluateWork, type QAEvaluation } from '../services/qa-evaluator.js';
import { calculateReliabilityProfile, getOrgReliabilityProfiles } from '../services/agent-reliability.js';
import { retrieveRelevantLessons } from '../services/learning-system.js';
import { appendAudit } from '../services/audit.js';
import { broadcastToOrg } from '../services/realtime.js';
import type { AppDeps } from '../types.js';

export function registerQualityRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config } = deps;

  /**
   * POST /v1/quality/qa/:taskId — Run QA evaluation on a completed task
   */
  app.post<{ Params: { taskId: string } }>('/v1/quality/qa/:taskId', async (request) => {
    const ctx = await requireAuth(request, deps);
    const { taskId } = request.params;

    // Load task
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.orgId, ctx.orgId)));

    if (!task) {
      throw validation({ formErrors: ['Task not found'] });
    }

    if (!task.result) {
      throw validation({ formErrors: ['Task has no result to evaluate'] });
    }

    // Run QA
    const evaluation = await evaluateWork(config, db, ctx.orgId, taskId, task.result);

    // Store evaluation in memory
    await db.insert(companyMemory).values({
      orgId: ctx.orgId,
      category: 'context',
      content: `QA Evaluation for "${task.title}": ${evaluation.verdict} (score: ${evaluation.score}). ${evaluation.warnings.join('; ')}`,
      source: 'qa-evaluator',
      agentId: task.agentId,
      taskId,
      importance: evaluation.verdict === 'fail' ? 8 : 5,
    });

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'system',
      action: 'task.qa_evaluated',
      tool: 'quality-pipeline',
      outcome: evaluation.verdict === 'pass' || evaluation.verdict === 'pass_with_warnings' ? 'success' : 'failure',
    });

    return { data: evaluation };
  });

  /**
   * GET /v1/quality/reliability — Get reliability profiles for all agents
   */
  app.get('/v1/quality/reliability', async (request) => {
    const ctx = await requireAuth(request, deps);
    const profiles = await getOrgReliabilityProfiles(db, ctx.orgId);
    return { data: profiles };
  });

  /**
   * GET /v1/quality/reliability/:agentId — Get reliability profile for one agent
   */
  app.get<{ Params: { agentId: string } }>('/v1/quality/reliability/:agentId', async (request) => {
    const ctx = await requireAuth(request, deps);
    const profile = await calculateReliabilityProfile(db, ctx.orgId, request.params.agentId);
    return { data: profile };
  });

  /**
   * GET /v1/quality/learning — Get learning events for the org
   */
  app.get('/v1/quality/learning', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const limit = Number(url.searchParams.get('limit')) || 20;

    const memories = await db
      .select()
      .from(companyMemory)
      .where(
        and(
          eq(companyMemory.orgId, ctx.orgId),
          sql`${companyMemory.category} IN ('workflow', 'lesson')`,
        )
      )
      .orderBy(desc(companyMemory.importance))
      .limit(limit);

    return { data: memories };
  });

  /**
   * GET /v1/quality/lessons — Retrieve relevant lessons for a task type
   */
  app.get('/v1/quality/lessons', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const taskTitle = url.searchParams.get('taskTitle') || '';
    const agentId = url.searchParams.get('agentId') || null;

    const lessons = await retrieveRelevantLessons(db, ctx.orgId, agentId, taskTitle, 10);
    return { data: lessons };
  });

  /**
   * GET /v1/quality/incidents — Get incidents for the org
   */
  app.get('/v1/quality/incidents', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const limit = Number(url.searchParams.get('limit')) || 20;

    const incidents = await db
      .select()
      .from(companyMemory)
      .where(
        and(
          eq(companyMemory.orgId, ctx.orgId),
          sql`content LIKE 'INCIDENT:%'`,
        )
      )
      .orderBy(desc(companyMemory.importance))
      .limit(limit);

    return { data: incidents };
  });

  /**
   * POST /v1/quality/review/:taskId — Founder review (approve/reject/revision)
   */
  app.post<{ Params: { taskId: string }; Body: { decision: string; feedback?: string } }>(
    '/v1/quality/review/:taskId',
    async (request) => {
      const ctx = await requireAuth(request, deps);
      const { taskId } = request.params;
      const { decision, feedback } = request.body;

      if (!['approve', 'reject', 'revision'].includes(decision)) {
        throw validation({ formErrors: ['Decision must be approve, reject, or revision'] });
      }

      const [task] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.orgId, ctx.orgId)));

      if (!task) {
        throw validation({ formErrors: ['Task not found'] });
      }

      // Store founder feedback as learning
      if (feedback) {
        await db.insert(companyMemory).values({
          orgId: ctx.orgId,
          category: 'preference',
          content: `FOUNDER FEEDBACK (${decision}): "${feedback}" for task "${task.title}"`,
          source: 'founder-review',
          agentId: task.agentId,
          taskId,
          importance: 9,
        });
      }

      // Record activity
      await db.insert(activityEvents).values({
        orgId: ctx.orgId,
        taskId,
        agentId: task.agentId,
        type: decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'revision',
        summary: `Founder ${decision}: ${feedback || 'No feedback provided'}`,
        cost: 0,
        department: null,
      });

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        action: `task.${decision}`,
        tool: 'quality-pipeline',
        outcome: 'success',
      });

      broadcastToOrg(ctx.orgId, {
        type: decision === 'approve' ? 'task.qa_passed' : 'task.qa_failed',
        taskId,
        summary: `Task ${decision}d by founder`,
      });

      return { data: { decision, taskId, feedback: feedback || null } };
    },
  );
}
