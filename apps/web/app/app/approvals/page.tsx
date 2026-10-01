"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import { AlertCircle, Check, ChevronDown, Loader2, RefreshCw, X } from "lucide-react";
import { useRealtime } from "../../../hooks/use-realtime";

/**
 * The gate queue (docs/71 §J, marketing/headquarters-mock-v2.html
 * `screen-approvals`).
 *
 * Every card names what it blocks and what approving it does — the API
 * resolves `gatedWork` (migration 0036) so a founder never rules on a sentence
 * with no object. Silence is never consent: nothing here auto-approves, and a
 * gate that is never decided leaves its work paused.
 */

// The work a decision moves (migration 0036).
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

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "unknown";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** What opened the gate — derived from the row, never invented. */
function triggerLabel(approval: Approval): string {
  if (approval.gatedWork?.toolId) return "tool call";
  if (approval.cost > 0) return "spend";
  return "action";
}

/** What approving actually does, from the gated work the API resolved. */
function approvalEffect(approval: Approval): string {
  if (approval.gatedWork?.taskId) return "the blocked task resumes";
  if (approval.gatedWork?.toolId) return `the tool runs: ${approval.gatedWork.toolId}`;
  return "the requested action proceeds";
}

function riskTone(risk: string): string {
  if (risk === "high") return "var(--orq-error)";
  if (risk === "medium") return "var(--orq-warm)";
  return "var(--orq-text-secondary)";
}

const PARAM_PREVIEW_LIMIT = 400;

