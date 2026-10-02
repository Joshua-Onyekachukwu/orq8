import { SkeletonRows } from "../../components/layout/data-boundary";

/**
 * Route-level loading state for every /app page (docs/76 Phase 3).
 *
 * Pages that fetch server-side stream their own shell; this catches the gap
 * between navigation and the page's first paint with the standard page shape
 * (header + content rows) so navigation never lands on a blank screen.
 * Individual segments override with their own loading.tsx when their shape
 * differs materially (board, code).
 */
export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl" aria-busy="true" aria-label="Loading page">
      <div className="h-3 w-24 animate-pulse rounded bg-surface-secondary" />
      <div className="mt-2 h-8 w-56 animate-pulse rounded bg-surface-secondary" />
      <div className="mt-2 h-4 w-80 animate-pulse rounded bg-surface-secondary" />
      <div className="mt-6">
        <SkeletonRows rows={5} />
      </div>
    </div>
  );
}
