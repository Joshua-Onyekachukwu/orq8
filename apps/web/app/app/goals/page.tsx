import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { fetchWithAuth } from "../../../lib/api";
import { GoalActions } from "../../../components/goal-actions";
import { TaskActions } from "../../../components/task-actions";
import { PageContainer } from "../../../components/layout/page-container";

export const metadata = { title: "Goals" };

/**
 * Goals (docs/71 §H, marketing/headquarters-mock-v2.html `screen-goals`).
 *
 * The mock's composition: one expandable row per commitment — status chip,
 * title, progress meter, "N steps · due date" — and, expanded, the lineage
 * chain the goal hangs off plus its plan steps as chips carrying the real task
 * status and the employee who owns them.
 *
 * Nothing on this page is invented: lineage comes from `GET /v1/goals/lineage`
 * (derived from the goal's tasks → initiative → key result → objective →
 * strategy, because `goals` has no strategy columns), the steps are the real
 * tasks, and a step the founder is holding up says "Paused" because an open
 * gate names it in `gatedWork`. A row with no lineage says so.
 */

/* ── Types ────────────────────────────────────────────────────────────── */

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
  status: string;
  goalId: string | null;
  agentId: string | null;
  cost: number;
  createdAt: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface GatedWork {
  taskId: string | null;
}

interface Approval {
  id: string;
  status: string;
  gatedWork?: GatedWork | null;
}

interface LineageLink {
  id: string;
  title: string;
}

interface GoalLineage {
  goalId: string;
  initiative: LineageLink | null;
  keyResult: LineageLink | null;
  objective: LineageLink | null;
  strategy: LineageLink | null;
}

/* ── Reads ────────────────────────────────────────────────────────────── */

const fetchGoals = async () =>
  (await fetchWithAuth<Goal[]>("/v1/goals?limit=200", { revalidate: false })) ?? [];
const fetchTasks = async () =>
  (await fetchWithAuth<Task[]>("/v1/tasks?order=desc&limit=200", { revalidate: false })) ?? [];
const fetchAgents = async () =>
  (await fetchWithAuth<Agent[]>("/v1/agents", { revalidate: false })) ?? [];
const fetchLineage = async () =>
  (await fetchWithAuth<GoalLineage[]>("/v1/goals/lineage", { revalidate: false })) ?? [];
const fetchOpenGates = async () =>
  (await fetchWithAuth<Approval[]>("/v1/approvals?status=pending&limit=200", { revalidate: false })) ??
  [];

/* ── Derivations ──────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

function dueLabel(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const date = due.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const days = Math.ceil((due.getTime() - Date.now()) / DAY_MS);
  if (days < -1) return `due ${date} · ${Math.abs(days)}d late`;
  if (days === -1) return `due ${date} · 1d late`;
  if (days === 0) return "due today";
  return `due ${date}`;
}

type Dot = "" | "working" | "waiting" | "blocked";
type Tone = "ok" | "warn" | "danger" | "muted";

/** The row's status chip, from the goal's own state and the work under it. */
function goalState(
  goal: Goal,
  steps: Task[],
  gatedSteps: Set<string>,
): { label: string; dot: Dot; tone: Tone } {
  const done = steps.filter((t) => t.status === "completed").length;
  const working = steps.filter((t) => t.status === "in_progress").length;
  const failed = steps.filter((t) => t.status === "failed").length;
  const paused = steps.filter((t) => gatedSteps.has(t.id)).length;
  const overdue =
    goal.dueDate !== null &&
    !Number.isNaN(new Date(goal.dueDate).getTime()) &&
    new Date(goal.dueDate).getTime() < Date.now() &&
    goal.progress < 100;

  if (goal.status === "completed") return { label: "Achieved", dot: "working", tone: "ok" };
  if (goal.status === "cancelled") return { label: "Cancelled", dot: "", tone: "muted" };
  if (goal.status === "paused") return { label: "Paused", dot: "", tone: "muted" };
  if (paused > 0) return { label: "Needs you", dot: "waiting", tone: "warn" };
  if (failed > 0 && done === 0) return { label: "At risk", dot: "blocked", tone: "danger" };
  if (overdue) return { label: "Overdue", dot: "waiting", tone: "warn" };
  if (working > 0) return { label: "On track", dot: "working", tone: "ok" };
  if (done > 0) return { label: "In progress", dot: "", tone: "ok" };
  if (steps.length === 0) return { label: "Planned", dot: "", tone: "muted" };
  return { label: "Planned", dot: "", tone: "muted" };
}

