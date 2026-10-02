import type { LucideIcon } from "lucide-react";

/**
 * DataBoundary — loading / empty / error / content, as data (docs/76 Phase 3).
 *
 * The app previously had one loading.tsx and one EmptyState usage across 44
 * pages; every page now declares its three states in one place instead of
 * hand-rolling (or omitting) them. Render order: loading → error → empty →
 * children.
 *
 * Loading: a real skeleton matching docs/71 (shimmering blocks, not a
 * spinner) — `skeleton` for list rows, or pass a custom node.
 * Error: retry callback + honest message + optional back link.
 * Empty: reuses the existing EmptyState component (dashed hairline box,
 * one line of instruction, one action).
 */
export function SkeletonRows({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="console-card h-14 animate-pulse bg-surface-secondary"
          style={{ opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  );
}

export function SkeletonBoard({ columns = 3 }: { columns?: number }) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(220px, 1fr))` }}
      aria-hidden="true"
    >
      {Array.from({ length: columns }).map((_, c) => (
        <div key={c} className="console-card p-3">
          <div className="mb-3 h-3 w-20 animate-pulse rounded bg-surface-secondary" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-secondary" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DataBoundary({
  loading,
  error,
  onRetry,
  errorTitle = "Could not load this view",
  empty,
  emptyIcon,
  emptyAction,
  skeleton,
  children,
}: {
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  errorTitle?: string;
  empty?: { title: string; description: string };
  emptyIcon?: LucideIcon;
  emptyAction?: React.ReactNode;
  /** Custom skeleton node; defaults to four list rows. */
  skeleton?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (loading) {
    return <>{skeleton ?? <SkeletonRows />}</>;
  }
  if (error) {
    return (
      <div className="console-card border-error-soft/50 p-8 text-center" role="alert">
        <p className="text-sm font-semibold text-error-ink">{errorTitle}</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 inline-flex items-center rounded-lg border border-hairline-strong px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:bg-elevated"
          >
            Try again
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    const EmptyIcon = emptyIcon;
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-hairline bg-canvas/50 px-6 py-12 text-center">
        {EmptyIcon && (
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-canvas">
            <EmptyIcon className="h-6 w-6 text-muted/50" />
          </div>
        )}
        <h3 className="text-sm font-semibold text-ink">{empty.title}</h3>
        <p className="mt-1 max-w-sm text-xs text-muted">{empty.description}</p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }
  return <>{children}</>;
}
