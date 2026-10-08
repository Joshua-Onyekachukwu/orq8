"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  GitBranch,
  Scale,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { usePageContext } from "../executive-agent-context";
import { titleize, type AgentAuthority } from "./authority-panel";
import {
  Stat,
  WorkflowCard,
  WorkCard,
  type WorkflowItem,
} from "../os/primitives";

/**
 * The department workspace (docs/71 §G). The department owns one row; every
 * other zone is scoped through its members, because the people are the scope:
 *
 *   Now             → tasks assigned to members, still live
 *   Team            → the members themselves (+ the teams they sit in)
 *   Needs founder   → pending approvals addressed to those members
 *   Tools           → the union of the members' role resolvers
 *   Resources       → files produced by members
 *   Decisions       → decisions a member made, or that name one of their tasks
 *   Approvals       → what the founder has already ruled on
 *   Memory          → the same company_memory the runtime feeds them
 *   Authority       → rolled up from the members' own authority profiles
 *   Activity        → the members' own events
 *
 * Nothing is invented: an empty zone says why it is empty and what would put
 * something in it.
 */

export interface DepartmentMemberData {
  id: string;
  name: string;
  role: string;
  status: string;
  autonomyLevel: string;
  currentTask: string | null;
  teamId: string | null;
  teamName: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  creditsUsed: number;
  weeklyCost: number;
  lastActiveAt: string | null;
  authority: AgentAuthority;
}

export interface DepartmentTeamData {
  id: string;
  name: string;
  lead: string | null;
  status: string;
  agentCount: number;
  activeCount: number;
}

export interface DepartmentTaskData {
  id: string;
  title: string;
  status: string;
  priority: string;
  agentId: string | null;
  cost: number;
  dueDate: string | null;
  createdAt: string;
}

export interface DepartmentApprovalData {
  id: string;
  action: string;
  description: string | null;
  cost: number;
  riskLevel: string;
  agentId: string | null;
  taskId?: string | null;
  status?: string;
  decisionNote?: string | null;
  decidedAt?: string | null;
  createdAt: string;
}

export interface DepartmentActivityData {
  id: number;
  type: string;
  summary: string;
  reason: string | null;
  cost: number;
  agentId: string | null;
  occurredAt: string;
}

