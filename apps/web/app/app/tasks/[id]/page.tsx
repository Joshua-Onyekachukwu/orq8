"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageErrorBoundary } from "../../../../components/page-error-boundary";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Target,
  FileText,
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  goalId: string | null;
  agentId: string | null;
  cost: number;
  dueDate: string | null;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Goal {
  id: string;
  title: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
}

function priorityBadge(priority: string) {
  switch (priority) {
    case "urgent": return "bg-error-soft text-error-ink";
    case "high": return "bg-warm-soft text-warm-ink";
    case "normal": return "bg-brand-soft text-brand-deep";
    default: return "bg-hairline text-ink-muted";
  }
}

function statusConfig(status: string) {
  switch (status) {
    case "completed":
      return { label: "Completed", cls: "bg-ink-accent/10 text-brand-ink", icon: CheckCircle2 };
    case "in_progress":
      return { label: "In progress", cls: "bg-brand-soft text-brand-deep", icon: Clock };
    case "failed":
      return { label: "Failed", cls: "bg-error-soft text-error-ink", icon: AlertCircle };
    case "cancelled":
      return { label: "Cancelled", cls: "bg-hairline text-muted", icon: AlertCircle };
    default:
      return { label: "Pending", cls: "bg-warm-soft text-warm-ink", icon: Clock };
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [task, setTask] = useState<Task | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Running and retrying work from the product (docs/66 §66.19). Before this,
  // both existed only as API endpoints: a founder whose task sat in `pending` or
  // failed had to ask a developer with curl to move it.
  const [acting, setActing] = useState<null | "execute" | "retry">(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const taskRes = await fetch(`/api/tasks/${id}`);
      if (!taskRes.ok) throw new Error("Failed to load task");
      const taskJson = await taskRes.json();
      const taskData: Task | null = taskJson.data ?? null;
      setTask(taskData);

      // Resolve linked goal and agent in parallel
      const [goalRes, agentRes] = await Promise.all([
        taskData?.goalId ? fetch(`/api/goals/${taskData.goalId}`) : Promise.resolve(null),
        taskData?.agentId ? fetch(`/api/agents/${taskData.agentId}`) : Promise.resolve(null),
      ]);
      if (goalRes && goalRes.ok) {
        const g = await goalRes.json();
        setGoal(g.data ?? null);
      }
      if (agentRes && agentRes.ok) {
        const a = await agentRes.json();
        setAgent(a.data ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load task");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const runAction = useCallback(
    async (kind: "execute" | "retry") => {
      setActing(kind);
      setActionError(null);
      setActionNote(null);
      try {
        const res = await fetch(`/api/commands/tasks/${id}/${kind}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          // The API's refusal is the explanation: "waiting on your decision" is
          // the answer, not a generic failure.
          throw new Error(payload?.error?.message ?? "The task could not be started.");
        }
        const outcome = payload?.status ?? payload?.data?.status ?? "started";
        setActionNote(`The task is now ${String(outcome).replace(/_/g, " ")}.`);
        await fetchAll();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "The task could not be started.");
      } finally {
        setActing(null);
      }
    },
    [fetchAll, id],
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading && !task) {
    return (
      <PageErrorBoundary pageName="Task" backHref="/app/goals">
        <div className="mx-auto max-w-3xl">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-32 rounded bg-hairline" />
            <div className="h-48 rounded-xl border border-hairline bg-white p-6" />
          </div>
        </div>
      </PageErrorBoundary>
    );
  }

  const status = task ? statusConfig(task.status) : null;

  return (
    <PageErrorBoundary pageName="Task" backHref="/app/goals">
      <div className="mx-auto max-w-3xl">
        <Link
          href={task?.goalId ? `/app/goals/${task.goalId}` : "/app/goals"}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to {task?.goalId ? "Goal" : "Goals & Tasks"}
        </Link>

        {actionNote && (
          <div className="mt-4 rounded-xl border border-hairline bg-canvas px-4 py-3 text-sm text-ink">
            {actionNote}
          </div>
        )}

        {actionError && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border-error bg-error-soft px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-error-ink" />
            <p className="text-sm text-error-ink">{actionError}</p>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="ml-auto text-xs text-error-ink"
            >
              Dismiss
            </button>
          </div>
        )}

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

        {!task || !status ? (
          <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted/30" />
            <p className="mt-4 text-sm font-medium text-ink">Task not found</p>
            <Link
              href="/app/goals"
              className="mt-2 inline-block text-sm text-brand-ink hover:underline"
            >
              Return to Goals & Tasks
            </Link>
          </div>
        ) : (
          <>
            {/* Task card */}
            <div className="mt-4 rounded-xl border border-hairline bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-surface/5">
                    <FileText className="h-5 w-5 text-ink" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl font-semibold tracking-tight text-ink">
                        {task.title}
                      </h1>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-3xs font-semibold uppercase ${status.cls}`}>
                        <status.icon className="h-3 w-3" />
                        {status.label}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 font-mono text-3xs font-semibold uppercase ${priorityBadge(task.priority)}`}>
                        {task.priority}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {task.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => void runAction("execute")}
                      disabled={acting !== null}
                      className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {acting === "execute" ? (
                        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <PlayCircle aria-hidden="true" className="h-3.5 w-3.5" />
                      )}
                      {acting === "execute" ? "Running…" : "Run now"}
                    </button>
                  )}
                  {task.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => void runAction("retry")}
                      disabled={acting !== null}
                      className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {acting === "retry" ? (
                        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                      )}
                      {acting === "retry" ? "Retrying…" : "Retry this task"}
                    </button>
                  )}
                  {task.status === "awaiting_approval" && (
                    <Link
                      href="/app/approvals"
                      className="inline-flex items-center gap-1.5 rounded-full border border-warm bg-warm-soft px-3 py-2 text-xs font-semibold text-warm-ink transition-opacity hover:opacity-90"
                    >
                      <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                      Waiting on your decision
                    </Link>
                  )}
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
              </div>

              {task.description && (
                <p className="mt-4 text-sm leading-relaxed text-ink">{task.description}</p>
              )}

              <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-4">
                <div className="bg-canvas px-4 py-3">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                    Assigned to
                  </dt>
                  <dd className="mt-0.5 truncate text-sm font-medium text-ink">
                    {agent ? (
                      <Link href={`/app/agents/${agent.id}`} className="hover:text-brand-ink">
                        {agent.name}
                      </Link>
                    ) : (
                      "Unassigned"
                    )}
                  </dd>
                </div>
                <div className="bg-canvas px-4 py-3">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                    Goal
                  </dt>
                  <dd className="mt-0.5 truncate text-sm font-medium text-ink">
                    {goal ? (
                      <Link href={`/app/goals/${goal.id}`} className="hover:text-brand-ink">
                        {goal.title}
                      </Link>
                    ) : (
                      "Standalone"
                    )}
                  </dd>
                </div>
                <div className="bg-canvas px-4 py-3">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                    Due
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink">
                    {task.dueDate ? formatDate(task.dueDate) : "No deadline"}
                  </dd>
                </div>
                <div className="bg-canvas px-4 py-3">
                  <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                    Cost
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium tabular-nums text-ink">
                    {formatCost(task.cost)}
                  </dd>
                </div>
              </dl>

              <p className="mt-4 text-xs text-muted">
                Created {formatDate(task.createdAt)}
                {task.updatedAt && ` · Updated ${formatDate(task.updatedAt)}`}
              </p>
            </div>

            {/* Result */}
            {task.result && (
              <section className="mt-6">
                <div className="flex items-center gap-2">
                  <Target aria-hidden="true" className="h-4 w-4 text-muted" />
                  <h2 className="text-sm font-semibold text-ink">Result</h2>
                </div>
                <div className="mt-3 rounded-xl border border-hairline bg-white p-5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {task.result}
                  </p>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </PageErrorBoundary>
  );
}