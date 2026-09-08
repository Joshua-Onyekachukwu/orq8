"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Award,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Loader2,
  Minus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";

/* ── Types ── */

interface ReliabilityProfile {
  agentId: string;
  agentName: string;
  role: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  revisionTasks: number;
  escalatedTasks: number;
  completionRate: number;
  firstPassSuccessRate: number;
  revisionRate: number;
  failureRate: number;
  escalationRate: number;
  averageQAScore: number;
  averageCostPerTask: number;
  totalCreditsUsed: number;
  recentFailureCount: number;
  trend: "improving" | "stable" | "declining";
  history: PerformanceHistoryWindow[];
  autonomyLevel: "trusted" | "watch" | "restricted" | "paused";
  autonomyReason: string;
  recommendation: "KEEP" | "MONITOR" | "IMPROVE" | "RETRAIN / ADJUST" | "REPLACE / ESCALATE";
  recommendationReason: string;
}

interface PerformanceHistoryWindow {
  windowDays: 7 | 30 | 90;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  revisionTasks: number;
  completionRate: number;
  failureRate: number;
  revisionRate: number;
  averageCostPerTask: number;
  noData: boolean;
}

/* ── Helpers ── */

function recommendationBadge(rec: ReliabilityProfile["recommendation"]) {
  switch (rec) {
    case "KEEP": return { label: "Keep", cls: "bg-emerald-50 text-emerald-700" };
    case "MONITOR": return { label: "Monitor", cls: "bg-blue-50 text-blue-700" };
    case "IMPROVE": return { label: "Improve", cls: "bg-amber-50 text-amber-700" };
    case "RETRAIN / ADJUST": return { label: "Retrain / Adjust", cls: "bg-orange-50 text-orange-700" };
    default: return { label: "Replace / Escalate", cls: "bg-red-50 text-red-700" };
  }
}

function trendBadge(trend: ReliabilityProfile["trend"]) {
  switch (trend) {
    case "improving": return { icon: TrendingUp, cls: "text-emerald-600", label: "Improving" };
    case "declining": return { icon: TrendingDown, cls: "text-red-600", label: "Declining" };
    default: return { icon: Minus, cls: "text-muted", label: "Stable" };
  }
}

function autonomyBadge(level: ReliabilityProfile["autonomyLevel"]) {
  switch (level) {
    case "trusted": return { label: "Trusted", cls: "bg-emerald-50 text-emerald-700" };
    case "watch": return { label: "Watch", cls: "bg-blue-50 text-blue-700" };
    case "restricted": return { label: "Restricted", cls: "bg-orange-50 text-orange-700" };
    default: return { label: "Paused", cls: "bg-red-50 text-red-700" };
  }
}

function pct(v: number) {
  return `${Math.round(v)}%`;
}

