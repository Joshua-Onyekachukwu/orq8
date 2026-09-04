
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
import { fetchWithAuth } from "../../../lib/api";
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

const fetchGoals = async () => (await fetchWithAuth<Goal[]>("/v1/goals")) ?? [];
const fetchTasks = async () => (await fetchWithAuth<Task[]>("/v1/tasks")) ?? [];

function priorityBadge(priority: string) {
  switch (priority) {
    case "urgent": return "bg-red-100 text-red-700";
    case "high": return "bg-amber-50 text-amber-700";
    case "normal": return "bg-blue-50 text-blue-700";
    default: return "bg-hairline text-ink-muted";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-4 w-4 text-[#1a5c2e]" />;
    case "in_progress": return <Clock className="h-4 w-4 text-[#E86A33]" />;
    case "failed": return <AlertCircle className="h-4 w-4 text-red-500" />;
    default: return <Clock className="h-4 w-4 text-muted" />;
  }
}

const fetchAgents = async () => (await fetchWithAuth<Agent[]>("/v1/agents")) ?? [];

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
    return "bg-hairline text-ink-muted";
  } catch {
    return "bg-hairline text-ink-muted";
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
          <Target aria-hidden="true" className="h-4 w-4 text-[#1a5c2e]" />
          <h2 className="text-sm font-semibold text-ink">Company Goals</h2>
          <span className="rounded-full bg-muted/10 px-2 py-0.5 font-mono text-[10px] text-muted">
            {goals.length}
          </span>
        </div>

        {goals.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-white p-10 text-center">
            <Target aria-hidden="true" className="mx-auto h-8 w-8 text-muted/40" />
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
                      <Link href={`/app/goals/${goal.id}`} className="group">
                        <h3 className="truncate text-sm font-semibold text-ink group-hover:text-[#1a5c2e] transition-colors">
                          {goal.title}
                        </h3>
                      </Link>
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
                      className="h-full rounded-full bg-[#1a5c2e] transition-all"
                      style={{ width: `${goal.progress}%` }}
                    />
                  </div>
                </div>

                {/* Goal → Task flow visualization */}
                {(() => {
                  const goalTasks = tasks.filter((t) => t.goalId === goal.id);
                  if (goalTasks.length === 0) return null;
                  const completed = goalTasks.filter((t) => t.status === "completed").length;
                  const inProgress = goalTasks.filter((t) => t.status === "in_progress").length;
                  const failed = goalTasks.filter((t) => t.status === "failed").length;
                  const totalCost = goalTasks.reduce((sum, t) => sum + t.cost, 0);
                  const assignedAgents = new Set(goalTasks.filter((t) => t.agentId !== null).map((t) => agentMap.get(t.agentId!)?.name).filter(Boolean));

                  // Flow pipeline: Goal set → Tasks created → Agents working → Done → Achieved
                  const flowSteps = [
                    { label: "Goal set", done: true },
                    { label: `${goalTasks.length} tasks`, done: true },
                    { label: "Working", done: inProgress > 0, active: inProgress > 0 },
                    { label: `${completed}/${goalTasks.length} done`, done: completed === goalTasks.length },
                    { label: "Achieved", done: goal.status === "completed" || goal.progress === 100 },
                  ];

                  return (
                    <div className="mt-4 border-t border-hairline pt-3">
                      {/* Flow pipeline */}
                      <div className="flex items-center gap-1 mb-3">
                        {flowSteps.map((step, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                              step.done ? "bg-[#1a5c2e]/10 text-[#1a5c2e]" :
                              step.active ? "bg-[#E86A33]/10 text-[#E86A33]" :
                              "bg-hairline text-muted"
                            }`}>
                              {step.done && !step.active ? "✓" : step.active ? "●" : "○"} {step.label}
                            </span>
                            {i < flowSteps.length - 1 && <span className="text-muted text-[8px]">→</span>}
                          </div>
                        ))}
                      </div>

                      {/* Task list with agent + cost */}
                      <ul className="space-y-1.5">
                        {goalTasks.slice(0, 3).map((task) => (
                          <li key={task.id} className="flex items-center gap-2 text-xs">
                            {statusIcon(task.status)}
                            <Link href={`/app/tasks/${task.id}`} className="truncate text-ink hover:text-[#1a5c2e]">
                              {task.title}
                            </Link>
                            {task.agentId && agentMap.get(task.agentId) && (
                              <span className="shrink-0 rounded-full bg-[#1a5c2e]/10 px-1.5 py-0.5 text-[9px] font-medium text-[#1a5c2e]">
                                {agentMap.get(task.agentId)!.name}
                              </span>
                            )}
                            {task.cost > 0 && (
                              <span className="shrink-0 font-mono text-[9px] text-muted">${(task.cost / 100).toFixed(2)}</span>
                            )}
                          </li>
                        ))}
                      </ul>

                      {/* Summary */}
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted">
                        {assignedAgents.size > 0 && <span>{assignedAgents.size} agent{assignedAgents.size !== 1 ? "s" : ""} assigned</span>}
                        {totalCost > 0 && <span className="font-mono">${(totalCost / 100).toFixed(2)} total cost</span>}
                        {failed > 0 && <span className="text-red-500">{failed} failed</span>}
                      </div>
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
            <ListChecks aria-hidden="true" className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-ink">Standalone Tasks</h2>
            <span className="rounded-full bg-muted/10 px-2 py-0.5 font-mono text-[10px] text-muted">
              {tasks.filter((t) => !t.goalId).length}
            </span>
          </div>
          <TaskActions agents={agents} />
        </div>

        {tasks.filter((t) => !t.goalId).length === 0 ? (
          <div className="rounded-xl border border-hairline bg-white p-8 text-center">
            <ListChecks aria-hidden="true" className="mx-auto h-6 w-6 text-muted/40" />
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
                        <Link href={`/app/tasks/${task.id}`} className="hover:text-[#1a5c2e]">
                          <p className="text-sm font-medium text-ink">{task.title}</p>
                          {task.description && (
                            <p className="text-xs text-muted truncate max-w-[300px]">
                              {task.description}
                            </p>
                          )}
                        </Link>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {task.agentId && agentMap.get(task.agentId) ? (
                      <span className="rounded-full bg-[#0a0a0b]/5 px-2 py-0.5 text-[10px] font-medium text-[#0a0a0b]">
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
