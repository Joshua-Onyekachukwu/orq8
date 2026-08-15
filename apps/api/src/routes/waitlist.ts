import { validation } from '@orq8/core';
import { waitlistBody } from '@orq8/domain';
import { count, eq } from 'drizzle-orm';
import { waitlistSignups } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { createEmailTransport } from '../email/transport.js';
import { enqueueDrip, processDueWaitlistEmails } from '../email/waitlist-drip.js';
import type { AppDeps } from '../types.js';

// docs/00 GTM — public waitlist funnel. No auth: this is the landing page path.
export function registerWaitlistRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.post('/v1/waitlist', async (request, reply) => {
    const parsed = waitlistBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());
    const email = parsed.data.email.trim().toLowerCase();

    // Idempotent — same email twice is a 200, not a duplicate row.
    const [existing] = await db
      .select()
      .from(waitlistSignups)
      .where(eq(waitlistSignups.email, email))
      .limit(1);
    if (existing) {
      reply.code(200);
      return { data: { email, status: existing.status, already: true } };
    }

    const [row] = await db
      .insert(waitlistSignups)
      .values({
        email,
        name: parsed.data.name?.trim() || null,
        role: parsed.data.role ?? null,
        source: parsed.data.source ?? 'landing',
      })
      .returning();
    if (!row) throw new Error('waitlist insert returned no row');

    // Design-partner drip (docs/00, marketing/design_partner_application.md §4):
    // schedule the welcome + day-2/day-7 sequence. Best-effort — a queue failure
    // must never fail the signup; the drip re-schedules on any later signup.
    try {
      await enqueueDrip(db, { id: row.id, email: row.email, name: row.name });
    } catch (err) {
      request.log.error({ err }, 'failed to enqueue waitlist drip');
    }

    reply.code(201);
    return { data: { email: row.email, status: row.status, already: false } };
  });

  // Cron/script hook for the drip queue — call POST /v1/internal/waitlist/process-due
  // with `x-internal-token: <INTERNAL_TOKEN>` (GitHub Actions schedule in
  // .github/workflows/waitlist-drip.yml). Disabled when INTERNAL_TOKEN is unset.
  app.post('/v1/internal/waitlist/process-due', async (request, reply) => {
    if (!deps.config.INTERNAL_TOKEN) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Route not found' } };
    }
    const token = request.headers['x-internal-token'];
    if (typeof token !== 'string' || token !== deps.config.INTERNAL_TOKEN) {
      reply.code(401);
      return { error: { code: 'unauthorized', message: 'Invalid internal token' } };
    }
    const transport = createEmailTransport(deps.config, deps.logger);
    const result = await processDueWaitlistEmails(db, transport);
    return { data: result };
  });

  // Social proof for the landing page ("Join N founders already on the list").
  app.get('/v1/waitlist/count', async () => {
    const [row] = await db.select({ n: count() }).from(waitlistSignups);
    return { data: { count: row?.n ?? 0 } };
  });
}
