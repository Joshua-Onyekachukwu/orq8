import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { CompanyOrbit } from "../../../components/company-hub/company-orbit";
import { CompanyWelcome } from "../../../components/company-hub/company-welcome";
import {
  FirstValueChecklist,
  type FirstValueStep,
} from "../../../components/company-hub/first-value-checklist";
import { derivePresence } from "../../../components/dashboard/presence";
import type { FounderStage } from "../../../components/executive-agent-context";
import { fetchWithAuth, formatTimeAgo } from "../../../lib/api";
import { EA_NAME } from "../../../lib/ea";

export const metadata = { title: "Company" };

// Freshness matters on the company profile: headcount, goals and activity
// must reflect the latest backend state, never a cached body.
const FRESH = { revalidate: false } as const;

interface DashboardData {
  active_agents: number;
  pending_approvals: number;
  active_goals: number;
  total_tasks: number;
  completed_tasks: number;
  credits: {
    total: number;
    used: number;
    remaining: number;
    utilizationPercent: number;
  } | null;
}

interface AgentRow {
  id: string;
  name: string;
  role: string;
  status: string;
  currentTask: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  department?: string | null;
  lastActiveAt?: string | null;
  tasksCompleted?: number;
  tasksFailed?: number;
  weeklyCost?: number;
}

interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
  head: string | null;
  status: string;
  agentCount: number;
}

interface ApprovalRow {
  id: string;
  agentId: string | null;
  action: string;
  description: string | null;
}

interface ActivityRow {
  id: number;
  agentId: string | null;
  taskId: string | null;
  type: string;
  summary: string;
  occurredAt: string;
}

interface GoalRow {
  id: string;
  title: string;
  status: string;
  progress: number;
  priority: string;
  dueDate: string | null;
}

interface OrgInfo {
  user: { id: string; email: string; name: string | null };
  memberships: {
    org: { id: string; name: string; slug: string; plan: string; isDemo?: boolean; eaName?: string | null };
    role: string;
  }[];
  active_org_id: string | null;
}

interface CompanyBuilderState {
  step: string;
  completedAt: string | null;
  analysis: { companyName?: string } | null;
  plan: unknown;
  activation: unknown;
}

/**
 * The company profile (B6): what the company IS — welcome, first-value
 * checklist, orbit console, goals, departments — while /app keeps
 * decisions-blocked-active-next. Every value is read from a real endpoint.
 */
