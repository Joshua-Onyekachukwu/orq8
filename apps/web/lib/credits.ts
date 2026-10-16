/**
 * Credits are this product's unit of account — task cost, approval cost,
 * spend limits and usage are all credit counts, never dollars. This module is
 * the single shared formatter; every surface imports this instead of defining
 * its own (or dividing by 100 into a $ string, the C-08 suspicion).
 *
 * Pure TypeScript, no dependencies — safe to import from client components,
 * server components, route handlers, and the vitest unit harness alike.
 */
export function formatCredits(n: number): string {
  return `${Math.round(n ?? 0).toLocaleString()} cr`;
}
