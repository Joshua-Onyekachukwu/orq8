"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageErrorBoundary } from "../../../../components/page-error-boundary";
import {
  ArrowLeft,
  Target,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Bot,
  ListChecks,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  DollarSign,
  Calendar,
  Shield,
  ArrowUpRight,
} from "lucide-react";

/* ── Types ── */

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  progress: number;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  agentId: string | null;
  goalId: string | null;
  dueDate: string | null;
  cost: number;
  result: string | null;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  department: string | null;
  status: string;
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

/* ── Helpers ── */

function priorityBadge(priority: string) {
  switch (priority) {
    case "urgent": return "bg-red-100 text-red-700";
    case "high": return "bg-amber-50 text-amber-700";
    case "normal": return "bg-blue-50 text-blue-700";
    default: return "bg-hairline text-ink-muted";
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "completed": return "bg-[#B8FF66]/10 text-[#1a5c2e]";
    case "active": return "bg-blue-50 text-blue-700";
    case "paused": return "bg-amber-50 text-amber-700";
    case "cancelled": return "bg-hairline text-muted";
    default: return "bg-hairline text-ink-muted";
  }
}

function taskStatusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-4 w-4 text-[#1a5c2e]" />;
    case "in_progress": return <Clock className="h-4 w-4 text-[#E86A33]" />;
    case "failed": return <AlertCircle className="h-4 w-4 text-red-500" />;
    default: return <Clock className="h-4 w-4 text-muted" />;
  }
}

function taskStatusLabel(status: string) {
  switch (status) {
    case "completed": return "Completed";
    case "in_progress": return "In Progress";
    case "failed": return "Failed";
    case "pending": return "Pending";
    default: return status;
  }
}

