"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  CalendarDays,
  AlertCircle,
  RefreshCw,
  Activity,
  ClipboardCheck,
  Users,
  CircleDollarSign,
} from "lucide-react";

interface ActivityEvent {
  id: number;
  type: string;
  summary: string;
  reason: string | null;
  cost: number;
  department: string | null;
  occurredAt: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  tasksCompleted: number;
  weeklyCost: number;
}

interface Approval {
  id: string;
  action: string;
  status: string;
  riskLevel: string;
  cost: number;
}

interface ReportData {
  activity: ActivityEvent[];
  agents: Agent[];
  approvals: Approval[];
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activityRes, agentsRes, approvalsRes] = await Promise.all([
        fetch("/api/activity?limit=50"),
        fetch("/api/agents"),
        fetch("/api/approvals"),
      ]);

      const activity = activityRes.ok ? (await activityRes.json()).data ?? [] : [];
      const agents = agentsRes.ok ? (await agentsRes.json()).data ?? [] : [];
      const approvals = approvalsRes.ok ? (await approvalsRes.json()).data ?? [] : [];

      setData({ activity, agents, approvals });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const reportDate = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const completedActions = data?.activity.filter((e) =>
    e.type.toLowerCase().includes("completed") ||
    e.type.toLowerCase().includes("deployed") ||
    e.type.toLowerCase().includes("drafted") ||
    e.type.toLowerCase().includes("analyzed")
  ) ?? [];

  const pendingApprovals = data?.approvals.filter((a) => a.status === "pending") ?? [];
  const approvedActions = data?.approvals.filter((a) => a.status === "approved") ?? [];
  const rejectedActions = data?.approvals.filter((a) => a.status === "rejected") ?? [];
  const activeAgents = data?.agents.filter((a) => a.status === "active") ?? [];
  const totalSpend = data?.activity.reduce((sum, e) => sum + e.cost, 0) ?? 0;

  // Group activity by department
  const byDepartment = data?.activity.reduce((acc, e) => {
    const dept = e.department ?? "Unassigned";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(e);
    return acc;
  }, {} as Record<string, ActivityEvent[]>) ?? {};

  return (
    <PageErrorBoundary pageName="Weekly Report" backHref="/app">
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
            Executive summary
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Weekly Report
          </h1>
          <p className="mt-1 text-sm text-muted">
            The week in one page. What happened, what&apos;s blocked, what it cost,
            and what&apos;s next.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchReport}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      {/* Error state */}
      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-hairline bg-white p-5">
              <div className="space-y-3">
                <div className="h-4 w-1/3 rounded bg-hairline" />
                <div className="h-3 w-2/3 rounded bg-hairline" />
                <div className="h-3 w-1/2 rounded bg-hairline" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          {/* Report header */}
          <div className="mt-6 rounded-xl bg-navy-950 p-6 text-white sm:p-8">
            <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
              <CalendarDays className="h-3.5 w-3.5" />
              {reportDate}
            </p>
            <h2 className="mt-2 text-xl font-semibold">Weekly Executive Report</h2>
            <p className="mt-1 text-sm text-white/60">
              Generated from your organization&apos;s live activity data.
            </p>
          </div>

          {/* Key metrics */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-hairline bg-white p-4">
              <Activity className="h-5 w-5 text-emerald" />
              <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Total actions
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                {data.activity.length}
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-white p-4">
              <Users className="h-5 w-5 text-indigo-600" />
              <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Active agents
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                {activeAgents.length}
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-white p-4">
              <ClipboardCheck className="h-5 w-5 text-amber-600" />
              <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Decisions made
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                {approvedActions.length + rejectedActions.length}
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-white p-4">
              <CircleDollarSign className="h-5 w-5 text-amber-600" />
              <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Total spend
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                {formatCost(Math.round(totalSpend * 100))}
              </p>
            </div>
          </div>

          {/* What happened */}
          <section className="mt-6 rounded-xl border border-hairline bg-white p-5">
            <h3 className="text-sm font-semibold text-ink">What happened this week</h3>
            {completedActions.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No completed actions recorded yet. Actions will appear here as your
                AI workforce executes tasks.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {completedActions.slice(0, 10).map((e) => (
                  <li key={e.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" />
                    <span className="text-ink">{e.summary}</span>
                    {e.reason && (
                      <span className="text-xs text-muted">— {e.reason}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* What needs attention */}
          <section className="mt-6 rounded-xl border border-hairline bg-white p-5">
            <h3 className="text-sm font-semibold text-ink">
              What needs your attention
            </h3>
            {pendingApprovals.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No pending approvals. All decisions are up to date.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {pendingApprovals.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4 text-amber-600" />
                      <span className="text-sm text-ink">{a.action}</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-700">
                        {a.riskLevel}
                      </span>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-muted">
                      {formatCost(a.cost)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* By department */}
          {Object.keys(byDepartment).length > 0 && (
            <section className="mt-6 rounded-xl border border-hairline bg-white p-5">
              <h3 className="text-sm font-semibold text-ink">
                Activity by department
              </h3>
              <div className="mt-3 space-y-4">
                {Object.entries(byDepartment).map(([dept, events]) => (
                  <div key={dept}>
                    <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                      {dept} ({events.length} actions)
                    </p>
                    <ul className="space-y-1">
                      {events.slice(0, 5).map((e) => (
                        <li key={e.id} className="flex items-center gap-2 text-sm text-ink">
                          <span className="h-1 w-1 rounded-full bg-emerald" />
                          {e.summary}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Agent performance */}
          {activeAgents.length > 0 && (
            <section className="mt-6 rounded-xl border border-hairline bg-white p-5">
              <h3 className="text-sm font-semibold text-ink">Agent performance</h3>
              <div className="mt-3 overflow-hidden rounded-lg border border-hairline">
                <table className="w-full">
                  <thead>
                    <tr className="bg-canvas">
                      {["Agent", "Tasks", "Spend", "Status"].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {activeAgents.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-ink">{a.name}</p>
                          <p className="text-xs text-muted">{a.role}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm tabular-nums text-ink">
                          {a.tasksCompleted}
                        </td>
                        <td className="px-4 py-3 font-mono text-sm tabular-nums text-ink">
                          {formatCost(a.weeklyCost)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-xs text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
                            Active
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Report footer */}
          <div className="mt-6 rounded-xl border border-navy-800 bg-navy-950 p-5 text-white">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald">
              Note
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              This report is generated from your organization&apos;s live data.
              As more AI employees execute tasks and more decisions are made,
              this report will become increasingly detailed and actionable.
            </p>
          </div>
        </>
      )}
    </div>
    </PageErrorBoundary>
  );
}
