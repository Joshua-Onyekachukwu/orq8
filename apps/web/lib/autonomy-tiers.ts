/**
 * Plan-tier autonomy ordering (P2: Founder phased vs Company full map).
 *
 * Mirrors the server ladder in `apps/api/src/services/autonomy.ts`
 * (`AUTONOMY_LEVELS`) and the ceiling in `services/entitlements.ts`
 * (`enforceAutonomyCap`). Pure logic for progressive disclosure — the server
 * still enforces on every grant path, so an unknown ceiling here fails open
 * and lets the API answer 403 with the upgrade path.
 */
export const AUTONOMY_RANK = [
  "observe",
  "recommend",
  "draft",
  "execute_with_approval",
  "autonomous",
] as const;

export function levelAllowed(
  planMax: string | null | undefined,
  level: string,
): boolean {
  if (!planMax) return true;
  const max = (AUTONOMY_RANK as readonly string[]).indexOf(planMax);
  if (max < 0) return true;
  const want = (AUTONOMY_RANK as readonly string[]).indexOf(level);
  if (want < 0) return false;
  return want <= max;
}