function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return "No deadline";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return "Due today";
    if (days === 1) return "Due tomorrow";
    return `${days}d left`;
  } catch {
    return "Unknown";
  }
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getGoalHealth(
  goal: Goal,
  tasks: Task[]
): { label: string; icon: React.ElementType; color: string; bg: string; description: string } {
  if (goal.status === "completed") {
    return { label: "Achieved", icon: CheckCircle2, color: "text-[#1a5c2e]", bg: "bg-[#B8FF66]/10", description: "This goal has been completed." };
  }
  if (goal.status === "cancelled") {
    return { label: "Cancelled", icon: AlertCircle, color: "text-muted", bg: "bg-hairline", description: "This goal has been cancelled." };
  }

  const completed = tasks.filter(t => t.status === "completed").length;
  const failed = tasks.filter(t => t.status === "failed").length;
  const inProgress = tasks.filter(t => t.status === "in_progress").length;

  // Check overdue
  if (goal.dueDate) {
    const due = new Date(goal.dueDate);
    const now = new Date();
    if (due < now && goal.progress < 100) {
      return { label: "Overdue", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", description: "This goal is past its deadline and not yet complete." };
    }
  }

  // Check blocked (failed tasks)
  if (failed > 0 && completed === 0) {
    return { label: "At Risk", icon: TrendingDown, color: "text-red-500", bg: "bg-red-50", description: "Tasks are failing with no completions yet." };
  }

  // Check stalled
  if (inProgress === 0 && completed === 0 && tasks.length > 0) {
    return { label: "Stalled", icon: Minus, color: "text-amber-600", bg: "bg-amber-50", description: "No tasks are in progress." };
  }

  // On track
  if (goal.progress >= 50) {
    return { label: "On Track", icon: TrendingUp, color: "text-[#1a5c2e]", bg: "bg-[#B8FF66]/10", description: "Making good progress toward completion." };
  }

  return { label: "In Progress", icon: Clock, color: "text-blue-600", bg: "bg-blue-50", description: "Work is underway." };
}

/* ── Tab type ── */
type TaskTab = "all" | "completed" | "in_progress" | "pending" | "failed";

/* ── Component ── */

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [goal, setGoal] = useState<Goal | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TaskTab>("all");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [goalRes, tasksRes, agentsRes] = await Promise.all([
        fetch(`/api/goals/${id}`),
        fetch(`/api/tasks?goal_id=${id}&limit=100`),
        fetch("/api/agents"),
      ]);
      if (!goalRes.ok) throw new Error("Failed to load goal");
      const goalJson = await goalRes.json();
      setGoal(goalJson.data ?? null);
      const tasksJson = await tasksRes.json().catch(() => null);
      const taskList: Task[] = tasksJson?.data ?? [];
      setTasks(taskList);
      const agentsJson = await agentsRes.json().catch(() => null);
      setAgents(agentsJson?.data ?? []);

      // Fetch activity for tasks in this goal
      if (taskList.length > 0) {
        const taskIds = taskList.map(t => t.id).join(",");
        const actRes = await fetch(`/api/activity?task_ids=${taskIds}&limit=20`);
        const actJson = await actRes.json().catch(() => null);
        setActivity(actJson?.data ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load goal");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const agentMap = new Map(agents.map(a => [a.id, a]));
  const completedTasks = tasks.filter(t => t.status === "completed");
  const inProgressTasks = tasks.filter(t => t.status === "in_progress");
  const pendingTasks = tasks.filter(t => t.status === "pending");
  const failedTasks = tasks.filter(t => t.status === "failed");
  const totalCost = tasks.reduce((sum, t) => sum + t.cost, 0);

  // Agents working on this goal
  const assignedAgentIds = new Set(tasks.filter(t => t.agentId).map(t => t.agentId!));
  const assignedAgents = agents.filter(a => assignedAgentIds.has(a.id));

  // Health
  const health = goal ? getGoalHealth(goal, tasks) : null;

  // Filtered tasks by tab
  const filteredTasks = activeTab === "all" ? tasks
    : activeTab === "completed" ? completedTasks
    : activeTab === "in_progress" ? inProgressTasks
    : activeTab === "pending" ? pendingTasks
    : failedTasks;

  if (loading && !goal) {
    return (
      <PageErrorBoundary pageName="Goal" backHref="/app/goals">
        <div className="mx-auto max-w-5xl">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-32 rounded bg-hairline" />
            <div className="h-40 rounded-xl border border-hairline bg-white p-6" />
            <div className="h-64 rounded-xl border border-hairline bg-white p-6" />
          </div>
        </div>
      </PageErrorBoundary>
    );
  }

  return (
    <PageErrorBoundary pageName="Goal" backHref="/app/goals">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/app/goals"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Goals & Tasks
        </Link>

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

        {!goal ? (
          <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
            <Target aria-hidden="true" className="mx-auto h-10 w-10 text-muted/30" />
            <p className="mt-4 text-sm font-medium text-ink">Goal not found</p>
            <Link
              href="/app/goals"
              className="mt-2 inline-block text-sm text-[#1a5c2e] hover:underline"
            >
              Return to Goals & Tasks
            </Link>
          </div>
        ) : (
          <>
            {/* ── Goal Overview ── */}
            <div className="mt-4 rounded-xl border border-hairline bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#B8FF66]/10">
                    <Target aria-hidden="true" className="h-5 w-5 text-[#1a5c2e]" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl font-semibold tracking-tight text-ink">
                        {goal.title}
                      </h1>
                      <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${priorityBadge(goal.priority)}`}>
                        {goal.priority}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${statusBadge(goal.status)}`}>
                        {goal.status}
                      </span>
                    </div>
                    {goal.description && (
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                        {goal.description}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchAll}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
                >
                   <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {/* Goal meta row */}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDueDate(goal.dueDate)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ListChecks aria-hidden="true" className="h-3.5 w-3.5" />
                  {completedTasks.length}/{tasks.length} tasks completed
                </span>
                {totalCost > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" />
                    {formatCost(totalCost)} total cost
                  </span>
                )}
                <span className="text-muted">·</span>
                <span className="text-muted">
                  Created {new Date(goal.createdAt).toLocaleDateString()}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wide">
                    Progress
                  </span>
                  <span className="font-mono tabular-nums">{goal.progress}%</span>
                </div>
                <div className="mt-1.5 h-2.5 rounded-full bg-muted/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      goal.progress >= 80 ? "bg-[#1a5c2e]" :
                      goal.progress >= 40 ? "bg-[#B8FF66]" :
                      "bg-[#E86A33]"
                    }`}
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* ── Health + AI Employees side by side ── */}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Goal Health */}
              {health && (
                <div className={`rounded-xl border border-hairline bg-white p-5`}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-ink">Goal Health</h2>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${health.color} ${health.bg}`}>
                      <health.icon className="h-3 w-3" />
                      {health.label}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted">{health.description}</p>

                  {/* Task summary mini-bars */}
                  <div className="mt-4 space-y-2">
                    {completedTasks.length > 0 && (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#1a5c2e]" />
                        <span className="text-xs text-ink">{completedTasks.length} completed</span>
                        <div className="flex-1 h-1.5 rounded-full bg-hairline overflow-hidden">
                          <div className="h-full rounded-full bg-[#1a5c2e]" style={{ width: `${(completedTasks.length / tasks.length) * 100}%` }} />
                        </div>
                      </div>
                    )}
                    {inProgressTasks.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-[#E86A33]" />
                        <span className="text-xs text-ink">{inProgressTasks.length} in progress</span>
                        <div className="flex-1 h-1.5 rounded-full bg-hairline overflow-hidden">
                          <div className="h-full rounded-full bg-[#E86A33]" style={{ width: `${(inProgressTasks.length / tasks.length) * 100}%` }} />
                        </div>
                      </div>
                    )}
                    {pendingTasks.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-muted" />
                        <span className="text-xs text-ink">{pendingTasks.length} pending</span>
                        <div className="flex-1 h-1.5 rounded-full bg-hairline overflow-hidden">
                          <div className="h-full rounded-full bg-hairline" style={{ width: `${(pendingTasks.length / tasks.length) * 100}%` }} />
                        </div>
                      </div>
                    )}
                    {failedTasks.length > 0 && (
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                        <span className="text-xs text-ink">{failedTasks.length} failed</span>
                        <div className="flex-1 h-1.5 rounded-full bg-hairline overflow-hidden">
                          <div className="h-full rounded-full bg-red-400" style={{ width: `${(failedTasks.length / tasks.length) * 100}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AI Employees */}
              <div className="rounded-xl border border-hairline bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">AI Employees</h2>
                  <span className="rounded-full bg-muted/10 px-2 py-0.5 font-mono text-[10px] text-muted">
                    {assignedAgents.length}
                  </span>
                </div>

                {assignedAgents.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-hairline p-4 text-center">
                    <Bot aria-hidden="true" className="mx-auto h-5 w-5 text-muted/30" />
                    <p className="mt-1 text-xs text-muted">No agents assigned to tasks in this goal</p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {assignedAgents.map(agent => {
                      const agentTasks = tasks.filter(t => t.agentId === agent.id);
                      const agentCompleted = agentTasks.filter(t => t.status === "completed").length;
                      const agentCost = agentTasks.reduce((s, t) => s + t.cost, 0);
                      const isWorking = agentTasks.some(t => t.status === "in_progress");

                      return (
                        <div key={agent.id} className="flex items-center gap-3 rounded-lg border border-hairline p-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a5c2e] text-xs font-bold text-[#B8FF66]">
                            {agent.name.charAt(0)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-ink">{agent.name}</p>
                              {isWorking && (
                                <span className="flex items-center gap-1 text-[10px] text-[#E86A33]">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[#E86A33] animate-pulse" />
                                  Working
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted">
                              {agent.role}
                              {agent.department && ` · ${agent.department}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium text-ink">{agentCompleted}/{agentTasks.length}</p>
                            <p className="text-[10px] text-muted">tasks</p>
                          </div>
                          {agentCost > 0 && (
                            <div className="text-right">
                              <p className="text-xs font-mono text-ink">{formatCost(agentCost)}</p>
                              <p className="text-[10px] text-muted">cost</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Tasks with Tabs ── */}
            <section className="mt-6">
              <div className="flex items-center gap-3 border-b border-hairline pb-3">
                <ListChecks aria-hidden="true" className="h-4 w-4 text-muted" />
                <h2 className="text-sm font-semibold text-ink">Tasks</h2>
                <div className="flex items-center gap-1 ml-2">
                  {(["all", "completed", "in_progress", "pending", "failed"] as TaskTab[]).map(tab => {
                    const count = tab === "all" ? tasks.length
                      : tab === "completed" ? completedTasks.length
                      : tab === "in_progress" ? inProgressTasks.length
                      : tab === "pending" ? pendingTasks.length
                      : failedTasks.length;
                    if (tab !== "all" && count === 0) return null;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase transition-colors ${
                          activeTab === tab
                            ? "bg-[#0a0a0b] text-white"
                            : "bg-hairline text-muted hover:bg-hairline"
                        }`}
                      >
                        {tab === "in_progress" ? "Active" : tab} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {filteredTasks.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-hairline bg-white p-8 text-center">
                  <ListChecks aria-hidden="true" className="mx-auto h-6 w-6 text-muted/30" />
                  <p className="mt-2 text-sm text-muted">
                    {activeTab === "all"
                      ? "No tasks linked to this goal yet"
                      : `No ${activeTab === "in_progress" ? "active" : activeTab} tasks`
                    }
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {filteredTasks.map(t => (
                    <Link
                      key={t.id}
                      href={`/app/tasks/${t.id}`}
                      className="block rounded-xl border border-hairline bg-white p-4 transition-colors hover:border-[#1a5c2e]/30 hover:bg-[#1a5c2e]/5"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0">{taskStatusIcon(t.status)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-ink">{t.title}</p>
                            <span className="shrink-0 rounded-full bg-muted/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase text-muted">
                              {taskStatusLabel(t.status)}
                            </span>
                          </div>
                          {t.description && (
                            <p className="mt-0.5 text-xs text-muted line-clamp-1">
                              {t.description}
                            </p>
                          )}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted">
                            {t.agentId && agentMap.get(t.agentId) && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#0a0a0b]/5 px-2 py-0.5 font-medium text-[#0a0a0b]">
                                <Bot aria-hidden="true" className="h-2.5 w-2.5" />
                                {agentMap.get(t.agentId)!.name}
                              </span>
                            )}
                            <span className={`rounded-full px-2 py-0.5 font-mono uppercase ${priorityBadge(t.priority)}`}>
                              {t.priority}
                            </span>
                            {t.dueDate && (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-2.5 w-2.5" />
                                {formatDueDate(t.dueDate)}
                              </span>
                            )}
                            {t.cost > 0 && (
                              <span className="font-mono">{formatCost(t.cost)}</span>
                            )}
                          </div>
                          {t.result && (
                            <div className="mt-2 rounded-lg bg-[#B8FF66]/5 border border-[#B8FF66]/20 px-3 py-2">
                              <p className="font-mono text-[9px] font-semibold uppercase text-[#1a5c2e] mb-0.5">Result</p>
                              <p className="text-xs text-ink leading-relaxed">{t.result}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* ── Activity Feed ── */}
            {activity.length > 0 && (
              <section className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-muted" />
                  <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
                  <span className="rounded-full bg-muted/10 px-2 py-0.5 font-mono text-[10px] text-muted">
                    {activity.length}
                  </span>
                </div>

                <div className="rounded-xl border border-hairline bg-white divide-y divide-hairline">
                  {activity.map(event => {
                    const agent = event.agentId ? agentMap.get(event.agentId) : null;
                    const task = tasks.find(t => t.id === event.taskId);
                    return (
                      <div key={event.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1a5c2e]/10 mt-0.5">
                          {event.type === "completed" ? (
                            <CheckCircle2 className="h-3 w-3 text-[#1a5c2e]" />
                          ) : event.type === "failed" ? (
                            <AlertCircle className="h-3 w-3 text-red-500" />
                          ) : (
                            <Clock className="h-3 w-3 text-[#E86A33]" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-ink">{event.summary}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                            {agent && <span className="font-medium">{agent.name}</span>}
                            {task && (
                              <Link href={`/app/tasks/${task.id}`} className="hover:text-[#1a5c2e]">
                                {task.title}
                              </Link>
                            )}
                            <span>{formatTimeAgo(event.occurredAt)}</span>
                            {event.cost > 0 && (
                              <span className="font-mono">{formatCost(event.cost)}</span>
                            )}
                          </div>
                          {event.reason && (
                            <p className="mt-0.5 text-[10px] text-muted italic">Because: {event.reason}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </PageErrorBoundary>
  );
}
