import type { Metadata } from "next";
import Link from "next/link";

import { fetchWithAuth } from "../../../../lib/api";
import { EA_NAME } from "../../../../lib/ea";
import type { AttentionSnapshot } from "../../../../lib/attention";
import { EAOpenButton } from "../../../../components/dashboard/ea-open-button";
import {
  OrganizationHub,
  type HubAgent,
  type HubDepartment,
  type HubTaskSummary,
} from "../../../../components/company-hub/organization-hub";
import {
  ExecutiveAgentRail,
  type CoordinationItem,
} from "../../../../components/company-hub/ea-rail";
import { ago, Empty, Section, Stat, StatusChip } from "../../../../components/company-hub/hub-ui";

export const metadata: Metadata = {
  title: "Company Overview",
  description: "The company operating hub: attention, goals, organization, work, outcomes and capacity.",
};

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  settings: Record<string, unknown> | null;
}

interface DashboardSummary {
  active_agents: number;
  pending_approvals: number;
  total_goals: number;
  active_goals: number;
  total_tasks: number;
  completed_tasks: number;
  weekly_spend: number;
  credits: {
    total: number;
    used: number;
    remaining: number;
    utilizationPercent: number;
    isLow: boolean;
    isCritical: boolean;
    daysRemaining: number | null;
  };
}

interface ApiAgent {
  id: string;
  name: string;
  role: string;
  departmentId: string | null;
  departmentName: string | null;
  status: string;
  currentTask: string | null;
  autonomyLevel: string | null;
  config: { tools?: string[] } | null;
  capabilities: unknown;
  canExecuteTasks?: boolean;
  canCreateTasks?: boolean;
  canCommunicateExternally?: boolean;
  creditsUsed: number;
  lastActiveAt: string | null;
}

interface ApiDepartment {
  id: string;
  name: string;
  description: string | null;
  head: string | null;
  budget: number | null;
  status: string;
  agentCount: number;
}

interface ApiTask {
  id: string;
  goalId: string | null;
  agentId: string | null;
  title: string;
  status: string;
  priority: string | null;
  cost: number;
  initiativeId: string | null;
  updatedAt: string;
}

interface ApiGoal {
  id: string;
  title: string;
  status: string;
  progress: number;
  priority: string | null;
  dueDate: string | null;
}

interface ApiActivity {
  id: number;
  agentId: string | null;
  taskId: string | null;
  type: string;
  summary: string;
  reason: string | null;
  cost: number;
  department: string | null;
  occurredAt: string;
}

interface CompanyProgress {
  overallPct: number;
  activeTasks: number;
  blockedTasks: number;
  completedTasks: number;
  activeGoals: number;
  recentOutputs: number;
}

/** One failing source must not blank the hub; each section degrades on its own. */
async function safe<T>(path: string, fallback: T): Promise<T | null> {
  try {
    return await fetchWithAuth<T>(path, { revalidate: false });
  } catch {
    return fallback;
  }
}

/** List sources default to empty, so a failing endpoint renders an honest empty state. */
async function safeList<T>(path: string): Promise<T[]> {
  return (await safe<T[]>(path, [])) ?? [];
}

const EA = EA_NAME;

