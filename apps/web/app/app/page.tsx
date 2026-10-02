import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Bot, Zap } from "lucide-react";

import { EAOpenButton } from "../../components/dashboard/ea-open-button";
import { EAStageRegistrar } from "../../components/dashboard/ea-stage-registrar";
import { EADock } from "../../components/dashboard/ea-dock";
import { ContrastSelfCheck } from "../../components/contrast-self-check";
import type { FounderStage } from "../../components/executive-agent-context";
import { fetchWithAuth } from "../../lib/api";
import { EA_NAME } from "../../lib/ea";
import { computeScore } from "../../lib/health-score";

export const metadata = { title: "Dashboard" };

interface Agent {
  id: string;
  name: string;
  role: string;
  department: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  teamName?: string | null;
  status: string;
  currentTask: string | null;
  tasksCompleted: number;
  tasksFailed?: number;
  weeklyCost?: number;
  lastActiveAt?: string | null;
}

interface Approval {
  id: string;
  agentId: string | null;
  action: string;
  description: string | null;
  cost: number;
  riskLevel: string;
  status: string;
  createdAt: string;
}

interface ActivityEvent {
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

interface DashboardData {
  active_agents: number;
  pending_approvals: number;
  weekly_spend: number;
  total_goals: number;
  active_goals: number;
  total_tasks: number;
  completed_tasks: number;
  credits: {
    total: number;
    used: number;
    remaining: number;
    utilizationPercent: number;
    isLow: boolean;
    isCritical: boolean;
    daysRemaining: number | null;
  } | null;
  recent_activity: ActivityEvent[];
}

interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
  head: string | null;
  budget: number | null;
  status: string;
  agentCount: number;
  activeCount: number;
}

interface DepartmentProgress {
  departmentId: string;
  departmentName: string;
  progressPct: number;
  status: string;
  blockedTaskCount: number;
  activeTaskCount: number;
}

interface CompanyProgressData {
  overallPct: number;
  maturityStage: string;
  departments: DepartmentProgress[];
  blockedTasks: number;
}

interface OrgInfo {
  user: { id: string; email: string; name: string | null };
  memberships: {
    org: { id: string; name: string; slug: string; plan: string; isDemo?: boolean };
    role: string;
  }[];
  active_org_id: string | null;
}

/** Persisted onboarding/company-builder state (GET /v1/company-builder/state). */
interface CompanyBuilderState {
  step: string;
  completedAt: string | null;
  analysis: { companyName?: string } | null;
  plan: unknown;
  activation: unknown;
}

interface PriorityAction {
  type: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  suggestedAction: string;
}

/** The unratified plan revision shown in the dock's plan card (GET /v1/plan-revisions). */
interface PendingRevision {
  rev: number;
  title: string;
  summary: string | null;
  authorName: string;
  status: string;
}

interface DecisionRow {
  id: string;
  title: string;
  decisionType: string;
  status: string;
  confidence: string;
  decisionMakerName: string | null;
  expectedOutcome: string | null;
  createdAt: string;
}

interface GoalRow {
  id: string;
  title: string;
  status: string;
  progress: number;
  priority: string;
  dueDate: string | null;
}

// Freshness matters on the company HQ: approvals, health and activity must
// reflect the latest backend state, never a cached body.
const FRESH = { revalidate: false } as const;

const fetchDashboardData = () => fetchWithAuth<DashboardData>("/v1/dashboard", FRESH);
const fetchAgents = () => fetchWithAuth<Agent[]>("/v1/agents", FRESH);
const fetchApprovals = () => fetchWithAuth<Approval[]>("/v1/approvals?status=pending", FRESH);
const fetchDepartments = () => fetchWithAuth<DepartmentRow[]>("/v1/departments?all=true", FRESH);
const fetchActivity = () => fetchWithAuth<ActivityEvent[]>("/v1/activity?limit=14", FRESH);
const fetchCompanyProgress = () => fetchWithAuth<CompanyProgressData>("/v1/company-progress", FRESH);
const fetchOrgInfo = () => fetchWithAuth<OrgInfo>("/v1/auth/me", FRESH);
const fetchBuilderState = () =>
  fetchWithAuth<CompanyBuilderState>("/v1/company-builder/state", FRESH);
const fetchPriorities = () =>
  fetchWithAuth<PriorityAction[]>("/v1/recommendations/priorities?limit=4", FRESH).catch(
    () => null,
  );
