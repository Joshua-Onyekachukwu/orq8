"use client";

/**
 * ORQ8 structure layer (docs/86 §3) — the layout and dashboard infrastructure
 * every console page composes.
 *
 * WHY THIS EXISTS
 * Pages used to hand-roll their own chrome: page titles, toolbars, tables and
 * empty states were re-written per page, which is how a console drifts into
 * several unrelated visual languages (docs/86 §3 records the audit). Trezo's
 * admin template already solves this class of problem well — page header +
 * breadcrumbs, section panels, dense data tables, tab bars, metric widgets,
 * timelines, drawers, pagination — so this module adopts that *structure* and
 * dresses it in ORQ8's tokens (`border-hairline`, `bg-canvas`, `text-ink`,
 * `text-muted`, mono micro-labels). Trezo supplies the layout grammar; ORQ8
 * supplies the palette, the density and the terminology.
 *
 * The rule for returning here: if two pages need the same box, table or state,
 * it belongs in this file — not copied into both.
 */

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { type DotState, type OsStatus, StateDot, formatDate } from "./primitives";

// ── Status chips (all nine states, token-driven) ───────────────────────────

const CHIP_TONE: Record<DotState, string> = {
  "": "border-hairline text-muted",
  active: "bg-status-active-bg text-status-active-text border-transparent",
  working: "bg-status-working-bg text-status-working-text border-transparent",
  waiting: "bg-status-waiting-bg text-status-waiting-text border-transparent",
  blocked: "bg-status-blocked-bg text-status-blocked-text border-transparent",
  review: "bg-status-review-bg text-status-review-text border-transparent",
  done: "bg-status-done-bg text-status-done-text border-transparent",
  paused: "bg-status-paused-bg text-status-paused-text border-transparent",
  failed: "bg-status-failed-bg text-status-failed-text border-transparent",
  offline: "bg-status-offline-bg text-status-offline-text border-transparent",
};

/**
 * A state badge that carries its own tone. Unlike the dot-only treatment in
 * `primitives.tsx`, this one is for lists and tables where the state is the
 * most important column and has to be readable at a glance.
 */
export function OsStateBadge({ state, label, className }: { state: DotState; label: string; className?: string }) {
  return (
    <span
      data-state={state}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-3xs font-semibold tracking-wide uppercase",
        CHIP_TONE[state],
        className,
      )}
    >
      <StateDot state={state} className={state ? "" : "opacity-60"} />
      {label}
    </span>
  );
}

// ── Breadcrumbs + page header ─────────────────────────────────────────────

export interface Crumb {
  label: string;
  href?: string;
}

