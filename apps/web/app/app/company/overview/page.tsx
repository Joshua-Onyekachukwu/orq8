import type { Metadata } from "next";
import Link from "next/link";

import { fetchWithAuth, formatTimeAgo } from "../../../../lib/api";
import { EA_NAME } from "../../../../lib/ea";
import type { AttentionSnapshot } from "../../../../lib/attention";
import { EAOpenButton } from "../../../../components/dashboard/ea-open-button";
import { EAStageRegistrar } from "../../../../components/dashboard/ea-stage-registrar";
import type { FounderStage } from "../../../../components/executive-agent-context";
import { CompanyOrbit } from "../../../../components/company-hub/company-orbit";

export const metadata: Metadata = {
  title: "Company Hub",
  description: "The company operating hub: the Executive Agent, the workforce, decisions and memory.",
};

interface MeData {
  user: { id: string; name: string | null };
  memberships: {
    org: { id: string; name: string; slug: string; plan: string; isDemo?: boolean };
    role: string;
  }[];
  active_org_id: string | null;
}

/** Persisted onboarding state (GET /v1/company-builder/state). */
interface BuilderState {
  step: string;
  completedAt: string | null;
  analysis: { companyName?: string; description?: string } | null;
  plan: unknown;
  activation: unknown;
}

interface DashboardSummary {
  pending_approvals: number;
  credits: { remaining: number; isLow: boolean; isCritical: boolean } | null;
}

interface AgentRow {
  id: string;
  status: string;
}

interface TaskRow {
  id: string;
  status: string;
}

interface GoalRow {
  id: string;
  status: string;
}

interface ActivityRow {
  id: number;
  occurredAt: string;
}

interface MemoryStats {
  totalEntries: number;
}

/** Freshness matters here: the stage, the queue and the counts gate real actions. */
const FRESH = { revalidate: false } as const;

/** One failing source must not blank the hub; each read degrades on its own. */
async function safe<T>(path: string, fallback: T): Promise<T> {
  try {
    return (await fetchWithAuth<T>(path, FRESH)) ?? fallback;
  } catch {
    return fallback;
  }
}

async function safeList<T>(path: string): Promise<T[]> {
  return safe<T[]>(path, []);
}

const EA = EA_NAME;