export default async function CompanyOverviewPage() {
  const [org, summary, attention, agents, departments, tasks, goals, activity, progress] =
    await Promise.all([
      safe<OrgInfo | null>("/v1/org", null),
      safe<DashboardSummary | null>("/v1/dashboard", null),
      safe<AttentionSnapshot | null>("/v1/attention", null),
      safeList<ApiAgent>("/v1/agents"),
      safeList<ApiDepartment>("/v1/departments"),
      safeList<ApiTask>("/v1/tasks"),
      safeList<ApiGoal>("/v1/goals"),
      safeList<ApiActivity>("/v1/activity?limit=12"),
      safe<CompanyProgress | null>("/v1/company-progress", null),
    ]);

  const goalTitleById = new Map(goals.map((g) => [g.id, g.title]));
  const agentNameById = new Map(agents.map((a) => [a.id, a.name]));

  const hubAgents: HubAgent[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    status: a.status,
    currentTask: a.currentTask,
    autonomyLevel: a.autonomyLevel,
    tools: a.config?.tools ?? [],
    canExecuteTasks: a.canExecuteTasks !== false,
    canCreateTasks: a.canCreateTasks !== false,
    canCommunicateExternally: a.canCommunicateExternally === true,
    creditsUsed: a.creditsUsed ?? 0,
    lastActiveAt: a.lastActiveAt,
  }));

  const hubDepartments: HubDepartment[] = departments.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    head: d.head,
    budget: d.budget,
    agents: hubAgents.filter((a) => agents.find((x) => x.id === a.id)?.departmentId === d.id),
  }));
  const unassigned = hubAgents.filter((a) => !agents.find((x) => x.id === a.id)?.departmentId);

  const hubTasks: HubTaskSummary[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    agentId: t.agentId,
    goalTitle: t.goalId ? goalTitleById.get(t.goalId) ?? null : null,
    cost: t.cost ?? 0,
  }));

  const openTasks = tasks
    .filter((t) => !["completed", "failed"].includes(t.status))
    .sort((a, b) => (b.priority === "high" ? 1 : 0) - (a.priority === "high" ? 1 : 0));

  const counts = {
    working: hubAgents.filter((a) => ["working", "executing", "in_progress"].includes(a.status)).length,
    waiting: hubAgents.filter((a) => ["waiting", "pending", "assigned"].includes(a.status)).length,
    blocked: hubAgents.filter((a) => ["blocked", "failed"].includes(a.status)).length,
  };

  const attentionItems = attention?.items ?? [];
  const quiet = attention?.quiet ?? attentionItems.length === 0;
  const credits = summary?.credits ?? null;
  const tagline =
    (org?.settings?.tagline as string | undefined) ??
    (org?.settings?.industry as string | undefined) ??
    null;

  const coordination: CoordinationItem[] = activity.slice(0, 6).map((e) => ({
    id: e.id,
    summary: e.summary,
    type: e.type,
    agentName: e.agentId ? agentNameById.get(e.agentId) ?? null : null,
    occurredAt: e.occurredAt,
  }));

  const outcomes = activity.filter((e) => ["completed", "qa_passed"].includes(e.type));
  const overdueGoals = goals.filter(
    (g) => g.status === "active" && g.dueDate && new Date(g.dueDate).getTime() < Date.now(),
  );

  return (
    <div className="space-y-6">
      {/* Company header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
            Company
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {org?.name ?? "Your company"}
          </h1>
          {tagline ? <p className="mt-1 text-sm text-muted">{tagline}</p> : null}
          <p className="mt-2 text-sm text-muted">
            {counts.blocked > 0
              ? `${counts.blocked} AI employee${counts.blocked === 1 ? "" : "s"} blocked`
              : "Operating normally"}
            {" · "}
            {counts.working} working · {counts.waiting} waiting · {agents.length} total ·{" "}
            {departments.length} department{departments.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EAOpenButton
            prompt="Give me the state of my company and what needs me."
            className="rounded-lg bg-orq8-dark px-3 py-2 text-2xs font-semibold text-white transition-colors hover:bg-orq8-green"
          >
            Ask {EA}
          </EAOpenButton>
          <Link
            href="/app/attention"
            className="rounded-lg border border-hairline px-3 py-2 text-2xs font-medium text-ink transition-colors hover:bg-white"
          >
            Open attention queue
          </Link>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-4">
        {/* 75% — the company hub */}
        <div className="space-y-6 xl:col-span-3">
          {/* Founder's attention */}
          <Section
            title="Founder's attention"
            hint="What actually needs you, with the authority required and what happens next."
            action={
              <Link href="/app/attention" className="text-2xs font-medium text-orq8-orange">
                All {attention?.summary.total ?? attentionItems.length}
              </Link>
            }
          >
            {quiet ? (
              <div className="rounded-xl border border-hairline bg-white p-4">
                <p className="text-sm text-ink">No urgent actions. {EA} is monitoring the company.</p>
                <p className="mt-1 text-2xs text-muted">
                  Approvals, blocked work, failures, credit alerts and deadline risks appear here the
                  moment they happen.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {attentionItems.slice(0, 4).map((item) => (
                  <li key={item.id} className="rounded-xl border border-hairline bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-ink">{item.what}</p>
                      <span
                        className={`font-mono text-3xs uppercase tracking-wide ${
                          item.severity === "critical" ? "text-orq8-orange" : "text-muted"
                        }`}
                      >
                        {item.severity} · {item.source.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-2sm text-muted">{item.why}</p>
                    <dl className="mt-2 grid gap-1 text-2xs text-muted sm:grid-cols-2">
                      <div>
                        <dt className="inline text-muted">Who: </dt>
                        <dd className="inline text-ink">{item.who ?? "Unassigned"}</dd>
                      </div>
                      <div>
                        <dt className="inline text-muted">Authority required: </dt>
                        <dd className="inline text-ink">{item.authority}</dd>
                      </div>
                      {item.impact ? (
                        <div className="sm:col-span-2">
                          <dt className="inline text-muted">Impact: </dt>
                          <dd className="inline text-ink">{item.impact}</dd>
                        </div>
                      ) : null}
                      <div className="sm:col-span-2">
                        <dt className="inline text-muted">Next: </dt>
                        <dd className="inline text-ink">{item.next}</dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Link
                        href="/app/attention"
                        className="rounded-lg bg-orq8-orange px-3 py-1.5 text-2xs font-semibold text-white transition-colors hover:bg-orq8-orange-bright"
                      >
                        Decide in the queue
                      </Link>
                      <EAOpenButton
                        prompt={`Explain "${item.what}" and what my options are.`}
                        className="rounded-lg border border-hairline px-3 py-1.5 text-2xs font-medium text-ink transition-colors hover:bg-canvas"
                      >
                        Ask {EA}
                      </EAOpenButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Goals and workstreams */}
          <Section
            title="Goals and workstreams"
            hint="Only active goals. Progress comes from the goal record, never from a projection."
            action={
              <Link href="/app/goals" className="text-2xs font-medium text-orq8-orange">
                All goals
              </Link>
            }
          >
            {goals.length === 0 ? (
              <Empty>
                No goals yet. Ask {EA} to turn your direction into a goal, or set one under Company →
                Strategy.
              </Empty>
            ) : (
              <ul className="space-y-2">
                {goals
                  .filter((g) => g.status === "active")
                  .slice(0, 4)
                  .map((goal) => {
                    const goalTasks = tasks.filter((t) => t.goalId === goal.id);
                    const blocked = goalTasks.filter((t) => t.status === "blocked").length;
                    const overdue = overdueGoals.some((g) => g.id === goal.id);
                    return (
                      <li
                        key={goal.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-2sm font-medium text-ink">{goal.title}</p>
                          <p className="text-2xs text-muted">
                            {goalTasks.length} task{goalTasks.length === 1 ? "" : "s"} ·{" "}
                            {blocked > 0 ? `${blocked} blocked · ` : ""}
                            {goal.priority ?? "normal"} priority
                            {goal.dueDate ? ` · due ${new Date(goal.dueDate).toLocaleDateString()}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {overdue ? (
                            <span className="font-mono text-3xs uppercase tracking-wide text-orq8-orange">
                              Past due
                            </span>
                          ) : blocked > 0 ? (
                            <span className="font-mono text-3xs uppercase tracking-wide text-orq8-orange">
                              At risk
                            </span>
                          ) : (
                            <span className="font-mono text-3xs uppercase tracking-wide text-muted">
                              On track
                            </span>
                          )}
                          <span className="text-sm font-semibold tabular-nums text-ink">
                            {goal.progress}%
                          </span>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Section>

          {/* Live organization */}
          <Section
            title="Live organization"
            hint={`${EA} at the centre, departments around it, AI employees with their real state.`}
          >
            <OrganizationHub
              eaName={EA}
              departments={hubDepartments}
              unassigned={unassigned}
              tasks={hubTasks}
              pendingApprovals={summary?.pending_approvals ?? 0}
              attentionCritical={attention?.summary.critical ?? 0}
            />
          </Section>

          {/* Active work */}
          <Section
            title="Active work"
            hint="Work that exists right now, linked to its agent, department and goal."
            action={
              <Link href="/app/goals" className="text-2xs font-medium text-orq8-orange">
                Open work
              </Link>
            }
          >
            {openTasks.length === 0 ? (
              <Empty>Nothing is in flight. Ask {EA} to start the next piece of work.</Empty>
            ) : (
              <div className="overflow-hidden rounded-xl border border-hairline bg-white">
                <table className="w-full text-left text-2sm">
                  <thead className="bg-canvas text-3xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Task</th>
                      <th className="px-4 py-2 font-medium">Employee</th>
                      <th className="px-4 py-2 font-medium">Goal</th>
                      <th className="px-4 py-2 font-medium">State</th>
                      <th className="px-4 py-2 font-medium">Credits</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {openTasks.slice(0, 8).map((task) => (
                      <tr key={task.id}>
                        <td className="px-4 py-2 text-ink">{task.title}</td>
                        <td className="px-4 py-2 text-muted">
                          {task.agentId ? agentNameById.get(task.agentId) ?? "Unassigned" : "Unassigned"}
                        </td>
                        <td className="px-4 py-2 text-muted">
                          {task.goalId ? goalTitleById.get(task.goalId) ?? "—" : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <StatusChip status={task.status} />
                        </td>
                        <td className="px-4 py-2 tabular-nums text-muted">{task.cost ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Outcomes and activity */}
          <Section
            title="Outcomes and activity"
            hint="Outcomes are what changed; activity is what happened on the way."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-hairline bg-white p-4">
                <p className="text-2xs font-medium uppercase tracking-wide text-muted">Completed</p>
                {outcomes.length === 0 ? (
                  <p className="mt-2 text-2sm text-muted">No completed work recorded yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2.5">
                    {outcomes.slice(0, 5).map((o) => (
                      <li key={o.id} className="text-2sm">
                        <p className="text-ink">{o.summary}</p>
                        <p className="text-3xs text-muted">
                          {o.agentId ? `${agentNameById.get(o.agentId) ?? "Agent"} · ` : ""}
                          {o.cost > 0 ? `${o.cost} credit${o.cost === 1 ? "" : "s"} · ` : ""}
                          {ago(o.occurredAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-hairline bg-white p-4">
                <p className="text-2xs font-medium uppercase tracking-wide text-muted">Recent activity</p>
                {activity.length === 0 ? (
                  <p className="mt-2 text-2sm text-muted">No activity recorded yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2.5">
                    {activity.slice(0, 6).map((event) => (
                      <li key={event.id} className="text-2sm">
                        <p className="text-ink">{event.summary}</p>
                        <p className="text-3xs text-muted">
                          {event.type.replace(/_/g, " ")}
                          {event.department ? ` · ${event.department}` : ""} · {ago(event.occurredAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>

          {/* Health and capacity */}
          <Section
            title="Company health and execution capacity"
            hint="Derived from real records. Infrastructure health lives on the Company Health page."
            action={
              <Link href="/app/health" className="text-2xs font-medium text-orq8-orange">
                Open Company Health
              </Link>
            }
          >
            <div className="grid gap-4 rounded-xl border border-hairline bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Execution"
                value={`${progress?.activeTasks ?? openTasks.length} active`}
                hint={
                  (progress?.blockedTasks ?? 0) > 0
                    ? `${progress?.blockedTasks} blocked`
                    : "Nothing blocked"
                }
                tone={(progress?.blockedTasks ?? 0) > 0 ? "orange" : "ink"}
              />
              <Stat
                label="Organization"
                value={`${counts.working}/${agents.length} working`}
                hint={
                  counts.blocked > 0
                    ? `${counts.waiting} waiting · ${counts.blocked} blocked`
                    : `${counts.waiting} waiting · none blocked`
                }
                tone={counts.blocked > 0 ? "orange" : "ink"}
              />
              <Stat
                label="Credits"
                value={credits ? credits.remaining : "—"}
                hint={
                  credits
                    ? `${credits.used} used · ${credits.utilizationPercent}% of this period`
                    : "No balance recorded"
                }
                tone={credits?.isCritical ? "orange" : "ink"}
              />
              <Stat
                label="Risks"
                value={attention?.summary.critical ?? 0}
                hint={
                  overdueGoals.length > 0
                    ? `${overdueGoals.length} past-due goal${overdueGoals.length === 1 ? "" : "s"}`
                    : "No past-due goals"
                }
                tone={(attention?.summary.critical ?? 0) > 0 ? "orange" : "ink"}
              />
            </div>
            <p className="mt-2 text-3xs text-muted">
              Weekly spend ${summary?.weekly_spend?.toFixed(2) ?? "0.00"} · {progress?.recentOutputs ?? 0}{" "}
              outputs this week · overall progress {progress?.overallPct ?? 0}%
            </p>
          </Section>
        </div>

        {/* 25% — the persistent Executive Agent */}
        <div className="xl:col-span-1">
          <div className="xl:sticky xl:top-6">
            <ExecutiveAgentRail
              eaName={EA}
              companyName={org?.name ?? "your company"}
              working={counts.working}
              waiting={counts.waiting}
              blocked={counts.blocked}
              attentionCount={attention?.summary.total ?? attentionItems.length}
              creditsRemaining={credits?.remaining ?? 0}
              creditsUsed={credits?.used ?? 0}
              coordination={coordination}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
