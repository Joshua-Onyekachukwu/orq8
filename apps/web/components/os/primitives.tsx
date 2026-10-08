"use client";

/**
 * ORQ8 OS primitives (docs/85 §5).
 *
 * The shared building blocks the department workspace, the employee page and
 * the executive surfaces compose. One visual system: dense, operational, no
 * theatrics. Every primitive renders REAL fields from the API read-models —
 * nothing here invents activity.
 */

import Link from "next/link";

// ── Status system (docs/85 §4) ──────────────────────────────────────────────

export type DotState = "" | "working" | "waiting" | "blocked";

export interface OsStatus {
  label: string;
  state: DotState;
}

/** Canonical mapping from a task row's DB status (docs/85 §4 table). */
export function taskOsStatus(status: string): OsStatus {
  if (status === "in_progress") return { label: "Working", state: "working" };
  if (status === "awaiting_approval") return { label: "Waiting on a decision", state: "waiting" };
  if (status === "pending") return { label: "Queued", state: "" };
  if (status === "failed") return { label: "Failed", state: "blocked" };
  if (status === "completed") return { label: "Done", state: "" };
  if (status === "cancelled") return { label: "Cancelled", state: "" };
  return { label: status, state: "" };
}

/** Canonical mapping for an employee row. */
export function employeeOsStatus(status: string, currentTask: string | null): OsStatus {
  if (status === "archived") return { label: "Retired", state: "" };
  if (status === "paused") return { label: "Paused", state: "" };
  if (currentTask) return { label: "Working", state: "working" };
  return { label: "Idle", state: "" };
}

export function StateDot({ state, className = "" }: { state: DotState; className?: string }) {
  // Styled by the global [data-state] CSS the console already ships.
  return <span aria-hidden="true" className={`state-dot ${className}`} data-state={state} />;
}

