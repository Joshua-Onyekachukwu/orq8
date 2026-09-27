import Link from "next/link";

import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Command,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { CommandBar } from "../../components/command-bar";
import { ReliabilityWidget } from "../../components/dashboard/ReliabilityWidget";
import { ModelPerformanceWidget } from "../../components/dashboard/ModelPerformanceWidget";
import { DepartmentActivityWidget } from "../../components/dashboard/DepartmentActivityWidget";

import { ContrastSelfCheck } from "../../components/contrast-self-check";
import { ActivityFeed } from "../../components/dashboard/ActivityFeed";
import { HealthScore } from "../../components/dashboard/HealthScore";
import { GoalExecutionPanel } from "../../components/dashboard/GoalExecutionPanel";
import { EAStageRegistrar } from "../../components/dashboard/ea-stage-registrar";
import { EAOpenButton } from "../../components/dashboard/ea-open-button";
import type { FounderStage } from "../../components/executive-agent-context";
import { fetchWithAuth, formatCost, formatDate, formatTimeAgo } from "../../lib/api";
import { EA_NAME } from "../../lib/ea";

export const metadata = { title: "Dashboard" };

interface Agent {
  id: string;
  name: string;
  role: string;
  department: string | null;
  status: string;
  weeklyCost: number;
  tasksCompleted: number;
  currentTask: string | null;
}

interface Approval {
  id: string;
  agentId: string | null;
  action: string;
  description: string | null;
  cost: number;
  riskLevel: string;
  status: string;
  decisionNote: string | null;
  decidedAt: string | null;
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

interface DepartmentProgress {
  departmentId: string;
  departmentName: string;
  taskCount: number;
  completedTaskCount: number;
  activeTaskCount: number;
  blockedTaskCount: number;
  recentOutputs: number;
  agentCount: number;
  activeAgentCount: number;
  progressPct: number;
  status: string;
}

interface CompanyProgressData {
  overallPct: number;
  maturityStage: string;
  departments: DepartmentProgress[];
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  blockedTasks: number;
  recentOutputs: number;
  attentionNeeded: string[];
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
  analysis: {
    companyName?: string;
    description?: string;
    stage?: string;
    industry?: string;
    sourceType?: string;
    priorities?: string[];
  } | null;
  plan: unknown;
  activation: unknown;
}

interface PriorityAction {
  type: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  urgency: number;
  suggestedAction: string;
  evidence: string[];
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
  description: string | null;
  status: string;
  progress: number;
  priority: string;
  dueDate: string | null;
}

// Freshness matters for an oversight dashboard: the attention queue, the
// onboarding stage and the goal/decision lists must reflect the latest
// backend state (revalidate: false → cache: "no-store").
const FRESH = { revalidate: false } as const;

const fetchDashboardData = () => fetchWithAuth<DashboardData>("/v1/dashboard", FRESH);
const fetchAgents = () => fetchWithAuth<Agent[]>("/v1/agents");
const fetchApprovals = () => fetchWithAuth<Approval[]>("/v1/approvals?status=pending", FRESH);
const fetchCompanyProgress = () => fetchWithAuth<CompanyProgressData>("/v1/company-progress");
const fetchOrgInfo = () => fetchWithAuth<OrgInfo>("/v1/auth/me");
const fetchBuilderState = () =>
  fetchWithAuth<CompanyBuilderState>("/v1/company-builder/state", FRESH);
const fetchPriorities = () =>
  fetchWithAuth<PriorityAction[]>("/v1/recommendations/priorities?limit=4", FRESH).catch(
    () => null,
  );
const fetchDecisions = () =>
  fetchWithAuth<{ decisions: DecisionRow[]; total: number }>("/v1/decisions?limit=5", FRESH).catch(
    () => null,
  );
const fetchActiveGoals = () =>
  fetchWithAuth<GoalRow[]>("/v1/goals?status=active&limit=5", FRESH).catch(() => null);

function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  color,
  href,
}: {
  label: string;
  value: string | number;
  subtext: string;
  icon: React.ElementType;
  color: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-hairline bg-white p-5 transition-all hover:border-hairline hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span data-contrast-check="stat-card-label" className="text-xs font-medium text-muted">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p data-contrast-check="stat-card-value" className="mt-2 text-2xl font-bold tracking-tight text-ink">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-1">
        <span data-contrast-check="stat-card-subtext" className="text-xs text-muted">{subtext}</span>
        <ArrowUpRight className="h-3 w-3 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  );
}

