import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import {
  Activity,
  Bot,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Zap,
  TrendingUp,
  Users,
  Target,
} from "lucide-react";

export const metadata = { title: "Agent Execution — Admin" };

async function fetchWithAuth(token: string, path: string) {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return (await res.json())?.data ?? null;
  } catch {
    return null;
  }
}

export default async function ExecutionMonitoringPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";

  const [activity, agents, tasks, stats] = await Promise.all([
    fetchWithAuth(token, "/v1/admin/activity?limit=50"),
    fetchWithAuth(token, "/v1/admin/users?limit=200"),
    fetchWithAuth(token, "/v1/commands/history?limit=30"),
    fetchWithAuth(token, "/v1/admin/stats"),
  ]);

  const recentActivity = activity ?? [];
  const allAgents = agents ?? [];
  const recentCommands = tasks ?? [];
  const platformStats = stats ?? {};

  // Categorize activity
  const completedTasks = recentActivity.filter((e: any) => e.type === "completed" || e.action === "task.completed");
  const failedTasks = recentActivity.filter((e: any) => e.type === "failed" || e.action === "task.failed");
  const delegatedTasks = recentActivity.filter((e: any) => e.type === "delegated" || e.action === "agent.delegated");
  const feedbackEvents = recentActivity.filter((e: any) =>
    e.type === "completion" || e.type === "blocker" || e.type === "escalation" ||
    e.action?.includes("feedback")
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Agent Execution</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Real-time monitoring of AI agent activity, task execution, and system health.
        </p>
      </div>

      {/* Live Status Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orq8-green/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-orq8-green" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink">{allAgents.length}</p>
              <p className="text-xs text-ink-muted">Total Agents</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{completedTasks.length}</p>
              <p className="text-xs text-ink-muted">Completed</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{failedTasks.length}</p>
              <p className="text-xs text-ink-muted">Failed</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{feedbackEvents.length}</p>
              <p className="text-xs text-ink-muted">Feedback Events</p>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Execution Timeline */}
      <div className="rounded-xl border border-hairline bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Recent Activity</h2>
            <p className="text-xs text-ink-muted">Live agent execution events</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>

        {recentActivity.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Activity className="w-12 h-12 text-ink-muted mx-auto mb-3" />
            <p className="text-sm font-medium text-ink">No activity yet</p>
            <p className="text-xs text-ink-muted mt-1">
              Agent execution events will appear here in real-time
            </p>
          </div>
        ) : (
          <div className="divide-y divide-hairline-light max-h-[600px] overflow-y-auto">
            {recentActivity.map((event: any, i: number) => {
              const isCompleted = event.type === "completed" || event.action?.includes("completed");
              const isFailed = event.type === "failed" || event.action?.includes("failed");
              const isDelegated = event.type === "delegated" || event.action?.includes("delegated");
              const isFeedback = event.type === "completion" || event.type === "blocker" || event.type === "escalation";

              return (
                <div key={event.id ?? i} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {isFailed && <XCircle className="w-4 h-4 text-red-500" />}
                      {isDelegated && <Zap className="w-4 h-4 text-amber-500" />}
                      {isFeedback && <AlertTriangle className="w-4 h-4 text-blue-500" />}
                      {!isCompleted && !isFailed && !isDelegated && !isFeedback && (
                        <Activity className="w-4 h-4 text-ink-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink">
                        {event.summary || event.action || "Activity event"}
                      </p>
                      {event.reason && (
                        <p className="text-xs text-ink-muted mt-0.5 truncate">{event.reason}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-3xs text-ink-muted">
                          {event.occurredAt
                            ? new Date(event.occurredAt).toLocaleString()
                            : "Unknown time"}
                        </span>
                        {event.cost > 0 && (
                          <span className="text-3xs font-mono text-ink-muted">
                            {(event.cost / 100).toFixed(2)} credits
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <span className={`inline-flex items-center gap-1 text-3xs font-medium px-2 py-0.5 rounded-full ${
                        isCompleted ? "bg-emerald-50 text-emerald-700" :
                        isFailed ? "bg-red-50 text-red-700" :
                        isDelegated ? "bg-amber-50 text-amber-700" :
                        "bg-gray-100 text-ink-muted"
                      }`}>
                        {event.type || event.action?.split(".")[1] || "event"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delegation & Feedback Summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Delegation Stats */}
        <div className="rounded-xl border border-hairline bg-white p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">Delegation Activity</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Tasks delegated</span>
              <span className="text-sm font-medium text-ink">{delegatedTasks.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Tasks completed</span>
              <span className="text-sm font-medium text-emerald-600">{completedTasks.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Tasks failed</span>
              <span className="text-sm font-medium text-red-600">{failedTasks.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Success rate</span>
              <span className="text-sm font-medium text-ink">
                {completedTasks.length + failedTasks.length > 0
                  ? `${((completedTasks.length / (completedTasks.length + failedTasks.length)) * 100).toFixed(0)}%`
                  : "N/A"}
              </span>
            </div>
          </div>
        </div>

        {/* Feedback Summary */}
        <div className="rounded-xl border border-hairline bg-white p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">Agent Feedback</h2>
          <div className="space-y-3">
            {feedbackEvents.length === 0 ? (
              <p className="text-sm text-ink-muted">No feedback events yet</p>
            ) : (
              feedbackEvents.slice(0, 5).map((event: any, i: number) => (
                <div key={event.id ?? i} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    event.type === "escalation" ? "bg-red-500" :
                    event.type === "blocker" ? "bg-amber-500" :
                    event.type === "completion" ? "bg-emerald-500" :
                    "bg-blue-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink truncate">
                      {event.summary || event.action}
                    </p>
                    <p className="text-3xs text-ink-muted">
                      {event.occurredAt ? new Date(event.occurredAt).toLocaleString() : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
