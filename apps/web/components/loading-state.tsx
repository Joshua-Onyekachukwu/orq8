export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-hairline bg-white p-5"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-canvas" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-canvas" />
              <div className="h-3 w-2/3 rounded bg-canvas" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded bg-canvas" />
            <div className="h-3 w-4/5 rounded bg-canvas" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Welcome banner skeleton */}
      <div className="animate-pulse rounded-xl bg-navy-950 p-6 sm:p-8">
        <div className="h-3 w-24 rounded bg-white/10" />
        <div className="mt-3 h-7 w-48 rounded bg-white/10" />
        <div className="mt-2 h-4 w-64 rounded bg-white/10" />
        <div className="mt-6 flex gap-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-white/10" />
            <div className="space-y-1.5">
              <div className="h-4 w-28 rounded bg-white/10" />
              <div className="h-3 w-20 rounded bg-white/10" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-white/10" />
            <div className="space-y-1.5">
              <div className="h-4 w-28 rounded bg-white/10" />
              <div className="h-3 w-20 rounded bg-white/10" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-hairline bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-20 rounded bg-canvas" />
              <div className="h-5 w-12 rounded-full bg-canvas" />
            </div>
            <div className="mt-3 h-8 w-16 rounded bg-canvas" />
            <div className="mt-3 h-2 w-full rounded bg-canvas" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-hairline bg-white p-5"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-canvas" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-canvas" />
                  <div className="h-3 w-1/2 rounded bg-canvas" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-hairline bg-white p-5"
            >
              <div className="h-4 w-24 rounded bg-canvas" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-3 w-full rounded bg-canvas" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
