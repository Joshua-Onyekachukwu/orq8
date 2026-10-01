import type { Metadata } from "next";
import { fetchWithAuth } from "../../../lib/api";
import { PageShell } from "../../../components/page-shell";
import { EAOpenButton } from "../../../components/dashboard/ea-open-button";
import {
  WorkBoard,
  type WorkAgent,
  type WorkGoal,
  type WorkTask,
} from "../../../components/work/work-board";

export const metadata: Metadata = {
  title: "Tasks",
  description: "Work planned from goals and by Atlas — what runs next, what is running, what is done.",
};

/**
 * Work → Tasks (docs/71 §I). The board the mock introduced: Backlog / In
 * progress / Done plus a detail pane.
 *
 * Server-rendered with `revalidate: false`: this is a founder-visibility
 * surface, and a board that shows work as "pending" after it has started is
 * worse than a slow one. Tasks come from `GET /v1/tasks` (newest first, cap
 * 200); the three reads are parallel.
 */
export default async function TasksPage() {
  const [tasks, agents, goals] = await Promise.all([
    fetchWithAuth<WorkTask[]>("/v1/tasks?order=desc&limit=200", { revalidate: false }),
    fetchWithAuth<WorkAgent[]>("/v1/agents", { revalidate: false }),
    fetchWithAuth<WorkGoal[]>("/v1/goals", { revalidate: false }),
  ]);

  const list = tasks ?? [];
  const running = list.filter((t) => t.status === "in_progress").length;
  const waiting = list.filter((t) => t.status === "awaiting_approval").length;
  const done = list.filter((t) => t.status === "completed").length;

  return (
    <PageShell pageName="Tasks" backHref="/app">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
            Work
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Tasks</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Work is assigned from goals and by Atlas. Approvals pause work that needs you —
            nothing else does.
          </p>
        </div>
        <EAOpenButton
          prompt="Plan the work for "
          className="inline-flex items-center rounded-full border border-hairline-strong px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:bg-elevated"
        >
          Ask Atlas to plan work
        </EAOpenButton>
      </div>

      {list.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs text-muted">
          <span>{list.length} tasks</span>
          {running > 0 && <span className="text-ink">{running} running</span>}
          {waiting > 0 && <span className="text-warm-ink">{waiting} waiting on you</span>}
          {done > 0 && <span>{done} done</span>}
        </p>
      )}

      {list.length === 0 ? (
        <div className="console-card mt-4 p-10 text-center">
          <p className="text-sm font-medium text-ink">No work yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted">
            Give Atlas a direction and it will plan the work, assign it to your AI employees, and
            show up here as it runs.
          </p>
        </div>
      ) : (
        <WorkBoard
          tasks={list}
          agents={agents ?? []}
          goals={goals ?? []}
        />
      )}
    </PageShell>
  );
}
