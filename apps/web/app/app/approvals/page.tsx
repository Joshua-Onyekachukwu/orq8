"use client";

import { useState, useEffect, useCallback } from "react";
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

interface Approval {
  id: string;
  agentId: string | null;
  action: string;
  description: string | null;
  cost: number;
  riskLevel: string;
  status: string;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
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
  if (risk === "high") return "bg-red-100 text-red-700";
  if (risk === "medium") return "bg-amber-50 text-amber-700";
  return "bg-emerald/15 text-emerald-700";
}

function statusBadge(status: string) {
  if (status === "approved") return "bg-emerald/15 text-emerald-700";
  if (status === "rejected") return "bg-red-100 text-red-600";
  if (status === "modified") return "bg-indigo-50 text-indigo-700";
  if (status === "expired") return "bg-gray-100 text-gray-500";
  return "bg-amber-50 text-amber-700";
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
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
            Decision Center · {pending.length} pending
            {connected && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald/70">
                <span className="h-1 w-1 rounded-full bg-emerald animate-pulse" />
                Live
              </span>
            )}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Approval Queue
          </h1>
          <p className="mt-1 text-sm text-muted">
            Every action that needs your sign-off. Review what the AI wants to do,
            why it wants to do it, and what it costs — then approve, modify, or reject.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchApprovals}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
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
                ? "bg-navy-900 text-white"
                : "bg-white text-muted hover:bg-canvas hover:text-ink"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

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
            <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Needs your decision ({pending.length})
            </h2>
            <div className="space-y-3">
              {pending.map((a) => (
                <article
                  key={a.id}
                  className="rounded-xl border border-amber-200 bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50">
                        <Clock className="h-5 w-5 text-amber-600" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-ink">{a.action}</h3>
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${riskBadge(a.riskLevel)}`}
                          >
                            {a.riskLevel} risk
                          </span>
                        </div>
                        {a.description && (
                          <p className="mt-1 text-sm text-muted">{a.description}</p>
                        )}
                        <div className="mt-2 flex items-center gap-4 text-xs text-muted">
                          <span>Cost: {formatCost(a.cost)}</span>
                          <span>Created: {formatDate(a.createdAt)}</span>
                          {a.agentId && (
                            <span>Agent: #{a.agentId.slice(0, 8)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecision(a.id, "approved")}
                        disabled={processingId === a.id}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald px-3 py-2 text-xs font-semibold text-navy-950 transition-colors hover:bg-emerald/80 disabled:opacity-50"
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
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
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
          <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Past decisions ({decided.length})
          </h2>
          <div className="overflow-hidden rounded-xl border border-hairline bg-white">
            <table className="w-full">
              <thead>
                <tr className="bg-canvas text-left">
                  {["Action", "Risk", "Cost", "Status", "Decided"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
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
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${riskBadge(a.riskLevel)}`}
                      >
                        {a.riskLevel}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs tabular-nums text-muted">
                      {formatCost(a.cost)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${statusBadge(a.status)}`}
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
