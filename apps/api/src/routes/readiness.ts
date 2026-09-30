import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError, capabilityReadiness, envRequiredInProduction, envSurface, forbidden, validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { runMailDiagnosis } from '../services/email-diagnostics.js';
import type { AppDeps } from '../types.js';

/**
 * The activation report (docs/69, "infrastructure to build").
 *
 * A deployment that boots is not a deployment that works: the API starts with
 * almost nothing configured and degrades quietly (no mail, no model, keyword
 * memory) or refuses to serve (`DATABASE_URL` absent). The founder should be
 * able to ask one question — "what is not activated yet, and what does that
 * cost me?" — and get the answer from the running system rather than from a
 * developer reading the source.
 *
 * Two ways in, and they are different on purpose:
 *
 *   founder     a session. A person reading where their deployment is soft.
 *   machine     `x-internal-token`, the same secret the cron hooks use. A
 *               release gate has no session and must still be able to *name*
 *               the blockers, because "the deploy is not good" without the
 *               reason is a red build nobody can act on.
 *
 * Either way it never returns a value, only key names (docs/37 — never expose
 * secrets), so the report is safe to render in the product and safe to print in
 * a CI log.
 */
export function registerReadinessRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get('/v1/readiness', async (request) => {
    if (!isInternalCall(deps, request.headers['x-internal-token'])) {
      await requireAuth(request, deps);
    }

    const report = capabilityReadiness(deps.config);

    return {
      data: {
        environment: deps.config.NODE_ENV,
        ...report,
        requiredInProduction: envRequiredInProduction(),
        envSurfaceSize: envSurface().length,
      },
    };
  });

  /**
   * POST /v1/readiness/mail-check — prove mail, don't just describe it.
   *
   * `/v1/readiness` says `email` is *configured*: `SMTP_HOST` or `RESEND_API_KEY`
   * is present. That is a claim about the environment, not about the network. A
   * production can hold a correct key that the provider rejects, or an SMTP host
   * whose port is blocked, and every capability check passes while nobody in the
   * company can receive a confirmation email.
   *
   * So the release pipeline sends one real message and reports the three
   * verdicts the settings page already shows (configured, credentials accepted,
   * message accepted). The founder path stays `/v1/settings/mail/test`, which is
   * a session and writes an audit row; this one is machine-only — the pipeline
   * has no founder to attribute the send to, and an unauthenticated caller must
   * not be able to make the deployment send mail.
   *
   * 200 always means "the check ran" — a failed diagnosis is the answer, carried
   * in the body, so the gate can name the broken step and the fix.
   */
  app.post('/v1/readiness/mail-check', async (request) => {
    if (!isInternalCall(deps, request.headers['x-internal-token'])) {
      throw forbidden('The mail check is a release-pipeline probe (x-internal-token).');
    }

    const parsed = mailCheckBody.safeParse(request.body ?? {});
    if (!parsed.success) throw validation(parsed.error.flatten());

    const to = parsed.data.to ?? addressFromEmailFrom(deps.config.EMAIL_FROM);
    if (!to) {
      throw new AppError(
        400,
        'mail.no_probe_recipient',
        'The mail check has no recipient: set EMAIL_FROM to an address that can receive mail, or POST {"to": "you@company.com"}.',
      );
    }

    const diagnosis = await runMailDiagnosis(deps.config, deps.logger, to);
    deps.logger.info(
      { provider: diagnosis.provider, to, delivered: diagnosis.delivered },
      'release gate: mail delivery check',
    );

    return { data: diagnosis };
  });
}

const mailCheckBody = z.object({
  /** Where the probe message goes. Defaults to the address inside EMAIL_FROM. */
  to: z.string().email().optional(),
});

/** `ORQ8 <hello@orq8.ai>` → `hello@orq8.ai`; `hello@orq8.ai` → itself. */
function addressFromEmailFrom(from: string): string | null {
  const candidate = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
  return candidate.includes('@') ? candidate : null;
}

/**
 * Constant-time compare of the presented token against `INTERNAL_TOKEN`.
 *
 * `===` on a credential leaks its length and prefix through timing. A
 * readiness token is low-stakes compared with a session secret, but it is still
 * a credential accepted from the network, and the same guard costs nothing.
 */
function isInternalCall(deps: AppDeps, presented: unknown): boolean {
  const expected = deps.config.INTERNAL_TOKEN;
  if (!expected) return false;
  if (typeof presented !== 'string') return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