const fetchPendingRevision = () =>
  fetchWithAuth<{ revisions: PendingRevision[]; pending: PendingRevision | null }>(
    "/v1/plan-revisions",
    FRESH,
  ).catch(() => null);
const fetchDecisions = () =>
  fetchWithAuth<{ decisions: DecisionRow[]; total: number }>("/v1/decisions?limit=4", FRESH).catch(
    () => null,
  );
const fetchActiveGoals = () =>
  fetchWithAuth<GoalRow[]>("/v1/goals?status=active&limit=4", FRESH).catch(() => null);

type DotState = "" | "working" | "waiting" | "blocked";

/** A thin state meter — same vocabulary as the console's state dots. */
function Meter({ pct, tone = "ok" }: { pct: number; tone?: "ok" | "warn" | "danger" }) {
  const width = Math.min(Math.max(pct, 0), 100);
  const color =
    tone === "danger"
      ? "var(--orq-error)"
      : tone === "warn"
        ? "var(--orq-warm)"
        : "var(--orq-mark-active)";
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-hairline" aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
  subtext,
  meter,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  subtext: string;
  meter?: number;
  tone?: "ok" | "warn" | "danger";
  href: string;
}) {
  return (
    <Link
      href={href}
      className="console-card block p-4 transition-colors hover:bg-surface-secondary"
    >
      <span className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">
        {value}
        {suffix && <span className="ml-1 text-xs font-medium text-muted">{suffix}</span>}
      </p>
      {meter !== undefined && (
        <div className="mt-2">
          <Meter pct={meter} tone={tone} />
        </div>
      )}
      <p className="mt-1.5 truncate text-xs text-muted">{subtext}</p>
    </Link>
  );
}

