"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";

/* ── Types ── */

interface JobRun {
  id: string;
  job: string;
  status: "success" | "error" | "partial" | string;
  trigger: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number | null;
  orgsProcessed: number;
  detail: Record<string, unknown>;
  error: string | null;
}

interface JobsStatus {
  jobs: JobRun[];
}

/* ── Job catalog ── */

const JOB_CATALOG: Array<{
  key: string;
  label: string;
  cadence: string;
  description: string;
}> = [
  {
    key: "events_process_pending",
    label: "Event Processing",
    cadence: "Every 5 minutes",
    description: "Processes pending webhook events from GitHub, Linear and Gmail into tasks, approvals and notifications.",
  },
  {
    key: "memory_consolidate",
    label: "Memory Consolidation",
    cadence: "Daily · 06:30 UTC",
    description: "Deduplicates and promotes company memory across every organization.",
  },
  {
    key: "anomaly_scan",
    label: "Anomaly Scan",
    cadence: "Daily",
    description: "Scans every organization for stalled goals, blocked tasks, failure spikes and spend spikes.",
  },
  {
    key: "briefing_daily",
    label: "Daily Briefing",
    cadence: "Daily · 07:00 UTC",
    description: "Generates the daily executive briefing for organizations with activity.",
  },
  {
    key: "briefing_weekly",
    label: "Weekly Briefing",
    cadence: "Mondays · 07:10 UTC",
    description: "Generates the weekly executive briefing.",
  },
  {
    key: "briefing_monthly",
    label: "Monthly Briefing",
    cadence: "1st of month · 07:15 UTC",
    description: "Generates the monthly executive briefing.",
  },
];

const DETAIL_LABELS: Record<string, string> = {
  generated: "briefings generated",
  skipped: "orgs skipped",
  scanned: "memory items scanned",
  merged: "duplicates merged",
  promoted: "entries promoted",
  nearDuplicatePairs: "near-duplicate pairs",
  anomalies: "anomalies found",
  failedOrgs: "orgs errored",
  processed: "events processed",
  failed: "failed",
  dead: "dead-lettered",
  notified: "notified",
  createdTasks: "tasks created",
  createdApprovals: "approvals created",
};

/* ── Helpers ── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function durationLabel(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function detailSummary(detail: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, label] of Object.entries(DETAIL_LABELS)) {
    const raw = detail[key];
    const value = typeof raw === "number" ? raw : Number(raw);
    if (typeof raw === "number" && Number.isFinite(value) && value !== 0) {
      parts.push(`${value} ${label}`);
    }
  }
  return parts.slice(0, 3).join(" · ");
}

function statusMeta(status: JobRun["status"] | "never") {
  switch (status) {
    case "success":
      return { icon: CheckCircle2, cls: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Healthy" };
    case "error":
      return { icon: XCircle, cls: "text-red-600", bg: "bg-red-50 border-red-200", label: "Failed" };
    case "partial":
      return { icon: AlertTriangle, cls: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Partial" };
    default:
      return { icon: Clock, cls: "text-muted", bg: "bg-muted/5 border-hairline", label: "Never run" };
  }
}

/* ── Page ── */

export default function ScheduledJobsPage() {
  const [data, setData] = useState<JobsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.error ?? "Failed to load scheduled-job status");
      setData(json?.data ?? { jobs: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scheduled-job status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const timer = setInterval(fetchJobs, 60_000);
    return () => clearInterval(timer);
  }, [fetchJobs]);

  const runsByJob = new Map((data?.jobs ?? []).map((j) => [j.job, j]));
  const hadAnyRun = (data?.jobs?.length ?? 0) > 0;

  return (
    <PageErrorBoundary pageName="Scheduled Jobs">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orq8-lime/10">
                <CalendarClock aria-hidden="true" className="h-4.5 w-4.5 text-orq8-green" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight text-ink">Scheduled Jobs</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              When each automated job actually ran in production — event processing, memory consolidation, anomaly
              scans and executive briefings. A green row means the last scheduled run authenticated and completed
              successfully.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchJobs}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
            <button type="button" onClick={() => setError(null)} className="ml-auto text-xs text-red-500 hover:text-red-700">Dismiss</button>
          </div>
        )}

        {loading && !data ? (
          <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-hairline bg-white p-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted">Loading scheduled-job status…</p>
          </div>
        ) : (
          <>
            {!hadAnyRun && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-amber-800">No scheduled jobs have run yet</p>
                  <p className="mt-1 text-xs text-amber-700">
                    The job log starts populating on the next scheduled run (event processing fires every 5 minutes;
                    consolidation, anomaly scan and briefings fire daily). Use the refresh button after the next run.
                  </p>
                </div>
              </div>
            )}

            {/* Job cards */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {JOB_CATALOG.map((def) => {
                const run = runsByJob.get(def.key);
                const meta = statusMeta(run ? (run.status as JobRun["status"]) : "never");
                const Icon = meta.icon;
                const summary = run ? detailSummary(run.detail ?? {}) : "";
                return (
                  <div key={def.key} className="flex flex-col rounded-xl border border-hairline bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-ink">{def.label}</h3>
                        <p className="mt-0.5 text-3xs font-medium uppercase tracking-wide text-muted">{def.cadence}</p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-3xs font-medium ${meta.bg} ${meta.cls}`}>
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted">{def.description}</p>
                    {run ? (
                      <div className="mt-3 border-t border-hairline pt-3 text-xs">
                        <p className="text-ink">
                          Last run <span className="font-medium">{timeAgo(run.startedAt)}</span>{" "}
                          <span className="text-muted">({new Date(run.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })})</span>
                        </p>
                        <p className="mt-1 text-muted">
                          {run.status === "error" ? (
                            <span className="text-red-600">{run.error ?? "Job failed"}</span>
                          ) : (
                            <>
                              {run.orgsProcessed > 0 && `${run.orgsProcessed} org(s) · `}
                              {summary || "completed"} · {durationLabel(run.durationMs)}
                            </>
                          )}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-3 border-t border-hairline pt-3 text-xs text-muted">
                        No run recorded yet — waiting for the next schedule.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-muted">
              Scheduled jobs are triggered by the <span className="font-mono">orq8-jobs</span> GitHub Actions workflow and
              authenticate with an internal token. Rows here are written by the jobs themselves in production, so a
              failure anywhere in the chain shows up as “Failed” or “No run recorded”.
            </p>
          </>
        )}
      </div>
    </PageErrorBoundary>
  );
}
