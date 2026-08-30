"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  ListChecks,
  Users,
  RefreshCw,
  Zap,
} from "lucide-react";
import { ApprovalActions } from "./approval-actions";
import { useRealtime } from "../hooks/use-realtime";

interface Agent {
  id: string;
  name: string;
  role: string;
  department: string | null;
  status: string;
  weeklyCost: number;
  tasksCompleted: number;
  currentTask: string | null;
}

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

interface DashboardRealtimeProps {
  initialStats: {
    activeAgents: number;
    pendingApprovals: number;
    weeklySpend: number;
    recentActivityCount: number;
    totalGoals: number;
    activeGoals: number;
    totalTasks: number;
    completedTasks: number;
    credits: {
      total: number;
      used: number;
      remaining: number;
      utilizationPercent: number;
      isLow: boolean;
      isCritical: boolean;
      daysRemaining: number | null;
    } | null;
  };
  initialApprovals: Approval[];
  initialAgents: Agent[];
  initialActivity: ActivityEvent[];
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--:--";
  }
}

function riskBadge(risk: string) {
  if (risk === "high") return "bg-red-100 text-red-700";
  if (risk === "medium") return "bg-amber-50 text-amber-700";
  return "bg-emerald/15 text-emerald-700";
}

export function DashboardRealtime({
  initialStats,
  initialApprovals,
  initialAgents,
  initialActivity,
}: DashboardRealtimeProps) {
  const [stats, setStats] = useState(initialStats);
  const [approvals, setApprovals] = useState(initialApprovals);
  const [agents, setAgents] = useState(initialAgents);
  const [activity, setActivity] = useState(initialActivity);
  const [flash, setFlash] = useState<string | null>(null);

  // Flash a notification when a real-time event arrives
  const triggerFlash = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
  }, []);

  // Refetch data from the API
  const refetchData = useCallback(async () => {
    try {
      const [agentsRes, approvalsRes, activityRes] = await Promise.all([
        fetch("/api/agents").catch(() => null),
        fetch("/api/approvals?status=pending").catch(() => null),
        fetch("/api/activity?limit=10").catch(() => null),
      ]);

      if (agentsRes?.ok) {
        const json = await agentsRes.json();
        const list = json?.data ?? [];
        setAgents(list);
        setStats((prev) => ({
          ...prev,
          activeAgents: list.filter((a: Agent) => a.status === "active").length,
        }));
      }

      if (approvalsRes?.ok) {
        const json = await approvalsRes.json();
        const list = json?.data ?? [];
        setApprovals(list);
        setStats((prev) => ({
          ...prev,
          pendingApprovals: list.length,
        }));
      }

      if (activityRes?.ok) {
        const json = await activityRes.json();
        const list = json?.data ?? [];
        setActivity(list);
        setStats((prev) => ({
          ...prev,
          recentActivityCount: list.length,
        }));
      }
    } catch {
      // Silently handle — SSE will retry
    }
  }, []);

  // SSE real-time connection
  const { connected } = useRealtime({
    onEvent: useCallback(
      (event: any) => {
        switch (event.type) {
          case "task.completed":
            triggerFlash(`Task completed by ${event.agentName}`);
            refetchData();
            break;
          case "task.failed":
            triggerFlash(`Task failed: ${event.error ?? "Unknown error"}`);
            refetchData();
            break;
          case "approval.created":
            triggerFlash(`New approval request: ${event.action}`);
            refetchData();
            break;
          case "approval.decided":
            triggerFlash(`Approval ${event.status}`);
            refetchData();
            break;
          case "credits.consumed":
            setStats((prev) => ({
              ...prev,
              weeklySpend: prev.weeklySpend + event.amount / 100,
            }));
            break;
          case "agent.status_changed":
            refetchData();
            break;
        }
      },
      [refetchData, triggerFlash]
    ),
  });

  // Initial data sync
  useEffect(() => {
    setStats(initialStats);
    setApprovals(initialApprovals);
    setAgents(initialAgents);
    setActivity(initialActivity);
  }, [initialStats, initialApprovals, initialAgents, initialActivity]);

  const activeAgents = stats.activeAgents;
  const pendingApprovals = stats.pendingApprovals;
  const weeklySpend = stats.weeklySpend;
  const recentActivityCount = stats.recentActivityCount;
  const credits = stats.credits;

  const statCards = [
    {
      label: "Agents active",
      value: String(activeAgents).padStart(2, "0"),
      note: "working right now",
      icon: Users,
      accent: "bg-emerald/10 text-emerald-700",
    },
    {
      label: "Tasks completed",
      value: String(stats.completedTasks).padStart(2, "0"),
      note: `${stats.totalTasks} total tasks`,
      icon: ListChecks,
      accent: "bg-indigo-50 text-indigo-700",
    },
    {
      label: "Weekly spend",
      value: formatCost(Math.round(weeklySpend * 100)),
      note: weeklySpend > 0 ? "this week" : "no spend yet",
      icon: CircleDollarSign,
      accent: "bg-amber-50 text-amber-700",
    },
    {
      label: "Credits remaining",
      value: credits ? String(credits.remaining) : "—",
      note: credits ? `${credits.utilizationPercent}% used` : "no credits yet",
      icon: ClipboardCheck,
      accent: credits?.isCritical ? "bg-red-50 text-red-600" : "bg-red-50 text-red-600",
    },
  ];

  return (
    <>
      {/* Real-time flash notification */}
      {flash && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald/20 bg-emerald/5 px-4 py-2.5 text-sm text-emerald-700 animate-in fade-in slide-in-from-top-2">
          <Zap className="h-4 w-4" />
          {flash}
          <button
            onClick={() => setFlash(null)}
            className="ml-auto text-emerald/50 hover:text-emerald"
          >
            ×
          </button>
        </div>
      )}

      {/* Connection status bar */}
      <div className="mb-4 flex items-center justify-end gap-2">
        <span
          className={`flex items-center gap-1.5 text-[10px] font-medium ${
            connected ? "text-emerald" : "text-muted"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "bg-emerald animate-pulse" : "bg-muted"
            }`}
          />
          {connected ? "Live" : "Offline"}
        </span>
        <button
          onClick={refetchData}
          className="rounded p-1 text-muted transition-colors hover:bg-canvas hover:text-ink"
          title="Refresh data"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded-xl border border-hairline bg-white p-4 sm:p-5"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.accent}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {s.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-navy-900 tabular-nums">
                {s.value}
              </p>
              <p className="mt-0.5 text-xs text-muted">{s.note}</p>
            </div>
          );
        })}
      </div>

      {/* Goals Progress + Credits */}
      {(stats.totalGoals > 0 || credits) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {/* Goals */}
          {stats.totalGoals > 0 && (
            <Link
              href="/app/goals"
              className="rounded-xl border border-hairline bg-white p-5 transition-colors hover:border-emerald/30"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Goals Progress</h3>
                <ArrowUpRight className="h-4 w-4 text-muted" />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted mb-1">
                  <span>{stats.activeGoals} active goals</span>
                  <span className="font-mono">{stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}% task completion</span>
                </div>
                <div className="h-2 rounded-full bg-muted/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald transition-all"
                    style={{ width: `${stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0}%` }}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">
                {stats.completedTasks} of {stats.totalTasks} tasks completed
              </p>
            </Link>
          )}

          {/* Credits */}
          {credits && (
            <Link
              href="/app/budgets"
              className={`rounded-xl border bg-white p-5 transition-colors hover:border-emerald/30 ${
                credits.isCritical ? 'border-red-200' : credits.isLow ? 'border-amber-200' : 'border-hairline'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Work Credits</h3>
                <ArrowUpRight className="h-4 w-4 text-muted" />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted mb-1">
                  <span>{credits.used} of {credits.total} used</span>
                  <span className="font-mono">{credits.utilizationPercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      credits.isCritical ? 'bg-red-500' : credits.isLow ? 'bg-amber-400' : 'bg-emerald'
                    }`}
                    style={{ width: `${Math.min(credits.utilizationPercent, 100)}%` }}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">
                {credits.remaining} credits remaining
                {credits.daysRemaining != null && ` · ~${credits.daysRemaining} days left`}
              </p>
            </Link>
          )}
        </div>
      )}

      {/* Decision Center + Agent Roster */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Pending Approvals */}
        <section
          aria-labelledby="approvals-heading"
          className="rounded-xl border border-hairline bg-white lg:col-span-2"
        >
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <h2
              id="approvals-heading"
              className="text-sm font-semibold text-ink"
            >
              Decision Center
            </h2>
            <Link
              href="/app/approvals"
              className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-800 hover:text-emerald"
            >
              All requests <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {approvals.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <ClipboardCheck className="mx-auto h-8 w-8 text-muted/40" />
              <p className="mt-3 text-sm font-medium text-ink">
                No pending approvals
              </p>
              <p className="mt-1 text-xs text-muted">
                When AI employees propose actions, they&apos;ll appear here for
                your review.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-canvas text-left">
                    {["Request", "What", "Risk", "Cost", "Action"].map((h) => (
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
                  {approvals.slice(0, 5).map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-muted">
                        #{a.id.slice(0, 8)}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm text-ink">
                          <span className="font-semibold">{a.action}</span>
                          {a.description && (
                            <span className="text-muted">
                              {" "}
                              — {a.description}
                            </span>
                          )}
                        </p>
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
                        <ApprovalActions
                          approvalId={a.id}
                          status={a.status}
                          onDecision={() => refetchData()}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Agent Roster */}
        <section className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">AI Workforce</h2>
            <Link
              href="/app/agents"
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-800 hover:text-emerald"
            >
              View all
            </Link>
          </div>
          {agents.length === 0 ? (
            <div className="mt-6 text-center">
              <Users className="mx-auto h-8 w-8 text-muted/40" />
              <p className="mt-3 text-sm font-medium text-ink">No agents yet</p>
              <p className="mt-1 text-xs text-muted">
                Hire your first AI employee to start building your team.
              </p>
              <Link
                href="/app/agents"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-navy-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-lime hover:text-navy-950"
              >
                <Users className="h-3.5 w-3.5" /> Hire an agent
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {agents.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-emerald">
                    {a.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {a.name}
                    </p>
                    <p className="truncate text-xs text-muted">{a.role}</p>
                  </div>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      a.status === "active" ? "bg-emerald" : "bg-muted"
                    }`}
                    title={a.status}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent agent actions */}
      <section
        aria-labelledby="recent-heading"
        className="mt-6 rounded-xl border border-hairline bg-white"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 id="recent-heading" className="text-sm font-semibold text-ink">
            Recent agent actions
          </h2>
          <Link
            href="/app/activity"
            className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-800 hover:text-emerald"
          >
            Full log <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        {activity.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Activity className="mx-auto h-8 w-8 text-muted/40" />
            <p className="mt-3 text-sm font-medium text-ink">No activity yet</p>
            <p className="mt-1 text-xs text-muted">
              Agent actions will appear here as your AI workforce executes tasks.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {activity.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-start gap-4 px-5 py-3.5">
                <time className="mt-0.5 w-11 shrink-0 font-mono text-xs tabular-nums text-muted">
                  {formatTime(a.occurredAt)}
                </time>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-semibold">{a.type}</span>{" "}
                    {a.summary}
                  </p>
                  {a.reason && (
                    <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted">
                      <span
                        aria-hidden
                        className="font-mono font-semibold text-emerald"
                      >
                        because
                      </span>
                      {a.reason}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                  {formatCost(a.cost)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
