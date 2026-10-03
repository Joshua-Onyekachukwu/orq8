"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ServerCog,
  Timer,
  XCircle,
} from "lucide-react";

/**
 * Commands — the real agent_jobs console (brief §7–§8, docs/78 Phase E).
 *
 * Everything on this page is read from the queue itself. The status names are
 * the schema's (`pending | running | done | failed | dead`), relabelled only
 * for readability; the counts, retry counts, timestamps and errors are the
 * rows. Retry calls POST /v1/admin/jobs/:id/retry, which decides retryability
 * from the job's actual state — the button cannot force a running job to run
 * twice.
 */

export interface CommandJob {
  id: string;
  orgId: string;
  type: string;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  lockedBy: string | null;
  lastError: string | null;
  taskId: string | null;
  taskTitle: string | null;
  taskStatus: string | null;
  agentId: string | null;
  agentName: string | null;
}

export interface QueueHealth {
  counts: Record<string, number>;
  byType: Record<string, Record<string, number>>;
  pending: number;
  eligible: number;
  running: number;
  staleRunning: number;
  activeWorkers: number;
  oldestPendingAt: string | null;
  lastCompletedAt: string | null;
  lastFailureAt: string | null;
  dead: number;
  failed: number;
}

/** The five statuses the schema actually defines, in queue order. */
const STATUSES = [
  { key: "pending", label: "Queued", icon: Timer, tone: "var(--orq-text-secondary)" },
  { key: "running", label: "Running", icon: Play, tone: "var(--orq-mark-active)" },
  { key: "done", label: "Completed", icon: CheckCircle2, tone: "var(--orq-mark-active)" },
  { key: "failed", label: "Failed", icon: AlertTriangle, tone: "var(--orq-warm)" },
  { key: "dead", label: "Dead-letter", icon: XCircle, tone: "var(--orq-error)" },
] as const;

const STATUS_TONE: Record<string, string> = {
  pending: "text-muted",
  running: "text-brand-ink",
  done: "text-mark-active",
  failed: "text-warm-ink",
  dead: "text-error-ink",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "queued",
  running: "running",
  done: "completed",
  failed: "failed",
  dead: "dead-letter",
};

