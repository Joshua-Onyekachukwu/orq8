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

/** Get the onboarding state for a user. Creates a default if none exists. */
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

  const row = existing[0];
  if (row) {
    const stepMap: Record<string, number> = { organization: 0, constitution: 1, agents: 2, complete: 3 };
    return {
      step: row.step,
      stepNumber: stepMap[row.step] ?? 0,
      organization: (row.organization as Record<string, unknown>) ?? undefined,
      constitution: (row.constitution as Record<string, unknown>) ?? undefined,
      agentSelections: (row.agentSelections as Array<Record<string, unknown>>) ?? undefined,
      completedAt: row.completedAt ?? undefined,
    };
  }

  // Create default state
  await db.insert(onboardingStates).values({
    userId,
    orgId,
    step: 'organization',
  });

  return { step: 'organization', stepNumber: 0 };
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
