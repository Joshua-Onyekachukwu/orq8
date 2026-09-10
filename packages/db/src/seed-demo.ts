/**
 * Demo-organization plan seed (run manually: `pnpm --filter @orq8/db seed:demo`).
 *
 * The demo org (matched by DEMO_ORG_EMAIL, its owner's login) was created
 * through normal registration and therefore sits on trial caps (2 departments,
 * 3 agents) — which made the seeded demo look half-built and blocked catalog
 * activation. This script grants it a Company plan subscription, idempotently.
 *
 * Gated: without DEMO_ORG_EMAIL set it does nothing (never touches prod data
 * by accident). Intentionally NOT part of `pnpm --filter @orq8/db seed` — the
 * product seed must stay demo-agnostic.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { organizations, users, memberships, subscriptions } from './schema.js';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8';

async function main() {
  const demoEmail = process.env.DEMO_ORG_EMAIL;
  if (!demoEmail) {
    console.log('DEMO_ORG_EMAIL not set — nothing to do (safety gate).');
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  try {
    const [owner] = await db.select().from(users).where(eq(users.email, demoEmail)).limit(1);
    if (!owner) {
      console.log(`No user with email ${demoEmail} — nothing to do.`);
      return;
    }
    const [membership] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, owner.id))
      .limit(1);
    if (!membership) {
      console.log(`Owner ${demoEmail} has no organization membership — nothing to do.`);
      return;
    }
    const orgId = membership.orgId;

    const period = new Date();
    const periodEnd = new Date(period.getTime() + 365 * 24 * 60 * 60 * 1000);
    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .limit(1);

    if (existing && existing.plan === 'company' && existing.status === 'active') {
      console.log(`Org ${orgId} already has an active Company plan — nothing to do.`);
      return;
    }

    if (existing) {
      await db
        .update(subscriptions)
        .set({ plan: 'company', status: 'active', includedCredits: 12000, maxAgents: 50, currentPeriodStart: period, currentPeriodEnd: periodEnd })
        .where(eq(subscriptions.id, existing.id));
      console.log(`Updated org ${orgId} subscription to Company plan.`);
    } else {
      await db.insert(subscriptions).values({
        orgId,
        plan: 'company',
        billingCycle: 'monthly',
        status: 'active',
        includedCredits: 12000,
        maxAgents: 50,
        currentPeriodStart: period,
        currentPeriodEnd: periodEnd,
      });
      console.log(`Created Company plan subscription for org ${orgId}.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('seed-demo failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
