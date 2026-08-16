// Route-transition loading state for the dashboard shell: shown while the
// authenticated layout verifies the session and the page hydrates after
// sign-in. Mirrors the dashboard's structure so the transition feels stable.
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-xl bg-hairline/70 ${className ?? ""}`}
    />
  );
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl" role="status" aria-label="Loading dashboard">
      <span className="sr-only">Loading your dashboard…</span>

      {/* Welcome banner */}
      <SkeletonBlock className="h-56 w-full" />

      {/* Stat cards + activity chart */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="grid grid-cols-2 gap-4 lg:col-span-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-32" />
          ))}
        </div>
        <SkeletonBlock className="h-64" />
      </div>

      {/* Decision table + budgets */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <SkeletonBlock className="h-80 lg:col-span-2" />
        <SkeletonBlock className="h-80" />
      </div>
    </div>
  );
}