export function OsBreadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1.5 text-2xs text-muted", className)}>
      {items.map((c, i) => (
        <React.Fragment key={`${c.label}-${i}`}>
          {i > 0 ? <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 opacity-50" /> : null}
          {c.href ? (
            <Link href={c.href} className="transition-colors hover:text-ink">
              {c.label}
            </Link>
          ) : (
            <span className="text-ink">{c.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

/**
 * The one page header. Every console page uses this so titles, eyebrows,
 * breadcrumbs and actions land in the same place at the same size.
 */
export function OsPageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  actions,
  meta,
  state,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  state?: { state: DotState; label: string };
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-hairline pb-5">
      {breadcrumbs?.length ? <OsBreadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="font-mono text-2xs tracking-wider text-muted uppercase">{eyebrow}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
            {state ? <OsStateBadge state={state.state} label={state.label} /> : null}
          </div>
          {description ? (
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-muted">{meta}</div> : null}
    </header>
  );
}

// ── Zone title (the micro-label above every block) ────────────────────────

/**
 * The canonical zone heading. It exists because this exact markup was copied
 * into every page by hand (the employee workspace alone had eleven copies), so
 * restyling a heading meant finding all of them. Any surface that renders its
 * own container but still needs the house heading uses this.
 */
export function OsZoneTitle({
  children,
  as: As = "h2",
  className,
}: {
  children: React.ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <As
      className={cn(
        "font-mono text-2xs font-semibold tracking-wider text-muted uppercase",
        className,
      )}
    >
      {children}
    </As>
  );
}

// ── Section (the repeated titled panel) ───────────────────────────────────

/**
 * Every block on a page is a Section: title, optional count, optional action,
 * optional one-line explanation of what the section means. Sections are what
 * the backend's `pageConfig.sections` orders — see docs/86 §4.
 */
export function OsSection({
  id,
  title,
  description,
  count,
  action,
  children,
  className,
  emphasis = false,
}: {
  id?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Emphasis marks the section this department is actually about (docs/85 §7). */
  emphasis?: boolean;
}) {
  return (
    <section id={id} className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <OsZoneTitle>
            {title}
            {typeof count === "number" ? (
              <span className="ml-1.5 text-ink">{count}</span>
            ) : null}
          </OsZoneTitle>
          {emphasis ? (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-mark-warm"
              title="This section carries this department's emphasis"
            />
          ) : null}
        </div>
        {action ? <div className="shrink-0 text-2xs">{action}</div> : null}
      </div>
      {description ? <p className="-mt-1 text-2xs text-muted">{description}</p> : null}
      {children}
    </section>
  );
}

/** A plain surface box. Prefer this to a hand-written `rounded-lg border`. */
export function OsPanel({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-hairline bg-canvas",
        padded && "p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Filter / action row that sits above a list or table. */
export function OsToolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-hairline pb-3", className)}>
      {children}
    </div>
  );
}

// ── Metric row (the backend names which metrics matter here) ───────────────

export interface OsMetric {
  key: string;
  label: string;
  value: string | number;
  sub?: string;
  /** Optional emphasis — e.g. a metric that is currently unhealthy. */
  tone?: "default" | "warn" | "bad";
}

export function OsMetricRow({ metrics, className }: { metrics: OsMetric[]; className?: string }) {
  if (metrics.length === 0) return null;
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {metrics.map((m) => (
        <div key={m.key} className="rounded-lg border border-hairline bg-canvas p-3.5">
          <p className="font-mono text-2xs tracking-wider text-muted uppercase">{m.label}</p>
          <p
            className={cn(
              "mt-1.5 text-xl font-semibold",
              m.tone === "bad" ? "text-error-ink" : m.tone === "warn" ? "text-warm-ink" : "text-ink",
            )}
          >
            {m.value}
          </p>
          {m.sub ? <p className="mt-0.5 text-2xs text-muted">{m.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────

export interface OsTab {
  key: string;
  label: string;
  count?: number;
}

export function OsTabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: OsTab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("flex flex-wrap items-center gap-1 border-b border-hairline", className)}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              on
                ? "border-warm text-ink"
                : "border-transparent text-muted hover:border-hairline hover:text-ink",
            )}
          >
            {t.label}
            {typeof t.count === "number" ? (
              <span className={cn("ml-1.5 font-mono text-2xs", on ? "text-ink" : "text-muted")}>
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ── Dense data table ──────────────────────────────────────────────────────

export interface OsColumn<T> {
  key: string;
  header: React.ReactNode;
  /** Cell renderer. Receives the row. */
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Hide below `sm` — for columns that are detail, not signal. */
  hideOnMobile?: boolean;
}

// ── Column builders ───────────────────────────────────────────────────────
//
// The console's tables are mostly the same four columns in a different order: a
// state chip, a mono value, a date, and a leading icon + label. Spelling those
// out per table costs more lines than the raw <td> markup they replaced, and it
// lets two pages disagree about what a "State" column is. A builder takes the
// column's identity and an accessor; the shape lives here, once.

/** Shared options for the column builders below. */
export interface OsColumnOpts {
  className?: string;
  /** Detail rather than signal — hidden below `sm`. */
  hideOnMobile?: boolean;
}

/** A state chip, reading its label and dot from the shared state vocabulary. */
export function stateColumn<T>(
  key: string,
  header: React.ReactNode,
  read: (row: T) => OsStatus,
  opts: OsColumnOpts = {},
): OsColumn<T> {
  return {
    key,
    header,
    className: opts.className,
    hideOnMobile: opts.hideOnMobile,
    cell: (row) => {
      const status = read(row);
      return <OsStateBadge state={status.state} label={status.label} />;
    },
  };
}

/** A mono micro-value: ids, branches, commands, exit codes, autonomy levels. */
export function monoColumn<T>(
  key: string,
  header: React.ReactNode,
  read: (row: T) => React.ReactNode,
  opts: OsColumnOpts = {},
): OsColumn<T> {
  return {
    key,
    header,
    className: opts.className,
    hideOnMobile: opts.hideOnMobile,
    cell: (row) => <span className="font-mono text-3xs text-muted">{read(row)}</span>,
  };
}

/** A timestamp rendered short ("Mar 4"). Detail, so hidden below `sm`. */
export function dateColumn<T>(
  key: string,
  header: React.ReactNode,
  read: (row: T) => string | Date | null | undefined,
  opts: OsColumnOpts = {},
): OsColumn<T> {
  return {
    key,
    header,
    className: opts.className,
    hideOnMobile: opts.hideOnMobile ?? true,
    cell: (row) => <span className="text-2xs text-muted">{formatDate(read(row))}</span>,
  };
}

/**
 * A leading icon plus a label — the first column of most tables. The icon is
 * passed whole (each one is sized differently); only the layout is shared.
 */
export function iconTextColumn<T>(
  key: string,
  header: React.ReactNode,
  icon: React.ReactNode,
  read: (row: T) => React.ReactNode,
  opts: OsColumnOpts & { mono?: boolean } = {},
): OsColumn<T> {
  return {
    key,
    header,
    className: opts.className,
    hideOnMobile: opts.hideOnMobile,
    cell: (row) => (
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <span className={cn("truncate text-ink", opts.mono ? "font-mono text-2xs" : "text-sm")}>
          {read(row)}
        </span>
      </div>
    ),
  };
}

/**
 * The console's table. Dense (32px rows), mono headers, hairline rules, first
 * column primary. Use it for anything list-shaped that has more than three
 * fields per row; use cards for fewer.
 */
export function OsDataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
  className,
}: {
  columns: Array<OsColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  empty?: React.ReactNode;
  className?: string;
}) {
  if (rows.length === 0) {
    return <>{empty ?? <OsEmptyPanel title="Nothing here yet." />}</>;
  }
  return (
    <div className={cn("overflow-hidden rounded-lg border border-hairline", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-canvas">
            <tr className="border-b border-hairline">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2 font-mono text-3xs font-semibold tracking-wider text-muted uppercase",
                    c.hideOnMobile && "hidden sm:table-cell",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr key={rowKey(row)} className="transition-colors hover:bg-surface-secondary">
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        "border-b border-hairline px-3 py-2 align-middle text-ink",
                        c.hideOnMobile && "hidden sm:table-cell",
                        c.className,
                      )}
                    >
                      {/* The first column carries the row link — links never
                          nest inside a cell, and the rest of the row stays
                          plain text a person can select. */}
                      {href && i === 0 ? (
                        <Link href={href} className="block min-w-0 transition-colors hover:text-brand-ink">
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Timeline (execution history, honestly ordered) ────────────────────────

export interface OsTimelineItem {
  id: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  at?: string;
  state?: DotState;
  href?: string;
}

/**
 * A vertical execution history. Used for "what this employee/team actually
 * did", newest first. No spinner theatre — every row is a recorded event.
 */
export function OsTimeline({ items, className }: { items: OsTimelineItem[]; className?: string }) {
  if (items.length === 0) return <OsEmptyPanel title="No recorded activity yet." />;
  return (
    <ol className={cn("relative space-y-3 border-l border-hairline pl-4", className)}>
      {items.map((it) => {
        const body = (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                {it.state !== undefined ? <StateDot state={it.state} className="mt-1.5" /> : null}
                <p className="min-w-0 text-sm text-ink">{it.title}</p>
              </div>
              {it.at ? <span className="shrink-0 text-2xs text-muted">{it.at}</span> : null}
            </div>
            {it.detail ? <p className="mt-0.5 text-2xs leading-relaxed text-muted">{it.detail}</p> : null}
          </>
        );
        return (
          <li key={it.id} className="relative">
            <span
              aria-hidden="true"
              className="absolute top-1.5 -left-[21px] h-1.5 w-1.5 rounded-full bg-border-strong"
            />
            {it.href ? (
              <Link href={it.href} className="block transition-colors hover:text-ink">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────

export function OsPagination({
  page,
  pageCount,
  onPage,
  className,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className={cn("flex items-center justify-between gap-3 text-2xs text-muted", className)}>
      <span className="font-mono">
        page {page} / {pageCount}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded-md border border-hairline px-2.5 py-1 transition-colors hover:border-ink/20 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          className="rounded-md border border-hairline px-2.5 py-1 transition-colors hover:border-ink/20 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ── Drawer (detail without losing the list) ───────────────────────────────

export function OsDrawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-overlay"
      />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-hairline bg-canvas shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-hairline p-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-hairline px-2 py-0.5 text-2xs text-muted transition-colors hover:text-ink"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <div className="border-t border-hairline p-4">{footer}</div> : null}
      </div>
    </div>
  );
}

// ── Modal (the console's dialog) ──────────────────────────────────────────

/**
 * The one dialog. Ten pages hand-rolled the same `fixed inset-0 … bg-white
 * shadow-2xl` overlay (docs/86 §5 records the audit), which is why a modal in
 * one corner of the console ignored the ink theme while another respected it.
 * Sized by intent, closed by the button, the backdrop or Escape.
 */
export function OsModal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="fixed inset-0 bg-overlay"
      />
      <div className={cn("relative z-10 w-full rounded-lg border border-hairline bg-canvas shadow-2xl", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-hairline px-2 py-0.5 text-2xs text-muted transition-colors hover:text-ink"
          >
            Close
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? <div className="border-t border-hairline px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

// ── States: empty / loading / error (truthful, never fake) ────────────────

export function OsEmptyPanel({
  title,
  hint,
  action,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  /** A link, or a real control when the empty state's next step is local. */
  action?: { label: string; href: string } | { label: string; onClick: () => void };
}) {
  const actionClass = "mt-2.5 inline-block text-sm text-brand-ink underline underline-offset-4";
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-canvas p-6 text-center">
      <p className="text-sm text-muted">{title}</p>
      {hint ? <p className="mt-1 text-2xs text-muted">{hint}</p> : null}
      {action ? (
        "href" in action ? (
          <Link href={action.href} className={actionClass}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={actionClass}>
            {action.label}
          </button>
        )
      ) : null}
    </div>
  );
}

export function OsLoadingRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("animate-pulse space-y-2.5", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-lg border border-hairline bg-canvas p-4">
          <div className="h-3 w-1/3 rounded bg-surface-secondary" />
          <div className="mt-2 h-2.5 w-2/3 rounded bg-surface-secondary" />
        </div>
      ))}
    </div>
  );
}

export function OsErrorPanel({
  title = "This did not load.",
  detail,
  onRetry,
}: {
  title?: string;
  detail?: React.ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-lg border border-hairline bg-canvas p-5">
      <p className="text-sm font-medium text-error-ink">{title}</p>
      {detail ? <p className="mt-1 text-2xs text-muted">{detail}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-hairline px-3 py-1 text-2xs text-ink transition-colors hover:border-ink/20"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

// ── Definition list (identity/authority/config facts) ─────────────────────

export function OsFacts({
  items,
  columns = 2,
  className,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3",
        columns === 1 ? "grid-cols-1" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
        className,
      )}
    >
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="font-mono text-2xs tracking-wider text-muted uppercase">{it.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