export default async function CompanyHubPage() {
  const [me, builder, summary, attention, agents, departments, tasks, goals, activity, memory] =
    await Promise.all([
      safe<MeData | null>("/v1/auth/me", null),
      safe<BuilderState | null>("/v1/company-builder/state", null),
      safe<DashboardSummary | null>("/v1/dashboard", null),
      safe<AttentionSnapshot | null>("/v1/attention", null),
      safeList<AgentRow>("/v1/agents"),
      safeList<unknown>("/v1/departments"),
      safeList<TaskRow>("/v1/tasks"),
      safeList<GoalRow>("/v1/goals"),
      safeList<ActivityRow>("/v1/activity?limit=200"),
      safe<MemoryStats | null>("/v1/memory/stats", null),
    ]);

  const activeOrg =
    me?.memberships.find((m) => m.org.id === me.active_org_id) ?? me?.memberships[0];
  const companyName = activeOrg?.org.name ?? "Your company";
  const isDemo = !!activeOrg?.org.isDemo;
  const firstName = me?.user.name?.trim().split(/\s+/)[0] ?? null;

  // First-run stage: server-derived from persisted onboarding state, never
  // inferred from frontend state. The dashboard at /app derives it the same
  // way, so both agree.
  //   new         → onboarding not started (default row, nothing collected)
  //   in_progress → a step or a stored analysis/plan exists, not completed
  //   active      → completedAt or activation exists
  const stage: FounderStage = !builder
    ? "new"
    : builder.completedAt || builder.activation
      ? "active"
      : builder.step !== "organization" || !!builder.analysis || !!builder.plan
        ? "in_progress"
        : "new";

  const normalize = (status: string) => (status ?? "").toLowerCase();
  const inStatuses = (statuses: string[]) =>
    agents.filter((a) => statuses.includes(normalize(a.status))).length;

  const employees = agents.length;
  const working = inStatuses(["working", "executing", "in_progress"]);
  const waiting = inStatuses(["waiting", "pending", "assigned"]);
  const blocked = inStatuses(["blocked", "failed"]);
  const pendingApprovals = summary?.pending_approvals ?? 0;
  const activeGoals = goals.filter((g) => g.status === "active").length;
  const openTasks = tasks.filter((t) => !["completed", "failed"].includes(t.status)).length;
  const memories = memory?.totalEntries ?? 0;
  const auditEvents = activity.length;
  const lastActivityLabel = activity[0]?.occurredAt ? formatTimeAgo(activity[0].occurredAt) : null;

  const attentionItems = attention?.items ?? [];
  const attentionCount = attention?.summary.total ?? attentionItems.length;
  const criticalCount = attention?.summary.critical ?? 0;

  // Progressive first run: the welcome only appears while the company has no
  // operating structure at all. Once real employees, goals or departments
  // exist the company is running, so the hub leads instead (real rows, not
  // the onboarding flag, decide this). The stage still reaches the Executive
  // Agent unchanged so its greeting matches the dashboard at /app.
  const hasStructure = employees > 0 || activeGoals > 0 || departments.length > 0;
  const showFirstRun = !hasStructure && stage !== "active";

  const primaryActionClass =
    "inline-flex items-center justify-center rounded-lg bg-orq8-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orq8-green";
  const secondaryActionClass =
    "inline-flex items-center justify-center rounded-lg border border-hairline bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-canvas";

  const headerLine =
    employees === 0 && activeGoals === 0
      ? stage === "new"
        ? "Nothing is running yet. Tell me what you are building and I will start."
        : "Nothing is running yet."
      : [
          `${employees} AI employee${employees === 1 ? "" : "s"}`,
          working > 0 ? `${working} working` : null,
          pendingApprovals > 0 ? `${pendingApprovals} waiting on you` : null,
          blocked > 0 ? `${blocked} blocked` : null,
        ]
          .filter((part): part is string => !!part)
          .join(" · ");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EAStageRegistrar stage={stage} route="/app/company/overview" pageName="Company Hub" />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-muted">
              Company
            </p>
            {isDemo ? (
              <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-3xs uppercase tracking-wide text-muted">
                Demo data
              </span>
            ) : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {companyName}
          </h1>
          <p className="mt-2 text-sm text-muted">{headerLine}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EAOpenButton
            prompt="Give me the state of my company and what needs me."
            className={primaryActionClass}
          >
            Ask {EA}
          </EAOpenButton>
          {attentionCount > 0 ? (
            <Link href="/app/attention" className={secondaryActionClass}>
              Attention queue ({attentionCount})
            </Link>
          ) : null}
        </div>
      </header>

      {showFirstRun ? (
        <section className="rounded-2xl border border-orq8-green/20 bg-orq8-dark p-6 text-white">
          <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-lime">
            {stage === "new" ? "First run" : "In progress"}
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">
            {stage === "new" ? "Let's get your company set up" : `Finish setting up ${companyName}`}
          </h2>
          <p className="mt-2 max-w-2xl text-2sm text-white/70">
            {stage === "new"
              ? `I am ${EA}, your Executive Agent. Before I organize work I need to know what you are building, where you are today, and what you want to accomplish.`
              : "What you have already given me is saved. I can pick up where we left off, and nothing is activated until you approve it."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-orq8-dark transition-colors hover:bg-orq8-lime"
            >
              {stage === "new" ? "Start onboarding" : "Continue onboarding"}
            </Link>
            <EAOpenButton
              prompt={stage === "new" ? (firstName ? `I'm ${firstName}, and I'm building ` : "I'm building ") : "What is left to finish setting up my company?"}
              className="inline-flex items-center justify-center rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              {stage === "new" ? `Tell ${EA} what you are building` : `Ask ${EA} what remains`}
            </EAOpenButton>
          </div>
        </section>
      ) : null}

      {attentionCount > 0 ? (
        <Link
          href="/app/attention"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orq8-orange/30 bg-orq8-orange/[0.04] px-4 py-3"
        >
          <p className="text-2sm text-ink">
            <span className="font-semibold">{attentionCount}</span> item
            {attentionCount === 1 ? "" : "s"} need your decision
            {criticalCount > 0 ? ` · ${criticalCount} critical` : ""}
            {attentionItems[0] ? ` · ${attentionItems[0].what}` : ""}
          </p>
          <span className="text-2xs font-semibold text-orq8-orange">Open queue</span>
        </Link>
      ) : null}

      <CompanyOrbit
        companyName={companyName}
        employees={employees}
        departments={departments.length}
        working={working}
        waiting={waiting}
        blocked={blocked}
        pendingApprovals={pendingApprovals}
        activeGoals={activeGoals}
        openTasks={openTasks}
        memories={memories}
        auditEvents={auditEvents}
        lastActivityLabel={lastActivityLabel}
      />
    </div>
  );
}
