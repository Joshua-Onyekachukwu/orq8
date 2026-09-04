"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageErrorBoundary } from "../../../../components/page-error-boundary";
import {
  ArrowLeft,
  Pause,
  Play,
  Loader2,
  AlertCircle,
  RefreshCw,
  Target,
  Activity as ActivityIcon,
  Clock,
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  role: string;
  department: string | null;
  status: string;
  weeklyCost: number;
  tasksCompleted: number;
  currentTask: string | null;
  capabilities: string[];
  config: Record<string, unknown>;
  createdAt: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  goalId: string | null;
  dueDate: string | null;
  cost: number;
  createdAt: string;
}

interface ActivityEvent {
  id: number;
  type: string;
  summary: string;
  reason: string | null;
  cost: number;
  department: string | null;
  occurredAt: string;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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

function taskStatusIcon(status: string) {
  if (status === "completed") return <span className="h-2 w-2 rounded-full bg-[#1a5c2e]" />;
  if (status === "in_progress") return <span className="h-2 w-2 rounded-full bg-blue-500" />;
  if (status === "failed") return <span className="h-2 w-2 rounded-full bg-red-500" />;
  return <span className="h-2 w-2 rounded-full bg-hairline" />;
}

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentRes, tasksRes, activityRes] = await Promise.all([
        fetch(`/api/agents/${id}`),
        fetch(`/api/tasks?agent_id=${id}&limit=20`),
        fetch(`/api/activity?agent_id=${id}&limit=15`),
      ]);
      if (!agentRes.ok) throw new Error("Failed to load agent");
      const agentJson = await agentRes.json();
      setAgent(agentJson.data ?? null);
      const tasksJson = await tasksRes.json().catch(() => null);
      setTasks(tasksJson?.data ?? []);
      const activityJson = await activityRes.json().catch(() => null);
      setActivity(activityJson?.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleToggleStatus = async () => {
    if (!agent || processing) return;
    setProcessing(true);
    try {
      const newStatus = agent.status === "active" ? "paused" : "active";
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Failed to update agent");
      }
      const json = await res.json();
      setAgent(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent");
    } finally {
      setProcessing(false);
    }
  };

  if (loading && !agent) {
    return (
      <PageErrorBoundary pageName="AI Employee" backHref="/app/agents">
        <div className="mx-auto max-w-4xl">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-32 rounded bg-hairline" />
            <div className="h-24 rounded-xl border border-hairline bg-white p-6" />
            <div className="h-64 rounded-xl border border-hairline bg-white p-6" />
          </div>
        </div>
      </PageErrorBoundary>
    );
  }

  return (
    <PageErrorBoundary pageName="AI Employee" backHref="/app/agents">
      <div className="mx-auto max-w-4xl">
        {/* Back link */}
        <Link
          href="/app/agents"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to AI Workforce
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

        {!agent ? (
          <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-muted/30" />
            <p className="mt-4 text-sm font-medium text-ink">Agent not found</p>
            <Link
              href="/app/agents"
              className="mt-2 inline-block text-sm text-[#1a5c2e] hover:underline"
            >
              Return to AI Workforce
            </Link>
          </div>
        ) : (
          <>
            {/* Header card */}
            <div className="mt-4 rounded-xl border border-hairline bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#0a0a0b] text-xl font-bold text-[#1a5c2e]">
                    {agent.name.charAt(0)}
                  </span>
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1a5c2e]">
                      {agent.department ?? "General"}
                    </p>
                    <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">
                      {agent.name}
                    </h1>
                    <p className="text-sm text-muted">{agent.role}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleStatus}
                  disabled={processing}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    agent.status === "active"
                      ? "border border-hairline bg-white text-ink hover:bg-canvas"
                      : "bg-[#1a5c2e] text-white transition-colors hover:bg-[#144a24]"
                  }`}
                >
                  {processing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : agent.status === "active" ? (
                    <>
                      <Pause className="h-3.5 w-3.5" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" /> Resume
                    </>
                  )}
                </button>
              </div>

              <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide">
                {agent.status === "active" ? (
                  <>
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1a5c2e]" />
                    <span className="text-[#1a5c2e]">Working now</span>
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-muted" />
                    <span className="text-muted">Paused</span>
                  </>
                )}
              </p>

              {agent.currentTask && (
                <div className="mt-4 rounded-lg bg-canvas px-4 py-3">
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-wide text-muted">
                    Current task
                  </p>
                  <p className="mt-0.5 text-sm text-ink">{agent.currentTask}</p>
                </div>
              )}

              {agent.capabilities && agent.capabilities.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {agent.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="rounded-full bg-[#0a0a0b]/5 px-2.5 py-1 text-[11px] font-medium text-[#0a0a0b]"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              )}

              <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
                <div className="bg-canvas px-4 py-3">
                  <dt className="font-mono text-[9px] font-semibold uppercase tracking-wide text-muted">
                    Weekly cost
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium tabular-nums text-ink">
                    {formatCost(agent.weeklyCost)}
                  </dd>
                </div>
                <div className="bg-canvas px-4 py-3">
                  <dt className="font-mono text-[9px] font-semibold uppercase tracking-wide text-muted">
                    Tasks completed
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium tabular-nums text-ink">
                    {agent.tasksCompleted}
                  </dd>
                </div>
                <div className="bg-canvas px-4 py-3">
                  <dt className="font-mono text-[9px] font-semibold uppercase tracking-wide text-muted">
                    Hired
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink">
                    {formatDate(agent.createdAt)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Tasks */}
            <section className="mt-6">
              <div className="flex items-center gap-2">
                <Target aria-hidden="true" className="h-4 w-4 text-muted" />
                <h2 className="text-sm font-semibold text-ink">Recent Tasks</h2>
                <span className="rounded-full bg-muted/10 px-2 py-0.5 font-mono text-[10px] text-muted">
                  {tasks.length}
                </span>
                <button
                  type="button"
                  onClick={fetchAll}
                  disabled={loading}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
                >
                  <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {tasks.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-hairline bg-white p-8 text-center">
                  <Target aria-hidden="true" className="mx-auto h-6 w-6 text-muted/30" />
                  <p className="mt-2 text-sm text-muted">No tasks assigned yet</p>
                </div>
              ) : (
                <div className="mt-3 overflow-hidden rounded-xl border border-hairline bg-white">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-canvas text-left">
                        {["Task", "Status", "Priority", "Due", "Cost"].map((h) => (
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
                      {tasks.map((t) => (
                        <tr key={t.id} className="hover:bg-canvas/50">
                          <td className="px-5 py-3">
                            <Link
                              href={`/app/tasks/${t.id}`}
                              className="text-sm font-medium text-ink hover:text-[#1a5c2e]"
                            >
                              {t.title}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3">
                            <span className="flex items-center gap-1.5 text-xs capitalize text-muted">
                              {taskStatusIcon(t.status)}
                              {t.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 font-mono text-[10px] uppercase text-muted">
                            {t.priority}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-xs text-muted">
                            {t.dueDate ? formatDate(t.dueDate) : "—"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 font-mono text-xs tabular-nums text-muted">
                            {formatCost(t.cost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Activity */}
            <section className="mt-6">
              <div className="flex items-center gap-2">
                <ActivityIcon className="h-4 w-4 text-muted" />
                <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
              </div>

              {activity.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-hairline bg-white p-8 text-center">
                  <ActivityIcon className="mx-auto h-6 w-6 text-muted/30" />
                  <p className="mt-2 text-sm text-muted">No activity recorded yet</p>
                </div>
              ) : (
                <ol className="mt-3 space-y-2">
                  {activity.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-start gap-3 rounded-xl border border-hairline bg-white p-4"
                    >
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink">{e.summary}</p>
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                          {e.type} · {formatDate(e.occurredAt)}
                          {e.cost > 0 && ` · ${formatCost(e.cost)}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </PageErrorBoundary>
  );
}