function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "—";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function clock(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

async function unwrap<T>(res: Response): Promise<T | null> {
  const body = (await res.json().catch(() => null)) as { data?: T } | null;
  return (body?.data ?? null) as T | null;
}

export function CommandsDashboard({
  initialHealth,
  initialRecent,
  initialDeadLetter,
  initialMode,
}: {
  initialHealth: QueueHealth;
  initialRecent: CommandJob[];
  initialDeadLetter: CommandJob[];
  initialMode: string;
}) {
  const [health, setHealth] = useState(initialHealth);
  const [recent, setRecent] = useState(initialRecent);
  const [deadLetter, setDeadLetter] = useState(initialDeadLetter);
  const [mode, setMode] = useState(initialMode);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [refreshedAt, setRefreshedAt] = useState<number>(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    try {
      const query = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      const [healthRes, recentRes, deadRes] = await Promise.all([
        fetch("/api/admin/jobs/health", { cache: "no-store" }),
        fetch(`/api/admin/jobs/recent${query}`, { cache: "no-store" }),
        fetch("/api/admin/jobs/dead-letter", { cache: "no-store" }),
      ]);
      if (!healthRes.ok || !recentRes.ok || !deadRes.ok) {
        setRefreshError(`The queue could not be read (HTTP ${healthRes.status}/${recentRes.status}/${deadRes.status}).`);
        return;
      }
      const healthBody = (await healthRes.json()) as { data?: QueueHealth & { mode?: string } };
      const nextHealth = healthBody.data;
      if (nextHealth) {
        setHealth(nextHealth);
        if (nextHealth.mode) setMode(nextHealth.mode);
      }
      setRecent((await unwrap<CommandJob[]>(recentRes)) ?? []);
      setDeadLetter((await unwrap<CommandJob[]>(deadRes)) ?? []);
      setRefreshError(null);
      setRefreshedAt(Date.now());
    } catch {
      setRefreshError("The queue could not be read — the API may be restarting.");
    } finally {
      busy.current = false;
      setRefreshing(false);
    }
  }, [statusFilter]);

  // Auto-refresh: the queue moves on its own, so a static page would be a lie
  // within seconds. Paused while the tab is hidden (no pointless polling).
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Re-read with the new filter the moment it changes.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const retry = async (job: CommandJob): Promise<void> => {
    setRetryingId(job.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/jobs/${job.id}/retry`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { data?: { job?: { id: string } }; error?: { message?: string } }
        | null;
      if (!res.ok) {
        setNotice({
          tone: "error",
          text: body?.error?.message ?? `The retry was refused (HTTP ${res.status}).`,
        });
      } else {
        setNotice({
          tone: "ok",
          text: `Job ${shortId(job.id)} is queued again — the worker picks it up on its next tick.`,
        });
      }
    } catch {
      setNotice({ tone: "error", text: "The retry could not reach the API." });
    } finally {
      setRetryingId(null);
      void refresh();
    }
  };

  const shownRecent = statusFilter === "all" ? recent : recent.filter((j) => j.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* ── Queue health ── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Queue health</h2>
          <div className="flex flex-wrap items-center gap-2 font-mono text-2xs text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1">
              <ServerCog className="h-3 w-3" />
              queue mode: {mode}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              refreshed {timeAgo(new Date(refreshedAt).toISOString())}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline px-2.5 uppercase tracking-wide transition-colors hover:bg-surface-secondary hover:text-ink"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STATUSES.map((status) => {
            const count = health.counts[status.key] ?? 0;
            const Icon = status.icon;
            return (
              <button
                key={status.key}
                type="button"
                onClick={() => setStatusFilter(statusFilter === status.key ? "all" : status.key)}
                className={`rounded-xl border bg-white p-4 text-left transition-colors ${
                  statusFilter === status.key ? "border-hairline-strong" : "border-hairline hover:border-hairline-strong"
                }`}
              >
                <span className="flex items-center gap-2 text-2xs uppercase tracking-wide text-ink-muted">
                  <Icon className="h-3.5 w-3.5" style={{ color: status.tone }} />
                  {status.label}
                </span>
                <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{count}</p>
                <p className="mt-0.5 font-mono text-3xs uppercase tracking-wide text-ink-muted">
                  {status.key}
                </p>
              </button>
            );
          })}
        </div>

        <dl className="mt-3 grid gap-x-6 gap-y-2 rounded-xl border border-hairline bg-white p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-ink-muted">Eligible now</dt>
            <dd className="text-ink">
              {health.eligible} of {health.pending} queued
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Oldest waiting</dt>
            <dd className="text-ink">{timeAgo(health.oldestPendingAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Workers seen (10m)</dt>
            <dd className="text-ink">
              {health.activeWorkers}
              {health.running > 0 ? ` · ${health.running} running` : ""}
              {health.staleRunning > 0 ? (
                <span className="ml-1 text-error-ink">· {health.staleRunning} stale</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Last completed</dt>
            <dd className="text-ink">
              {timeAgo(health.lastCompletedAt)}
              {health.lastFailureAt ? ` · last failure ${timeAgo(health.lastFailureAt)}` : ""}
            </dd>
          </div>
        </dl>

        {health.staleRunning > 0 && (
          <p className="mt-2 flex items-center gap-2 rounded-lg border border-border-error bg-error-soft px-3 py-2 text-xs text-error-ink">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {health.staleRunning} job{health.staleRunning === 1 ? "" : "s"} still marked running after
            5 minutes — the worker reaps these back to the queue on its next tick.
          </p>
        )}
        {refreshError && (
          <p className="mt-2 flex items-center gap-2 rounded-lg border border-hairline px-3 py-2 text-xs text-ink-muted">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warm-ink" />
            {refreshError}
          </p>
        )}
      </section>

      {/* ── Dead-letter triage ── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Dead-letter &amp; failed jobs</h2>
          <span className="font-mono text-2xs text-ink-muted">
            {deadLetter.length} job{deadLetter.length === 1 ? "" : "s"} awaiting triage
          </span>
        </div>
        {notice && (
          <p
            className={`mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              notice.tone === "ok"
                ? "border-hairline text-ink"
                : "border-border-error bg-error-soft text-error-ink"
            }`}
          >
            {notice.tone === "ok" ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-mark-active" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            )}
            {notice.text}
          </p>
        )}
        {deadLetter.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-hairline px-4 py-5 text-xs text-ink-muted">
            Nothing has failed permanently. A job lands here only after its retry budget is spent.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {deadLetter.map((job) => (
              <li key={job.id} className="rounded-xl border border-hairline bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-mono text-2xs uppercase tracking-wide ${STATUS_TONE[job.status] ?? "text-muted"}`}>
                        {STATUS_LABEL[job.status] ?? job.status}
                      </span>
                      <span className="font-mono text-2xs text-ink-muted">
                        {job.type} · {shortId(job.id)}
                      </span>
                      <span className="text-2xs text-ink-muted">
                        {job.attempts}/{job.maxAttempts} attempts
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink">
                      {job.taskTitle ? (
                        job.taskId ? (
                          <Link href={`/app/tasks/${job.taskId}`} className="hover:text-brand-ink">
                            {job.taskTitle}
                          </Link>
                        ) : (
                          job.taskTitle
                        )
                      ) : (
                        <span className="text-ink-muted">No task attached</span>
                      )}
                      {job.agentName ? ` · ${job.agentName}` : ""}
                    </p>
                    {job.lastError && (
                      <p className="mt-1 break-words font-mono text-2xs text-error-ink">
                        {job.lastError.slice(0, 400)}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-3xs uppercase tracking-wide text-ink-muted">
                      created {clock(job.createdAt)} · started {clock(job.startedAt)} · last change{" "}
                      {clock(job.updatedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void retry(job)}
                    disabled={retryingId === job.id}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-hairline-strong px-3 text-xs font-medium text-ink transition-colors hover:bg-surface-secondary disabled:opacity-60"
                  >
                    {retryingId === job.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Retry
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Recent jobs ── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Recent jobs</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {[{ key: "all", label: "All" }, ...STATUSES.map((s) => ({ key: s.key, label: s.label }))].map(
              (chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setStatusFilter(chip.key)}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-2xs uppercase tracking-wide transition-colors ${
                    statusFilter === chip.key
                      ? "border-hairline-strong bg-surface-secondary text-ink"
                      : "border-hairline text-ink-muted hover:text-ink"
                  }`}
                >
                  {chip.label}
                </button>
              ),
            )}
          </div>
        </div>

        {shownRecent.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-hairline px-4 py-5 text-xs text-ink-muted">
            {statusFilter === "all"
              ? "The queue is empty. Jobs appear here the moment a founder or Atlas queues work."
              : `No ${STATUS_LABEL[statusFilter] ?? statusFilter} jobs right now.`}
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="mt-3 hidden overflow-x-auto rounded-xl border border-hairline bg-white lg:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-hairline text-2xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Job</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Employee / task</th>
                    <th className="px-3 py-2.5 font-medium">Created</th>
                    <th className="px-3 py-2.5 font-medium">Started</th>
                    <th className="px-3 py-2.5 font-medium">Completed</th>
                    <th className="px-3 py-2.5 font-medium">Retries</th>
                    <th className="px-4 py-2.5 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline-light">
                  {shownRecent.map((job) => (
                    <tr key={job.id} className="align-top">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-2xs text-ink">{shortId(job.id)}</span>
                        <span className="mt-0.5 block font-mono text-3xs uppercase tracking-wide text-ink-muted">
                          {job.type}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 ${STATUS_TONE[job.status] ?? "text-muted"}`}>
                        {STATUS_LABEL[job.status] ?? job.status}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-ink">{job.agentName ?? "—"}</span>
                        <span className="mt-0.5 block truncate text-2xs text-ink-muted">
                          {job.taskTitle ?? (job.taskId ? job.taskId.slice(0, 8) : "no task")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-muted">{timeAgo(job.createdAt)}</td>
                      <td className="px-3 py-2.5 text-ink-muted">{timeAgo(job.startedAt)}</td>
                      <td className="px-3 py-2.5 text-ink-muted">
                        {job.status === "done" || job.status === "dead" || job.status === "failed"
                          ? timeAgo(job.updatedAt)
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-ink-muted">
                        {job.attempts}/{job.maxAttempts}
                      </td>
                      <td className="max-w-[240px] px-4 py-2.5">
                        {job.lastError ? (
                          <span className="break-words font-mono text-2xs text-error-ink" title={job.lastError}>
                            {job.lastError.slice(0, 120)}
                          </span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="mt-3 space-y-2 lg:hidden">
              {shownRecent.map((job) => (
                <li key={job.id} className="rounded-xl border border-hairline bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-2xs text-ink">{shortId(job.id)}</span>
                    <span className={`font-mono text-2xs uppercase tracking-wide ${STATUS_TONE[job.status] ?? "text-muted"}`}>
                      {STATUS_LABEL[job.status] ?? job.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink">{job.taskTitle ?? "No task attached"}</p>
                  <p className="mt-0.5 text-2xs text-ink-muted">
                    {job.agentName ?? "—"} · {job.type}
                  </p>
                  <p className="mt-1 font-mono text-3xs uppercase tracking-wide text-ink-muted">
                    {timeAgo(job.createdAt)} · retries {job.attempts}/{job.maxAttempts}
                  </p>
                  {job.lastError && (
                    <p className="mt-1 break-words font-mono text-2xs text-error-ink">
                      {job.lastError.slice(0, 200)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="flex items-center gap-2 text-2xs text-ink-muted">
        <Pause className="h-3 w-3" />
        This page reads the live queue every 10 seconds while it is open. Nothing here is simulated.
      </p>
    </div>
  );
}
