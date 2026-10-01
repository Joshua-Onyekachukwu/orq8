"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowUpRight,
  Clock,
  FileText,
  Loader2,
  PlayCircle,
  RotateCcw,
} from "lucide-react";

/**
 * Work board (docs/71 §I, mock screen "Tasks").
 *
 * Three columns — Backlog / In progress / Done — plus a detail pane for the
 * selected card. Every column, chip and number is derived from the task rows
 * the API returned; nothing here is invented. The order inside Backlog follows
 * the founder's priority vocabulary (urgent → high → normal → low) so the top
 * card is genuinely the next thing that should run.
 */

export interface WorkTask {
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
  updatedAt?: string | null;
}

export interface WorkAgent {
  id: string;
  name: string;
  role: string;
}

export interface WorkGoal {
  id: string;
  title: string;
}

type ColumnKey = "backlog" | "progress" | "done";
type Filter = "all" | "backlog" | "progress" | "approval" | "done";

const COLUMNS: { key: ColumnKey; label: string; hint: string }[] = [
  { key: "backlog", label: "Backlog", hint: "What runs next — priority order." },
  { key: "progress", label: "In progress", hint: "Live work and anything paused for you." },
  { key: "done", label: "Done", hint: "Finished work, newest first. Nothing is deleted." },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "backlog", label: "Pending" },
  { key: "progress", label: "In progress" },
  { key: "approval", label: "Needs approval" },
  { key: "done", label: "Done" },
];

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function columnFor(status: string): ColumnKey {
  if (status === "in_progress" || status === "awaiting_approval") return "progress";
  if (status === "completed" || status === "failed" || status === "cancelled") return "done";
  return "backlog";
}

/** Chip label + state-dot state, using the locked status vocabulary. */
function chip(status: string): { label: string; state: string } {
  switch (status) {
    case "in_progress":
      return { label: "Working", state: "working" };
    case "awaiting_approval":
      return { label: "Paused — approval", state: "waiting" };
    case "completed":
      return { label: "Done", state: "done" };
    case "failed":
      return { label: "Failed", state: "blocked" };
    case "cancelled":
      return { label: "Cancelled", state: "" };
    default:
      return { label: "Draft", state: "" };
  }
}

function matchesFilter(task: WorkTask, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "approval") return task.status === "awaiting_approval";
  if (filter === "backlog") return columnFor(task.status) === "backlog";
  if (filter === "progress") return task.status === "in_progress";
  return columnFor(task.status) === "done";
}

function formatCredits(cents: number): string {
  // Tasks store cost in cents; the product shows whole credits.
  return `${Math.round(cents / 100)} Cr`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const minutes = Math.round((Date.now() - d.getTime()) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-hairline-strong bg-canvas text-3xs font-medium text-muted">
      {initial}
    </span>
  );
}

