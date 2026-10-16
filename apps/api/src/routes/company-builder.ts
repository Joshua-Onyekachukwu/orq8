import { z } from 'zod';
import { forbidden, validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as builder from '../services/company-builder.js';
import * as onboarding from '../services/onboarding.js';
import * as orgs from '../services/orgs.js';
import * as playbooks from '../services/playbooks.js';
import { appendAudit } from '../services/audit.js';
import type { AppDeps } from '../types.js';

const analyzeBody = z.object({
  description: z.string().trim().min(10).max(4000),
  sourceType: z.enum(['idea', 'existing']).default('idea'),
});

const planBody = z.object({
  analysis: z.record(z.string(), z.unknown()),
});

const activateBody = z.object({
  plan: z.record(z.string(), z.unknown()),
  // The founder-reviewed company name from the analysis step. Applied to the
  // org record so the dashboard shows the corrected name, not the signup one.
  companyName: z.string().trim().min(1).max(120).optional(),
});

/**
 * Company Builder routes:
 *   POST /v1/company-builder/analyze   — understand the founder's idea/company
 *   POST /v1/company-builder/plan      — generate proposed org + operating plan
 *   POST /v1/company-builder/activate  — create departments, agents, goals, tasks
 *   GET  /v1/company-builder/state     — resume current discovery state
 */
export function registerCompanyBuilderRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config, logger } = deps;

  /** Analyze the founder's input into structured company understanding. */
  app.post('/v1/company-builder/analyze', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = analyzeBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    logger.info({ orgId: ctx.orgId, sourceType: parsed.data.sourceType }, 'Company Builder: analyzing company');

    try {
      const analysis = await builder.analyzeCompany(config, db, ctx.orgId, {
        description: parsed.data.description,
        sourceType: parsed.data.sourceType,
      });

      // Persist so the founder can resume later
      await onboarding.update(db, ctx.userId, {
        step: 'analysis',
        organization: {
          ...(await onboarding.getOrCreate(db, ctx.userId, ctx.orgId)).organization,
          analysis: analysis as unknown as Record<string, unknown>,
        },
      });

      reply.code(200);
      return { data: { analysis } };
    } catch (error) {
      logger.error({ err: error, orgId: ctx.orgId }, 'Company Builder: analysis failed');
      reply.code(500);
      return { error: { code: 'company_builder.analyze_failed', message: 'Failed to analyze your company. Please try again.' } };
    }
  });

  /** Generate the proposed organization + operating plan from an analysis. */
  app.post('/v1/company-builder/plan', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = planBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const analysis = parsed.data.analysis as unknown as builder.CompanyAnalysis;
    if (!analysis?.rawInput) {
      reply.code(400);
      return { error: { code: 'validation', message: 'A valid company analysis is required. Run analyze first.' } };
    }

    try {
      const plan = await builder.generatePlan(config, db, ctx.orgId, analysis);
      await onboarding.update(db, ctx.userId, {
        step: 'plan',
        organization: {
          ...(await onboarding.getOrCreate(db, ctx.userId, ctx.orgId)).organization,
          plan: plan as unknown as Record<string, unknown>,
        },
      });
      return { data: { plan } };
    } catch (error) {
      logger.error({ err: error, orgId: ctx.orgId }, 'Company Builder: plan generation failed');
      reply.code(500);
      return { error: { code: 'company_builder.plan_failed', message: 'Failed to generate your operating plan. Please try again.' } };
    }
  });

  /** Activate the approved plan — create everything through real services. */
  app.post('/v1/company-builder/activate', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    // Activation provisions departments and agents org-wide from a plan that
    // may carry elevated autonomy. Members may explore (analyze/plan); only
    // owners and admins may activate.
    if (ctx.role !== 'owner' && ctx.role !== 'admin') throw forbidden('Only owners and admins can activate a company plan.');
    const parsed = activateBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const plan = parsed.data.plan as unknown as builder.CompanyPlan;
    if (!plan?.agents?.length || !plan?.departments?.length) {
      reply.code(400);
      return { error: { code: 'validation', message: 'A valid operating plan is required. Run plan first.' } };
    }

    try {
      const result = await builder.activateCompany(db, ctx.orgId, ctx.userId, plan);

      // Apply the founder-reviewed company name (C-06). Best-effort: a rename
      // failure must never fail an activation that already succeeded.
      const companyName = parsed.data.companyName?.trim();
      if (companyName) {
        try {
          await orgs.updateOrg(db, ctx.orgId, { name: companyName });
          await appendAudit(db, {
            orgId: ctx.orgId,
            actorType: 'user',
            actorId: ctx.userId,
            action: 'org.renamed',
            outcome: 'success',
            inputRef: 'source=onboarding',
          });
        } catch (renameErr) {
          logger.warn({ err: renameErr, orgId: ctx.orgId }, 'Company Builder: org rename skipped, activation stands');
        }
      }

      // Mark onboarding complete
      await onboarding.update(db, ctx.userId, {
        step: 'complete',
        completedAt: new Date(),
        organization: {
          ...(await onboarding.getOrCreate(db, ctx.userId, ctx.orgId)).organization,
          activation: result as unknown as Record<string, unknown>,
        },
      });

      reply.code(201);
      return { data: { activation: result } };
    } catch (error) {
      logger.error({ err: error, orgId: ctx.orgId }, 'Company Builder: activation failed');
      reply.code(500);
      return { error: { code: 'company_builder.activate_failed', message: 'Failed to activate your company. Please try again.' } };
    }
  });

  /** Get the current discovery state (analysis + plan, if any). */
  app.get('/v1/company-builder/state', async (request) => {
    const ctx = await requireAuth(request, deps);
    const state = await onboarding.getOrCreate(db, ctx.userId, ctx.orgId);
    const organization = (state.organization ?? {}) as Record<string, unknown>;
    return {
      data: {
        step: state.step,
        completedAt: state.completedAt ?? null,
        analysis: organization.analysis ?? null,
        plan: organization.plan ?? null,
        activation: organization.activation ?? null,
      },
    };
  });

  /** List available industry playbooks (metadata only). */
  app.get('/v1/company-builder/playbooks', async (request) => {
    await requireAuth(request, deps);
    return { data: { playbooks: playbooks.listPlaybooks() } };
  });

  /**
   * Seed an industry playbook into the organization (idempotent).
   *
   * C-02: the seed is gated behind company facts — a playbook is a starting
   * template applied to YOUR company, not an instant generic company. The
   * company name is required (applied to the org record); the objective is
   * optional and is stored with the onboarding state for the EA to use.
   */
  app.post('/v1/company-builder/playbook', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = z.object({
      slug: z.string().trim().min(1).max(100),
      companyName: z.string().trim().min(1).max(120),
      objective: z.string().trim().min(1).max(500).optional(),
    }).safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    try {
      // Plan-aware: never exceed the org's AI-employee capacity (§5.4). The
      // playbook seeds its most important roles and reports the trim so the
      // founder can see exactly why the team is smaller than the template.
      const result = await playbooks.seedPlaybook(db, ctx.orgId, ctx.userId, parsed.data.slug, { enforceAgentLimit: true });

      // Apply the facts the gate collected. Best-effort: the seed already
      // succeeded, so a rename/state failure is logged, never fatal.
      try {
        await orgs.updateOrg(db, ctx.orgId, { name: parsed.data.companyName });
        await appendAudit(db, {
          orgId: ctx.orgId,
          actorType: 'user',
          actorId: ctx.userId,
          action: 'org.renamed',
          outcome: 'success',
          inputRef: 'source=playbook',
        });
        const current = await onboarding.getOrCreate(db, ctx.userId, ctx.orgId);
        await onboarding.update(db, ctx.userId, {
          step: 'complete',
          completedAt: new Date(),
          organization: {
            ...(current.organization ?? {}),
            playbookFacts: {
              companyName: parsed.data.companyName,
              ...(parsed.data.objective ? { objective: parsed.data.objective } : {}),
              slug: parsed.data.slug,
            },
          },
        });
      } catch (factsErr) {
        logger.warn({ err: factsErr, orgId: ctx.orgId }, 'Company Builder: playbook facts skipped, seed stands');
      }

      return { data: { result } };
    } catch (error) {
      logger.error({ err: error, orgId: ctx.orgId, slug: parsed.data.slug }, 'Playbook seed failed');
      reply.code(400);
      return { error: { code: 'playbook.seed_failed', message: error instanceof Error ? error.message : 'Failed to seed playbook' } };
    }
  });
}