const METER_COLOR: Record<Tone, string> = {
  ok: "var(--orq-mark-active)",
  warn: "var(--orq-warm)",
  danger: "var(--orq-error)",
  muted: "var(--orq-border-strong)",
};

/** A step's chip, in the mock's grammar: only real states get a dot + label. */
function stepState(task: Task, gatedSteps: Set<string>): { label: string; dot: Dot; tone: Tone } | null {
  if (gatedSteps.has(task.id)) return { label: "Paused", dot: "waiting", tone: "warn" };
  if (task.status === "in_progress") return { label: "Working", dot: "working", tone: "ok" };
  if (task.status === "completed") return { label: "Done", dot: "", tone: "muted" };
  if (task.status === "failed") return { label: "Failed", dot: "blocked", tone: "danger" };
  if (task.status === "cancelled") return { label: "Cancelled", dot: "", tone: "muted" };
  return null;
}

/** Live work first, then failures, then what is queued, then what is finished. */
const STEP_RANK: Record<string, number> = {
  in_progress: 0,
  failed: 1,
  pending: 2,
  completed: 3,
  cancelled: 4,
};

function sortSteps(steps: Task[]): Task[] {
  return [...steps].sort((a, b) => {
    const rank = (STEP_RANK[a.status] ?? 9) - (STEP_RANK[b.status] ?? 9);
    if (rank !== 0) return rank;
    return +new Date(b.createdAt) - +new Date(a.createdAt);
  });
}

/* ── Pieces ───────────────────────────────────────────────────────────── */

