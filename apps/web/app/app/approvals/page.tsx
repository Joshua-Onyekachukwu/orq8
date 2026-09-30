"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Check,
  X,
  PencilLine,
  Loader2,
  AlertCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
  Zap,
} from "lucide-react";
import { useRealtime } from "../../../hooks/use-realtime";

// The work a decision moves (migration 0036). Resolved by the API so a card can
// name what it blocks instead of showing the founder a sentence and asking them
// to rule on it.
interface GatedWork {
  taskId: string | null;
  taskTitle: string | null;
  taskStatus: string | null;
  toolId: string | null;
  toolParams: unknown;
}

interface Approval {
  id: string;
  agentId: string | null;
  /** The requesting agent's name, resolved by the API for the whole page. */
  agentName?: string | null;
  action: string;
  description: string | null;
  cost: number;
  riskLevel: string;
  status: string;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  gatedWork?: GatedWork | null;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Unknown";
  }
}

function riskBadge(risk: string) {
  if (risk === "high") return "bg-error-soft text-error-ink";
  if (risk === "medium") return "bg-warm-soft text-warm-ink";
  return "bg-warm/10 text-warm-ink";
}

function statusBadge(status: string) {
  if (status === "approved") return "bg-brand-deep/10 text-brand-ink";
  if (status === "rejected") return "bg-error-soft text-error-ink";
  if (status === "modified") return "bg-brand-soft text-brand-deep";
  if (status === "expired") return "bg-hairline text-muted";
  return "bg-warm/10 text-warm-ink";
}

const PARAM_PREVIEW_LIMIT = 400;

/**
 * A tool argument, rendered as it will be sent.
 *
 * Approving "send the email" without seeing the recipient and the body is not
 * approving anything specific — migration 0036 stores the exact call for this
 * reason, so the card shows it rather than summarising it. Long values are cut
 * at a readable limit with an ellipsis, not rewritten.
 */
function renderParamValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function ToolCallDetails({ params }: { params: unknown }) {
  const entries: Array<[string, unknown]> =
    params && typeof params === "object" && !Array.isArray(params)
      ? Object.entries(params as Record<string, unknown>)
      : [["payload", params]];

  return (
    <div className="mt-2 rounded-lg border border-hairline bg-canvas p-3">
      <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
        The exact call
      </p>
      <dl className="mt-1.5 space-y-1">
        {entries.map(([key, value]) => {
          const shown = renderParamValue(value);
          return (
            <div key={key} className="flex flex-wrap gap-x-2 text-xs">
              <dt className="shrink-0 font-mono text-muted">{key}</dt>
              <dd className="min-w-0 break-words text-ink">
                {shown.length > PARAM_PREVIEW_LIMIT
                  ? `${shown.slice(0, PARAM_PREVIEW_LIMIT)}…`
                  : shown}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = filter === "all" ? "/api/approvals" : `/api/approvals?status=${filter}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch approvals");
      const json = await res.json();
      setApprovals(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  // Auto-refresh when new approvals arrive via SSE
  const { connected } = useRealtime({
    onEvent: useCallback(
      (event: any) => {
        if (
          event.type === "approval.created" ||
          event.type === "approval.decided"
        ) {
          fetchApprovals();
        }
      },
      [fetchApprovals]
    ),
  });

  const handleDecision = async (id: string, status: "approved" | "rejected") => {
    if (processingId) return; // Prevent double-click
    setProcessingId(id);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to update approval");
      }
      // Update local state immediately
      setApprovals((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status, decidedAt: new Date().toISOString() }
            : a
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update approval");
    } finally {
      setProcessingId(null);
    }
  };

  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");

  return (
    <PageErrorBoundary pageName="Decision Center" backHref="/app">
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-brand-ink">
            Decision Center · {pending.length} pending
            {connected && (
              <span className="ml-2 inline-flex items-center gap-1 text-brand-ink/70">
                <span className="h-1 w-1 rounded-full bg-brand-soft animate-pulse" />
                Live
              </span>
            )}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Approval Queue
          </h1>
          <p className="mt-1 text-sm text-muted">
            Every action your AI workforce wants to take. Review what the agent proposes,
            why it matters, and what it costs — then approve, modify, or reject.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchApprovals}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      {/* Filter tabs */}
      <div className="mt-6 flex gap-2">
        {(["all", "pending", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f
                ? "ink text-white"
                : "bg-white text-muted hover:bg-canvas hover:text-ink"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border-error bg-error-soft px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-error-ink" />
          <p className="text-sm text-error-ink">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-xs text-error-ink hover:text-error-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && approvals.length === 0 && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-hairline bg-white p-5">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-hairline" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-hairline" />
                  <div className="h-3 w-2/3 rounded bg-hairline" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && approvals.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted/30" />
          <p className="mt-4 text-sm font-medium text-ink">No approval requests</p>
          <p className="mt-1 text-sm text-muted">
            When AI employees propose actions that need your sign-off, they&apos;ll
            appear here with full context and cost preview.
          </p>
        </div>
      )}

      {/* Pending approvals */}
      {!loading && pending.length > 0 && filter !== "all" && filter !== "pending" ? null : (
        pending.length > 0 && (
          <section className="mt-6" aria-label="Pending approvals">
            <h2 className="mb-3 font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
              Needs your decision ({pending.length})
            </h2>
            <div className="space-y-3">
              {pending.map((a) => (
                <article
                  key={a.id}
                  className="rounded-xl border border-warm bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warm-soft">
                        <Clock className="h-5 w-5 text-warm-ink" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-ink">{a.action}</h3>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-3xs font-semibold uppercase tracking-wide ${riskBadge(a.riskLevel)}`}
                          >
                            {a.riskLevel} risk
                          </span>
                        </div>
                        {a.description && (
                          <p className="mt-1 text-sm text-muted leading-relaxed">{a.description}</p>
                        )}

                        {/* What this decision moves. Absent on older rows that
                            predate migration 0036, so it is not faked. */}
                        {a.gatedWork && (a.gatedWork.taskTitle || a.gatedWork.toolId) && (
                          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-3xs font-semibold uppercase tracking-wide text-muted">
                            <span>Blocks</span>
                            {a.gatedWork.taskId && (
                              <Link
                                href={`/app/tasks/${a.gatedWork.taskId}`}
                                className="normal-case text-brand-ink hover:underline"
                              >
                                {a.gatedWork.taskTitle ??
                                  `task ${a.gatedWork.taskId.slice(0, 8)}`}
                              </Link>
                            )}
                            {a.gatedWork.toolId && (
                              <span className="normal-case text-ink">
                                tool {a.gatedWork.toolId}
                              </span>
                            )}
                            {a.gatedWork.taskStatus && (
                              <span>{a.gatedWork.taskStatus.replace(/_/g, " ")}</span>
                            )}
                          </p>
                        )}

                        {/* The tool call itself, argument by argument. */}
                        {a.gatedWork?.toolId && a.gatedWork.toolParams != null && (
                          <ToolCallDetails params={a.gatedWork.toolParams} />
                        )}

                        {/* Context grid — agent, cost, time, urgency */}
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div className="rounded-lg bg-canvas px-3 py-2">
                            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Requested by</p>
                            <p className="mt-0.5 text-xs font-medium text-ink">
                              {a.agentName ?? (a.agentId ? `Agent #${a.agentId.slice(0, 8)}` : 'System')}
                            </p>
                          </div>
                          <div className="rounded-lg bg-canvas px-3 py-2">
                            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Estimated cost</p>
                            <p className="mt-0.5 text-xs font-medium tabular-nums text-ink">
                              {a.cost > 0 ? formatCost(a.cost) : 'Free'}
                            </p>
                          </div>
                          <div className="rounded-lg bg-canvas px-3 py-2">
                            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Submitted</p>
                            <p className="mt-0.5 text-xs font-medium text-ink">
                              {formatDate(a.createdAt)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-canvas px-3 py-2">
                            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">Request ID</p>
                            <p className="mt-0.5 font-mono text-3xs font-medium text-muted">
                              #{a.id.slice(0, 8)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecision(a.id, "approved")}
                        disabled={processingId === a.id}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-deep px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand disabled:opacity-50"
                      >
                        {processingId === a.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision(a.id, "rejected")}
                        disabled={processingId === a.id}
                        className="flex items-center gap-1.5 rounded-lg border border-border-error px-3 py-2 text-xs font-semibold text-error-ink transition-colors hover:bg-error-soft disabled:opacity-50"
                      >
                        {processingId === a.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                        Reject
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )
      )}

      {/* Decided approvals */}
      {!loading && decided.length > 0 && (
        <section className="mt-6" aria-label="Decided approvals">
          <h2 className="mb-3 font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
            Past decisions ({decided.length})
          </h2>
          <div className="overflow-hidden rounded-xl border border-hairline bg-white">
            <table className="w-full">
              <thead>
                <tr className="bg-canvas text-left">
                  {["Action", "Risk", "Cost", "Status", "Decided"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-5 py-2.5 font-mono text-3xs font-semibold uppercase tracking-[0.14em] text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {decided.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-ink">{a.action}</p>
                      {a.description && (
                        <p className="mt-0.5 text-xs text-muted">{a.description}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-3xs font-semibold uppercase tracking-wide ${riskBadge(a.riskLevel)}`}
                      >
                        {a.riskLevel}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-muted">
                      {formatCost(a.cost)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-3xs font-semibold uppercase tracking-wide ${statusBadge(a.status)}`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs text-muted">
                      {a.decidedAt ? formatDate(a.decidedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
    </PageErrorBoundary>
  );
}
