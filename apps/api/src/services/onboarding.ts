import { eq } from 'drizzle-orm';
import type { Db } from '@orq8/db';
import { onboardingStates } from '@orq8/db';

export interface OnboardingData {
  step: string;
  stepNumber: number; // 0-based step index for UI restoration
  organization?: Record<string, unknown>;
  constitution?: Record<string, unknown>;
  agentSelections?: Array<Record<string, unknown>>;
  completedAt?: Date;
}

type OnboardingRow = typeof onboardingStates.$inferSelect;

const STEP_NUMBERS: Record<string, number> = {
  organization: 0,
  constitution: 1,
  agents: 2,
  complete: 3,
};

function toOnboardingData(row: OnboardingRow): OnboardingData {
  return {
    step: row.step,
    stepNumber: STEP_NUMBERS[row.step] ?? 0,
    organization: (row.organization as Record<string, unknown>) ?? undefined,
    constitution: (row.constitution as Record<string, unknown>) ?? undefined,
    agentSelections: (row.agentSelections as Array<Record<string, unknown>>) ?? undefined,
    completedAt: row.completedAt ?? undefined,
  };
}

/**
 * Get the onboarding state for a user, creating the default if none exists.
 *
 * Idempotent on purpose. The row is unique per user, and the previous
 * select-then-insert raced that unique index: two calls in the same window (the
 * dashboard and the company builder both ask on load) made the loser throw
 * `duplicate key value violates unique constraint "onboarding_states_user_idx"`
 * and reach the browser as a bare 500. A conflict here is not an error — it
 * means somebody already created the row, so read theirs.
 */
export async function getOrCreate(
  db: Db,
  userId: string,
  orgId: string,
): Promise<OnboardingData> {
  const existing = await db
    .select()
    .from(onboardingStates)
    .where(eq(onboardingStates.userId, userId))
    .limit(1);

  if (existing[0]) return toOnboardingData(existing[0]);

  const inserted = await db
    .insert(onboardingStates)
    .values({ userId, orgId, step: 'organization' })
    .onConflictDoNothing()
    .returning();

  return inserted[0] ? toOnboardingData(inserted[0]) : { step: 'organization', stepNumber: 0 };
}

/** Update onboarding state for a user. */
export async function update(
  db: Db,
  userId: string,
  data: Partial<OnboardingData>,
): Promise<void> {
  const existing = await db
    .select({ id: onboardingStates.id })
    .from(onboardingStates)
    .where(eq(onboardingStates.userId, userId))
    .limit(1);

  const row = existing[0];
  if (!row) return;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.step) updates.step = data.step;
  if (data.organization !== undefined) updates.organization = data.organization;
  if (data.constitution !== undefined) updates.constitution = data.constitution;
  if (data.agentSelections !== undefined) updates.agentSelections = data.agentSelections;
  if (data.completedAt) updates.completedAt = data.completedAt;

  await db
    .update(onboardingStates)
    .set(updates)
    .where(eq(onboardingStates.id, row.id));
}