/**
 * A tool argument, rendered as it will be sent. Approving "send the email"
 * without seeing the recipient and the body is not approving anything
 * specific, so the exact call is shown rather than summarised.
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
    <div className="mt-2 rounded-md border border-hairline bg-canvas p-3">
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
  const [tab, setTab] = useState<"open" | "decided">("open");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/approvals?limit=200");
      if (!res.ok) throw new Error("Failed to fetch approvals");
      const json = await res.json();
      setApprovals(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  // Auto-refresh when new approvals arrive via SSE.
  const { connected } = useRealtime({
    onEvent: useCallback(
      (event: any) => {
        if (event.type === "approval.created" || event.type === "approval.decided") {
          fetchApprovals();
        }
      },
      [fetchApprovals],
    ),
  });

  const handleDecision = async (id: string, status: "approved" | "rejected") => {
    if (processingId) return;
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
      setApprovals((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status, decidedAt: new Date().toISOString() } : a)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update approval");
    } finally {
      setProcessingId(null);
    }
  };

  const open = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");
  const visible = tab === "open" ? open : decided;

  return (
    <PageErrorBoundary pageName="Approvals" backHref="/app">
      <div className="space-y-4">
        <header className="console-card flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Decision center · {open.length} open
              {connected && (
                <span className="ml-2 inline-flex items-center gap-1.5">
                  <span className="state-dot" data-state="working" />
                  live
                </span>
              )}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Approvals</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              The gate queue. Nothing here approves itself — open gates pause the work and tell the
              requester. Every card names what it blocks and what a decision does.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchApprovals}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary disabled:opacity-40"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {/* The policy, stated where the decision happens. */}
        <div className="console-card flex items-start gap-3 p-4">
          <span className="state-dot mt-1.5" data-state="waiting" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ink">Silence is never consent.</p>
            <p className="mt-0.5 text-xs text-muted">
              If you do not decide, the work stays paused and the requester is told. Gates never
              auto-approve.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-error-soft bg-error-soft/40 px-3.5 py-2.5">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-error-ink" />
            <p className="text-sm text-error-ink">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto text-2xs text-muted transition-colors hover:text-ink"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "open", label: "Open", count: open.length },
              { key: "decided", label: "Decided", count: decided.length },
            ] as const
          ).map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-hairline-strong bg-elevated text-ink"
                    : "border-hairline text-muted hover:border-hairline-strong hover:text-ink"
                }`}
              >
                {t.label}
                <span className="ml-1.5 font-mono text-2xs text-muted">{t.count}</span>
              </button>
            );
          })}
        </div>

        {loading && approvals.length === 0 ? (
          <div className="console-card flex items-center gap-3 p-6">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-muted" />
            <p className="text-sm text-muted">Loading the queue…</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="console-card p-6">
            <p className="text-sm text-ink">
              {tab === "open" ? "Nothing is waiting on you." : "No decisions recorded yet."}
            </p>
            <p className="mt-1 text-xs text-muted">
              {tab === "open"
                ? "Work that needs your authority pauses here and names what it is blocking."
                : "Approved and rejected gates appear here, with the note you left."}
            </p>
          </div>
        ) : tab === "open" ? (
          <ul className="space-y-3">
            {visible.map((approval) => {
              const busy = processingId === approval.id;
              const expanded = expandedId === approval.id;
              return (
                <li key={approval.id} className="console-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-2xs uppercase tracking-wide text-muted">
                      {triggerLabel(approval)}
                    </span>
                    <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-2xs uppercase tracking-wide text-muted">
                      gate #{approval.id.slice(0, 8)}
                    </span>
                    <span
                      className="font-mono text-2xs uppercase tracking-wide"
                      style={{ color: riskTone(approval.riskLevel) }}
                    >
                      {approval.riskLevel} risk
                    </span>
                    <span className="ml-auto font-mono text-2xs text-muted">
                      opened {formatTimeAgo(approval.createdAt)}
                    </span>
                  </div>

                  <p className="mt-2.5 text-sm font-semibold text-ink">{approval.action}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {approval.agentName ? (
                      <>
                        <span className="text-ink">{approval.agentName}</span>
                        {approval.description ? " — " : " asks for your decision."}
                      </>
                    ) : null}
                    {approval.description}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span>
                      Cost:{" "}
                      <span className="text-ink">
                        {approval.cost > 0 ? formatCost(approval.cost) : "Free"}
                      </span>
                    </span>
                    {approval.gatedWork?.taskId && (
                      <span>
                        Blocks:{" "}
                        <Link
                          href={`/app/tasks/${approval.gatedWork.taskId}`}
                          className="text-ink transition-colors hover:text-brand-ink"
                        >
                          {approval.gatedWork.taskTitle ?? `task ${approval.gatedWork.taskId.slice(0, 8)}`}
                        </Link>
                      </span>
                    )}
                    {approval.gatedWork?.toolId && approval.gatedWork.taskId && (
                      <span>
                        Tool: <span className="text-ink">{approval.gatedWork.toolId}</span>
                      </span>
                    )}
                    <span>
                      If approved: <span className="text-ink">{approvalEffect(approval)}</span>
                    </span>
                  </div>

                  {(approval.gatedWork?.toolParams !== undefined &&
                    approval.gatedWork?.toolParams !== null) ||
                  approval.description ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : approval.id)}
                        aria-expanded={expanded}
                        className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-ink"
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                        />
                        {expanded ? "Hide context" : "Show full context"}
                      </button>
                      {expanded && (
                        <>
                          {approval.description && (
                            <p className="mt-2 text-xs leading-relaxed text-muted">
                              {approval.description}
                            </p>
                          )}
                          {approval.gatedWork?.toolParams !== undefined &&
                            approval.gatedWork?.toolParams !== null && (
                              <ToolCallDetails params={approval.gatedWork.toolParams} />
                            )}
                        </>
                      )}
                    </div>
                  ) : null}

                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDecision(approval.id, "rejected")}
                      disabled={busy}
                      className="btn-ghost-danger inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecision(approval.id, "approved")}
                      disabled={busy}
                      className="btn-ghost-white inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Approve
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="console-card overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="px-4 py-2.5 font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                    When
                  </th>
                  <th className="px-4 py-2.5 font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                    Gate
                  </th>
                  <th className="px-4 py-2.5 font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                    Decision
                  </th>
                  <th className="px-4 py-2.5 font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((approval) => (
                  <tr key={approval.id} className="border-b border-hairline last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                      {formatDate(approval.decidedAt ?? approval.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-ink">
                        #{approval.id.slice(0, 8)} · {triggerLabel(approval)}
                      </span>
                      <span className="mt-0.5 block text-muted">{approval.action}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 font-mono text-2xs uppercase tracking-wide"
                        style={{
                          color:
                            approval.status === "rejected"
                              ? "var(--orq-error)"
                              : approval.status === "approved"
                                ? "var(--orq-text-primary)"
                                : "var(--orq-text-secondary)",
                        }}
                      >
                        <span
                          className="state-dot"
                          data-state={approval.status === "approved" ? "working" : approval.status === "rejected" ? "blocked" : ""}
                        />
                        {approval.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {approval.decisionNote ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageErrorBoundary>
  );
}