/** Activity → the terminal's type tag and its colour (docs/73: colour = state). */
function activityTag(type: string): { tag: string; color: string } {
  const t = type.toLowerCase();
  if (t.includes("fail") || t.includes("block") || t.includes("denied")) {
    return { tag: "FAILED", color: "var(--orq-error)" };
  }
  if (t.includes("approv") || t.includes("gate") || t.includes("waiting")) {
    return { tag: "GATE", color: "var(--orq-warm)" };
  }
  if (t.includes("complet") || t.includes("done") || t.includes("success")) {
    return { tag: "DONE", color: "var(--orq-mark-active)" };
  }
  if (t.includes("tool")) return { tag: "TOOL", color: "var(--orq-text-secondary)" };
  if (t.includes("created") || t.includes("hired")) return { tag: "NEW", color: "var(--orq-text-secondary)" };
  if (t.includes("execut") || t.includes("run")) return { tag: "RUN", color: "var(--orq-text-secondary)" };
  if (t.includes("analyz")) return { tag: "ANALYZE", color: "var(--orq-text-secondary)" };
  if (t.includes("draft")) return { tag: "DRAFT", color: "var(--orq-text-secondary)" };
  if (t.includes("review")) return { tag: "REVIEW", color: "var(--orq-text-secondary)" };
  if (t.includes("paused")) return { tag: "PAUSED", color: "var(--orq-text-secondary)" };
  // Unknown types: the first word, uppercased — never a word cut in half
  // (a mid-word slice read as "EXECUTI" in the terminal).
  const firstWord = t.split(/[^a-z]+/).filter(Boolean)[0] ?? "event";
  return { tag: firstWord.toUpperCase().slice(0, 9), color: "var(--orq-text-secondary)" };
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatMoney(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

/**
 * Company HQ (docs/71 §F, marketing/headquarters-mock-v2.html).
 *
 * The approved mock's composition: greeting → four-state strip → the banner
 * that morphs with company state → the live organization (departments as
 * columns with their people and work) → the live-activity terminal. The
 * deeper oversight surfaces that used to live here have their own pages
 * (performance, quality, activity, goals, decisions) and are linked, not
 * duplicated.
 *
 * Every value is read from a real endpoint. Nothing on this page is invented,
 * and a department/employee with nothing to say says nothing rather than
 * showing a placeholder.
 */
export default async function AppPage() {
  const [
    dashboard,
    agents,
    approvals,
    departments,
    activity,
    companyProgress,
    orgInfo,
    builderState,
    priorities,
    decisionsRes,
    activeGoalsRes,
    pendingRevisionRes,
  ] = await Promise.all([
    fetchDashboardData(),
    fetchAgents(),
    fetchApprovals(),
    fetchDepartments(),
    fetchActivity(),
    fetchCompanyProgress(),
    fetchOrgInfo(),
    fetchBuilderState(),
    fetchPriorities(),
    fetchDecisions(),
    fetchActiveGoals(),
    fetchPendingRevision(),
  ]);

  const agentList = agents ?? [];
  const approvalList = approvals ?? [];
  const departmentList = (departments ?? []).filter((d) => d.status === "active");
  const events = activity ?? dashboard?.recent_activity ?? [];

  // First-login detection: server-derived from persisted onboarding state.
  const founderStage: FounderStage = !builderState
    ? "new"
    : builderState.completedAt || builderState.activation
      ? "active"
      : builderState.step !== "organization" || !!builderState.analysis || !!builderState.plan
        ? "in_progress"
        : "new";

  const activeOrg = orgInfo?.memberships?.find((m) => m.org.id === orgInfo.active_org_id);
  const orgName = activeOrg?.org.name ?? "My Company";

  const activeAgents = dashboard?.active_agents ?? 0;
  const pendingApprovals = dashboard?.pending_approvals ?? 0;
  const totalTasks = dashboard?.total_tasks ?? 0;
  const completedTasks = dashboard?.completed_tasks ?? 0;
  const weeklySpend = dashboard?.weekly_spend ?? 0;
  const credits = dashboard?.credits ?? null;
  const totalGoals = dashboard?.total_goals ?? 0;
  const activeGoalsCount = dashboard?.active_goals ?? 0;
  const blockedTasks = companyProgress?.blockedTasks ?? 0;

  const health = computeScore({
    activeAgents,
    totalAgents: agentList.length,
    completedTasks,
    totalTasks,
    creditsRemaining: credits?.remaining ?? 0,
    creditsTotal: credits?.total ?? 100,
    pendingApprovals,
    activeGoals: activeGoalsCount,
    totalGoals,
  });

  const firstName = orgInfo?.user.name?.trim().split(/\s+/)[0] ?? null;
  const hour = new Date().getHours();
  const dayGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const todayLine = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const remainingSteps: string[] = (() => {
    if (founderStage !== "in_progress") return [];
    switch (builderState?.step) {
      case "constitution":
        return ["your company constitution", "your first AI employees"];
      case "plan":
        return ["your company plan", "your first AI employees"];
      case "agents":
        return ["your first AI employees"];
      default:
        return ["your company profile", "your company constitution", "your first AI employees"];
    }
  })();

  const liveFacts: string[] = [
    agentList.length > 0 ? `${activeAgents} of ${agentList.length} AI employees active` : null,
    pendingApprovals > 0
      ? `${pendingApprovals} approval${pendingApprovals !== 1 ? "s" : ""} waiting for your decision`
      : "no approvals waiting",
    activeGoalsCount > 0
      ? `${activeGoalsCount} active goal${activeGoalsCount !== 1 ? "s" : ""}`
      : "no active goals yet",
    totalTasks > 0 ? `${completedTasks} of ${totalTasks} tasks completed` : null,
  ].filter((fact): fact is string => !!fact);
  const liveSummary = liveFacts.length > 0 ? liveFacts.join("; ") : null;

  const eaBody =
    founderStage === "active"
      ? liveSummary
        ? `What I am tracking: ${liveSummary}.`
        : "There is no activity yet. Ask me to plan the first work for your company."
      : founderStage === "in_progress"
        ? "I kept what you have already given me, so we can pick up where you left off. Nothing is activated until you approve it."
        : `Welcome to ORQ8${firstName ? `, ${firstName}` : ""}. I am ${EA_NAME}, your Executive Agent. Tell me what you are building and what you want it to accomplish.`;

  const goalList = activeGoalsRes ?? [];
  const decisionList = decisionsRes?.decisions ?? [];
  const priorityList = priorities ?? [];
  const pendingRevision = pendingRevisionRes?.pending ?? null;

  // ── The live organization ───────────────────────────────────────────────
  // Status is derived from the employee's own rows, never invented: an
  // archived employee is retired, a paused one is paused, a pending approval
  // addressed to them means they need you, their newest event deciding
  // "blocked" (so one old failure cannot label someone blocked forever), a
  // current task means working, otherwise idle.
  const pendingApprovalAgentIds = new Set(
    approvalList.map((a) => a.agentId).filter((id): id is string => !!id),
  );
  const newestEventByAgent = new Map<string, ActivityEvent>();
  for (const event of events) {
    if (event.agentId && !newestEventByAgent.has(event.agentId)) {
      newestEventByAgent.set(event.agentId, event);
    }
  }
  const blockedAgentIds = new Set<string>();
  for (const [agentId, event] of newestEventByAgent) {
    const tag = activityTag(event.type).tag;
    if (tag === "FAILED") blockedAgentIds.add(agentId);
  }

  function memberState(agent: Agent): { label: string; detail: string; state: DotState } {
    if (agent.status === "archived") return { label: "Retired", detail: "Retired", state: "" };
    if (agent.status !== "active") return { label: "Paused", detail: "Paused by you", state: "" };
    if (pendingApprovalAgentIds.has(agent.id)) {
      return { label: "Needs you", detail: "Waiting on approval", state: "waiting" };
    }
    if (blockedAgentIds.has(agent.id)) {
      const newest = newestEventByAgent.get(agent.id);
      // The event summary already names the failure ("Failed: Publish the
      // launch post"); repeating the tag reads as a stutter, so the tag is
      // stripped and the state dot carries it.
      const reason = newest
        ? newest.summary.replace(/^(failed|blocked|execution blocked):\s*/i, "")
        : null;
      return { label: "Blocked", detail: reason ?? "Blocked", state: "blocked" };
    }
    if (agent.currentTask) {
      return { label: "Working", detail: agent.currentTask, state: "working" };
    }
    return { label: "Idle", detail: "Idle", state: "" };
  }

  const membersByDepartment = new Map<string, Agent[]>();
  const unassigned: Agent[] = [];
  for (const agent of agentList) {
    if (agent.departmentId) {
      const list = membersByDepartment.get(agent.departmentId) ?? [];
      list.push(agent);
      membersByDepartment.set(agent.departmentId, list);
    } else {
      unassigned.push(agent);
    }
  }

  const progressByDepartment = new Map<string, DepartmentProgress>(
    (companyProgress?.departments ?? []).map((d) => [d.departmentId, d]),
  );

  function departmentState(members: Agent[]): {
    label: string;
    state: DotState;
    tone: "ok" | "warn" | "danger";
  } {
    const states = members.map((m) => memberState(m).label);
    if (states.includes("Needs you")) return { label: "Needs you", state: "waiting", tone: "warn" };
    if (states.includes("Blocked")) return { label: "Blocked", state: "blocked", tone: "danger" };
    const working = states.filter((s) => s === "Working").length;
    if (working > 0) {
      return { label: `${working} working`, state: "working", tone: "ok" };
    }
    if (members.length === 0) return { label: "Empty", state: "", tone: "ok" };
    return { label: "Idle", state: "", tone: "ok" };
  }

  const agentNameById = new Map(agentList.map((a) => [a.id, a.name]));

  // ── The Atlas dock's props ────────────────────────────────────────────
  // The employee mid-task right now: an active currentTask is the honest
  // signal (the executor sets it when work starts and clears it when it ends).
  const workingAgent =
    agentList.find((a) => a.status === "active" && a.currentTask) ?? null;
  const workingNow = workingAgent
    ? { name: workingAgent.name, task: workingAgent.currentTask ?? "" }
    : null;
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const eventsThisHour = events.filter(
    (e) => new Date(e.occurredAt).getTime() >= hourAgo,
  ).length;
  const dockEvents = events
    .filter((e) => {
      const tag = activityTag(e.type).tag;
      return tag === "DONE" || tag === "GATE" || tag === "FAILED";
    })
    .slice(0, 2)
    .map((e) => ({
      id: e.id,
      type: e.type,
      summary: e.summary,
      agentName: e.agentId ? (agentNameById.get(e.agentId) ?? null) : null,
      cost: e.cost,
    }));
  const dockApprovals = approvalList.slice(0, 3).map((a) => ({
    id: a.id,
    agentName: a.agentId ? (agentNameById.get(a.agentId) ?? null) : null,
    action: a.action,
    description: a.description,
    cost: a.cost,
  }));

  // The banner morphs with company state (docs/71 §F): approvals first, then
  // blockers, then "all caught up".
  const banner =
    approvalList.length > 0
      ? {
          state: "waiting" as DotState,
          title: `${approvalList.length} approval${approvalList.length !== 1 ? "s" : ""} holding work`,
          body:
            approvalList
              .slice(0, 2)
              .map(
                (a) =>
                  `${a.agentId ? (agentNameById.get(a.agentId) ?? "An employee") : "System"} — ${a.action}`,
              )
              .join(" · ") + (approvalList.length > 2 ? ` · +${approvalList.length - 2} more` : ""),
          href: "/app/approvals",
          cta: "Review",
        }
      : blockedTasks > 0
        ? {
            state: "blocked" as DotState,
            title: `${blockedTasks} task${blockedTasks !== 1 ? "s" : ""} blocked`,
            body: "Work that cannot continue without a decision or a fix.",
            href: "/app/attention",
            cta: "Open attention",
          }
        : {
            state: "" as DotState,
            title: "All caught up",
            body: "Nothing is waiting on you. The company is working from its goals.",
            href: "/app/tasks",
            cta: "View work",
          };

  const attentionItems: Array<{ icon: React.ElementType; text: string; href: string }> = [];
  if (credits?.isCritical) {
    attentionItems.push({ icon: Zap, text: "Work credits critically low — employees may pause.", href: "/app/budgets" });
  } else if (credits?.isLow) {
    attentionItems.push({ icon: Zap, text: `Only ${credits.remaining} credits remaining.`, href: "/app/budgets" });
  }
  if (blockedTasks > 0) {
    attentionItems.push({ icon: AlertTriangle, text: `${blockedTasks} blocked task${blockedTasks !== 1 ? "s" : ""}.`, href: "/app/goals" });
  }
  if (agentList.length === 0) {
    attentionItems.push({ icon: Bot, text: "No AI employees yet — hire your first one.", href: "/app/agents" });
  }
  if (activeAgents === 0 && agentList.length > 0) {
    attentionItems.push({ icon: Bot, text: "All AI employees are paused.", href: "/app/agents" });
  }

  return (
    <div className="space-y-4">
      <EAStageRegistrar stage={founderStage} route="/app" pageName="Dashboard" />

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <header className="console-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {dayGreeting}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              {todayLine} · {orgName}
              {activeOrg?.org.plan ? ` · ${activeOrg.org.plan} plan` : ""}
            </p>
            {founderStage === "in_progress" && remainingSteps.length > 0 && (
              <ul className="mt-2 space-y-1">
                {remainingSteps.map((step) => (
                  <li key={step} className="flex items-center gap-2 text-xs text-muted">
                    <span className="h-1 w-1 rounded-full bg-warm" aria-hidden="true" />
                    {step}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {founderStage === "active" ? (
              <EAOpenButton
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
                prompt="What should we do next, and why?"
              >
                ＋ Give direction
              </EAOpenButton>
            ) : (
              <>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
                  style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
                >
                  Continue setup
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <EAOpenButton
                  className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
                  prompt="Here is what I am building: "
                >
                  Tell {EA_NAME} about it
                </EAOpenButton>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── The four-state strip ─────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active goals"
          value={activeGoalsCount}
          subtext={
            activeGoalsCount > 0 ? "In progress" : totalGoals > 0 ? "None active" : "None yet"
          }
          href="/app/goals"
        />
        <StatCard
          label="Employees active"
          value={`${activeAgents} / ${agentList.length}`}
          meter={agentList.length > 0 ? (activeAgents / agentList.length) * 100 : 0}
          subtext={agentList.length > 0 ? `${agentList.length} on the roster` : "Hire your first employee"}
          href="/app/agents"
        />
        <StatCard
          label="Credits this week"
          value={weeklySpend > 0 ? formatMoney(weeklySpend) : (credits?.remaining ?? 0)}
          suffix={weeklySpend > 0 ? "spent" : "left"}
          meter={credits?.utilizationPercent ?? 0}
          tone={credits?.isCritical ? "danger" : credits?.isLow ? "warn" : "ok"}
          subtext={
            credits
              ? `${credits.remaining} of ${credits.total} credits left`
              : "Usage not available"
          }
          href="/app/budgets"
        />
        <StatCard
          label="Company health"
          value={health.score}
          suffix="/ 100"
          meter={health.score}
          tone={health.score >= 70 ? "ok" : health.score >= 40 ? "warn" : "danger"}
          subtext={`${health.label.toLowerCase()} · ${
            pendingApprovals > 0
              ? `${pendingApprovals} gate${pendingApprovals !== 1 ? "s" : ""} waiting`
              : "no gates waiting"
          }`}
          href="/app/health"
        />
      </div>

      {/* ── Main grid: the company column + the Atlas dock ────────────── */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">

      {/* ── The morphing banner ──────────────────────────────────────────── */}
      <div className="console-card flex flex-wrap items-center gap-3 p-4">
        <span className="state-dot" data-state={banner.state} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{banner.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{banner.body}</p>
        </div>
        {attentionItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {attentionItems.slice(0, 2).map((item) => (
              <Link
                key={item.text}
                href={item.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-2xs text-muted transition-colors hover:text-ink"
              >
                <item.icon className="h-3 w-3" />
                {item.text}
              </Link>
            ))}
          </div>
        )}
        <Link
          href={banner.href}
          className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold"
          style={
            approvalList.length > 0
              ? { backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }
              : { border: "1px solid var(--orq-border-strong)", color: "var(--orq-text-primary)" }
          }
        >
          {banner.cta}
        </Link>
      </div>

      {/* ── What's happening now — the live organization ─────────────────── */}
      <section className="console-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
            What&apos;s happening now
          </h2>
          <div className="flex items-center gap-2">
            <Link
              href="/app/departments"
              className="text-xs text-muted transition-colors hover:text-ink"
            >
              All departments →
            </Link>
            <span
              title="Every task is routed to a suitable model automatically; nothing here needs a choice."
              className="rounded-full border border-hairline px-2.5 py-1 font-mono text-2xs uppercase tracking-wide text-muted"
            >
              Auto Model
            </span>
          </div>
        </div>

        {departmentList.length === 0 && agentList.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-hairline px-4 py-6">
            <p className="text-sm text-ink">No departments and no employees yet.</p>
            <p className="mt-1 text-xs text-muted">
              Finish setup, or ask {EA_NAME} to propose a structure for the company.
            </p>
            <EAOpenButton
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
              prompt="Propose a structure for my company"
            >
              Ask {EA_NAME}
            </EAOpenButton>
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center">
            {/* Founder */}
            <div className="flex min-w-[200px] items-center gap-2.5 rounded-md border border-hairline bg-elevated px-3.5 py-2">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-canvas text-2xs font-semibold text-ink"
              >
                {(firstName ?? "F").charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-ink">
                  {firstName ?? "You"}
                </span>
                <span className="block text-2xs text-muted">Founder · human</span>
              </span>
            </div>
            <span className="h-5 w-px bg-hairline-strong" aria-hidden="true" />
            {/* The Executive Agent — directs all departments */}
            <div
              className="flex min-w-[230px] items-center gap-2.5 rounded-md border px-3.5 py-2"
              style={{
                borderColor: "rgba(166,206,149,0.45)",
                backgroundColor: "rgba(166,206,149,0.07)",
              }}
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm text-brand-ink"
                style={{ backgroundColor: "rgba(166,206,149,0.12)" }}
              >
                ◈
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-ink">{EA_NAME}</span>
                <span className="block text-2xs text-muted">
                  Executive Agent · directs all departments
                </span>
              </span>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-2xs text-muted">
                <span className="state-dot" data-state={workingNow ? "working" : ""} />
                active
              </span>
            </div>
            <span className="h-5 w-px bg-hairline-strong" aria-hidden="true" />

            {/* Departments — who is in each and what their people are doing */}
            <div className="flex w-full flex-wrap items-start justify-center gap-x-4 gap-y-7">
              {departmentList.map((department) => {
                const members = membersByDepartment.get(department.id) ?? [];
                const lead = department.head
                  ? members.find(
                      (m) => m.name.toLowerCase() === department.head!.toLowerCase(),
                    )
                  : undefined;
                const others = members.filter((m) => m.id !== lead?.id);
                const roster = [...(lead ? [lead] : []), ...others];
                const weekly = members.reduce((sum, m) => sum + (m.weeklyCost ?? 0), 0);
                return (
                  <div
                    key={department.id}
                    className="flex w-full min-w-[136px] flex-col items-center sm:w-[calc(50%-0.5rem)] xl:w-[calc(25%-0.75rem)]"
                  >
                    <Link
                      href={`/app/departments/${department.id}`}
                      className="w-full rounded-md border border-hairline bg-elevated px-3 py-1.5 text-center transition-colors hover:border-hairline-strong"
                    >
                      <span className="block text-xs font-semibold text-ink">
                        {department.name}
                      </span>
                      <span className="block text-2xs text-muted">
                        {members.length} employee{members.length === 1 ? "" : "s"}
                        {weekly > 0 ? ` · ${formatMoney(weekly / 100)}/wk` : ""}
                      </span>
                    </Link>
                    <span className="h-4 w-px bg-hairline-strong" aria-hidden="true" />
                    {roster.length === 0 ? (
                      <div className="w-full rounded-md border border-dashed border-hairline px-2 py-2.5 text-center">
                        <p className="text-2xs text-muted">
                          No employees yet — ask {EA_NAME} to hire.
                        </p>
                      </div>
                    ) : (
                      <ul className="w-full space-y-1.5">
                        {roster.map((member) => {
                          const memberInfo = memberState(member);
                          return (
                            <li key={member.id}>
                              <Link
                                href={`/app/agents/${member.id}`}
                                className="flex w-full items-center gap-2 rounded-md border border-hairline bg-elevated px-2.5 py-1.5 transition-colors hover:border-hairline-strong"
                              >
                                <span
                                  aria-hidden="true"
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline bg-canvas text-2xs font-semibold text-ink"
                                >
                                  {member.name.charAt(0).toUpperCase()}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs text-ink">
                                    {member.name}
                                    {member.id === lead?.id && (
                                      <span className="ml-1.5 text-2xs text-muted">Lead</span>
                                    )}
                                  </span>
                                  <span className="block truncate text-2xs text-muted">
                                    {memberInfo.detail}
                                  </span>
                                </span>
                                <span
                                  className="state-dot"
                                  data-state={memberInfo.state}
                                  title={memberInfo.label}
                                />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}

              {unassigned.length > 0 && (
                <div className="flex w-full min-w-[136px] flex-col items-center sm:w-[calc(50%-0.5rem)] xl:w-[calc(25%-0.75rem)]">
                  <div className="w-full rounded-md border border-hairline bg-elevated px-3 py-1.5 text-center">
                    <span className="block text-xs font-semibold text-ink">Unassigned</span>
                    <span className="block text-2xs text-muted">
                      {unassigned.length} employee{unassigned.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="h-4 w-px bg-hairline-strong" aria-hidden="true" />
                  <ul className="w-full space-y-1.5">
                    {unassigned.map((member) => {
                      const memberInfo = memberState(member);
                      return (
                        <li key={member.id}>
                          <Link
                            href={`/app/agents/${member.id}`}
                            className="flex w-full items-center gap-2 rounded-md border border-dashed border-hairline bg-elevated px-2.5 py-1.5 transition-colors hover:border-hairline-strong"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs text-ink">
                                {member.name}
                              </span>
                              <span className="block truncate text-2xs text-muted">
                                {memberInfo.label}
                              </span>
                            </span>
                            <span className="state-dot" data-state={memberInfo.state} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Live activity ────────────────────────────────────────────────── */}
      <section className="console-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
            Live activity
          </h2>
          <Link href="/app/audit" className="text-xs text-muted transition-colors hover:text-ink">
            Full audit trail →
          </Link>
        </div>
        {events.length === 0 ? (
          <p className="mt-3 text-xs text-muted">
            No activity yet. Every task an employee runs leaves an event here.
          </p>
        ) : (
          <div className="mt-2.5 space-y-1 overflow-hidden font-mono text-2xs leading-relaxed">
            {events.slice(0, 12).map((event) => {
              const tag = activityTag(event.type);
              const who = event.agentId ? agentNameById.get(event.agentId) : null;
              return (
                <div key={event.id} className="flex items-baseline gap-2">
                  <span className="shrink-0 text-muted">[{formatClock(event.occurredAt)}]</span>
                  <span className="w-14 shrink-0 font-semibold" style={{ color: tag.color }}>
                    {tag.tag}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {who ? `${who}: ` : ""}
                    {who && event.summary.startsWith(`${who}: `)
                      ? event.summary.slice(who.length + 2)
                      : event.summary}
                  </span>
                  {event.cost > 0 && (
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatMoney(event.cost / 100)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Goals and recent decisions ───────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="console-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Goals
            </h2>
            <Link href="/app/goals" className="text-xs text-muted transition-colors hover:text-ink">
              View all →
            </Link>
          </div>
          {goalList.length === 0 ? (
            <div className="mt-3 rounded-md border border-dashed border-hairline px-4 py-5">
              <p className="text-sm text-ink">No active goals yet.</p>
              <p className="mt-1 text-xs text-muted">
                Tell {EA_NAME} what you want the company to accomplish and it can define the first
                goal with you.
              </p>
              <EAOpenButton
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
                prompt="Help me define my first goal"
              >
                Ask {EA_NAME}
              </EAOpenButton>
            </div>
          ) : (
            <ul className="mt-2.5 space-y-3">
              {goalList.map((goal) => (
                <li key={goal.id}>
                  <Link href={`/app/goals/${goal.id}`} className="group block">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm text-ink transition-colors group-hover:text-brand-ink">
                        {goal.title}
                      </p>
                      <span className="shrink-0 font-mono text-2xs tabular-nums text-muted">
                        {goal.progress}%
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Meter pct={goal.progress} />
                    </div>
                    <p className="mt-1 font-mono text-2xs text-muted">
                      {goal.priority} priority
                      {goal.dueDate ? ` · due ${new Date(goal.dueDate).toLocaleDateString()}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="console-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Recent decisions
            </h2>
            <Link href="/app/decisions" className="text-xs text-muted transition-colors hover:text-ink">
              View all →
            </Link>
          </div>
          {decisionList.length === 0 ? (
            <p className="mt-3 text-xs text-muted">
              No decisions recorded yet. Consequential calls are filed here with their expected
              outcome so the company can learn from them.
            </p>
          ) : (
            <ul className="mt-2.5 space-y-2.5">
              {decisionList.map((decision) => (
                <li key={decision.id} className="border-b border-hairline pb-2.5 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/app/decisions/${decision.id}`}
                      className="text-sm text-ink transition-colors hover:text-brand-ink"
                    >
                      {decision.title}
                    </Link>
                    <span className="shrink-0 font-mono text-2xs uppercase tracking-wide text-muted">
                      {decision.status}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-2xs text-muted">
                    {decision.decisionType.replace(/_/g, " ")}
                    {decision.decisionMakerName ? ` · ${decision.decisionMakerName}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── From the Executive Agent ─────────────────────────────────────── */}
      {priorities !== null && (
        <section className="console-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              From {EA_NAME}
            </h2>
            <span className="font-mono text-2xs uppercase tracking-wide text-muted">
              {priorityList.length > 0
                ? `${priorityList.length} recommendation${priorityList.length === 1 ? "" : "s"}`
                : "nothing needs action"}
            </span>
          </div>
          {priorityList.length > 0 ? (
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {priorityList.map((item, i) => (
                <li key={i} className="rounded-md border border-hairline bg-canvas p-3.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono text-2xs uppercase tracking-wide"
                      style={{
                        color:
                          item.priority === "critical"
                            ? "var(--orq-error)"
                            : item.priority === "high" || item.priority === "medium"
                              ? "var(--orq-warm)"
                              : "var(--orq-text-secondary)",
                      }}
                    >
                      {item.priority}
                    </span>
                    <span className="font-mono text-2xs uppercase tracking-wide text-muted">
                      {item.type}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.description}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-ink">Suggested: {item.suggestedAction}</p>
                    <EAOpenButton
                      className="shrink-0 rounded-md border border-hairline px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-secondary"
                      prompt={`What should we do about "${item.title}"?`}
                    >
                      Discuss
                    </EAOpenButton>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted">
              No recommendations right now. {EA_NAME} reviews goals, work, approvals and blockers
              continuously and surfaces what deserves your attention here.
            </p>
          )}
        </section>
      )}

      {attentionItems.length > 0 && (
        <section className="console-card p-4">
          <h2 className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
            Also worth knowing
          </h2>
          <ul className="mt-2 space-y-1.5">
            {attentionItems.map((item) => (
              <li key={item.text}>
                <Link
                  href={item.href}
                  className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface-secondary hover:text-ink"
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">{item.text}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

        </div>

        {/* ── The Atlas dock — fixed on the right, per the mock ────────────── */}
        <EADock
          intro={eaBody}
          approvals={dockApprovals}
          events={dockEvents}
          workingNow={workingNow}
          pendingRevision={
            pendingRevision
              ? {
                  rev: pendingRevision.rev,
                  authorName: pendingRevision.authorName,
                  summary: pendingRevision.summary,
                }
              : null
          }
          eventsThisHour={eventsThisHour}
        />
      </div>

      <ContrastSelfCheck />
    </div>
  );
}
