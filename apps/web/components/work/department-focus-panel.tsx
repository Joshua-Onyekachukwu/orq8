"use client";

/**
 * Engineering focus (docs/86 §6).
 *
 * Renders the department-scoped read-model the API returns at
 * `detail.focus.engineering`. The shape distinguishes two scopes and this panel
 * keeps them visibly separate, because blurring them would be a lie:
 *
 *   this department  — engineering work and reviews whose author is one of the
 *                      department's own employees
 *   workspace-wide   — repositories and sandbox runs, which have no employee
 *                      column at all (a repository belongs to the org; a run
 *                      belongs to a repository)
 *
 * It is the reason an engineering department page looks like engineering and
 * not like a task list with a different name.
 */

import Link from "next/link";

import { OsEmptyPanel, OsFacts, OsMetricRow, OsSection, OsStateBadge, type OsMetric } from "../os/structure";
import { type DotState, StateDot, formatTimeAgo } from "../os/primitives";

export interface EngineeringFocusData {
  work: Array<{
    id: string;
    title: string;
    status: string;
    branch: string;
    assigneeId: string;
    prId: string | null;
    updatedAt: string;
  }>;
  reviews: Array<{
    id: string;
    title: string;
    status: string;
    state: string;
    headBranch: string;
    repositoryId: string;
    updatedAt: string;
  }>;
  repositories: Array<{
    id: string;
    name: string;
    fullName: string;
    defaultBranch: string;
    lastSyncedAt: string;
  }>;
  sandbox: Array<{
    id: string;
    command: string;
    state: string;
    exitCode: number | null;
    startedAt: string | null;
  }>;
  counts: {
    repositories: number;
    workOpen: number;
    workCompleted: number;
    workFailed: number;
    reviewsOpen: number;
    sandboxRunning: number;
  };
}

/**
 * engineering_tasks.status → the shared state vocabulary. Exported because the
 * engineering page renders the same statuses from a different read (the
 * workspace-wide `/api/engineering/tasks`) and two mappers would drift — which
 * is exactly how a failed run came to render as `blocked` in one place and
 * `failed` in another.
 */
export function workState(status: string): { state: DotState; label: string } {
  if (status === "planning") return { state: "waiting", label: "Planning" };
  if (status === "implemented") return { state: "review", label: "Implemented" };
  if (status === "tested") return { state: "review", label: "Tested" };
  if (status === "review") return { state: "review", label: "In review" };
  if (status === "completed") return { state: "done", label: "Completed" };
  if (status === "failed") return { state: "failed", label: "Failed" };
  return { state: "", label: status };
}

/** repository_prs.status → the shared state vocabulary. */
export function prState(status: string): { state: DotState; label: string } {
  if (status === "pending_review") return { state: "waiting", label: "Awaiting review" };
  if (status === "changes_requested") return { state: "blocked", label: "Changes requested" };
  if (status === "approved") return { state: "review", label: "Approved" };
  if (status === "merged") return { state: "done", label: "Merged" };
  if (status === "rejected") return { state: "failed", label: "Rejected" };
  return { state: "", label: status };
}

/** sandbox_runs.state → the shared state vocabulary. */
export function runState(state: string): { state: DotState; label: string } {
  if (state === "running") return { state: "working", label: "Running" };
  if (state === "queued") return { state: "", label: "Queued" };
  if (state === "completed") return { state: "done", label: "Completed" };
  if (state === "failed" || state === "timeout") return { state: "failed", label: state };
  if (state === "cancelled") return { state: "paused", label: "Cancelled" };
  return { state: "", label: state };
}

