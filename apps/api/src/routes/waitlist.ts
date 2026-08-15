import { validation } from '@orq8/core';
import { waitlistBody } from '@orq8/domain';
import { count, eq } from 'drizzle-orm';
import { waitlistSignups } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
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
    reply.code(201);
    return { data: { email: row.email, status: row.status, already: false } };
  });

  // Social proof for the landing page ("Join N founders already on the list").
  app.get('/v1/waitlist/count', async () => {
    const [row] = await db.select({ n: count() }).from(waitlistSignups);
    return { data: { count: row?.n ?? 0 } };
  });
}