export interface DepartmentDecisionData {
  id: string;
  title: string;
  decisionType: string;
  status: string;
  confidence: string;
  whatWasDecided: string;
  rationale: string | null;
  decisionMakerName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface DepartmentMemoryData {
  id: string;
  category: string;
  content: string;
  importance: number;
  source: string | null;
  agentId: string | null;
  createdAt: string;
}

export interface DepartmentFileData {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  agentId: string | null;
  createdAt: string;
}

export interface DepartmentToolData {
  id: string;
  name: string;
  description: string;
  category: string;
  riskLevel: string;
  creditCost: number;
  roles: string[];
}

export interface DepartmentWorkflowData {
  id: string;
  provider: string;
  eventType: string;
  action: string;
  requiresApproval: boolean;
  enabled: boolean;
  agentId: string | null;
  agentName: string | null;
  taskTitleTemplate: string | null;
}

export interface DepartmentMetricsData {
  creditsUsed30d: number;
  tasksDone30d: number;
  avgApprovalHours: number | null;
  budgetBurnPct: number | null;
  failed30d: number;
}

export interface DepartmentDetailData {
  department: {
    id: string;
    name: string;
    description: string | null;
    head: string | null;
    budget: number | null;
    status: string;
    createdAt: string;
    agentCount: number;
    activeCount: number;
    /** docs/85 — template blueprint written at activation. */
    settings?: {
      templateSlug?: string;
      kpis?: unknown[];
      typicalGoals?: unknown[];
      roles?: unknown[];
    } | null;
  };
  members: DepartmentMemberData[];
  teams: DepartmentTeamData[];
  now: DepartmentTaskData[];
  needsFounder: DepartmentApprovalData[];
  recentApprovals: DepartmentApprovalData[];
  activity: DepartmentActivityData[];
  decisions: DepartmentDecisionData[];
  memory: DepartmentMemoryData[];
  files: DepartmentFileData[];
  tools: DepartmentToolData[];
  /** docs/85 §3.3 — accepted work not yet running. */
  queued?: DepartmentTaskData[];
  /** docs/85 §3.3 — recent outcomes. */
  done?: Array<{
    id: string;
    title: string;
    status: string;
    agentId: string | null;
    cost: number;
    result: string | null;
    updatedAt: string;
  }>;
  metrics?: DepartmentMetricsData;
  workflows?: DepartmentWorkflowData[];
  head?: {
    id: string;
    name: string;
    role: string;
    status: string;
    currentTask: string | null;
    autonomyLevel: string;
  } | null;
}

const TABS = [
  { key: "tools", label: "Tools & integrations" },
  { key: "resources", label: "Resources" },
  { key: "decisions", label: "Decisions" },
  { key: "approvals", label: "Approvals" },
  { key: "memory", label: "Memory" },
  { key: "authority", label: "Authority" },
  { key: "activity", label: "Activity" },
  { key: "queued", label: "Queued" },
  { key: "done", label: "Completed" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
type DotState = "" | "working" | "waiting" | "blocked";

const AUTONOMY_ORDER = [
  "observe",
  "recommend",
  "draft",
  "execute_with_approval",
  "autonomous",
] as const;

function formatCost(cents: number): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTimeAgo(iso?: string | null): string {
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
  return formatDate(iso);
}

function taskLabel(status: string): { label: string; state: DotState } {
  if (status === "in_progress") return { label: "Running", state: "working" };
  if (status === "awaiting_approval") return { label: "Waiting on your decision", state: "waiting" };
  if (status === "pending") return { label: "Queued", state: "" };
  if (status === "failed") return { label: "Failed", state: "blocked" };
  if (status === "completed") return { label: "Completed", state: "" };
  return { label: titleize(status), state: "" };
}

function memberState(member: DepartmentMemberData): { label: string; state: DotState } {
  if (member.status === "archived") return { label: "Retired", state: "" };
  if (member.status !== "active") return { label: "Paused", state: "" };
  if (member.currentTask) return { label: "Working", state: "working" };
  return { label: "Idle", state: "" };
}

/** Header state: the loudest true thing about the department right now (docs/85 §4 — needs you > blocked > working > queued > idle). */
function departmentState(detail: DepartmentDetailData): { label: string; state: DotState; hint: string } {
  if (detail.department.status !== "active") {
    return { label: "Archived", state: "", hint: "Archived — kept for history, not operating." };
  }
  if (detail.members.length === 0) {
    return {
      label: "Empty",
      state: "",
      hint: "No employees yet — hire one into this department, or ask the Executive Agent to brief it.",
    };
  }
  if (detail.needsFounder.length > 0) {
    return {
      label: "Needs you",
      state: "waiting",
      hint: `${detail.needsFounder.length} decision${detail.needsFounder.length === 1 ? "" : "s"} waiting on you.`,
    };
  }
  const failed = (detail.done ?? []).filter((t) => t.status === "failed");
  const running = detail.now.filter((t) => t.status === "in_progress");
  if (failed.length > 0 && running.length === 0) {
    return {
      label: "Blocked",
      state: "blocked",
      hint: `Last outcome failed (“${failed[0]!.title}”) and nothing is progressing.`,
    };
  }
  if (running.length > 0) {
    return { label: "Working", state: "working", hint: `Running “${running[0]!.title}”.` };
  }
  const queuedCount = (detail.queued ?? []).length;
  if (queuedCount > 0) {
    return { label: "Queued", state: "", hint: `${queuedCount} task${queuedCount === 1 ? "" : "s"} waiting for a run.` };
  }
  return { label: "Idle", state: "", hint: "Active and available; nothing is running." };
}

const RISK_TONE: Record<string, string> = {
  low: "text-muted",
  medium: "text-ink",
  high: "text-warm-ink",
  critical: "text-error-ink",
};

export function DepartmentWorkspace({ detail }: { detail: DepartmentDetailData }) {
  const [tab, setTab] = useState<TabKey>("tools");
  const department = detail.department;
  const state = departmentState(detail);

  usePageContext({
    route: `/app/departments/${department.id}`,
    pageName: `Department — ${department.name}`,
    entity: { type: "department", id: department.id, name: department.name, status: department.status },
    extra: {
      members: detail.members.length,
      openWork: detail.now.length,
      waitingOnFounder: detail.needsFounder.length,
    },
  });

  const memberNameById = useMemo(
    () => new Map(detail.members.map((m) => [m.id, m.name])),
    [detail.members],
  );

  const toolsByCategory = useMemo(() => {
    const groups = new Map<string, DepartmentToolData[]>();
    for (const tool of detail.tools) {
      const list = groups.get(tool.category) ?? [];
      list.push(tool);
      groups.set(tool.category, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [detail.tools]);

  const authorityRollup = useMemo(() => {
    const members = detail.members;
    const canFlags: Array<[keyof AgentAuthority, string]> = [
      ["canCreateTasks", "Create tasks"],
      ["canExecuteTasks", "Execute tasks"],
      ["canAccessCompanyInfo", "Access company info"],
      ["canCommunicateExternally", "Communicate externally"],
      ["canModifyResources", "Modify resources"],
    ];
    const canDo = canFlags.map(([key, label]) => ({
      label,
      count: members.filter((m) => Boolean(m.authority?.[key])).length,
    }));
    const spendCeiling = members.reduce(
      (max, m) => Math.max(max, Number(m.authority?.spendingLimitCents ?? 0) || 0),
      0,
    );
    const approvalMap = new Map<string, number>();
    for (const m of members) {
      for (const item of m.authority?.requiresApprovalFor ?? []) {
        approvalMap.set(item, (approvalMap.get(item) ?? 0) + 1);
      }
    }
    const forbiddenMap = new Map<string, number>();
    for (const m of members) {
      for (const item of m.authority?.forbiddenActions ?? []) {
        forbiddenMap.set(item, (forbiddenMap.get(item) ?? 0) + 1);
      }
    }
    const ladder = AUTONOMY_ORDER.map((level) => ({
      level,
      count: members.filter((m) => (m.autonomyLevel ?? "execute_with_approval") === level).length,
    }));
    return {
      canDo,
      spendCeiling,
      requiresApproval: [...approvalMap.entries()].sort((a, b) => b[1] - a[1]),
      cannotDo: [...forbiddenMap.entries()].sort((a, b) => b[1] - a[1]),
      ladder,
    };
  }, [detail.members]);

  return (
    <div className="space-y-4">
      <Link
        href="/app/departments"
        className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
      >
        ← All departments
      </Link>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="console-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-hairline bg-elevated text-ink"
            >
              <GitBranch className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                Department
              </p>
              <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-ink">
                {department.name}
              </h1>
              {department.description && (
                <p className="mt-1 max-w-2xl text-sm text-muted">{department.description}</p>
              )}
              {(department.settings?.kpis?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(department.settings!.kpis as unknown[]).slice(0, 4).map((k, i) => {
                    const label =
                      typeof k === "string"
                        ? k
                        : k && typeof k === "object" && "name" in (k as Record<string, unknown>)
                          ? String((k as Record<string, unknown>).name)
                          : null;
                    return label ? (
                      <span key={i} className="rounded-md bg-elevated px-1.5 py-0.5 text-3xs text-muted">
                        KPI · {label}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-2xs text-ink">
                  <span className="state-dot" data-state={state.state} />
                  {state.label}
                </span>
                {department.head &&
                  (detail.head ? (
                    <Link
                      href={`/app/agents/${detail.head.id}`}
                      className="rounded-full border border-hairline px-2.5 py-1 text-2xs text-muted transition-colors hover:text-ink"
                    >
                      Lead · {department.head}
                    </Link>
                  ) : (
                    <span className="rounded-full border border-hairline px-2.5 py-1 text-2xs text-muted">
                      Lead · {department.head}
                    </span>
                  ))}
                <span className="font-mono text-2xs text-muted">
                  {department.agentCount} employee{department.agentCount === 1 ? "" : "s"} ·{" "}
                  {department.activeCount} active
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">{state.hint}</p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex -space-x-2" aria-hidden="true">
              {detail.members.slice(0, 5).map((m) => (
                <span
                  key={m.id}
                  title={m.name}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-canvas text-2xs font-semibold text-ink"
                >
                  {m.name.charAt(0).toUpperCase()}
                </span>
              ))}
              {detail.members.length > 5 && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-elevated font-mono text-2xs text-muted">
                  +{detail.members.length - 5}
                </span>
              )}
            </div>
            {detail.needsFounder.length > 0 ? (
              <Link
                href="/app/approvals"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
              >
                <Clock className="h-3.5 w-3.5" />
                {detail.needsFounder.length} need{detail.needsFounder.length === 1 ? "s" : ""} you
              </Link>
            ) : (
              <span className="font-mono text-2xs uppercase tracking-wide text-muted">
                Nothing waiting on you
              </span>
            )}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-4">
          {[
            { label: "Employees", value: String(detail.members.length) },
            { label: "Teams", value: detail.teams.length > 0 ? String(detail.teams.length) : "—" },
            { label: "Open work", value: String(detail.now.length) },
            {
              label: "Budget",
              value: department.budget != null && department.budget > 0
                ? `${department.budget.toLocaleString()} credits`
                : "Not set",
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-canvas px-3.5 py-2.5">
              <dt className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                {stat.label}
              </dt>
              <dd className="mt-0.5 text-sm tabular-nums text-ink">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {/* ── Needs founder — never buried ─────────────────────────────────── */}
      {detail.needsFounder.length > 0 && (
        <section className="console-card p-4">
          <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
            Needs founder
          </h2>
          <ul className="mt-2 space-y-2">
            {detail.needsFounder.map((approval) => (
              <li
                key={approval.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-hairline-strong bg-elevated px-3.5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{approval.action}</p>
                  {approval.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{approval.description}</p>
                  )}
                  <p className="mt-1 font-mono text-2xs uppercase tracking-wide text-muted">
                    {approval.agentId ? (memberNameById.get(approval.agentId) ?? "Employee") : "Department"}
                    {" · "}
                    {approval.riskLevel} risk
                    {approval.cost > 0 ? ` · ${formatCost(approval.cost)}` : ""}
                    {" · "}
                    {/* normal-case: the label above is uppercased, and "6M AGO"
                        reads as six months for six minutes. */}
                    <span className="normal-case">{formatTimeAgo(approval.createdAt)}</span>
                  </p>
                </div>
                <Link
                  href="/app/approvals"
                  className="shrink-0 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Now ──────────────────────────────────────────────────────────── */}
      <section className="console-card p-4">
        <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
          Now
        </h2>
        {detail.now.length === 0 ? (
          <div className="mt-2 rounded-md border border-dashed border-hairline px-4 py-5">
            <p className="text-sm text-ink">Nothing running.</p>
            <p className="mt-1 text-xs text-muted">
              {detail.members.length === 0
                ? "This department has no employees yet. Hire one into it, or ask the Executive Agent to brief it."
                : "Running work and anything waiting on your decision appears here; accepted-but-idle tasks live under Queued."}
            </p>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--console-line)]">
            {detail.now.map((task) => {
              const status = taskLabel(task.status);
              return (
                <li key={task.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="state-dot" data-state={status.state} />
                  <Link
                    href={`/app/tasks/${task.id}`}
                    className="min-w-0 flex-1 truncate text-sm text-ink transition-colors hover:text-brand-ink"
                  >
                    {task.title}
                  </Link>
                  <span className="font-mono text-2xs uppercase tracking-wide text-muted">
                    {status.label}
                  </span>
                  <span className="font-mono text-2xs text-muted">
                    {task.agentId ? (memberNameById.get(task.agentId) ?? "Employee") : "Unassigned"}
                  </span>
                  {task.cost > 0 && (
                    <span className="font-mono text-2xs tabular-nums text-muted">
                      {formatCost(task.cost)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Workflows (docs/85 §5 workflow-card) ─────────────────────────── */}
      {(detail.workflows?.length ?? 0) > 0 && (
        <section className="console-card p-4">
          <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
            Workflows — triggers this department responds to
          </h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {detail.workflows!.map((wf) => (
              <WorkflowCard key={wf.id} wf={wf as WorkflowItem} />
            ))}
          </div>
        </section>
      )}

      {/* ── Metrics (docs/85 §3.3) ──────────────────────────────────────── */}
      {detail.metrics && (
        <section className="console-card p-4">
          <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
            Last 30 days
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Tasks done" value={detail.metrics.tasksDone30d} />
            <Stat label="Failed" value={detail.metrics.failed30d} />
            <Stat label="Credits spent" value={detail.metrics.creditsUsed30d} />
            <Stat
              label="Avg approval wait"
              value={detail.metrics.avgApprovalHours != null ? `${detail.metrics.avgApprovalHours}h` : "—"}
              sub="request → founder decision"
            />
            <Stat
              label="Budget burn"
              value={detail.metrics.budgetBurnPct != null ? `${detail.metrics.budgetBurnPct}%` : "—"}
              sub={department.budget ? `of ${department.budget.toLocaleString()} credits` : "no budget set"}
            />
          </div>
        </section>
      )}

      {/* ── Team ─────────────────────────────────────────────────────────── */}
      <section className="console-card p-4">
        <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
          Team
        </h2>
        {detail.members.length === 0 ? (
          <div className="mt-2 rounded-md border border-dashed border-hairline px-4 py-5">
            <p className="text-sm text-ink">No employees in this department.</p>
            <p className="mt-1 text-xs text-muted">
              Open the department in the list, or ask the Executive Agent: “brief the{" "}
              {department.name} department”.
            </p>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--console-line)]">
            {detail.members.map((member) => {
              const status = memberState(member);
              return (
                <li key={member.id}>
                  <Link
                    href={`/app/agents/${member.id}`}
                    className="-mx-2 flex flex-wrap items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-secondary"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline bg-elevated text-xs font-semibold text-ink"
                    >
                      {member.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm text-ink">{member.name}</span>
                        <span className="inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wide text-muted">
                          <span className="state-dot" data-state={status.state} />
                          {status.label}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {member.role.replace(/_/g, " ")}
                        {member.teamName ? ` · ${member.teamName}` : ""}
                        {member.currentTask ? ` · ${member.currentTask}` : ""}
                      </span>
                    </span>
                    <span className="font-mono text-2xs tabular-nums text-muted">
                      {member.tasksCompleted} done
                      {member.tasksFailed > 0 ? ` · ${member.tasksFailed} failed` : ""}
                      {member.creditsUsed > 0 ? ` · ${member.creditsUsed} credits` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {detail.teams.length > 0 && (
          <div className="mt-3">
            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Teams in this department
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {detail.teams.map((team) => (
                <li
                  key={team.id}
                  className="rounded-full border border-hairline px-2.5 py-1 text-2xs text-muted"
                >
                  <span className="text-ink">{team.name}</span>
                  {" · "}
                  {team.agentCount} member{team.agentCount === 1 ? "" : "s"}
                  {team.lead ? ` · lead ${team.lead}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Operating context ────────────────────────────────────────────── */}
      <div>
        <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
          Operating context
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = tab === t.key;
            const badge =
              t.key === "tools" && detail.tools.length > 0
                ? detail.tools.length
                : t.key === "memory" && detail.memory.length > 0
                  ? detail.memory.length
                  : t.key === "activity" && detail.activity.length > 0
                    ? detail.activity.length
                    : t.key === "resources" && detail.files.length > 0
                      ? detail.files.length
                      : null;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-hairline-strong bg-elevated text-ink"
                    : "border-hairline text-muted hover:border-hairline-strong hover:text-ink"
                }`}
              >
                {t.label}
                {badge !== null && (
                  <span className="ml-1.5 font-mono text-2xs text-muted">{badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tools & integrations */}
      {tab === "tools" && (
        <section className="console-card p-4">
          <div className="flex items-center gap-2">
            <Wrench aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
            <h3 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Tools this department&apos;s roles may call
            </h3>
          </div>
          {detail.tools.length === 0 ? (
            <div className="mt-2 rounded-md border border-dashed border-hairline px-4 py-5">
              <p className="text-sm text-ink">No tools resolve for this department&apos;s roles.</p>
              <p className="mt-1 text-xs text-muted">
                Tools come from the runtime&apos;s role resolver — if an employee has no role with
                tools, this stays empty.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {toolsByCategory.map(([category, tools]) => (
                <div key={category}>
                  <p className="font-mono text-2xs uppercase tracking-wide text-muted">{category}</p>
                  <ul className="mt-1.5 divide-y divide-[var(--console-line)]">
                    {tools.map((tool) => (
                      <li key={tool.id} className="flex flex-wrap items-start gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-ink">{tool.name}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{tool.description}</p>
                          <p className="mt-1 font-mono text-2xs text-muted">
                            {tool.roles.map((r) => r.replace(/_/g, " ")).join(", ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className={`font-mono text-2xs uppercase ${RISK_TONE[tool.riskLevel] ?? "text-muted"}`}>
                            {tool.riskLevel}
                          </span>
                          <span className="font-mono text-2xs tabular-nums text-muted">
                            {tool.creditCost} credit{tool.creditCost === 1 ? "" : "s"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Resources */}
      {tab === "resources" && (
        <section className="console-card p-4">
          <div className="flex items-center gap-2">
            <FolderOpen aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
            <h3 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Files produced by this department
            </h3>
          </div>
          {detail.files.length === 0 ? (
            <div className="mt-2 rounded-md border border-dashed border-hairline px-4 py-5">
              <p className="text-sm text-ink">No files yet.</p>
              <p className="mt-1 text-xs text-muted">
                Files appear here when one of this department&apos;s employees uploads one or is
                attached to one.
              </p>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--console-line)]">
              {detail.files.map((file) => (
                <li key={file.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{file.name}</span>
                  <span className="font-mono text-2xs text-muted">{formatBytes(file.size)}</span>
                  <span className="font-mono text-2xs text-muted">
                    {file.agentId ? (memberNameById.get(file.agentId) ?? "Employee") : "—"}
                  </span>
                  <span className="font-mono text-2xs text-muted">{formatDate(file.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Decisions */}
      {tab === "decisions" && (
        <section className="console-card p-4">
          <div className="flex items-center gap-2">
            <Scale aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
            <h3 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Recent decisions
            </h3>
          </div>
          {detail.decisions.length === 0 ? (
            <div className="mt-2 rounded-md border border-dashed border-hairline px-4 py-5">
              <p className="text-sm text-ink">No decisions recorded for this department.</p>
              <p className="mt-1 text-xs text-muted">
                Decisions this department&apos;s employees make — or that name one of their tasks —
                are recorded here.
              </p>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--console-line)]">
              {detail.decisions.map((decision) => (
                <li key={decision.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/app/decisions/${decision.id}`}
                      className="text-sm text-ink transition-colors hover:text-brand-ink"
                    >
                      {decision.title}
                    </Link>
                    <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-muted">
                      {decision.decisionType}
                    </span>
                    <span className="font-mono text-2xs uppercase tracking-wide text-muted">
                      {decision.confidence} confidence
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{decision.whatWasDecided}</p>
                  <p className="mt-1 font-mono text-2xs text-muted">
                    {decision.decisionMakerName ?? "—"}
                    {" · "}
                    {formatDate(decision.decidedAt ?? decision.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Approvals */}
      {tab === "approvals" && (
        <section className="console-card p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
            <h3 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Approvals
            </h3>
          </div>
          <p className="mt-2 font-mono text-2xs uppercase tracking-wide text-muted">Waiting on you</p>
          {detail.needsFounder.length === 0 ? (
            <p className="mt-1 text-xs text-muted">Nothing from this department is waiting on you.</p>
          ) : (
            <ul className="mt-1.5 divide-y divide-[var(--console-line)]">
              {detail.needsFounder.map((approval) => (
                <li key={approval.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="state-dot" data-state="waiting" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{approval.action}</span>
                  <span className="font-mono text-2xs text-muted">
                    {approval.agentId ? (memberNameById.get(approval.agentId) ?? "Employee") : "—"}
                  </span>
                  <Link href="/app/approvals" className="text-2xs text-brand-ink hover:underline">
                    Review →
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 font-mono text-2xs uppercase tracking-wide text-muted">Decided</p>
          {detail.recentApprovals.length === 0 ? (
            <p className="mt-1 text-xs text-muted">No decisions recorded on this department&apos;s requests yet.</p>
          ) : (
            <ul className="mt-1.5 divide-y divide-[var(--console-line)]">
              {detail.recentApprovals.map((approval) => (
                <li key={approval.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{approval.action}</span>
                    <span
                      className={`font-mono text-2xs uppercase tracking-wide ${
                        approval.status === "rejected" ? "text-error-ink" : "text-muted"
                      }`}
                    >
                      {approval.status}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-2xs text-muted">
                    {approval.agentId ? (memberNameById.get(approval.agentId) ?? "Employee") : "—"}
                    {" · "}
                    {formatDate(approval.decidedAt ?? approval.createdAt)}
                    {approval.cost > 0 ? ` · ${formatCost(approval.cost)}` : ""}
                  </p>
                  {approval.decisionNote && (
                    <p className="mt-0.5 text-xs text-muted">“{approval.decisionNote}”</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Memory */}
      {tab === "memory" && (
        <section className="console-card p-4">
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
            <h3 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              What this department knows
            </h3>
          </div>
          <p className="mt-1 text-xs text-muted">
            The same memory the runtime hands this department&apos;s employees before a task.
          </p>
          {detail.memory.length === 0 ? (
            <div className="mt-2 rounded-md border border-dashed border-hairline px-4 py-5">
              <p className="text-sm text-ink">Nothing learned yet.</p>
              <p className="mt-1 text-xs text-muted">
                Entries appear here as this department&apos;s employees work and record what they
                learned.
              </p>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--console-line)]">
              {detail.memory.map((entry) => (
                <li key={entry.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-muted">
                      {entry.category}
                    </span>
                    <span className="font-mono text-2xs text-muted">
                      importance {entry.importance}/10
                    </span>
                    <span className="font-mono text-2xs text-muted">
                      {entry.agentId ? (memberNameById.get(entry.agentId) ?? entry.source ?? "—") : (entry.source ?? "—")}
                    </span>
                    <span className="font-mono text-2xs text-muted">{formatDate(entry.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink">{entry.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Authority */}
      {tab === "authority" && (
        <section className="console-card p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
            <h3 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Authority — derived from this department&apos;s members
            </h3>
          </div>
          {detail.members.length === 0 ? (
            <div className="mt-2 rounded-md border border-dashed border-hairline px-4 py-5">
              <p className="text-sm text-ink">No members, so no authority to derive.</p>
            </div>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-md border border-hairline p-3.5">
                <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                  Can do
                </p>
                <ul className="mt-2 space-y-1.5">
                  {authorityRollup.canDo.map((row) => (
                    <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink">{row.label}</span>
                      <span className="font-mono text-2xs tabular-nums text-muted">
                        {row.count} of {detail.members.length}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-md border border-hairline p-3.5">
                <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                  Can spend
                </p>
                <p className="mt-2 text-sm text-ink">
                  {authorityRollup.spendCeiling > 0
                    ? `Up to ${formatCost(authorityRollup.spendCeiling)} per action without approval (highest member limit).`
                    : "No employee in this department may spend without approval."}
                </p>

                <p className="mt-4 font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                  Autonomy
                </p>
                <ul className="mt-2 space-y-1.5">
                  {authorityRollup.ladder.map((row) => (
                    <li key={row.level} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink">{titleize(row.level)}</span>
                      <span className="font-mono text-2xs tabular-nums text-muted">
                        {row.count} of {detail.members.length}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-md border border-hairline p-3.5">
                <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                  Requires approval
                </p>
                {authorityRollup.requiresApproval.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No member lists anything explicitly.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {authorityRollup.requiresApproval.map(([item, count]) => (
                      <li key={item} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-ink">{titleize(item)}</span>
                        <span className="font-mono text-2xs tabular-nums text-muted">
                          {count} of {detail.members.length}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-md border border-hairline p-3.5">
                <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
                  Cannot do
                </p>
                {authorityRollup.cannotDo.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No forbidden actions are listed.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {authorityRollup.cannotDo.map(([item, count]) => (
                      <li key={item} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-error-ink">{titleize(item)}</span>
                        <span className="font-mono text-2xs tabular-nums text-muted">
                          {count} of {detail.members.length}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Activity */}
      {tab === "activity" && (
        <section className="console-card p-4">
          <div className="flex items-center gap-2">
            <Activity aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
            <h3 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Activity
            </h3>
          </div>
          {detail.activity.length === 0 ? (
            <div className="mt-2 rounded-md border border-dashed border-hairline px-4 py-5">
              <p className="text-sm text-ink">No activity yet.</p>
              <p className="mt-1 text-xs text-muted">
                Every task this department&apos;s employees run leaves an event here.
              </p>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--console-line)]">
              {detail.activity.map((event) => (
                <li key={event.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-muted">
                      {event.type}
                    </span>
                    <span className="font-mono text-2xs text-muted">
                      {event.agentId ? (memberNameById.get(event.agentId) ?? "Employee") : "—"}
                    </span>
                    <span className="font-mono text-2xs text-muted">{formatTimeAgo(event.occurredAt)}</span>
                    {event.cost > 0 && (
                      <span className="font-mono text-2xs tabular-nums text-muted">
                        {formatCost(event.cost)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-ink">{event.summary}</p>
                  {event.reason && <p className="mt-0.5 text-xs text-muted">{event.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Queued — accepted work waiting for a run (docs/85 §3.3) */}
      {tab === "queued" && (
        <section className="console-card p-4">
          <div className="flex items-center gap-2">
            <Clock aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
            <h3 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Queued — accepted, waiting for a run
            </h3>
          </div>
          {(detail.queued?.length ?? 0) === 0 ? (
            <div className="mt-2 rounded-md border border-dashed border-hairline px-4 py-5">
              <p className="text-sm text-ink">Queue is empty.</p>
              <p className="mt-1 text-xs text-muted">
                New tasks assigned to this department&apos;s employees wait here until a worker picks them up.
              </p>
            </div>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {detail.queued!.map((task) => (
                <WorkCard
                  key={task.id}
                  task={task}
                  agentName={task.agentId ? (memberNameById.get(task.agentId) ?? null) : null}
                  href={`/app/tasks/${task.id}`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Completed — outcomes (docs/85 §3.3) */}
      {tab === "done" && (
        <section className="console-card p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
            <h3 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Completed — recent outcomes
            </h3>
          </div>
          {(detail.done?.length ?? 0) === 0 ? (
            <div className="mt-2 rounded-md border border-dashed border-hairline px-4 py-5">
              <p className="text-sm text-ink">Nothing finished yet.</p>
              <p className="mt-1 text-xs text-muted">
                Completed and failed tasks land here with their results — the record of what this department produced.
              </p>
            </div>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {detail.done!.map((task) => (
                <WorkCard
                  key={task.id}
                  task={task}
                  agentName={task.agentId ? (memberNameById.get(task.agentId) ?? null) : null}
                  href={`/app/tasks/${task.id}`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {detail.members.length === 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-elevated px-3.5 py-3">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <p className="text-xs text-muted">
            This department is a shell until someone works in it: every zone below is scoped through
            its members. Hire an employee into it, or ask the Executive Agent to brief it.
          </p>
        </div>
      )}

      {detail.members.length > 0 && detail.now.length === 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-elevated px-3.5 py-3">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <p className="text-xs text-muted">
            No open work in this department. Completed work stays on each employee&apos;s page and in
            Activity.
          </p>
        </div>
      )}
    </div>
  );
}