function Chip({
  label,
  dot = "",
  tone = "muted",
  size = "sm",
}: {
  label: string;
  dot?: Dot;
  tone?: Tone;
  size?: "sm" | "xs";
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-hairline font-mono uppercase tracking-wide ${
        size === "xs" ? "px-2 py-0.5 text-3xs" : "px-2.5 py-1 text-2xs"
      } ${tone === "muted" ? "text-muted" : "text-ink"}`}
    >
      {dot ? <span className="state-dot" data-state={dot} aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

/** One line of the lineage chain. The last chip is where this goal sits. */
function Crumb({ label, here = false }: { label: string; here?: boolean }) {
  return (
    <Link
      href="/app/strategy"
      className={`rounded-full border px-2.5 py-1 text-2xs transition-colors ${
        here
          ? "border-hairline-strong bg-elevated text-ink"
          : "border-hairline text-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

function LineageChain({ goal, lineage }: { goal: Goal; lineage: GoalLineage | undefined }) {
  const links = [
    lineage?.strategy ? `Strategy: ${lineage.strategy.title}` : null,
    lineage?.objective ? `Objective: ${lineage.objective.title}` : null,
    lineage?.keyResult ? `Key result: ${lineage.keyResult.title}` : null,
    lineage?.initiative ? `Initiative: ${lineage.initiative.title}` : null,
  ].filter((label): label is string => label !== null);

  if (links.length === 0) {
    return (
      <p className="text-xs text-muted">
        No strategy link yet — none of this goal&apos;s steps sit under an initiative.{" "}
        <Link href="/app/strategy" className="text-ink transition-colors hover:text-brand-ink">
          Open Strategy
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {links.map((label, index) => (
        <span key={label} className="flex items-center gap-1.5">
          {index > 0 ? (
            <span aria-hidden="true" className="text-3xs text-muted">
              →
            </span>
          ) : null}
          <Crumb label={label} />
        </span>
      ))}
      <span aria-hidden="true" className="text-3xs text-muted">
        →
      </span>
      <Crumb label={`Goal: ${goal.title}`} here />
    </div>
  );
}

function GoalRow({
  goal,
  steps,
  agentName,
  lineage,
  gatedSteps,
}: {
  goal: Goal;
  steps: Task[];
  agentName: (agentId: string | null) => string | null;
  lineage: GoalLineage | undefined;
  gatedSteps: Set<string>;
}) {
  const state = goalState(goal, steps, gatedSteps);
  const ordered = sortSteps(steps);
  const due = dueLabel(goal.dueDate);
  const done = steps.filter((t) => t.status === "completed").length;
  const spent = steps.reduce((sum, t) => sum + (t.cost ?? 0), 0);
  const progress = Math.max(0, Math.min(100, goal.progress));

  return (
    <details
      className="console-card group overflow-hidden transition-colors open:border-hairline-strong"
      open={state.label === "Needs you"}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <Chip label={state.label} dot={state.dot} tone={state.tone} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{goal.title}</span>
        <span
          className="hidden h-1.5 w-36 shrink-0 overflow-hidden rounded-full bg-hairline sm:block"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full"
            style={{ width: `${progress}%`, backgroundColor: METER_COLOR[state.tone] }}
          />
        </span>
        <span className="shrink-0 font-mono text-2xs text-muted">
          {steps.length === 1 ? "1 step" : `${steps.length} steps`}
          {due ? ` · ${due}` : ""}
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 text-2xs text-muted transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>

      <div className="border-t border-hairline px-4 py-4">
        <LineageChain goal={goal} lineage={lineage} />

        <p className="mt-4 font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
          Plan steps
        </p>

        {ordered.length === 0 ? (
          <p className="mt-2 text-xs text-muted">
            Atlas has not broken this goal into steps yet. Ask it to plan the work from the{" "}
            <Link href="/app/tasks" className="text-ink transition-colors hover:text-brand-ink">
              task board
            </Link>
            .
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ordered.map((step) => {
              const stepChip = stepState(step, gatedSteps);
              const owner = agentName(step.agentId);
              return (
                <Link
                  key={step.id}
                  href={`/app/tasks/${step.id}`}
                  className="inline-flex max-w-full items-center gap-2 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-ink transition-colors hover:border-hairline-strong hover:bg-elevated"
                >
                  {stepChip ? (
                    <Chip label={stepChip.label} dot={stepChip.dot} tone={stepChip.tone} size="xs" />
                  ) : null}
                  <span className="min-w-0 truncate">{step.title}</span>
                  {owner ? <span className="shrink-0 text-muted">· {owner}</span> : null}
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs text-muted">
          <span>
            {done}/{steps.length} done · {progress}% complete
          </span>
          {spent > 0 ? <span>${(spent / 100).toFixed(2)} spent</span> : null}
          <Link
            href={`/app/goals/${goal.id}`}
            className="ml-auto inline-flex items-center gap-1 font-sans text-xs text-ink transition-colors hover:text-brand-ink"
          >
            Open goal
            <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </details>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default async function GoalsPage() {
  const [goals, tasks, agents, lineage, openGates] = await Promise.all([
    fetchGoals(),
    fetchTasks(),
    fetchAgents(),
    fetchLineage(),
    fetchOpenGates(),
  ]);

  const goalList = goals;
  const taskList = tasks;
  const nameById = new Map(agents.map((a) => [a.id, a.name]));
  const lineageByGoal = new Map(lineage.map((row) => [row.goalId, row]));
  const gatedSteps = new Set(
    openGates
      .map((approval) => approval.gatedWork?.taskId ?? null)
      .filter((taskId): taskId is string => taskId !== null),
  );
  const stepsByGoal = new Map<string, Task[]>();
  for (const task of taskList) {
    if (!task.goalId) continue;
    const list = stepsByGoal.get(task.goalId);
    if (list) list.push(task);
    else stepsByGoal.set(task.goalId, [task]);
  }

  const active = goalList.filter((g) => g.status === "active").length;
  const unplanned = taskList.filter((t) => !t.goalId).length;

  return (
    <PageContainer
      width="standard"
      kicker={`Commitments · ${active} active`}
      title="Goals"
      lede="Each goal is a commitment with a plan. Expand one to see its steps and lineage."
      actions={
        <>
          <TaskActions agents={agents} />
          <GoalActions />
        </>
      }
      pageName="Goals"
      backHref="/app"
    >
      <div className="space-y-4">
        {goalList.length === 0 ? (
          <div className="console-card p-8">
            <p className="text-sm font-medium text-ink">No goals yet</p>
            <p className="mt-1 max-w-xl text-xs text-muted">
              A goal is a commitment — what the company is trying to make true, and by when. Atlas
              breaks it into steps, assigns them to your AI employees, and reports progress here.
            </p>
            <div className="mt-3">
              <GoalActions />
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {goalList.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                steps={stepsByGoal.get(goal.id) ?? []}
                lineage={lineageByGoal.get(goal.id)}
                gatedSteps={gatedSteps}
                agentName={(agentId) => (agentId ? nameById.get(agentId) ?? null : null)}
              />
            ))}
          </div>
        )}

        {unplanned > 0 ? (
          <p className="text-xs text-muted">
            {unplanned === 1 ? "1 task is" : `${unplanned} tasks are`} not attached to a goal. They
            run from the{" "}
            <Link href="/app/tasks" className="text-ink transition-colors hover:text-brand-ink">
              task board
            </Link>
            .
          </p>
        ) : null}
      </div>
    </PageContainer>
  );
}
