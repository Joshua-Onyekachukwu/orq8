import type { ReactNode } from "react";

/**
 * Shared primitives for the Company Hub (docs/63).
 *
 * Sections, not cards: a hub made of cards reads as a dashboard, so cards are
 * reserved for entities (an employee, a department node, an attention item).
 * Status is always glyph plus label, never colour alone.
 */

export type HubStatus =
  | "active"
  | "working"
  | "waiting"
  | "blocked"
  | "review"
  | "completed"
  | "failed"
  | "paused"
  | "offline"
  | "idle";

const STATUS_META: Record<string, { label: string; glyph: string; tone: string }> = {
  active: { label: "Active", glyph: "●", tone: "text-orq8-green" },
  working: { label: "Working", glyph: "●", tone: "text-orq8-green" },
  executing: { label: "Working", glyph: "●", tone: "text-orq8-green" },
  in_progress: { label: "Working", glyph: "●", tone: "text-orq8-green" },
  completed: { label: "Completed", glyph: "✓", tone: "text-orq8-green" },
  waiting: { label: "Waiting", glyph: "○", tone: "text-orq8-orange" },
  pending: { label: "Waiting", glyph: "○", tone: "text-orq8-orange" },
  assigned: { label: "Waiting", glyph: "○", tone: "text-orq8-orange" },
  review: { label: "Review", glyph: "◐", tone: "text-orq8-orange" },
  blocked: { label: "Blocked", glyph: "!", tone: "text-orq8-orange" },
  failed: { label: "Failed", glyph: "✕", tone: "text-orq8-orange" },
  paused: { label: "Paused", glyph: "Ⅱ", tone: "text-muted" },
  offline: { label: "Offline", glyph: "○", tone: "text-muted" },
  retired: { label: "Offline", glyph: "○", tone: "text-muted" },
  idle: { label: "Idle", glyph: "○", tone: "text-muted" },
};

export function statusMeta(status: string | null | undefined) {
  const key = (status ?? "idle").toLowerCase();
  return STATUS_META[key] ?? { label: status ?? "Unknown", glyph: "○", tone: "text-muted" };
}

export function StatusChip({ status }: { status: string | null | undefined }) {
  const meta = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 text-2xs font-medium ${meta.tone}`}>
      <span aria-hidden="true">{meta.glyph}</span>
      {meta.label}
    </span>
  );
}

/** A titled region of the hub. Dividers instead of card chrome. */
export function Section({
  title,
  hint,
  action,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-4 border-b border-hairline pb-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
          {hint ? <p className="mt-0.5 text-2xs text-muted">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One number with its label and, when known, where it comes from. */
export function Stat({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "ink" | "orange" | "green";
}) {
  const toneClass =
    tone === "orange" ? "text-orq8-orange" : tone === "green" ? "text-orq8-green" : "text-ink";
  return (
    <div>
      <p className={`text-lg font-semibold tabular-nums tracking-tight ${toneClass}`}>{value}</p>
      <p className="text-2xs text-muted">{label}</p>
      {hint ? <p className="mt-0.5 text-3xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Honest empty state. Used wherever the company has no such records yet. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

/** Relative time from an ISO timestamp, in the app's plain register. */
export function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