function formatCredits(cents: number) {
  if (cents >= 100000) return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${(cents / 100).toFixed(2)}`;
}

/* ── Page ── */

export default function PerformancePage() {
  const [profiles, setProfiles] = useState<ReliabilityProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [historyWindow, setHistoryWindow] = useState<7 | 30 | 90>(30);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionAutonomy, setActionAutonomy] = useState("");

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quality/reliability");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load performance data");
      setProfiles(json?.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load performance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const runAction = useCallback(async (agentId: string, action: string) => {
    setActionBusy(true);
    setActionMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/performance-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: actionReason.trim() || undefined,
          autonomyLevel: actionAutonomy || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Action rejected by the server");
        return;
      }
      setActionMessage(
        action === "replace"
          ? "AI employee archived. Historical performance is preserved."
          : action === "improve"
            ? "Improvement action applied. Re-run the review later to see the effect."
            : action === "set_autonomy"
              ? "Autonomy level updated."
              : "KEEP confirmed for this AI employee.",
      );
      setActionReason("");
      setActionAutonomy("");
      await fetchProfiles();
    } catch {
      setError("Backend unavailable");
    } finally {
      setActionBusy(false);
    }
  }, [actionReason, actionAutonomy, fetchProfiles]);

  const needsAttention = profiles.filter(p => p.recommendation !== "KEEP" && p.recommendation !== "MONITOR");
  const visible = filter === "attention" ? needsAttention : profiles;
  const selected = profiles.find(p => p.agentId === selectedId) ?? null;

  const avgQuality = profiles.length
    ? Math.round(profiles.reduce((s, p) => s + p.averageQAScore, 0) / profiles.length)
    : 0;
  const avgCompletion = profiles.length
    ? Math.round(profiles.reduce((s, p) => s + p.completionRate, 0) / profiles.length)
    : 0;
  const avgCost = profiles.length
    ? Math.round(profiles.reduce((s, p) => s + p.averageCostPerTask, 0) / profiles.length)
    : 0;

  const summaryCards = [
    { icon: Users, label: "AI employees", value: profiles.length, hint: "with performance data" },
    { icon: Award, label: "Avg quality score", value: profiles.length ? `${avgQuality}/100` : "—", hint: "from real QA reviews" },
    { icon: CheckCircle2, label: "Avg completion rate", value: profiles.length ? pct(avgCompletion) : "—", hint: "across all employees" },
    { icon: CircleDollarSign, label: "Avg cost / task", value: profiles.length ? formatCredits(avgCost) : "—", hint: "from credit usage" },
  ];

  return (
    <PageErrorBoundary pageName="Performance">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orq8-lime/10">
                <Gauge aria-hidden="true" className="h-4.5 w-4.5 text-orq8-green" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight text-ink">AI Employee Performance</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Real performance data from your workforce — quality reviews, completion, revisions, failures and cost. Recommendations are derived from these metrics, never hard-coded.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchProfiles}
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

        {/* Summary */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {summaryCards.map(c => (
            <div key={c.label} className="rounded-xl border border-hairline bg-white p-4">
              <div className="flex items-center gap-1.5 text-3xs font-medium uppercase tracking-wide text-muted">
                <c.icon className="h-3 w-3" aria-hidden="true" />
                {c.label}
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ink">{c.value}</p>
              <p className="mt-1 text-3xs text-muted">{c.hint}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filter === "all" ? "bg-ink text-white" : "border border-hairline bg-white text-muted hover:text-ink"}`}
          >
            All employees ({profiles.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("attention")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filter === "attention" ? "bg-ink text-white" : "border border-hairline bg-white text-muted hover:text-ink"}`}
          >
            Needs attention ({needsAttention.length})
          </button>
        </div>

        {/* Roster */}
        <div className="mt-4 grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2 space-y-2">
            {loading && !profiles.length ? (
              <div className="rounded-xl border border-hairline bg-white p-8 text-center">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted" aria-hidden="true" />
                <p className="mt-2 text-xs text-muted">Loading performance data…</p>
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-hairline bg-white p-8 text-center">
                <Bot className="mx-auto h-8 w-8 text-muted/30" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-ink">No AI employees yet</p>
                <p className="mt-1 text-xs text-muted">Hire AI employees and give them tasks — performance profiles build from real execution data.</p>
              </div>
            ) : (
              visible.map(p => {
                const rec = recommendationBadge(p.recommendation);
                const tr = trendBadge(p.trend);
                return (
                  <button
                    key={p.agentId}
                    type="button"
                    onClick={() => setSelectedId(p.agentId)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedId === p.agentId ? "border-orq8-green bg-orq8-lime/5" : "border-hairline bg-white hover:bg-canvas"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/10">
                          <Bot className="h-4 w-4 text-muted" aria-hidden="true" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-ink">{p.agentName}</p>
                          <p className="text-3xs text-muted">{p.role}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-3xs font-semibold uppercase ${rec.cls}`}>{rec.label}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="font-mono text-sm font-semibold tabular-nums text-ink">{p.totalTasks}</p>
                        <p className="text-3xs text-muted">Tasks</p>
                      </div>
                      <div>
                        <p className="font-mono text-sm font-semibold tabular-nums text-ink">{p.averageQAScore}</p>
                        <p className="text-3xs text-muted">Quality</p>
                      </div>
                      <div>
                        <p className="font-mono text-sm font-semibold tabular-nums text-ink">{pct(p.revisionRate)}</p>
                        <p className="text-3xs text-muted">Revised</p>
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <tr.icon className="h-3.5 w-3.5" aria-hidden="true" />
                        <p className="text-3xs font-medium text-muted">{tr.label}</p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Detail */}
          <div className="lg:col-span-3">
            {!selected ? (
              <div className="rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
                <UserCheck className="mx-auto h-10 w-10 text-muted/30" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-ink">Select an AI employee</p>
                <p className="mt-1 text-xs text-muted">See their quality, reliability, cost and what we recommend based on real data.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-hairline bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/10">
                      <Bot className="h-5 w-5 text-muted" aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="text-base font-semibold text-ink">{selected.agentName}</h2>
                      <p className="text-xs text-muted">{selected.role}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2.5 py-1 text-3xs font-semibold uppercase ${recommendationBadge(selected.recommendation).cls}`}>
                      {recommendationBadge(selected.recommendation).label}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-3xs font-semibold uppercase ${autonomyBadge(selected.autonomyLevel).cls}`}>
                      {autonomyBadge(selected.autonomyLevel).label}
                    </span>
                  </div>
                </div>

                {/* Recommendation */}
                <div className="mt-4 rounded-lg border border-orq8-lime/30 bg-orq8-lime/5 p-3">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-orq8-green" aria-hidden="true" />
                    <p className="text-3xs font-semibold uppercase tracking-wide text-orq8-green">Recommendation</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink">{selected.recommendationReason}</p>
                </div>

                {/* Performance history */}
                <div className="mt-5 rounded-lg border border-hairline bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-orq8-green" aria-hidden="true" />
                      <p className="text-3xs font-semibold uppercase tracking-wide text-muted">Performance over time</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {([7, 30, 90] as const).map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setHistoryWindow(d)}
                          className={`rounded-full px-2.5 py-1 text-3xs font-medium transition-colors ${historyWindow === d ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>
                  {(() => {
                    const win = selected.history?.find(h => h.windowDays === historyWindow);
                    if (!win) return <p className="mt-2 text-xs text-muted">History is not available yet — it builds from real task and revision data over time.</p>;
                    if (win.noData) {
                      return (
                        <p className="mt-2 text-xs text-muted">
                          No recorded activity in the last {historyWindow} days — the window is empty rather than estimated.
                        </p>
                      );
                    }
                    return (
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {[
                          { label: "Tasks", value: String(win.totalTasks), hint: "in window" },
                          { label: "Completion", value: pct(win.completionRate), hint: `${win.completedTasks} completed` },
                          { label: "Failures", value: pct(win.failureRate), hint: `${win.failedTasks} failed` },
                          { label: "Revised", value: pct(win.revisionRate), hint: `${win.revisionTasks} revised` },
                          { label: "Cost / task", value: formatCredits(win.averageCostPerTask), hint: "credit usage" },
                        ].map(m => (
                          <div key={m.label} className="rounded-lg border border-hairline bg-canvas/50 p-2.5">
                            <p className="text-3xs font-medium uppercase tracking-wide text-muted">{m.label}</p>
                            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-ink">{m.value}</p>
                            <p className="text-3xs text-muted">{m.hint}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Metrics */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { label: "Quality score", value: `${selected.averageQAScore}/100`, hint: "avg from QA reviews" },
                    { label: "Completion rate", value: pct(selected.completionRate), hint: `${selected.completedTasks}/${selected.totalTasks} tasks` },
                    { label: "First-pass success", value: pct(selected.firstPassSuccessRate), hint: "passed QA first time" },
                    { label: "Revision rate", value: pct(selected.revisionRate), hint: `${selected.revisionTasks} tasks revised` },
                    { label: "Failure rate", value: pct(selected.failureRate), hint: `${selected.failedTasks} failed` },
                    { label: "Escalation rate", value: pct(selected.escalationRate), hint: `${selected.escalatedTasks} escalated` },
                    { label: "Avg cost / task", value: formatCredits(selected.averageCostPerTask), hint: "credit usage" },
                    { label: "Total credits", value: formatCredits(selected.totalCreditsUsed), hint: "lifetime usage" },
                    { label: "Recent failures", value: `${selected.recentFailureCount}`, hint: "of last 10 tasks" },
                  ].map(m => (
                    <div key={m.label} className="rounded-lg border border-hairline bg-canvas/50 p-3">
                      <p className="text-3xs font-medium uppercase tracking-wide text-muted">{m.label}</p>
                      <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-ink">{m.value}</p>
                      <p className="text-3xs text-muted">{m.hint}</p>
                    </div>
                  ))}
                </div>

                {/* Autonomy */}
                <div className="mt-4 rounded-lg border border-hairline bg-white p-3">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-orq8-green" aria-hidden="true" />
                    <p className="text-3xs font-semibold uppercase tracking-wide text-muted">Autonomy</p>
                  </div>
                  <p className="mt-1 text-xs text-ink">{selected.autonomyReason}</p>
                </div>

                {/* Founder actions (audited) */}
                <div className="mt-4 rounded-lg border border-hairline bg-white p-3">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-orq8-green" aria-hidden="true" />
                    <p className="text-3xs font-semibold uppercase tracking-wide text-muted">Founder actions</p>
                    <span className="text-3xs text-muted">· every action is audited server-side</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Recommendation: <span className="font-medium text-ink">{selected.recommendation}</span>. Act on it below — replacing archives the employee but never deletes historical performance.
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => runAction(selected.agentId, "confirm_keep")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Keep
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => runAction(selected.agentId, "improve")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                    >
                      <TrendingUp className="h-3.5 w-3.5" /> Improve
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => runAction(selected.agentId, "replace")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" /> Replace (archive)
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      placeholder="Reason (recorded in the audit trail)"
                      className="rounded-lg border border-hairline bg-white px-3 py-2 text-xs outline-none focus:border-orq8-green"
                    />
                    <select
                      value={actionAutonomy}
                      onChange={(e) => setActionAutonomy(e.target.value)}
                      className="rounded-lg border border-hairline bg-white px-2 py-2 text-xs outline-none focus:border-orq8-green"
                    >
                      <option value="">Autonomy unchanged</option>
                      <option value="observe">L0 Observe</option>
                      <option value="recommend">L1 Recommend</option>
                      <option value="draft">L2 Draft</option>
                      <option value="execute_with_approval">L3 Execute with approval</option>
                      <option value="autonomous">L4 Autonomous</option>
                    </select>
                  </div>
                  {actionMessage && <p className="mt-2 text-xs text-emerald-700">{actionMessage}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageErrorBoundary>
  );
}