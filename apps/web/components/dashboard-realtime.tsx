"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Zap, RefreshCw, ArrowUpRight } from "lucide-react";
import { useRealtime } from "../hooks/use-realtime";
import { DashboardStats } from "./dashboard/StatCards";
import { ApprovalList } from "./dashboard/ApprovalList";
import { AgentRoster } from "./dashboard/AgentRoster";

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

  const triggerFlash = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
  }, []);

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
        setStats((prev) => ({ ...prev, pendingApprovals: list.length }));
      }

      if (activityRes?.ok) {
        const json = await activityRes.json();
        const list = json?.data ?? [];
        setActivity(list);
        setStats((prev) => ({ ...prev, recentActivityCount: list.length }));
      }
    } catch {
      // SSE will retry
    }
  }, []);

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

  useEffect(() => {
    setStats(initialStats);
    setApprovals(initialApprovals);
    setAgents(initialAgents);
    setActivity(initialActivity);
  }, [initialStats, initialApprovals, initialAgents, initialActivity]);

  return (
    <>
      {/* Real-time flash notification */}
      {flash && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-orq8-lime/20 bg-orq8-lime/5 px-4 py-2.5 text-sm text-orq8-green animate-in fade-in slide-in-from-top-2">
          <Zap className="h-4 w-4" />
          {flash}
          <button
            onClick={() => setFlash(null)}
            className="ml-auto text-orq8-green/50 hover:text-orq8-green"
          >
            ×
          </button>
        </div>
      )}

      {/* Connection status bar */}
      <div className="mb-4 flex items-center justify-end gap-2">
        <span
          className={`flex items-center gap-1.5 text-3xs font-medium ${
            connected ? "text-orq8-green" : "text-gray-400"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "bg-orq8-lime animate-pulse" : "bg-gray-300"
            }`}
          />
          {connected ? "Live" : "Offline"}
        </span>
        <button
          onClick={refetchData}
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
          title="Refresh data"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* Stat cards */}
      <DashboardStats
        activeAgents={stats.activeAgents}
        completedTasks={stats.completedTasks}
        totalTasks={stats.totalTasks}
        weeklySpend={stats.weeklySpend}
        credits={stats.credits}
      />

      {/* Goals Progress + Credits */}
      {(stats.totalGoals > 0 || stats.credits) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {stats.totalGoals > 0 && (
            <Link
              href="/app/goals"
              className="rounded-xl border border-gray-100 bg-white p-5 transition-colors hover:border-orq8-lime/30"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Goals Progress</h3>
                <ArrowUpRight className="h-4 w-4 text-gray-400" />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>{stats.activeGoals} active goals</span>
                  <span className="font-mono">
                    {stats.totalTasks > 0
                      ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
                      : 0}
                    % task completion
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-orq8-green transition-all"
                    style={{
                      width: `${
                        stats.totalTasks > 0
                          ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-400">
                {stats.completedTasks} of {stats.totalTasks} tasks completed
              </p>
            </Link>
          )}

          {stats.credits && (
            <Link
              href="/app/budgets"
              className={`rounded-xl border bg-white p-5 transition-colors hover:border-orq8-lime/30 ${
                stats.credits.isCritical
                  ? "border-red-200"
                  : stats.credits.isLow
                  ? "border-amber-200"
                  : "border-gray-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Work Credits</h3>
                <ArrowUpRight className="h-4 w-4 text-gray-400" />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>
                    {stats.credits.used} of {stats.credits.total} used
                  </span>
                  <span className="font-mono">{stats.credits.utilizationPercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      stats.credits.isCritical
                        ? "bg-red-500"
                        : stats.credits.isLow
                        ? "bg-amber-400"
                        : "bg-orq8-green"
                    }`}
                    style={{ width: `${Math.min(stats.credits.utilizationPercent, 100)}%` }}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-400">
                {stats.credits.remaining} credits remaining
                {stats.credits.daysRemaining != null &&
                  ` · ~${stats.credits.daysRemaining} days left`}
              </p>
            </Link>
          )}
        </div>
      )}

      {/* Decision Center + Agent Roster */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <ApprovalList approvals={approvals} onRefresh={refetchData} />
        <AgentRoster agents={agents} />
      </div>
    </>
  );
}
