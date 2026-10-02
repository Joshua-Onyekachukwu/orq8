import { PageErrorBoundary } from "../page-error-boundary";

/**
 * PageContainer — the single width authority for every /app page (docs/76
 * Phase 3). Replaces the 13 ad-hoc max-w values pages used to invent with
 * four intentional widths, chosen by page TYPE not by accident:
 *
 *   narrow   max-w-3xl    forms, settings, focused reading
 *   standard max-w-6xl    most list/dashboard pages (the default)
 *   wide     max-w-[1600px] boards, rosters, dense operational grids
 *   full     edge-to-edge workspaces (Engineering, Kanban, code)
 *
 * Also standardizes the page header (docs/73: mono kicker / h1 / one-line
 * lede / actions right) and absorbs the per-page error boundary, so a
 * migration is: delete the hand-rolled wrapper + h1 block, render this.
 *
 * Server-component safe: no hooks, no event handlers of its own.
 */
const WIDTHS: Record<string, string> = {
  narrow: "max-w-3xl",
  standard: "max-w-6xl",
  wide: "max-w-[1600px]",
  full: "w-full",
};

export function PageContainer({
  width = "standard",
  kicker,
  title,
  lede,
  actions,
  footer,
  backHref,
  pageName,
  children,
}: {
  /** Intentional page width — see the table in docs/76 §Phase 3. */
  width?: keyof typeof WIDTHS;
  /** Mono micro-label above the title (e.g. "Work", "People", "Knowledge"). */
  kicker?: string;
  title: string;
  /** One line of context under the title. */
  lede?: string;
  /** Right-aligned header actions (buttons, menus). One orange CTA max. */
  actions?: React.ReactNode;
  /** Below the content (pagination, footnotes). */
  footer?: React.ReactNode;
  backHref?: string;
  /** Error-boundary name; defaults to the title. */
  pageName?: string;
  children: React.ReactNode;
}) {
  return (
    <PageErrorBoundary pageName={pageName ?? title} backHref={backHref}>
      <div className={`${WIDTHS[width] ?? WIDTHS.standard} mx-auto w-full`}>
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {kicker && (
              <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                {kicker}
              </p>
            )}
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
            {lede && <p className="mt-1.5 max-w-2xl text-sm text-muted">{lede}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </PageErrorBoundary>
  );
}
