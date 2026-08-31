import { cookies } from "next/headers";
import Link from "next/link";
import {
  Target,
  Plus,
  ArrowUpRight,
  ListChecks,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import { GoalActions } from "../../../components/goal-actions";
import { TaskActions } from "../../../components/task-actions";
import { PageShell } from "../../../components/page-shell";

export const metadata = { title: "Goals & Tasks" };

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  progress: number;
  priority: string;
  dueDate: string | null;
  createdAt: string;
}

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
}

interface Agent {
  id: string;
  name: string;
  role: string;
}

async function fetchGoals(): Promise<Goal[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return [];
  try {
    const res = await fetch(`${API_URL}/v1/goals`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: Goal[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

async function fetchTasks(): Promise<Task[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return [];
  try {
    const res = await fetch(`${API_URL}/v1/tasks`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: Task[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

function priorityBadge(priority: string) {
  switch (priority) {
    case "urgent": return "bg-red-100 text-red-700";
    case "high": return "bg-amber-50 text-amber-700";
    case "normal": return "bg-blue-50 text-blue-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-4 w-4 text-emerald" />;
    case "in_progress": return <Clock className="h-4 w-4 text-blue-500" />;
    case "failed": return <AlertCircle className="h-4 w-4 text-red-500" />;
    default: return <Clock className="h-4 w-4 text-muted" />;
  }
}

async function fetchAgents(): Promise<Agent[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return [];
  try {
    const res = await fetch(`${API_URL}/v1/agents`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: Agent[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

function formatDueDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
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
    return null;
  }
}

function dueDateBadge(dateStr: string | null) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return "bg-red-50 text-red-600";
    if (days <= 2) return "bg-amber-50 text-amber-700";
    return "bg-gray-100 text-gray-600";
  } catch {
    return "bg-gray-100 text-gray-600";
  }
}

export default async function GoalsPage() {
  const [goals, tasks, agents] = await Promise.all([fetchGoals(), fetchTasks(), fetchAgents()]);
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return (
    <PageShell pageName="Goals & Tasks" backHref="/app">
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Goals & Tasks</h1>
          <p className="mt-1 text-sm text-muted">
            Set outcomes, track progress, and watch your AI workforce execute.
          </p>
        </div>
        <GoalActions />
      </div>

      {/* Goals grid */}
      <section className="mt-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-semibold text-ink">Company Goals</h2>
          <span className="rounded-full bg-muted/10 px-2 py-0.5 font-mono text-[10px] text-muted">
            {goals.length}
          </span>
        </div>

        {goals.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-white p-10 text-center">
            <Target className="mx-auto h-8 w-8 text-muted/40" />
            <p className="mt-3 text-sm font-medium text-ink">No goals yet</p>
            <p className="mt-1 text-xs text-muted">
              Create your first goal to set the direction for your AI organization.
            </p>
            <GoalActions />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {goals.map((goal) => (
              <div
                key={goal.id}
                className="rounded-xl border border-hairline bg-white p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink truncate">
                        {goal.title}
                      </h3>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${priorityBadge(goal.priority)}`}
                      >
                        {goal.priority}
                      </span>
                    </div>
                    {goal.description && (
                      <p className="mt-1 text-xs text-muted line-clamp-2">
                        {goal.description}
                      </p>
                    )}
                    {goal.dueDate && (
                      <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${dueDateBadge(goal.dueDate)}`}>
                        {formatDueDate(goal.dueDate)}
                      </span>
                    )}
                  </div>
                  <GoalActions goalId={goal.id} currentStatus={goal.status} />
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[10px] text-muted mb-1">
                    <span className="uppercase font-semibold tracking-wide">Progress</span>
                    <span className="font-mono tabular-nums">{goal.progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald transition-all"
                      style={{ width: `${goal.progress}%` }}
                    />
                  </div>
                </div>

                {/* Tasks for this goal */}
                {(() => {
                  const goalTasks = tasks.filter((t) => t.goalId === goal.id);
                  if (goalTasks.length === 0) return null;
                  return (
                    <div className="mt-4 border-t border-hairline pt-3">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">
                        Tasks ({goalTasks.length})
                      </p>
                      <ul className="space-y-1.5">
                        {goalTasks.slice(0, 3).map((task) => (
                          <li key={task.id} className="flex items-center gap-2 text-xs">
                            {statusIcon(task.status)}
                            <span className="truncate text-ink">{task.title}</span>
                            {task.agentId && agentMap.get(task.agentId) && (
                              <span className="shrink-0 rounded-full bg-navy-900/5 px-1.5 py-0.5 text-[9px] font-medium text-navy-900">
                                {agentMap.get(task.agentId)!.name}
                              </span>
                            )}
                            {task.dueDate && (
                              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${dueDateBadge(task.dueDate)}`}>
                                {formatDueDate(task.dueDate)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Unlinked Tasks */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-ink">Standalone Tasks</h2>
            <span className="rounded-full bg-muted/10 px-2 py-0.5 font-mono text-[10px] text-muted">
              {tasks.filter((t) => !t.goalId).length}
            </span>
          </div>
          <TaskActions agents={agents} />
        </div>

        {tasks.filter((t) => !t.goalId).length === 0 ? (
          <div className="rounded-xl border border-hairline bg-white p-8 text-center">
            <ListChecks className="mx-auto h-6 w-6 text-muted/40" />
            <p className="mt-2 text-sm text-muted">
              All tasks are linked to goals, or no tasks exist yet.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-hairline bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-canvas text-left">
                  {['Task', 'Agent', 'Priority', 'Due', 'Status', 'Created'].map((h) => (
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
            {tasks
              .filter((t) => !t.goalId)
              .slice(0, 10)
              .map((task) => (
                <tr key={task.id}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {statusIcon(task.status)}
                      <div>
                        <p className="text-sm font-medium text-ink">{task.title}</p>
                        {task.description && (
                          <p className="text-xs text-muted truncate max-w-[300px]">
                            {task.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {task.agentId && agentMap.get(task.agentId) ? (
                      <span className="rounded-full bg-navy-900/5 px-2 py-0.5 text-[10px] font-medium text-navy-900">
                        {agentMap.get(task.agentId)!.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${priorityBadge(task.priority)}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    {task.dueDate ? (
                      <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${dueDateBadge(task.dueDate)}`}>
                        {formatDueDate(task.dueDate)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className="rounded-full bg-muted/10 px-2 py-0.5 font-mono text-[10px] uppercase">
                      {task.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-muted">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
    </PageShell>
  );
}
