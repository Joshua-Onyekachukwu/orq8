import Link from "next/link";

import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  ClipboardCheck,
  Command,
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
import { computeScore } from "../../components/dashboard/HealthScore";

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

/*
 * Phase 2 (docs/71): the dashboard follows the approved mock composition —
 * a slim 4-stat strip (approvals live in the banner, not as a stat card),
 * the slim approvals banner that anchors to the EA dock's gate rows, then
 * "What's happening now" and the section set. Every value stays
 * server-derived from the same real endpoints as before; only composition
 * and hierarchy change.
 */
function StatCard({
  label,
  value,
  subtext,
  meter,
  href,
}: {
  label: string;
  value: string | number;
  subtext: string;
  meter?: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-hairline bg-white p-4 transition-all hover:border-hairline-strong hover:shadow-sm"
    >
      <span className="text-xs font-medium text-muted">{label}</span>
      <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-ink">
        {value}
        {meter !== undefined && (
          <span className="ml-1 align-middle text-xs font-medium text-muted">/ {meter}</span>
        )}
      </p>
      <div className="mt-2 flex items-center gap-1">
        <span className="text-xs text-muted">{subtext}</span>
      </div>
    </Link>
  );
}

function decisionBadge(status: string): string {
  if (status === "validated") return "bg-brand-deep/10 text-brand-ink";
  if (status === "reversed") return "bg-error-soft text-error-ink";
  if (status === "active") return "bg-warm/10 text-warm-ink";
  if (status === "pending") return "bg-warm-soft text-warm-ink";
  return "bg-canvas text-muted";
}