export default async function CompanyPage() {
  const [
    dashboard,
    agents,
    departments,
    approvals,
    activity,
    orgInfo,
    builderState,
    activeGoalsRes,
    memoryStats,
  ] = await Promise.all([
    fetchWithAuth<DashboardData>("/v1/dashboard", FRESH),
    fetchWithAuth<AgentRow[]>("/v1/agents", FRESH),
    fetchWithAuth<DepartmentRow[]>("/v1/departments?all=true", FRESH),
    fetchWithAuth<ApprovalRow[]>("/v1/approvals?status=pending", FRESH),
    fetchWithAuth<ActivityRow[]>("/v1/activity?limit=14", FRESH),
    fetchWithAuth<OrgInfo>("/v1/auth/me", FRESH),
    fetchWithAuth<CompanyBuilderState>("/v1/company-builder/state", FRESH),
    fetchWithAuth<GoalRow[]>("/v1/goals?status=active&limit=6", FRESH).catch(() => null),
    fetchWithAuth<{ totalEntries: number }>("/v1/memory/stats", FRESH).catch(() => null),
  ]);

  const agentList = agents ?? [];
  const approvalList = approvals ?? [];
  const departmentList = (departments ?? []).filter((d) => d.status === "active");
  const events = activity ?? [];
  const goalList = activeGoalsRes ?? [];

  const founderStage: FounderStage = !builderState
    ? "new"
    : builderState.completedAt || builderState.activation
      ? "active"
      : builderState.step !== "organization" || !!builderState.analysis || !!builderState.plan
        ? "in_progress"
        : "new";

  const activeOrg = orgInfo?.memberships?.find((m) => m.org.id === orgInfo.active_org_id);
  const orgName = activeOrg?.org.name ?? "My Company";
  const orgPlan = activeOrg?.org.plan ?? "trial";
  const eaName = activeOrg?.org.eaName?.trim() || EA_NAME;
  const activeRole =
    orgInfo?.memberships?.find((m) => m.org.id === orgInfo.active_org_id)?.role ??
    orgInfo?.memberships?.[0]?.role;
  const canSeedDemo = activeRole === "owner" || activeRole === "admin";
  const firstName = orgInfo?.user.name?.trim().split(/\s+/)[0] ?? null;

  const totalTasks = dashboard?.total_tasks ?? 0;
  const completedTasks = dashboard?.completed_tasks ?? 0;
  const pendingApprovals = dashboard?.pending_approvals ?? 0;
  const activeGoalsCount = dashboard?.active_goals ?? 0;

  const hasStructure = agentList.length > 0 || activeGoalsCount > 0 || departmentList.length > 0;
  const showFirstRun = !hasStructure && founderStage !== "active";
  const showFirstValue = completedTasks === 0 && (hasStructure || founderStage !== "new");

  const firstValueSteps: FirstValueStep[] = [
    {
      title: "Hire your first AI employee",
      detail: "Pick a role — the employee works inside your departments.",
      done: agentList.length > 0,
      href: "/app/agents",
      cta: agentList.length > 0 ? "View workforce" : "Hire",
    },
    {
      title: "Set your first goal",
      detail: "A goal is what work gets planned from.",
      done: activeGoalsCount > 0,
      href: "/app/goals",
      cta: activeGoalsCount > 0 ? "View goals" : "Set a goal",
    },
    {
      title: "Put the first work in motion",
      detail: `Ask ${eaName} to plan it — tasks appear on the board as they run.`,
      done: totalTasks > 0,
      href: null,
      cta: "Plan work",
    },
    {
      title: "See the first task through",
      detail: "Approve what needs you in the attention queue; the rest runs itself.",
      done: false,
      href: "/app/tasks",
      cta: "Open tasks",
    },
  ];

  const presence = derivePresence(agentList, approvalList, events, (agent) => {
    if (agent.departmentId) {
      const dept = departmentList.find((d) => d.id === agent.departmentId);
      if (dept) return dept.name;
    }
    return agent.departmentName ?? agent.department ?? null;
  });
  const orbitLastActivityLabel = events[0]?.occurredAt ? formatTimeAgo(events[0].occurredAt) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-muted">
            Company profile
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{orgName}</h1>
          <p className="mt-1 text-xs text-muted">
            {orgPlan} plan · run by {eaName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app/org"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-canvas"
          >
            Organization <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link
            href="/app/members"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-canvas"
          >
            Members <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link
            href="/app/memory"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-canvas"
          >
            Memory <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {showFirstRun ? (
        <CompanyWelcome
          founderStage={founderStage}
          orgName={orgName}
          eaName={eaName}
          firstName={firstName}
          canSeedDemo={canSeedDemo}
        />
      ) : null}

      {showFirstValue ? (
        <FirstValueChecklist steps={firstValueSteps} hasTasks={totalTasks > 0} orgName={orgName} />
      ) : null}

      <CompanyOrbit
        companyName={orgName}
        employees={agentList.length}
        departments={departmentList.length}
        working={presence.working}
        waiting={presence.waiting}
        blocked={presence.blocked}
        pendingApprovals={pendingApprovals}
        activeGoals={activeGoalsCount}
        openTasks={totalTasks - completedTasks}
        memories={memoryStats?.totalEntries ?? 0}
        auditEvents={events.length}
        lastActivityLabel={orbitLastActivityLabel}
      />

      <div className="grid items-start gap-4 md:grid-cols-2">
        <section className="console-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Active goals
            </h2>
            <Link href="/app/goals" className="text-xs text-muted transition-colors hover:text-ink">
              View all →
            </Link>
          </div>
          {goalList.length === 0 ? (
            <p className="mt-3 text-xs text-muted">
              No active goals yet. A goal is what work gets planned from.
            </p>
          ) : (
            <ul className="mt-2.5 space-y-2.5">
              {goalList.map((goal) => (
                <li key={goal.id} className="border-b border-hairline pb-2.5 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/app/goals/${goal.id}`}
                      className="text-sm text-ink transition-colors hover:text-brand-ink"
                    >
                      {goal.title}
                    </Link>
                    <span className="shrink-0 font-mono text-2xs tabular-nums text-muted">
                      {goal.progress}%
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-2xs text-muted">
                    {goal.priority}
                    {goal.dueDate ? ` · due ${goal.dueDate}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="console-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Departments
            </h2>
            <Link href="/app/departments" className="text-xs text-muted transition-colors hover:text-ink">
              View all →
            </Link>
          </div>
          {departmentList.length === 0 ? (
            <p className="mt-3 text-xs text-muted">
              No departments yet. Departments organize employees around functions.
            </p>
          ) : (
            <ul className="mt-2.5 space-y-2.5">
              {departmentList.map((dept) => (
                <li key={dept.id} className="border-b border-hairline pb-2.5 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/app/departments/${dept.id}`}
                      className="text-sm text-ink transition-colors hover:text-brand-ink"
                    >
                      {dept.name}
                    </Link>
                    <span className="shrink-0 font-mono text-2xs tabular-nums text-muted">
                      {dept.agentCount} {dept.agentCount === 1 ? "employee" : "employees"}
                    </span>
                  </div>
                  {dept.head ? (
                    <p className="mt-0.5 font-mono text-2xs text-muted">lead · {dept.head}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