export function StatusChip({ status, className = "" }: { status: OsStatus; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-2xs text-ink ${className}`}>
      <StateDot state={status.state} />
      {status.label}
    </span>
  );
}

// ── Formatting helpers (shared, single source) ─────────────────────────────

export function formatCost(cents: number): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

export function formatTimeAgo(iso?: string | Date | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "—";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Metric block ────────────────────────────────────────────────────────────

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-3.5">
      <p className="font-mono text-2xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1.5 text-xl font-semibold text-ink">{value}</p>
      {sub ? <p className="mt-0.5 text-2xs text-muted">{sub}</p> : null}
    </div>
  );
}

// ── Work card (tasks: now / queued / done) ─────────────────────────────────

export interface WorkCardTask {
  id: string;
  title: string;
  status: string;
  priority?: string;
  agentId: string | null;
  cost?: number;
  dueDate?: string | Date | null;
  result?: string | null;
  parentTaskId?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export function WorkCard({
  task,
  agentName,
  parentTitle,
  href,
}: {
  task: WorkCardTask;
  agentName?: string | null;
  parentTitle?: string | null;
  href?: string;
}) {
  const os = taskOsStatus(task.status);
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{task.title}</p>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-2xs text-muted">
          <StateDot state={os.state} />
          {os.label}
        </span>
      </div>
      <p className="mt-1 text-2xs text-muted">
        {agentName ?? "Unassigned"}
        {task.priority && task.priority !== "normal" ? ` · ${task.priority}` : ""}
        {task.cost ? ` · ${formatCost(task.cost)}` : ""}
        {task.updatedAt ? ` · ${formatTimeAgo(task.updatedAt)}` : task.createdAt ? ` · ${formatTimeAgo(task.createdAt)}` : ""}
      </p>
      {parentTitle ? (
        <p className="mt-1 truncate text-2xs text-muted">via: {parentTitle}</p>
      ) : null}
      {task.result ? (
        <p className="mt-1.5 line-clamp-2 text-2xs leading-relaxed text-muted">{task.result}</p>
      ) : null}
    </>
  );
  const cls =
    "block rounded-lg border border-hairline bg-canvas p-3.5 transition-colors hover:border-ink/20";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ── Employee card ───────────────────────────────────────────────────────────

export interface EmployeeCardAgent {
  id: string;
  name: string;
  role: string;
  status: string;
  currentTask: string | null;
  autonomyLevel: string;
  tasksCompleted: number;
  tasksFailed: number;
  creditsUsed: number;
  lastActiveAt: string | Date | null;
}

export function EmployeeCard({ agent, href }: { agent: EmployeeCardAgent; href?: string }) {
  const os = employeeOsStatus(agent.status, agent.currentTask);
  const body = (
    <>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-white text-2xs font-bold text-ink"
        >
          {agent.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{agent.name}</p>
          <p className="truncate font-mono text-2xs text-muted">{agent.role.replace(/_/g, " ")}</p>
        </div>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-2xs text-muted">
          <StateDot state={os.state} />
          {os.label}
        </span>
      </div>
      {agent.currentTask ? (
        <p className="mt-2 truncate text-2xs text-ink">now: {agent.currentTask}</p>
      ) : null}
      <p className="mt-1.5 text-2xs text-muted">
        {agent.tasksCompleted}✓ {agent.tasksFailed}✗ · {agent.creditsUsed}cr · {agent.autonomyLevel.replace(/_/g, " ")}
        {agent.lastActiveAt ? ` · active ${formatTimeAgo(agent.lastActiveAt)}` : ""}
      </p>
    </>
  );
  const cls = "block rounded-lg border border-hairline bg-canvas p-4 transition-colors hover:border-ink/20";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ── Approval card (exact-call aware, per n8n/HITL pattern) ─────────────────

export interface ApprovalCardData {
  id: string;
  action: string;
  description: string | null;
  cost: number;
  riskLevel: string;
  agentId: string | null;
  taskId?: string | null;
  createdAt: string | Date;
  status?: string;
  decisionNote?: string | null;
  decidedAt?: string | Date | null;
}

const RISK_TONE: Record<string, string> = {
  low: "text-muted",
  medium: "text-ink",
  high: "text-warm-ink",
  critical: "text-error-ink",
};

export function ApprovalCard({
  approval,
  agentName,
  href,
}: {
  approval: ApprovalCardData;
  agentName?: string | null;
  href?: string;
}) {
  const pending = !approval.status || approval.status === "pending";
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-medium text-ink">{approval.action}</p>
        <span className={`shrink-0 font-mono text-2xs uppercase ${RISK_TONE[approval.riskLevel] ?? "text-muted"}`}>
          {approval.riskLevel} risk
        </span>
      </div>
      {approval.description ? (
        <p className="mt-1.5 line-clamp-3 text-2xs leading-relaxed text-muted">{approval.description}</p>
      ) : null}
      <p className="mt-2 text-2xs text-muted">
        {agentName ?? "An employee"} · {formatCost(approval.cost)} · {formatTimeAgo(approval.createdAt)}
        {!pending && approval.status ? ` · ${approval.status}` : ""}
        {approval.decisionNote ? ` · “${approval.decisionNote}”` : ""}
      </p>
    </>
  );
  const cls = "block rounded-lg border border-hairline bg-canvas p-4 transition-colors hover:border-ink/20";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ── Activity stream (operational transparency, no fake thinking) ───────────

export interface ActivityItem {
  id: number | string;
  type: string;
  summary: string;
  reason: string | null;
  cost: number;
  agentId?: string | null;
  occurredAt: string | Date;
}

export function ActivityStream({ items, agentNameById }: { items: ActivityItem[]; agentNameById?: Map<string, string> }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">Nothing yet — activity appears here as work happens.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {items.map((a) => (
        <li key={a.id} className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink">{a.summary}</p>
            {a.reason ? <p className="mt-0.5 text-2xs text-muted">because: {a.reason}</p> : null}
            <p className="mt-0.5 font-mono text-3xs uppercase tracking-wide text-muted">
              {a.type}
              {a.agentId && agentNameById?.get(a.agentId) ? ` · ${agentNameById.get(a.agentId)}` : ""}
            </p>
          </div>
          <span className="shrink-0 text-2xs text-muted">
            {a.cost ? formatCost(a.cost) : ""} {formatTimeAgo(a.occurredAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Authority panel (CAN DO / CAN SPEND / NEEDS APPROVAL / CANNOT DO) ──────

export interface AgentAuthority {
  canCreateTasks?: boolean;
  canExecuteTasks?: boolean;
  canAccessCompanyInfo?: boolean;
  canCommunicateExternally?: boolean;
  canModifyResources?: boolean;
  spendingLimitCents?: number;
  requiresApprovalFor?: string[];
  forbiddenActions?: string[];
}

const AUTHORITY_ROWS: Array<[keyof AgentAuthority, string]> = [
  ["canCreateTasks", "Create tasks"],
  ["canExecuteTasks", "Execute tasks"],
  ["canAccessCompanyInfo", "Access company info"],
  ["canCommunicateExternally", "Communicate externally"],
  ["canModifyResources", "Modify resources"],
];

export function AuthorityPanel({ authority, autonomyLevel }: { authority?: AgentAuthority | null; autonomyLevel?: string }) {
  if (!authority) return <p className="text-sm text-muted">No authority profile recorded.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="font-mono text-2xs uppercase tracking-wider text-muted">Can do</p>
        <ul className="mt-2 space-y-1">
          {AUTHORITY_ROWS.map(([key, label]) => (
            <li key={key} className="flex items-center justify-between text-sm">
              <span className="text-ink">{label}</span>
              <span className={authority[key] ? "text-ink" : "text-muted line-through"}>
                {authority[key] ? "yes" : "no"}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-4">
        <div>
          <p className="font-mono text-2xs uppercase tracking-wider text-muted">Can spend</p>
          <p className="mt-2 text-sm text-ink">
            {(authority.spendingLimitCents ?? 0) > 0
              ? `up to ${formatCost(authority.spendingLimitCents ?? 0)} without asking`
              : "nothing without approval"}
          </p>
        </div>
        <div>
          <p className="font-mono text-2xs uppercase tracking-wider text-muted">Needs approval</p>
          {(authority.requiresApprovalFor?.length ?? 0) > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(authority.requiresApprovalFor ?? []).map((r) => (
                <span key={r} className="rounded-md bg-white px-1.5 py-0.5 text-2xs text-warm-ink">
                  {r.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">nothing flagged</p>
          )}
        </div>
        <div>
          <p className="font-mono text-2xs uppercase tracking-wider text-muted">Cannot do</p>
          {(authority.forbiddenActions?.length ?? 0) > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(authority.forbiddenActions ?? []).map((r) => (
                <span key={r} className="rounded-md bg-white px-1.5 py-0.5 text-2xs text-error-ink line-through">
                  {r.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">nothing forbidden</p>
          )}
        </div>
        {autonomyLevel ? (
          <div>
            <p className="font-mono text-2xs uppercase tracking-wider text-muted">Autonomy</p>
            <p className="mt-2 text-sm text-ink">{autonomyLevel.replace(/_/g, " ")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Workflow card (event rules: trigger → action → assignee) ───────────────

export interface WorkflowItem {
  id: string;
  provider: string;
  eventType: string;
  action: string;
  requiresApproval: boolean;
  enabled: boolean;
  agentId?: string | null;
  agentName?: string | null;
  taskTitleTemplate?: string | null;
}

export function WorkflowCard({ wf }: { wf: WorkflowItem }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-2xs uppercase tracking-wide text-muted">
          {wf.provider} · {wf.eventType.replace(/_/g, " ")}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-3xs font-semibold uppercase ${wf.enabled ? "bg-ink text-white" : "bg-white text-muted"}`}>
          {wf.enabled ? "on" : "off"}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-ink">
        when this fires → {wf.action.replace(/_/g, " ")}
        {wf.action === "create_task" && wf.taskTitleTemplate ? `: “${wf.taskTitleTemplate}”` : ""}
      </p>
      <p className="mt-1 text-2xs text-muted">
        {wf.agentName ? `assigned to ${wf.agentName}` : "unassigned"}
        {wf.requiresApproval ? " · needs approval before it runs" : ""}
      </p>
    </div>
  );
}

// ── Empty states that teach the next action ────────────────────────────────

export function OsEmpty({ title, action }: { title: string; action?: { label: string; href: string } }) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-canvas p-6 text-center">
      <p className="text-sm text-muted">{title}</p>
      {action ? (
        <Link href={action.href} className="mt-2 inline-block text-sm text-brand-ink underline underline-offset-4">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