export function WorkBoard({
  tasks,
  agents,
  goals,
}: {
  tasks: WorkTask[];
  agents: WorkAgent[];
  goals: WorkGoal[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acting, setActing] = useState<null | "execute" | "retry">(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const goalMap = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);

  const visible = useMemo(() => tasks.filter((t) => matchesFilter(t, filter)), [tasks, filter]);

  const byColumn = useMemo(() => {
    const groups: Record<ColumnKey, WorkTask[]> = { backlog: [], progress: [], done: [] };
    for (const task of visible) groups[columnFor(task.status)].push(task);
    // Backlog reads in priority order; the other two read newest-first.
    groups.backlog.sort(
      (a, b) =>
        (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
        +new Date(b.createdAt) - +new Date(a.createdAt),
    );
    groups.progress.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    groups.done.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return groups;
  }, [visible]);

  const selected = useMemo(
    () => visible.find((t) => t.id === selectedId) ?? tasks.find((t) => t.id === selectedId) ?? null,
    [visible, tasks, selectedId],
  );

  const runAction = async (kind: "execute" | "retry") => {
    if (!selected) return;
    setActing(kind);
    setActionError(null);
    try {
      const res = await fetch(`/api/commands/tasks/${selected.id}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error?.message ?? "The task could not be started.");
      }
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The task could not be started.");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === f.key
                ? "border-hairline-strong bg-elevated text-ink"
                : "border-hairline text-muted hover:border-hairline-strong hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-3.5 lg:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_320px]">
        {COLUMNS.map((col) => {
          const items = byColumn[col.key];
          return (
            <section key={col.key} className="console-card p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                  {col.label}
                </span>
                <span className="ml-auto font-mono text-2xs text-muted">{items.length}</span>
              </div>
              <p className="mt-0.5 mb-2.5 text-2xs text-muted/80">{col.hint}</p>

              {items.length === 0 ? (
                <p className="rounded-md border border-dashed border-hairline px-3 py-6 text-center text-xs text-muted">
                  Nothing here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {items.map((task) => {
                    const c = chip(task.status);
                    const agent = task.agentId ? agentMap.get(task.agentId) : null;
                    const isSelected = selectedId === task.id;
                    return (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(task.id)}
                          className={`w-full rounded-lg border bg-canvas p-2.5 text-left transition-colors ${
                            isSelected
                              ? "border-brand"
                              : "border-hairline hover:border-hairline-strong"
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="state-dot" data-state={c.state} />
                            <span className="font-mono text-3xs uppercase tracking-wide text-muted">
                              {c.label}
                            </span>
                            <span className="ml-auto font-mono text-3xs text-muted">
                              {formatWhen(task.createdAt)}
                            </span>
                          </span>
                          <span className="mt-1.5 block text-xs font-semibold text-ink">
                            {task.title}
                          </span>
                          <span className="mt-1.5 flex items-center gap-1.5">
                            <Avatar name={agent?.name ?? "?"} />
                            <span className="truncate text-3xs text-muted">
                              {agent ? `${agent.name}` : "Unassigned"}
                              {task.cost > 0 ? ` · ${formatCredits(task.cost)}` : ""}
                            </span>
                            {task.priority === "urgent" || task.priority === "high" ? (
                              <span className="ml-auto rounded-full bg-warm-soft px-1.5 py-0.5 font-mono text-3xs uppercase text-warm-ink">
                                {task.priority}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}

        {/* Detail pane — the mock's sticky right column. On narrower screens it
            becomes a full-width panel below the board. */}
        <aside className="console-card p-4 lg:col-span-3 xl:col-span-1 xl:sticky xl:top-20">
          {!selected ? (
            <div className="py-8 text-center">
              <FileText className="mx-auto h-7 w-7 text-muted/40" />
              <p className="mt-3 text-sm font-medium text-ink">Select a card</p>
              <p className="mt-1 text-xs text-muted">
                The task&rsquo;s brief, result and actions appear here.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="state-dot" data-state={chip(selected.status).state} />
                <span className="font-mono text-2xs uppercase tracking-wide text-muted">
                  {chip(selected.status).label}
                </span>
                <Link
                  href={`/app/tasks/${selected.id}`}
                  className="ml-auto inline-flex items-center gap-1 text-2xs text-muted transition-colors hover:text-ink"
                >
                  Full task <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>

              <h3 className="mt-2 text-sm font-semibold text-ink">{selected.title}</h3>

              <dl className="mt-3 space-y-1 text-2xs">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted">Assignee</dt>
                  <dd className="text-ink">
                    {selected.agentId && agentMap.get(selected.agentId) ? (
                      <Link
                        href={`/app/agents/${selected.agentId}`}
                        className="hover:text-brand-ink"
                      >
                        {agentMap.get(selected.agentId)!.name}
                      </Link>
                    ) : (
                      "Unassigned"
                    )}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted">Goal</dt>
                  <dd className="text-ink">
                    {selected.goalId && goalMap.get(selected.goalId) ? (
                      <Link href={`/app/goals/${selected.goalId}`} className="hover:text-brand-ink">
                        {goalMap.get(selected.goalId)!.title}
                      </Link>
                    ) : (
                      "Standalone"
                    )}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted">Cost</dt>
                  <dd className="font-mono tabular-nums text-ink">{formatCredits(selected.cost)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-muted">Created</dt>
                  <dd className="text-ink">{formatWhen(selected.createdAt)}</dd>
                </div>
              </dl>

              {selected.description && (
                <>
                  <h4 className="mt-4 font-mono text-3xs uppercase tracking-wide text-muted">
                    Brief
                  </h4>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink">
                    {selected.description}
                  </p>
                </>
              )}

              {selected.result && (
                <>
                  <h4 className="mt-4 font-mono text-3xs uppercase tracking-wide text-muted">
                    Result
                  </h4>
                  <p className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-hairline bg-canvas p-2.5 text-2xs leading-relaxed text-muted">
                    {selected.result}
                  </p>
                </>
              )}

              {actionError && (
                <p className="mt-3 flex items-start gap-1.5 text-2xs text-error-ink">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  {actionError}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {selected.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => void runAction("execute")}
                    disabled={acting !== null}
                    className="inline-flex items-center gap-1.5 rounded-full bg-warm px-3 py-1.5 text-2xs font-semibold text-on-warm transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {acting === "execute" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <PlayCircle className="h-3 w-3" />
                    )}
                    {acting === "execute" ? "Running…" : "Run now"}
                  </button>
                )}
                {selected.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => void runAction("retry")}
                    disabled={acting !== null}
                    className="inline-flex items-center gap-1.5 rounded-full bg-warm px-3 py-1.5 text-2xs font-semibold text-on-warm transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {acting === "retry" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    {acting === "retry" ? "Retrying…" : "Retry this task"}
                  </button>
                )}
                {selected.status === "awaiting_approval" && (
                  <Link
                    href="/app/approvals"
                    className="inline-flex items-center gap-1.5 rounded-full border border-warm bg-warm-soft px-3 py-1.5 text-2xs font-semibold text-warm-ink"
                  >
                    <Clock className="h-3 w-3" />
                    Waiting on your decision
                  </Link>
                )}
                <span className="font-mono text-3xs text-muted">
                  {selected.priority} priority
                </span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
