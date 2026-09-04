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
  Loader2,
  ListChecks,
} from "lucide-react";

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
  dueDate: string | null;
  cost: number;
  result: string | null;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
}

function priorityBadge(priority: string) {
  switch (priority) {
    case "urgent": return "bg-red-100 text-red-700";
    case "high": return "bg-amber-50 text-amber-700";
    case "normal": return "bg-blue-50 text-blue-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "completed": return "bg-[#B8FF66]/10 text-[#1a5c2e]";
    case "paused": return "bg-amber-50 text-amber-700";
    case "cancelled": return "bg-gray-100 text-gray-500";
    default: return "bg-blue-50 text-blue-700";
  }
}

function taskStatusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-4 w-4 text-[#1a5c2e]" />;
    case "in_progress": return <Clock className="h-4 w-4 text-blue-500" />;
    case "failed": return <AlertCircle className="h-4 w-4 text-red-500" />;
    default: return <Clock className="h-4 w-4 text-muted" />;
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

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [goal, setGoal] = useState<Goal | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [goalRes, tasksRes, agentsRes] = await Promise.all([
        fetch(`/api/goals/${id}`),
        fetch(`/api/tasks?goal_id=${id}&limit=50`),
        fetch("/api/agents"),
      ]);
      if (!goalRes.ok) throw new Error("Failed to load goal");
      const goalJson = await goalRes.json();
      setGoal(goalJson.data ?? null);
      const tasksJson = await tasksRes.json().catch(() => null);
      setTasks(tasksJson?.data ?? []);
      const agentsJson = await agentsRes.json().catch(() => null);
      setAgents(agentsJson?.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load goal");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const completedTasks = tasks.filter((t) => t.status === "completed").length;

  if (loading && !goal) {
    return (
      <PageErrorBoundary pageName="Goal" backHref="/app/goals">
        <div className="mx-auto max-w-4xl">
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
      <div className="mx-auto max-w-4xl">
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
            <Target className="mx-auto h-10 w-10 text-muted/30" />
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
            {/* Goal card */}
            <div className="mt-4 rounded-xl border border-hairline bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#B8FF66]/10">
                    <Target className="h-5 w-5 text-[#1a5c2e]" />
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
                    <p className="mt-2 flex items-center gap-3 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDueDate(goal.dueDate)}
                      </span>
                      <span>
                        {completedTasks}/{tasks.length} tasks completed
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetchAll}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {/* Progress */}
              <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wide">
                    Progress
                  </span>
                  <span className="font-mono tabular-nums">{goal.progress}%</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-muted/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#1a5c2e] transition-all"
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Tasks */}
            <section className="mt-6">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted" />
                <h2 className="text-sm font-semibold text-ink">Tasks</h2>
                <span className="rounded-full bg-muted/10 px-2 py-0.5 font-mono text-[10px] text-muted">
                  {tasks.length}
                </span>
              </div>

              {tasks.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-hairline bg-white p-8 text-center">
                  <ListChecks className="mx-auto h-6 w-6 text-muted/30" />
                  <p className="mt-2 text-sm text-muted">
                    No tasks linked to this goal yet
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {tasks.map((t) => (
                    <Link
                      key={t.id}
                      href={`/app/tasks/${t.id}`}
                      className="block rounded-xl border border-hairline bg-white p-4 transition-colors hover:border-[#1a5c2e]/30 hover:bg-[#1a5c2e]/5"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0">{taskStatusIcon(t.status)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{t.title}</p>
                          {t.description && (
                            <p className="mt-0.5 text-xs text-muted line-clamp-1">
                              {t.description}
                            </p>
                          )}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted">
                            {t.agentId && agentMap.get(t.agentId) && (
                              <span className="rounded-full bg-[#0a0a0b]/5 px-2 py-0.5 font-medium text-[#0a0a0b]">
                                {agentMap.get(t.agentId)!.name}
                              </span>
                            )}
                            <span className="rounded-full bg-muted/10 px-2 py-0.5 font-mono uppercase">
                              {t.priority}
                            </span>
                            {t.dueDate && (
                              <span>{formatDueDate(t.dueDate)}</span>
                            )}
                          </div>
                        </div>
                        {t.status === "completed" && (
                          <span className="shrink-0 rounded-full bg-[#B8FF66]/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-[#1a5c2e]">
                            Done
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </PageErrorBoundary>
  );
}