export function DepartmentFocusPanel({
  focus,
  departmentName,
  agentNameById,
}: {
  focus: EngineeringFocusData;
  departmentName: string;
  agentNameById: Map<string, string>;
}) {
  const metrics: OsMetric[] = [
    {
      key: "workOpen",
      label: "Engineering in flight",
      value: focus.counts.workOpen,
      sub: "implemented, tested or in review",
    },
    {
      key: "reviewsOpen",
      label: "Reviews open",
      value: focus.counts.reviewsOpen,
      sub: "authored by this department",
      tone: focus.counts.reviewsOpen > 0 ? "warn" : "default",
    },
    {
      key: "workFailed",
      label: "Failed work",
      value: focus.counts.workFailed,
      sub: focus.counts.workFailed > 0 ? "needs a look" : "nothing failed",
      tone: focus.counts.workFailed > 0 ? "bad" : "default",
    },
    {
      key: "sandboxRunning",
      label: "Sandbox running",
      value: focus.counts.sandboxRunning,
      sub: "workspace-wide",
    },
  ];

  return (
    <OsSection
      id="focus"
      title="Engineering focus"
      description="What this department is building, reviewing and running — scoped to its own employees."
      emphasis
    >
      <OsMetricRow metrics={metrics} />

      {/* Member-scoped: the department's own engineering work. */}
      <div className="rounded-lg border border-hairline bg-canvas p-4">
        <p className="font-mono text-2xs tracking-wider text-muted uppercase">
          Work owned by {departmentName}
        </p>
        {focus.work.length === 0 ? (
          <div className="mt-2">
            <OsEmptyPanel
              title="No engineering work recorded for this department's employees yet."
              hint="Work appears here when an employee is assigned a repository task."
            />
          </div>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {focus.work.map((w) => {
              const s = workState(w.status);
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <StateDot state={s.state} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{w.title}</span>
                  <span className="font-mono text-3xs text-muted">{w.branch}</span>
                  <span className="text-2xs text-muted">
                    {agentNameById.get(w.assigneeId) ?? "employee"}
                  </span>
                  <OsStateBadge state={s.state} label={s.label} />
                  {w.prId ? (
                    <Link
                      href={`/app/engineering`}
                      className="font-mono text-3xs text-muted underline underline-offset-4 hover:text-ink"
                    >
                      PR
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Member-scoped: reviews this department authored. */}
      <div className="rounded-lg border border-hairline bg-canvas p-4">
        <p className="font-mono text-2xs tracking-wider text-muted uppercase">
          Reviews opened by this department
        </p>
        {focus.reviews.length === 0 ? (
          <div className="mt-2">
            <OsEmptyPanel title="No open pull requests from this department." />
          </div>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {focus.reviews.map((r) => {
              const s = prState(r.status);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <StateDot state={s.state} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.title}</span>
                  <span className="font-mono text-3xs text-muted">{r.headBranch}</span>
                  <OsStateBadge state={s.state} label={s.label} />
                  <span className="font-mono text-3xs text-muted">{formatTimeAgo(r.updatedAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Workspace-wide — explicitly labelled, because it is not this
          department's property and saying otherwise would mislead. */}
      <OsFacts
        columns={2}
        items={[
          {
            label: `Repositories the workspace works in (${focus.repositories.length})`,
            value:
              focus.repositories.length === 0 ? (
                <span className="text-muted">none connected</span>
              ) : (
                <ul className="space-y-1">
                  {focus.repositories.map((r) => (
                    <li key={r.id} className="font-mono text-2xs">
                      {r.fullName}{" "}
                      <span className="text-muted">· {r.defaultBranch}</span>
                    </li>
                  ))}
                </ul>
              ),
          },
          {
            label: `Recent sandbox runs (${focus.sandbox.length})`,
            value:
              focus.sandbox.length === 0 ? (
                <span className="text-muted">none recorded</span>
              ) : (
                <ul className="space-y-1">
                  {focus.sandbox.map((s) => {
                    const st = runState(s.state);
                    return (
                      <li key={s.id} className="flex items-center gap-2">
                        <StateDot state={st.state} />
                        <span className="min-w-0 flex-1 truncate font-mono text-2xs">{s.command}</span>
                        <span className="text-2xs text-muted">{st.label}</span>
                      </li>
                    );
                  })}
                </ul>
              ),
          },
        ]}
      />
      <p className="text-2xs text-muted">
        Repositories and sandbox runs are workspace-wide — ORQ8 records no owning employee for them,
        so they are never attributed to this department.
      </p>
    </OsSection>
  );
}
