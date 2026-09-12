"use client";

/**
 * Briefing History (founder-facing) — browse every generated briefing by kind
 * (daily/weekly/monthly) with full section rendering.
 *
 * Wired to the real GET /v1/briefings read API (paginated, org-scoped, includes
 * content). Every section rendered comes from the persisted briefing content
 * written by the scheduled briefing job — nothing is re-generated, invented, or
 * placeholder-filled; a failed/empty briefing says so.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import { Newspaper, RefreshCw, ChevronRight, CalendarDays, Loader2 } from "lucide-react";

interface BriefingSection {
  heading: string;
  items: string[];
}

interface BriefingContent {
  quiet?: boolean;
  periodStart?: string;
  periodEnd?: string;
  sections?: BriefingSection[];
  stats?: Record<string, number>;
}

interface BriefingRow {
  id: string;
  kind: string; // daily | weekly | monthly
  periodStart: string;
  periodEnd: string;
  content: BriefingContent;
  status: string; // generated | delivered | failed
  deliveredAt: string | null;
  createdAt: string;
}

const KINDS = [
  { key: "", label: "All" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
] as const;

const KIND_STYLES: Record<string, string> = {
  daily: "bg-orq8-green/10 text-orq8-green",
  weekly: "bg-indigo-50 text-indigo-700",
  monthly: "bg-purple-50 text-purple-700",
};

function periodLabel(row: BriefingRow): string {
  const fmt = (iso: string, withYear = false) =>
    new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    });
  if (row.kind === "daily") return fmt(row.periodStart);
  return `${fmt(row.periodStart)} – ${fmt(row.periodEnd, row.kind === "monthly")}`;
}

function statusLabel(row: BriefingRow): string {
  if (row.status === "failed") return "generation failed";
  if (row.content?.quiet) return "quiet period — nothing significant";
  if (row.status === "delivered") return "delivered";
  return "generated";
}

function BriefingCard({ row, expanded, onToggle }: { row: BriefingRow; expanded: boolean; onToggle: () => void }) {
  const sections = row.content?.sections ?? [];
  return (
    <article className="rounded-xl border border-hairline bg-white p-5">
      <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={expanded}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 font-mono text-3xs font-semibold uppercase tracking-wide ${KIND_STYLES[row.kind] ?? "bg-muted/10 text-muted"}`}>
              {row.kind}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink">
              <CalendarDays className="h-3.5 w-3.5 text-muted" />
              {periodLabel(row)}
            </span>
            <span className="text-2xs text-muted">· {statusLabel(row)}</span>
          </div>
          {!expanded && sections.length > 0 && (
            <p className="mt-1 truncate text-xs text-muted">
              {sections[0]!.heading}: {sections[0]!.items.slice(0, 2).join(" · ")}
            </p>
          )}
          {!expanded && row.content?.quiet && (
            <p className="mt-1 text-xs text-muted italic">Quiet period — no significant activity.</p>
          )}
        </div>
        <ChevronRight className={`mt-1 h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-hairline pt-4">
          {row.status === "failed" ? (
            <p className="text-xs text-red-500">This briefing failed to generate — the job run history (/app/jobs) has the error detail.</p>
          ) : row.content?.quiet ? (
            <p className="text-xs text-muted italic">
              No significant activity in this period. Stats are still real counts for the period.
            </p>
          ) : sections.length === 0 ? (
            <p className="text-xs text-muted italic">No sections recorded in this briefing.</p>
          ) : (
            sections.map((s, i) => (
              <div key={i}>
                <h4 className="font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">{s.heading}</h4>
                <ul className="mt-1.5 space-y-1">
                  {s.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
                      <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orq8-green" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          {row.content?.stats && Object.keys(row.content.stats).length > 0 && (
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-4">
              {Object.entries(row.content.stats)
                .filter(([, v]) => typeof v === "number")
                .map(([k, v]) => (
                  <div key={k} className="bg-white px-3 py-2">
                    <dt className="font-mono text-3xs font-semibold uppercase tracking-wide text-muted">
                      {k.replace(/([A-Z])/g, " $1").toLowerCase()}
                    </dt>
                    <dd className="mt-0.5 font-mono text-xs font-medium tabular-nums text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
          )}
        </div>
      )}
    </article>
  );
}

export default function BriefingsPage() {
  const [rows, setRows] = useState<BriefingRow[]>([]);
  const [kind, setKind] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(12);
  const [total, setTotal] = useState(0);
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: "0" });
      if (kind) params.set("kind", kind);
      const res = await fetch(`/api/briefings?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load briefings");
      const json = await res.json();
      setRows(json.data ?? []);
      setTotal(json.meta?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load briefings");
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  }, [kind, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageErrorBoundary pageName="Briefings" backHref="/app">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-green">
              Executive briefings · generated on schedule from real activity
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Briefing History
            </h1>
            <p className="mt-1 text-sm text-muted">
              Every daily, weekly and monthly executive briefing your organization has produced — full sections, real
              numbers, exactly as delivered.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </header>

        {/* Kind filter */}
        <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter briefings by kind">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              role="tab"
              aria-selected={kind === k.key}
              onClick={() => setKind(k.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                kind === k.key ? "bg-orq8-dark text-white" : "border border-hairline bg-white text-ink hover:bg-canvas"
              }`}
            >
              {k.label}
            </button>
          ))}
          {!loading && (
            <span className="ml-auto text-xs text-muted" aria-live="polite">
              {total} briefing{total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading && (
          <div className="mt-6 flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading briefings…
          </div>
        )}

        {!loading && !error && rows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
            <Newspaper className="mx-auto h-10 w-10 text-muted/30" />
            <p className="mt-4 text-sm font-medium text-ink">No briefings yet</p>
            <p className="mt-1 text-sm text-muted max-w-md mx-auto">
              Briefings are generated on schedule (daily, weekly, monthly) from your organization&apos;s real activity.
              Once the first one lands, it appears here in full.
            </p>
          </div>
        ) : null}

        {!loading && rows.length > 0 && (
          <div className="mt-6 space-y-3">
            {rows.map((row) => (
              <BriefingCard key={row.id} row={row} expanded={expandedId === row.id} onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)} />
            ))}
          </div>
        )}

        {!loading && rows.length < total && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setLimit((l) => l + 12)}
              className="rounded-full border border-hairline bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas"
            >
              Show more ({total - rows.length} remaining)
            </button>
          </div>
        )}
      </div>
    </PageErrorBoundary>
  );
}
