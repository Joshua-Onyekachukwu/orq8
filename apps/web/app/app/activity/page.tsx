"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import { Filter, Search, Activity, AlertCircle, RefreshCw, Download } from "lucide-react";

interface ActivityEvent {
  id: number;
  agentId: string | null;
  taskId: string | null;
  type: string;
  summary: string;
  reason: string | null;
  cost: number;
  department: string | null;
  occurredAt: string;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Unknown";
  }
}

function eventTypeBadge(type: string) {
  const lower = type.toLowerCase();
  if (lower.includes("deploy") || lower.includes("approve"))
    return "bg-emerald/15 text-emerald-700";
  if (lower.includes("reject")) return "bg-red-100 text-red-700";
  return "bg-indigo-50 text-indigo-700";
}

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (agentFilter !== "all") params.set("agent_id", agentFilter);
      params.set("limit", "50");
      const res = await fetch(`/api/activity?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch activity");
      const json = await res.json();
      setEvents(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [agentFilter]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Derive filter options from actual data
  const agentIds = [...new Set(events.map((e) => e.agentId).filter(Boolean))];
  const types = [...new Set(events.map((e) => e.type))];

  const filtered = events.filter(
    (e) =>
      (typeFilter === "all" || e.type === typeFilter) &&
      (query.trim() === "" ||
        e.summary.toLowerCase().includes(query.toLowerCase()) ||
        (e.reason && e.reason.toLowerCase().includes(query.toLowerCase())))
  );

  return (
    <PageErrorBoundary pageName="Agent Activity" backHref="/app">
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
            Live log · every action, with the reason
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Agent Activity
          </h1>
          <p className="mt-1 text-sm text-muted">
            Every action an AI employee takes, in plain language, with the
            &ldquo;because&rdquo; attached. Nothing happens that you can&apos;t trace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.open("/api/activity/export?format=csv", "_blank")}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={fetchActivity}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Error state */}
      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-xs text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters */}
      <section aria-label="Filters" className="mt-6 rounded-xl border border-hairline bg-white p-4 sm:p-5">
        <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          <Filter className="h-3.5 w-3.5" /> Filters
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Action type
            </span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-navy-800"
            >
              <option value="all">All actions</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Search
            </span>
            <span className="relative mt-1.5 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find an action or reason"
                className="w-full rounded-lg border border-hairline bg-white py-2 pl-9 pr-3 text-sm text-ink outline-none transition-colors focus:border-navy-800"
              />
            </span>
          </label>
        </div>
      </section>

      {/* Loading state */}
      {loading && events.length === 0 && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-hairline bg-white p-5">
              <div className="flex items-start gap-4">
                <div className="h-4 w-16 rounded bg-hairline" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-hairline" />
                  <div className="h-3 w-1/2 rounded bg-hairline" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
          <Activity className="mx-auto h-10 w-10 text-muted/30" />
          <p className="mt-4 text-sm font-medium text-ink">
            {events.length === 0 ? "No activity yet" : "Nothing matches those filters"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {events.length === 0
              ? "Agent actions will appear here as your AI workforce executes tasks."
              : "Try widening your search or changing the filters."}
          </p>
        </div>
      )}

      {/* Timeline */}
      {!loading && filtered.length > 0 && (
        <section aria-label="Activity timeline" className="mt-6">
          <ol className="space-y-3">
            {filtered.map((e) => (
              <li key={e.id} className="rounded-xl border border-hairline bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <time className="font-mono text-xs tabular-nums text-muted">
                    {formatTime(e.occurredAt)}
                  </time>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${eventTypeBadge(e.type)}`}
                  >
                    {e.type}
                  </span>
                  {e.department && (
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                      {e.department}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-muted">
                    {formatCost(e.cost)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink">{e.summary}</p>
                {e.reason && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
                    <span aria-hidden className="mt-0.5 font-mono font-semibold text-emerald">
                      because
                    </span>
                    {e.reason}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
    </PageErrorBoundary>
  );
}
