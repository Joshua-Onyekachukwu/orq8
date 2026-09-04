"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bot, ArrowUpRight, Clock, CheckCircle2, AlertCircle, Zap, Users, Target } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  role: string;
  department: string | null;
  status: string;
  currentTask: string | null;
  tasksCompleted: number;
  weeklyCost: number;
}

interface Approval {
  id: string;
  action: string;
  description: string | null;
  riskLevel: string;
  status: string;
  createdAt: string;
}

interface DashboardData {
  active_agents: number;
  pending_approvals: number;
  total_tasks: number;
  completed_tasks: number;
  total_goals: number;
  active_goals: number;
}

interface ExecutiveAgentPanelProps {
  agents: Agent[];
  approvals: Approval[];
  dashboard: DashboardData | null;
}

export function ExecutiveAgentPanel({ agents, approvals, dashboard }: ExecutiveAgentPanelProps) {
  const activeAgents = agents.filter(a => a.status === "active");
  const workingAgents = agents.filter(a => a.currentTask);
  const pendingApprovals = approvals.filter(a => a.status === "pending");

  // Build the status summary
  const getStatusText = () => {
    if (activeAgents.length === 0 && agents.length === 0) {
      return "No AI employees yet — hire your first agent to get started";
    }
    if (activeAgents.length === 0) {
      return "All AI employees are paused — resume them to continue execution";
    }
    if (workingAgents.length > 0) {
      return `Coordinating ${workingAgents.length} task${workingAgents.length !== 1 ? "s" : ""} across ${new Set(workingAgents.map(a => a.department).filter(Boolean)).size || 1} department${workingAgents.length !== 1 ? "s" : ""}`;
    }
    return `${activeAgents.length} agent${activeAgents.length !== 1 ? "s" : ""} ready — no active tasks right now`;
  };

  // Build current priorities
  const priorities = [];
  if (pendingApprovals.length > 0) {
    priorities.push({
      icon: Clock,
      text: `${pendingApprovals.length} decision${pendingApprovals.length !== 1 ? "s" : ""} waiting for your approval`,
      href: "/app/approvals",
      color: "text-[#E86A33]",
    });
  }
  if (dashboard && dashboard.total_goals > 0) {
    const completionRate = dashboard.total_tasks > 0
      ? Math.round((dashboard.completed_tasks / dashboard.total_tasks) * 100)
      : 0;
    priorities.push({
      icon: Target,
      text: `${dashboard.active_goals} active goals · ${completionRate}% task completion`,
      href: "/app/goals",
      color: "text-[#1a5c2e]",
    });
  }
  if (activeAgents.length > 0) {
    priorities.push({
      icon: Users,
      text: `${activeAgents.length} AI employee${activeAgents.length !== 1 ? "s" : ""} active`,
      href: "/app/agents",
      color: "text-[#B8FF66]",
    });
  }

  return (
    <div className="rounded-xl border border-hairline bg-white p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a5c2e]">
            <Bot aria-hidden="true" className="h-4 w-4 text-[#B8FF66]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Executive Agent</h2>
            <p className="text-xs text-muted">Your Chief of Staff</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[#B8FF66]/10 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#B8FF66] animate-pulse" />
          <span className="font-mono text-[9px] font-semibold text-[#1a5c2e]">ONLINE</span>
        </span>
      </div>

      {/* Status */}
      <div className="mt-4 rounded-lg bg-canvas px-4 py-3">
        <p className="text-sm text-ink">{getStatusText()}</p>
      </div>

      {/* Current work */}
      {workingAgents.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">Currently executing</p>
          <div className="space-y-2">
            {workingAgents.slice(0, 3).map(agent => (
              <div key={agent.id} className="flex items-center gap-3 rounded-lg border border-hairline px-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1a5c2e] text-[10px] font-bold text-[#B8FF66]">
                  {agent.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-ink truncate">{agent.name}</p>
                  <p className="text-[10px] text-muted truncate">{agent.currentTask}</p>
                </div>
                <span className="flex items-center gap-1 text-[10px] text-[#E86A33]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#E86A33] animate-pulse" />
                  Working
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Priorities */}
      {priorities.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">Current priorities</p>
          <div className="space-y-1.5">
            {priorities.map((p, i) => {
              const Icon = p.icon;
              return (
                <Link
                  key={i}
                  href={p.href}
                  className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-canvas"
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${p.color}`} />
                  <span className="flex-1">{p.text}</span>
                  <ArrowUpRight className="h-3 w-3 text-muted group-hover:text-muted" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-canvas px-3 py-2 text-center">
          <p className="font-mono text-lg font-bold text-ink">{activeAgents.length}</p>
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted">Active</p>
        </div>
        <div className="rounded-lg bg-canvas px-3 py-2 text-center">
          <p className="font-mono text-lg font-bold text-ink">{dashboard?.completed_tasks ?? 0}</p>
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted">Done</p>
        </div>
        <div className="rounded-lg bg-canvas px-3 py-2 text-center">
          <p className="font-mono text-lg font-bold text-[#E86A33]">{pendingApprovals.length}</p>
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted">Pending</p>
        </div>
      </div>
    </div>
  );
}