function recommendationBadge(priority: string): string {
  if (priority === "critical") return "bg-error-soft text-error-ink";
  if (priority === "high") return "bg-warm/10 text-warm-ink";
  if (priority === "medium") return "bg-warm-soft text-warm-ink";
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

  const activeOrg = orgInfo?.memberships?.find((m) => m.org.id === orgInfo.active_org_id);
  const orgName = activeOrg?.org.name ?? "My Company";

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

  // Company health for the stat strip — the same composite the HealthScore
  // widget computes, reused so the number means the same thing everywhere.
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
    "inline-flex items-center justify-center rounded-lg ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-surface/90";
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
      attentionItems.push({ icon: ClipboardCheck, text: a.action, href: "/app/approvals", color: "text-warm-ink" });
    }
    if (approvalList.length > 3) {
      attentionItems.push({ icon: ClipboardCheck, text: `${approvalList.length - 3} more approval${approvalList.length - 3 !== 1 ? "s" : ""} waiting for your decision`, href: "/app/approvals", color: "text-warm-ink" });
    }
  } else if (pendingApprovals > 0) {
    attentionItems.push({ icon: ClipboardCheck, text: `${pendingApprovals} approval${pendingApprovals !== 1 ? "s" : ""} waiting for your decision`, href: "/app/approvals", color: "text-warm-ink" });
  }
  if (credits?.isCritical) attentionItems.push({ icon: Zap, text: "Work credits critically low. AI employees may pause.", href: "/app/budgets", color: "text-error-ink" });
  if (credits?.isLow && !credits?.isCritical) attentionItems.push({ icon: Zap, text: `Only ${credits.remaining} credits remaining`, href: "/app/budgets", color: "text-warm-ink" });
  const recentFailed = recentActivity.filter((e) => e.type.toLowerCase().includes("failed"));
  if (recentFailed.length > 0) attentionItems.push({ icon: AlertTriangle, text: `${recentFailed.length} task${recentFailed.length !== 1 ? "s" : ""} failed recently`, href: "/app/goals", color: "text-error-ink" });
  if (blockedTasks > 0) attentionItems.push({ icon: AlertTriangle, text: `${blockedTasks} blocked task${blockedTasks !== 1 ? "s" : ""} ${blockedTasks !== 1 ? "need" : "needs"} attention`, href: "/app/goals", color: "text-warm-ink" });
  if (activeAgents === 0 && agentList.length > 0) attentionItems.push({ icon: Bot, text: "All AI employees are paused", href: "/app/agents", color: "text-muted" });
  if (agentList.length === 0) attentionItems.push({ icon: Bot, text: "No AI employees yet. Hire your first AI employee to get started", href: "/app/agents", color: "text-brand-ink" });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Report the persisted stage + page context to the EA panel so its
          greeting, empty state and suggestions match reality. */}
      <EAStageRegistrar stage={founderStage} route="/app" pageName="Dashboard" />

      {/* Phase 2: slim header → 4-stat strip → slim approvals banner.
          Each fact appears once; the banner anchors to the approvals queue
          (the canonical gate list the EA dock also surfaces). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {dayGreeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {liveSummary ?? `Nothing needs you right now — ${EA_NAME} is watching the company.`}
          </p>
        </div>
        {founderStage === "active" ? (
          <EAOpenButton
            className={secondaryActionClass}
            prompt="What should we do next, and why?"
          >
            Give direction
          </EAOpenButton>
        ) : (
          <Link href="/onboarding" className={primaryActionClass}>
            Continue setup
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active goals"
          value={activeGoalsCount}
          subtext={
            activeGoalsCount > 0
              ? "In progress"
              : totalGoals > 0
                ? "None active"
                : "None yet"
          }
          href="/app/goals"
        />
        <StatCard
          label="Employees active"
          value={activeAgents}
          meter={agentList.length}
          subtext={
            agentList.length > 0
              ? `${agentList.length} on the roster`
              : "Hire your first employee"
          }
          href="/app/agents"
        />
        <StatCard
          label="Work credits"
          value={credits ? credits.remaining : 0}
          subtext={
            credits
              ? `${credits.utilizationPercent}% used this week`
              : "Usage not available"
          }
          href="/app/budgets"
        />
        <StatCard
          label="Company health"
          value={health.score}
          meter={100}
          subtext={`${health.label.toLowerCase()} · ${
            pendingApprovals > 0
              ? `${pendingApprovals} gate${pendingApprovals !== 1 ? "s" : ""} waiting`
              : "no gates waiting"
          }`}
          href="/app/attention"
        />
      </div>

      {approvalList.length > 0 && (
        <div className="rounded-xl border border-hairline-strong bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="state-dot" data-state="waiting" aria-hidden="true" />
            <p className="text-sm font-semibold text-ink">
              {approvalList.length} approval{approvalList.length !== 1 ? "s" : ""} holding work
            </p>
            <p className="hidden min-w-0 flex-1 truncate text-xs text-muted sm:block">
              {approvalList
                .slice(0, 2)
                .map((a) => a.action)
                .join(" · ")}
              {approvalList.length > 2 ? ` · +${approvalList.length - 2} more` : ""}
            </p>
            <Link
              href="/app/approvals"
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-secondary"
            >
              Review
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warm/10 font-mono text-sm font-semibold text-warm-ink"
            >
              {EA_NAME.slice(0, 1)}
            </span>
            <div className="space-y-1.5">
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-warm-ink">
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
                        <span className="h-1 w-1 rounded-full bg-warm" aria-hidden="true" />
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

      {/* C. Needs your attention */}
      <div className="rounded-xl border border-warm/20 bg-warm/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warm/15">
            <AlertTriangle className="h-3.5 w-3.5 text-warm-ink" />
          </span>
          <h2 className="text-sm font-semibold text-ink">Needs your attention</h2>
          <Link
            href="/app/attention"
            className="ml-auto flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline"
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

      {/* D. What's happening now — live activity, mock title (docs/71 item 11) */}
      <section className="rounded-xl border border-hairline bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">What's happening now</h2>
          <Link href="/app/agents" className="text-xs font-medium text-brand-ink hover:underline">
            View AI employees
          </Link>
        </div>
        {workingAgents.length > 0 ? (
          <div className="space-y-2">
            {workingAgents.map((agent) => (
              <Link
                key={agent.id}
                href={`/app/agents/${agent.id}`}
                className="group flex items-center gap-3 rounded-lg border border-hairline px-3 py-2.5 transition-colors hover:border-brand-deep/40"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-deep text-xs font-bold text-white">
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
                <span className="flex items-center gap-1.5 rounded-full bg-surface-secondary px-2 py-0.5 font-mono text-2xs uppercase text-ink-muted">
                  <span className="state-dot" data-state="working" aria-hidden="true" />
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
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-hairline bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-brand-deep hover:text-brand-ink"
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
            <Link href="/app/goals" className="text-xs font-medium text-brand-ink hover:underline">
              View all
            </Link>
          </div>
          {activeGoalsRes === null ? null : goalList.length > 0 ? (
            <div className="space-y-3">
              {goalList.map((goal) => (
                <Link
                  key={goal.id}
                  href={`/app/goals/${goal.id}`}
                  className="group block rounded-lg border border-hairline p-4 transition-colors hover:border-brand-deep/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-ink group-hover:text-brand-ink">
                      {goal.title}
                    </p>
                    <span className="shrink-0 font-mono text-2xs text-muted">{goal.progress}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-hairline">
                    <div
                      className="h-full rounded-full bg-brand-deep"
                      style={{ width: `${Math.min(Math.max(goal.progress, 0), 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-2xs text-muted">
                    <span
                      className={
                        goal.priority === "urgent" || goal.priority === "high"
                          ? "font-medium text-warm-ink"
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
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-hairline bg-white px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-brand-deep hover:text-brand-ink"
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
              className="text-xs font-medium text-brand-ink hover:underline"
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
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-brand-ink">
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
                      className="shrink-0 self-start rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brand-deep hover:text-brand-ink sm:self-auto"
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
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-brand-ink">
              What happened recently
            </p>
          </div>
          <div className="space-y-2">
            {recentActivity.slice(0, 5).map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-lg bg-canvas/50 px-3 py-2">
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                  event.type.includes('completed') ? 'bg-brand' :
                  event.type.includes('failed') ? 'bg-error' :
                  event.type.includes('created') ? 'bg-brand-soft' :
                  'bg-disabled-surface'
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
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-brand-ink">
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
              className="h-full rounded-full bg-brand-deep transition-all duration-500"
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
                        dept.progressPct >= 70 ? 'bg-brand' :
                        dept.progressPct >= 40 ? 'bg-warm' :
                        dept.progressPct > 0 ? 'bg-warm' : 'bg-disabled-surface'
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
                <span className="text-error-ink">{companyProgress.blockedTasks} blocked</span>
              </>
            )}
            <span>·</span>
            <span>{companyProgress.recentOutputs} outputs this week</span>
          </div>

          {/* Attention needed */}
          {companyProgress.attentionNeeded.length > 0 && (
            <div className="mt-3 rounded-lg bg-warm-soft border border-warm px-3 py-2">
              <p className="text-xs font-medium text-warm-ink">Attention needed:</p>
              <ul className="mt-1 space-y-0.5">
                {companyProgress.attentionNeeded.map((item, i) => (
                  <li key={i} className="text-xs text-warm-ink">• {item}</li>
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
