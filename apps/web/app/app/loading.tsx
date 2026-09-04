export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Welcome banner skeleton */}
      <div className="animate-pulse rounded-xl bg-[#0a0a0b] p-6 sm:p-8">
        <div className="h-3 w-32 rounded bg-white/10" />
        <div className="mt-3 h-8 w-64 rounded bg-white/10" />
        <div className="mt-2 h-4 w-48 rounded bg-white/10" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-hairline bg-white p-5">
            <div className="h-3 w-20 rounded bg-hairline" />
            <div className="mt-3 h-7 w-16 rounded bg-hairline" />
            <div className="mt-2 h-3 w-24 rounded bg-hairline" />
          </div>
        ))}
      </div>

      {/* Content skeletons */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="animate-pulse rounded-xl border border-hairline bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-hairline" />
              <div>
                <div className="h-4 w-32 rounded bg-hairline" />
                <div className="mt-1 h-3 w-24 rounded bg-hairline" />
              </div>
            </div>
            <div className="mt-5 h-16 rounded-lg bg-canvas" />
            <div className="mt-5 grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-canvas" />
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="animate-pulse rounded-xl border border-hairline bg-white p-5">
            <div className="h-4 w-32 rounded bg-hairline" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-canvas" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
