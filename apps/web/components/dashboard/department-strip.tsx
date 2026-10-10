import Link from "next/link";

import { departmentHealth } from "../../lib/health-score";

/**
 * The executive department strip (docs/85 §6 P3).
 *
 * One row per department on the company HQ, showing what state it is in and how
 * it is doing, and linking into its workspace. This is the "state per department"
 * the dashboard was missing: before it, a founder could see every department's
 * employees but not which department was waiting on them.
 *
 * Every number is read from `GET /v1/departments/overview`; the state and the
 * health score are derived here from those counts with the same rule the
 * department page uses, so the two surfaces cannot disagree.
 *
 * State priority is docs/85 §4: needs you > blocked > working > queued > idle >
 * empty > archived. `blocked` is derived — ORQ8 has no blocked task status — so
 * it means "a recent failure with nothing progressing".
 */

export interface DepartmentOverviewRow {
  id: string;
  name: string;
  description: string | null;
  templateSlug: string | null;
  head: string | null;
  state:
    | "needs_you"
    | "blocked"
    | "working"
    | "queued"
    | "idle"
    | "empty"
    | "archived";
  counts: {
    membersTotal: number;
    membersActive: number;
    membersPaused: number;
    tasksDone30d: number;
    tasksFailed30d: number;
    tasksWorking: number;
    tasksQueued: number;
    gatesPending: number;
    oldestGateHours: number | null;
    budgetAmount: number | null;
    budgetRemaining: number | null;
  };
  lastActivityAt: string | null;
}

/** The console's nine-state vocabulary. Empty departments get no dot, not a lie. */
const STATE_DOT: Record<DepartmentOverviewRow["state"], string> = {
  needs_you: "waiting",
  blocked: "blocked",
  working: "working",
  queued: "",
  idle: "",
  empty: "",
  archived: "offline",
};

const STATE_LABEL: Record<DepartmentOverviewRow["state"], string> = {
  needs_you: "Needs you",
  blocked: "Blocked",
  working: "Working",
  queued: "Queued",
  idle: "Idle",
  empty: "No employees",
  archived: "Archived",
};

function tone(score: number): string {
  if (score >= 70) return "var(--orq-mark-active)";
  if (score >= 40) return "var(--orq-warm)";
  return "var(--orq-error)";
}

function lastActiveLabel(iso: string | null): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return null;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function DepartmentStrip({ rows }: { rows: DepartmentOverviewRow[] }) {
  if (rows.length === 0) return null;

  // Attention first: a founder scanning the strip must hit the department that
  // needs them before the ones that are fine. `needs_you` and `blocked` lead;
  // otherwise newest activity first.
  const order: DepartmentOverviewRow["state"][] = [
    "needs_you",
    "blocked",
    "working",
    "queued",
    "idle",
    "empty",
    "archived",
  ];
  const sorted = [...rows].sort((a, b) => {
    const byState = order.indexOf(a.state) - order.indexOf(b.state);
    if (byState !== 0) return byState;
    return (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "");
  });

  return (
    <section className="console-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
          Departments
        </h2>
        <Link
          href="/app/departments"
          className="text-xs text-muted transition-colors hover:text-ink"
        >
          All departments →
        </Link>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((row) => {
          const health = departmentHealth({
            membersActive: row.counts.membersActive,
            membersTotal: row.counts.membersTotal,
            tasksDone: row.counts.tasksDone30d,
            tasksFailed: row.counts.tasksFailed30d,
            tasksWorking: row.counts.tasksWorking,
            tasksQueued: row.counts.tasksQueued,
            gatesPending: row.counts.gatesPending,
            budgetAmount: row.counts.budgetAmount,
            budgetRemaining: row.counts.budgetRemaining,
          });
          const lastActive = lastActiveLabel(row.lastActivityAt);
          const parts = [
            row.counts.membersTotal === 0
              ? "no employees"
              : `${row.counts.membersActive}/${row.counts.membersTotal} active`,
            row.counts.tasksWorking > 0 ? `${row.counts.tasksWorking} working` : null,
            row.counts.tasksQueued > 0 ? `${row.counts.tasksQueued} queued` : null,
            row.counts.gatesPending > 0
              ? `${row.counts.gatesPending} gate${row.counts.gatesPending !== 1 ? "s" : ""} waiting`
              : null,
            row.counts.tasksFailed30d > 0 ? `${row.counts.tasksFailed30d} failed 30d` : null,
          ].filter((p): p is string => !!p);

          return (
            <Link
              key={row.id}
              href={`/app/departments/${row.id}`}
              className="group block rounded-md border border-hairline bg-canvas p-3 transition-colors hover:bg-surface-secondary"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="state-dot shrink-0"
                    data-state={STATE_DOT[row.state]}
                    aria-hidden="true"
                  />
                  <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                </div>
                <span
                  className="shrink-0 font-mono text-sm font-semibold tabular-nums"
                  style={{ color: tone(health.score) }}
                  title={`${health.label} — per-department health`}
                >
                  {health.score}
                </span>
              </div>

              <p className="mt-1 font-mono text-2xs uppercase tracking-wide text-muted">
                {STATE_LABEL[row.state]}
                {row.head ? ` · ${row.head}` : ""}
              </p>

              <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-hairline" aria-hidden="true">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${health.score}%`, background: tone(health.score) }}
                />
              </div>

              <p className="mt-1.5 truncate text-xs text-muted">
                {parts.length > 0 ? parts.join(" · ") : "nothing recorded yet"}
              </p>
              <p className="mt-0.5 truncate text-2xs text-muted">
                {lastActive ? `last activity ${lastActive}` : "no activity yet"}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
