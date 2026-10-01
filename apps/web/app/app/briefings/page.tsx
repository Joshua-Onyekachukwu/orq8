"use client";

/**
 * Briefings (docs/71 §L, marketing/headquarters-mock-v2.html
 * `screen-briefings`).
 *
 * The mock's composition: one card per briefing — period in the header, the
 * **big stats row** (completed / failed / credits…), the notable sections,
 * and a status line at the foot. Everything rendered comes from the persisted
 * briefing content written by the scheduled job — nothing re-generated or
 * invented; a quiet period says so, a failed briefing points at the job
 * history that has the error.
 */

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import { RefreshCw, ChevronDown, Loader2 } from "lucide-react";

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

/** Which stats get the mock's big-number treatment, in order. */
const HEADLINE_STATS = ["completed", "failed", "creditsUsed", "tasksCreated"];

function statLabel(key: string): string {
  const map: Record<string, string> = {
    completed: "Completed",
    failed: "Failed",
    tasksCreated: "Tasks created",
    creditsUsed: "Credits used",
    approvals: "Approvals",
    gates: "Gates",
    spend: "Spend",
    founderTimeSaved: "Founder time saved",
  };
  return map[key] ?? key.replace(/([A-Z])/g, " $1").toLowerCase();
}

function periodLabel(row: BriefingRow): string {
  const fmt = (iso: string, withYear = false) =>
    new Date(iso).toLocaleDateString("en-US", {
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

function BriefingCard({ row }: { row: BriefingRow }) {
  const [expanded, setExpanded] = useState(false);
  const sections = row.content?.sections ?? [];
  const statsEntries = Object.entries(row.content?.stats ?? {}).filter(
    ([, v]) => typeof v === "number",
  );
  const headline = statsEntries.filter(([k]) => HEADLINE_STATS.includes(k));
  const rest = statsEntries.filter(([k]) => !HEADLINE_STATS.includes(k));
  const failed = row.status === "failed";

  return (
    <details className="console-card group overflow-hidden">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-3xs uppercase tracking-wide text-muted">
          {row.kind}
        </span>
        <span className="text-sm font-semibold text-ink">Weekly briefing · {periodLabel(row)}</span>
        <span className="font-mono text-2xs text-muted">{statusLabel(row)}</span>
        <ChevronDown
          aria-hidden="true"
          className={`ml-auto h-3.5 w-3.5 shrink-0 text-muted transition-transform group-open:rotate-180`}
        />
      </summary>

      <div className="border-t border-hairline px-5 py-4">
        {failed ? (
          <p className="text-xs text-error-ink">
            This briefing failed to generate — the job run history (/app/jobs) has the error detail.
          </p>
        ) : row.content?.quiet ? (
          <p className="text-xs text-muted">
            Quiet period — no significant activity. The stats below are still the real counts for
            the period.
          </p>
        ) : sections.length === 0 && statsEntries.length === 0 ? (
          <p className="text-xs text-muted">No sections recorded in this briefing.</p>
        ) : null}

        {headline.length > 0 && (
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {headline.map(([key, value]) => (
              <div key={key} className="min-w-[64px] flex-1">
                <p className="font-mono text-lg font-semibold tabular-nums text-ink">{value}</p>
                <p className="font-mono text-3xs uppercase tracking-wide text-muted">
                  {statLabel(key)}
                </p>
              </div>
            ))}
          </div>
        )}

        {sections.map((section, i) => (
          <div key={i} className={i === 0 && headline.length > 0 ? "mt-4" : "mt-4 first:mt-0"}>
            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              {section.heading}
            </p>
            <ul className="mt-1.5 space-y-1">
              {section.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-xs leading-relaxed text-ink">
                  <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-mark-active" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {rest.length > 0 && (
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {rest.map(([key, value]) => (
              <div key={key}>
                <dt className="font-mono text-3xs uppercase tracking-wide text-muted">
                  {statLabel(key)}
                </dt>
                <dd className="font-mono text-xs tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </details>
  );
}

export default function BriefingsPage() {
  const [rows, setRows] = useState<BriefingRow[]>([]);
  const [kind, setKind] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(12);
  const [total, setTotal] = useState(0);

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
    }
  }, [kind, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageErrorBoundary pageName="Briefings" backHref="/app">
      <div className="space-y-4">
        <header className="console-card flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Executive briefings
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Briefings</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Weekly and monthly reports, written by Atlas from real activity, acknowledged by you.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated disabled:opacity-40"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {/* Kind filter */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter briefings by kind">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              aria-pressed={kind === k.key}
              onClick={() => setKind(k.key)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                kind === k.key
                  ? "border-hairline-strong bg-elevated text-ink"
                  : "border-hairline text-muted hover:border-hairline-strong hover:text-ink"
              }`}
            >
              {k.label}
            </button>
          ))}
          {!loading && (
            <span className="ml-auto self-center font-mono text-2xs text-muted" aria-live="polite">
              {total} briefing{total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-hairline bg-error-soft/40 px-3.5 py-2.5 text-sm text-error-ink">
            {error}
          </div>
        )}

        {loading ? (
          <div className="console-card flex items-center gap-3 p-6">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-muted" />
            <p className="text-sm text-muted">Loading briefings…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="console-card p-10 text-center">
            <p className="text-sm font-medium text-ink">No briefings yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">
              Briefings are generated on schedule — daily, weekly, monthly — from your
              organization&apos;s real activity. Once the first one lands, it appears here in full.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <BriefingCard key={row.id} row={row} />
            ))}
          </div>
        )}

        {!loading && rows.length < total && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setLimit((l) => l + 12)}
              className="rounded-full border border-hairline px-4 py-2 text-xs text-muted transition-colors hover:border-hairline-strong hover:text-ink"
            >
              Show more ({total - rows.length} remaining)
            </button>
          </div>
        )}
      </div>
    </PageErrorBoundary>
  );
}