function decisionBadge(status: string): string {
  if (status === "validated") return "bg-orq8-green/10 text-orq8-green";
  if (status === "reversed") return "bg-red-50 text-red-600";
  if (status === "active") return "bg-orq8-orange/10 text-orq8-orange";
  if (status === "pending") return "bg-amber-50 text-amber-700";
  return "bg-canvas text-muted";
}

function recommendationBadge(priority: string): string {
  if (priority === "critical") return "bg-red-50 text-red-600";
  if (priority === "high") return "bg-orq8-orange/10 text-orq8-orange";
  if (priority === "medium") return "bg-amber-50 text-amber-700";
  return "bg-canvas text-muted";
}

export default async function AppPage() {
  const [
    dashboard,
    agents,
    approvals,
    companyProgress,
    orgInfo,
    builderState,
    priorities,
    decisionsRes,
    activeGoalsRes,
  ] = await Promise.all([
    fetchDashboardData(),
    fetchAgents(),
    fetchApprovals(),
    fetchCompanyProgress(),
    fetchOrgInfo(),
    fetchBuilderState(),
    fetchPriorities(),
    fetchDecisions(),
    fetchActiveGoals(),
  ]);

  const agentList = agents ?? [];
  const approvalList = approvals ?? [];

  // First-login detection: server-derived from persisted onboarding state,
  // never inferred from frontend state.
  //   A new        → onboarding not started (default row, nothing collected)
  //   B in progress → a step or a stored analysis/plan exists, not completed
  //   C active      → completedAt or activation exists
  const founderStage: FounderStage = !builderState
    ? "new"
    : builderState.completedAt || builderState.activation
      ? "active"
      : builderState.step !== "organization" || !!builderState.analysis || !!builderState.plan
        ? "in_progress"
        : "new";

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const activeOrg = orgInfo?.memberships?.find((m) => m.org.id === orgInfo.active_org_id);
  const orgName = activeOrg?.org.name ?? "My Company";
  const isDemoOrg = !!activeOrg?.org.isDemo;
  const roleLabel = activeOrg?.role === "owner" ? "Founder & CEO" : "Team Member";

  const activeAgents = dashboard?.active_agents ?? 0;
  const pendingApprovals = dashboard?.pending_approvals ?? 0;
  const totalTasks = dashboard?.total_tasks ?? 0;
  const completedTasks = dashboard?.completed_tasks ?? 0;
  const weeklySpend = dashboard?.weekly_spend ?? 0;
  const credits = dashboard?.credits ?? null;
  const recentActivity = dashboard?.recent_activity ?? [];
  const totalGoals = dashboard?.total_goals ?? 0;
  const activeGoalsCount = dashboard?.active_goals ?? 0;
  const blockedTasks = companyProgress?.blockedTasks ?? 0;

  // Executive Agent setup strip. The stage comes from persisted onboarding
  // state (founderStage, derived above from /v1/company-builder/state) and
  // every fact below is read from a real endpoint, never invented.
  const firstName = orgInfo?.user.name?.trim().split(/\s+/)[0] ?? null;
  const hour = new Date().getHours();
  const dayGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
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

  const eaTitle =
    founderStage === "active"
      ? `${dayGreeting}${firstName ? `, ${firstName}` : ""}. Here is where your company stands.`
      : founderStage === "in_progress"
        ? `You are partway through setting up ${orgName}.`
        : `Welcome to ORQ8${firstName ? `, ${firstName}` : ""}. I am ${EA_NAME}, your Executive Agent.`;
  const eaBody =
    founderStage === "active"
      ? liveSummary
        ? `What I am tracking: ${liveSummary}.`
        : "There is no activity yet. Ask me to plan the first work for your company."
      : founderStage === "in_progress"
        ? "I kept what you have already given me, so we can pick up where you left off. Nothing is activated until you approve it."
        : "I am here to help you turn your direction into an operating company. What are you building, and what would you like to accomplish with it?";

  const primaryActionClass =
    "inline-flex items-center justify-center rounded-lg bg-orq8-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orq8-dark/90";
  const secondaryActionClass =
    "inline-flex items-center justify-center rounded-lg border border-hairline bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-canvas";

  const goalList = activeGoalsRes ?? [];
  const decisionList = decisionsRes?.decisions ?? [];
  const priorityList = priorities ?? [];
  const workingAgents = agentList.filter((a) => a.status === "active" && a.currentTask);

  const attentionItems: Array<{ icon: React.ElementType; text: string; href: string; color: string }> = [];
  if (approvalList.length > 0) {
    // Show the actual decisions waiting, not just a count.
    for (const a of approvalList.slice(0, 3)) {
      attentionItems.push({ icon: ClipboardCheck, text: a.action, href: "/app/approvals", color: "text-orq8-orange" });
    }
    if (approvalList.length > 3) {
      attentionItems.push({ icon: ClipboardCheck, text: `${approvalList.length - 3} more approval${approvalList.length - 3 !== 1 ? "s" : ""} waiting for your decision`, href: "/app/approvals", color: "text-orq8-orange" });
    }
  } else if (pendingApprovals > 0) {
    attentionItems.push({ icon: ClipboardCheck, text: `${pendingApprovals} approval${pendingApprovals !== 1 ? "s" : ""} waiting for your decision`, href: "/app/approvals", color: "text-orq8-orange" });
  }
  if (credits?.isCritical) attentionItems.push({ icon: Zap, text: "Work credits critically low. AI employees may pause.", href: "/app/budgets", color: "text-red-500" });
  if (credits?.isLow && !credits?.isCritical) attentionItems.push({ icon: Zap, text: `Only ${credits.remaining} credits remaining`, href: "/app/budgets", color: "text-amber-600" });
  const recentFailed = recentActivity.filter((e) => e.type.toLowerCase().includes("failed"));
  if (recentFailed.length > 0) attentionItems.push({ icon: AlertTriangle, text: `${recentFailed.length} task${recentFailed.length !== 1 ? "s" : ""} failed recently`, href: "/app/goals", color: "text-red-500" });
  if (blockedTasks > 0) attentionItems.push({ icon: AlertTriangle, text: `${blockedTasks} blocked task${blockedTasks !== 1 ? "s" : ""} need attention`, href: "/app/goals", color: "text-orq8-orange" });
  if (activeAgents === 0 && agentList.length > 0) attentionItems.push({ icon: Bot, text: "All AI employees are paused", href: "/app/agents", color: "text-muted" });
  if (agentList.length === 0) attentionItems.push({ icon: Bot, text: "No AI employees yet. Hire your first AI employee to get started", href: "/app/agents", color: "text-orq8-green" });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Report the persisted stage + page context to the EA panel so its
          greeting, empty state and suggestions match reality. */}
      <EAStageRegistrar stage={founderStage} route="/app" pageName="Dashboard" />

      {/* Welcome banner */}
      <div className="rounded-xl bg-orq8-dark p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-lime">
              {today}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Company at a glance
            </h1>
            <p className="mt-1 text-sm text-white/60">
              Your AI workforce is{" "}
              {activeAgents > 0
                ? `running ${activeAgents} active agent${activeAgents !== 1 ? "s" : ""}`
                : "waiting for you to get started"}
              .
            </p>

            <div className="mt-6 flex flex-wrap gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orq8-orange/15 text-orq8-orange">
                  <ClipboardCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {pendingApprovals} pending approval{pendingApprovals !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-white/50">Awaiting your decision</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orq8-lime/15 text-orq8-lime">
                  <Bot aria-hidden="true" className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {activeAgents} active agent{activeAgents !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-white/50">
                    {agentList.length > 0
                      ? `${agentList.length} total in your roster`
                      : "Hire agents to get started"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/70">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {completedTasks} task{completedTasks !== 1 ? "s" : ""} completed
                  </p>
                  <p className="text-xs text-white/50">{totalTasks} total tasks</p>
                </div>
              </div>
            </div>
          </div>

          {/* System status */}
          <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-center md:min-w-[160px]">
            <p className="flex items-center gap-1.5 font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-lime">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orq8-lime" />
              System Online
            </p>
            <p className="text-2xl font-bold tracking-tight">
              {orgName}
              {isDemoOrg && (
                <span
                  title="This organization contains staged demo content — its history is illustrative, not a record of live execution."
                  className="ml-2 inline-flex items-center rounded-full border border-amber-300/40 bg-amber-400/15 px-2 py-0.5 align-middle font-sans text-3xs font-semibold uppercase tracking-wider text-amber-200"
                >
                  Demo data
                </span>
              )}
            </p>
            <p className="text-xs text-white/50">{roleLabel}</p>
          </div>
        </div>
      </div>

      {/* Executive Agent setup strip: identity plus the next real step.
          Compact by design, the oversight sections below stay the focus. */}
      <section
        aria-label={`${EA_NAME}, your Executive Agent`}
        className="rounded-xl border border-hairline bg-white p-5 sm:p-6"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orq8-orange/10 font-mono text-sm font-semibold text-orq8-orange"
            >
              {EA_NAME.slice(0, 1)}
            </span>
            <div className="space-y-1.5">
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-orange">
                {EA_NAME} · Executive Agent
              </p>
              <p className="text-sm font-semibold text-ink">{eaTitle}</p>
              <p className="max-w-2xl text-sm text-muted">{eaBody}</p>
              {founderStage === "in_progress" && remainingSteps.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs font-semibold text-ink">Still to finish:</p>
                  <ul className="mt-1 space-y-1">
                    {remainingSteps.map((step) => (
                      <li key={step} className="flex items-center gap-2 text-xs text-muted">
                        <span className="h-1 w-1 rounded-full bg-orq8-orange" aria-hidden="true" />
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
            {founderStage === "active" ? (
              <EAOpenButton
                className={primaryActionClass}
                prompt="What should we do next, and why?"
              >
                Ask {EA_NAME}
              </EAOpenButton>
            ) : (
              <>
                <Link href="/onboarding" className={primaryActionClass}>
                  Continue onboarding
                </Link>
                <EAOpenButton
                  className={secondaryActionClass}
                  prompt="Here is what I am building: "
                >
                  Tell {EA_NAME} about it
                </EAOpenButton>
              </>
            )}
          </div>
        </div>
      </section>

      {/* B. Company overview */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-ink">Company overview</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Active goals"
            value={`${activeGoalsCount}/${totalGoals}`}
            subtext={activeGoalsCount > 0 ? "In progress" : totalGoals > 0 ? "None active" : "None yet"}
            icon={Target}
            color="bg-orq8-green/10 text-orq8-green"
            href="/app/goals"
          />
          <StatCard
            label="AI employees"
            value={activeAgents}
            subtext={`${agentList.length} total`}
            icon={Bot}
            color="bg-orq8-green/10 text-orq8-green"
            href="/app/agents"
          />
          <StatCard
            label="Pending approvals"
            value={pendingApprovals}
            subtext={pendingApprovals > 0 ? "Awaiting your decision" : "Nothing waiting"}
            icon={ClipboardCheck}
            color="bg-orq8-orange/10 text-orq8-orange"
            href="/app/approvals"
          />
          <StatCard
            label="Tasks"
            value={completedTasks}
            subtext={`${totalTasks} total${blockedTasks > 0 ? ` · ${blockedTasks} blocked` : ""}`}
            icon={CheckCircle2}
            color="bg-orq8-orange/10 text-orq8-orange"
            href="/app/goals"
          />
          <StatCard
            label="Work credits"
            value={credits ? credits.remaining : 0}
            subtext={credits ? `${credits.utilizationPercent}% used` : "Usage not available"}
            icon={Zap}
            color="bg-orq8-green/10 text-orq8-green"
            href="/app/budgets"
          />
          <StatCard
            label="Weekly spend"
            value={formatCost(Math.round(weeklySpend * 100))}
            subtext="This week"
            icon={Wallet}
            color="bg-orq8-orange/10 text-orq8-orange"
            href="/app/budgets"
          />
        </div>
      </section>

      {/* C. Needs your attention */}
      <div className="rounded-xl border border-orq8-orange/20 bg-orq8-orange/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orq8-orange/15">
            <AlertTriangle className="h-3.5 w-3.5 text-orq8-orange" />
          </span>
          <h2 className="text-sm font-semibold text-ink">Needs your attention</h2>
          <Link
            href="/app/attention"
            className="ml-auto flex items-center gap-1 text-xs font-medium text-orq8-green hover:underline"
          >
            Open the attention queue
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {attentionItems.length > 0 ? (
          <ul className="space-y-2">
            {attentionItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <li key={i}>
                  <Link href={item.href} className="group flex items-center gap-3 rounded-lg bg-white p-3 transition-colors hover:border-hairline border border-transparent">
                    <Icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                    <span className="flex-1 text-sm text-ink group-hover:text-ink">{item.text}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted group-hover:text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Nothing is waiting on you right now. {EA_NAME} surfaces approvals, blockers, and
            budget risks here as soon as they appear.
          </p>
        )}
      </div>

      {/* D. Active work */}
      <section className="rounded-xl border border-hairline bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Active work</h2>
          <Link href="/app/agents" className="text-xs font-medium text-orq8-green hover:underline">
            View AI employees
          </Link>
        </div>
        {workingAgents.length > 0 ? (
          <div className="space-y-2">
            {workingAgents.map((agent) => (
              <Link
                key={agent.id}
                href={`/app/agents/${agent.id}`}
                className="group flex items-center gap-3 rounded-lg border border-hairline px-3 py-2.5 transition-colors hover:border-orq8-green/40"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orq8-green text-xs font-bold text-white">
                  {agent.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {agent.name}
                    {agent.department ? (
                      <span className="ml-2 text-2xs font-normal text-muted">{agent.department}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted">{agent.currentTask}</p>
                </div>
                <span className="shrink-0 rounded-full bg-orq8-orange/10 px-2 py-0.5 font-mono text-2xs uppercase text-orq8-orange">
                  Working
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-canvas px-4 py-5 text-center">
            <p className="text-sm text-ink">
              {agentList.length === 0
                ? "No AI employees yet. I can recommend an initial team based on your company setup."
                : "No AI employees are working right now."}
            </p>
            <EAOpenButton
              prompt={
                agentList.length === 0
                  ? "Recommend an initial team for my company"
                  : "What should we work on next?"
              }
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-hairline bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-orq8-green hover:text-orq8-green"
            >
              Ask {EA_NAME}
            </EAOpenButton>
          </div>
        )}
      </section>

      {/* E + F. Goals and recent decisions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-hairline bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Goals</h2>
            <Link href="/app/goals" className="text-xs font-medium text-orq8-green hover:underline">
              View all
            </Link>
          </div>
          {activeGoalsRes === null ? null : goalList.length > 0 ? (
            <div className="space-y-3">
              {goalList.map((goal) => (
                <Link
                  key={goal.id}
                  href={`/app/goals/${goal.id}`}
                  className="group block rounded-lg border border-hairline p-4 transition-colors hover:border-orq8-green/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-ink group-hover:text-orq8-green">
                      {goal.title}
                    </p>
                    <span className="shrink-0 font-mono text-2xs text-muted">{goal.progress}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-hairline">
                    <div
                      className="h-full rounded-full bg-orq8-green"
                      style={{ width: `${Math.min(Math.max(goal.progress, 0), 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-2xs text-muted">
                    <span
                      className={
                        goal.priority === "urgent" || goal.priority === "high"
                          ? "font-medium text-orq8-orange"
                          : undefined
                      }
                    >
                      {goal.priority} priority
                    </span>
                    {goal.dueDate && <span>Due {formatDate(goal.dueDate)}</span>}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-canvas px-4 py-5 text-center">
              <p className="text-sm text-ink">
                No active goals yet. Tell {EA_NAME} what you want the company to accomplish and
                it can help you define your first goal.
              </p>
              <EAOpenButton
                prompt="Help me define my first goal"
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-hairline bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-orq8-green hover:text-orq8-green"
              >
                Ask {EA_NAME}
              </EAOpenButton>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-hairline bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Recent decisions</h2>
            <Link
              href="/app/decisions"
              className="text-xs font-medium text-orq8-green hover:underline"
            >
              View all
            </Link>
          </div>
          {decisionsRes === null ? null : decisionList.length > 0 ? (
            <div className="space-y-3">
              {decisionList.map((decision) => (
                <div key={decision.id} className="rounded-lg border border-hairline p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-ink">{decision.title}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-2xs uppercase ${decisionBadge(decision.status)}`}
                    >
                      {decision.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {decision.decisionType ? decision.decisionType.replace(/_/g, " ") : "decision"}
                    {decision.decisionMakerName ? ` · ${decision.decisionMakerName}` : ""} ·{" "}
                    {formatTimeAgo(decision.createdAt)}
                  </p>
                  {decision.expectedOutcome && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted">
                      Expected: {decision.expectedOutcome}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg bg-canvas px-4 py-5 text-center">
              <p className="text-sm text-ink">
                No decisions recorded yet. When you or your teams make a consequential call,
                {EA_NAME} files it here with the expected outcome so the company can learn from
                it.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* G. Executive recommendations */}
      {priorities !== null && (
        <section className="rounded-xl border border-hairline bg-white p-5">
          <div className="mb-1">
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-green">
              From {EA_NAME}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Executive recommendations</h2>
          </div>
          {priorityList.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {priorityList.map((item, i) => (
                <div key={i} className="rounded-lg border border-hairline p-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-2xs uppercase ${recommendationBadge(item.priority)}`}
                    >
                      {item.priority}
                    </span>
                    <span className="font-mono text-2xs uppercase text-muted">{item.type}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.description}</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-ink">Suggested: {item.suggestedAction}</p>
                    <EAOpenButton
                      prompt={`What should we do about "${item.title}"?`}
                      className="shrink-0 self-start rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-orq8-green hover:text-orq8-green sm:self-auto"
                    >
                      Discuss with {EA_NAME}
                    </EAOpenButton>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              No recommendations right now. {EA_NAME} reviews goals, work, approvals, and
              blockers continuously, and surfaces what deserves your attention here.
            </p>
          )}
        </section>
      )}

      {/* Daily Brief — what happened recently */}
      {recentActivity.length > 0 && (
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-green">
              What happened recently
            </p>
          </div>
          <div className="space-y-2">
            {recentActivity.slice(0, 5).map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-lg bg-canvas/50 px-3 py-2">
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                  event.type.includes('completed') ? 'bg-emerald-400' :
                  event.type.includes('failed') ? 'bg-red-400' :
                  event.type.includes('created') ? 'bg-blue-400' :
                  'bg-gray-300'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink leading-snug">{event.summary}</p>
                  <p className="mt-0.5 text-2xs text-muted">
                    {new Date(event.occurredAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    {event.department ? ` · ${event.department}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Company Progress — real progress from goals, tasks, activity */}
      {companyProgress && companyProgress.totalTasks > 0 && (
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-green">
                Company Progress
              </p>
              <h2 className="mt-1 text-lg font-semibold text-ink">
                {companyProgress.maturityStage}
              </h2>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-ink">{companyProgress.overallPct}%</p>
              <p className="text-xs text-muted">Overall progress</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-3 rounded-full bg-hairline overflow-hidden mb-4">
            <div
              className="h-full rounded-full bg-orq8-green transition-all duration-500"
              style={{ width: `${companyProgress.overallPct}%` }}
            />
          </div>

          {/* Department breakdown */}
          {companyProgress.departments.length > 0 && (
            <div className="space-y-2">
              {companyProgress.departments.map((dept) => (
                <div key={dept.departmentId} className="flex items-center gap-3">
                  <span className="w-32 truncate text-xs font-medium text-ink">
                    {dept.departmentName}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-hairline overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        dept.progressPct >= 70 ? 'bg-emerald-400' :
                        dept.progressPct >= 40 ? 'bg-amber-400' :
                        dept.progressPct > 0 ? 'bg-orange-400' : 'bg-gray-200'
                      }`}
                      style={{ width: `${Math.max(dept.progressPct, 2)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-mono text-xs text-muted">
                    {dept.progressPct}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Summary stats */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted">
            <span>{companyProgress.completedTasks} / {companyProgress.totalTasks} tasks completed</span>
            <span>·</span>
            <span>{companyProgress.activeTasks} active</span>
            {companyProgress.blockedTasks > 0 && (
              <>
                <span>·</span>
                <span className="text-red-500">{companyProgress.blockedTasks} blocked</span>
              </>
            )}
            <span>·</span>
            <span>{companyProgress.recentOutputs} outputs this week</span>
          </div>

          {/* Attention needed */}
          {companyProgress.attentionNeeded.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-xs font-medium text-amber-800">Attention needed:</p>
              <ul className="mt-1 space-y-0.5">
                {companyProgress.attentionNeeded.map((item, i) => (
                  <li key={i} className="text-xs text-amber-700">• {item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Company Health + Goal Execution — side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <HealthScore
          activeAgents={activeAgents}
          totalAgents={agentList.length}
          completedTasks={completedTasks}
          totalTasks={totalTasks}
          creditsRemaining={credits?.remaining ?? 0}
          creditsTotal={credits?.total ?? 100}
          pendingApprovals={pendingApprovals}
          activeGoals={activeGoalsCount}
          totalGoals={totalGoals}
        />
        <GoalExecutionPanel
          totalGoals={totalGoals}
          activeGoals={activeGoalsCount}
          completedTasks={completedTasks}
          totalTasks={totalTasks}
        />
      </div>

      {/* Agent Reliability */}
      <ReliabilityWidget />

      {/* Live department activity — real events, SSE primary + 60s poll fallback */}
      <DepartmentActivityWidget />

      {/* Model performance — measured signals from the §20/§7 pipeline */}
      <ModelPerformanceWidget />

      {/* Two-column layout: command bar + Activity Feed */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Command bar — left side */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-hairline bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Command className="h-4 w-4 text-muted" />
              <p className="text-xs font-semibold text-muted">Send a command</p>
            </div>
            <CommandBar />
          </div>
        </div>

        {/* Activity Feed — right side */}
        <div className="lg:col-span-2">
          <ActivityFeed initialActivity={recentActivity} />
        </div>
      </div>


      {/* Dev-only contrast diagnostic — renders nothing in production */}
      <ContrastSelfCheck />
    </div>
  );
}
