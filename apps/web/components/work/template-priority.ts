/**
 * Blueprint-first ordering for the hire catalog (docs/85 P2).
 *
 * A department's blueprint says which roles it needs (`settings.roles`, written
 * at activation). The hire desk should therefore lead with those roles instead
 * of making the founder re-derive what the department already told us.
 *
 * Pure and JSX-free so it can be tested directly: the view
 * (`hire-panel.tsx`) renders the order, this decides it.
 */

/**
 * Level/qualifier words. They say how senior a role is, not what it does, so
 * they must not count as a shared domain: `engineering_lead` and `sales_lead`
 * both contain "lead" and are plainly different jobs.
 */
const QUALIFIERS = new Set([
  "senior",
  "junior",
  "lead",
  "head",
  "manager",
  "staff",
  "principal",
  "associate",
  "intern",
  "director",
  "chief",
]);

function tokens(role: string): string[] {
  return role
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !QUALIFIERS.has(t));
}

/**
 * Rank a template against the department's blueprint roles.
 * 0 = the exact role the blueprint asked for, 1 = the same domain, 2 = unrelated.
 */
export function blueprintRank(templateRole: string, blueprintRoles: string[]): number {
  const role = templateRole.trim().toLowerCase();
  const wanted = blueprintRoles.map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return 2;
  if (wanted.includes(role)) return 0;

  const roleTokens = new Set(tokens(role));
  const related = wanted.some((w) => {
    if (role.includes(w) || w.includes(role)) return true;
    // Otherwise compare the *domain* words: a blueprint may name
    // `engineering_lead` while the catalog names `engineering_manager`, and
    // that is the hire the department meant. Matching on substrings alone would
    // have buried it.
    return tokens(w).some((t) => roleTokens.has(t));
  });
  return related ? 1 : 2;
}

/**
 * Order the catalog so the department's own roles come first, then alphabetically.
 * Returns a new array; the input is not mutated.
 */
export function prioritiseByBlueprint<T extends { name: string; role: string }>(
  templates: T[],
  blueprintRoles: string[],
): T[] {
  return [...templates].sort(
    (a, b) =>
      blueprintRank(a.role, blueprintRoles) - blueprintRank(b.role, blueprintRoles) ||
      a.name.localeCompare(b.name),
  );
}
