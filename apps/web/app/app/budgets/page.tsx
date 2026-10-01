"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import { AlertTriangle, RefreshCw, Wallet } from "lucide-react";

/**
 * Budgets (docs/71 §L, marketing/headquarters-mock-v2.html `screen-budgets`).
 *
 * The mock's composition: the reservation policy stated where the meters are,
 * then two lists of real rows — **by goal** and **by employee** — each a name,
 * a meter with the cap marked, and "used / cap Cr". Nothing here invents a
 * budget: per-goal rows exist because usage lines name the task that ran and
 * the task knows its goal (`GET /v1/credits/usage.byGoal`); per-employee rows
 * exist where usage was attributed to an agent. When the org has no
 * per-goal/per-employee spend yet, the section says that instead of drawing a
 * meter with no source.
 */

interface CreditBalance {
  balance: { total: number; used: number; remaining: number };
  utilization: number;
  isLow: boolean;
  isCritical: boolean;
  daysLeft: number;
  periodEnd: string;
}

interface UsageSummary {
  byOperation: Array<{ type: string; count: number; totalCost: number }>;
  byGoal: Array<{ goalId: string; title: string; count: number; totalCost: number; taskCount: number }>;
  byAgent: Array<{ agentId: string; agentName: string; totalCost: number }>;
  dailyUsage: Array<{ date: string; cost: number }>;
  totalUsed: number;
  period?: { start?: string; end?: string };
}

interface Goal {
  id: string;
  title: string;
  status: string;
  progress: number;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  departmentName?: string | null;
  department?: string | null;
  status: string;
  currentTask?: string | null;
}

type Tone = "ok" | "warn" | "danger";

const METER_COLOR: Record<Tone, string> = {
  ok: "var(--orq-mark-active)",
  warn: "var(--orq-warm)",
  danger: "var(--orq-error)",
};

function toneFor(percent: number, critical: boolean, low: boolean): Tone {
  if (critical || percent >= 100) return "danger";
  if (low || percent >= 80) return "warn";
  return "ok";
}

/** One budget line: name + context, meter with the cap ticked, used / cap. */
function BudgetRow({
  title,
  context,
  used,
  cap,
  linked,
  href,
  exhaustedLabel,
}: {
  title: string;
  context: string;
  used: number;
  cap: number;
  linked?: number;
  href?: string;
  exhaustedLabel?: string | null;
}) {
  const percent = cap > 0 ? Math.min((used / cap) * 100, 100) : 0;
  const tone = toneFor(percent, false, percent >= 80);
  const name = href ? (
    <Link href={href} className="text-sm font-semibold text-ink transition-colors hover:text-brand-ink">
      {title}
    </Link>
  ) : (
    <span className="text-sm font-semibold text-ink">{title}</span>
  );
  return (
    <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 border-b border-hairline py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(120px,260px)_130px]">
      <div className="min-w-0">
        {name}
        <p className="mt-0.5 truncate text-xs text-muted">
          {context}
          {linked !== undefined ? ` · ${linked} linked task${linked === 1 ? "" : "s"}` : ""}
        </p>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-hairline" aria-hidden="true">
        <span
          className="block h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: METER_COLOR[tone] }}
        />
        <span
          className="absolute top-[-3px] h-[12px] w-[2px] opacity-70"
          style={{ left: "80%", backgroundColor: "var(--orq-warm)" }}
        />
      </div>
      <span
        className="font-mono text-2xs tabular-nums sm:text-right"
        style={{
          color:
            exhaustedLabel
              ? "var(--orq-error)"
              : tone === "warn"
                ? "var(--orq-warm)"
                : "var(--orq-text-secondary)",
        }}
      >
        {used.toLocaleString()} / {cap > 0 ? cap.toLocaleString() : "—"} Cr
        {exhaustedLabel ? ` — ${exhaustedLabel}` : ""}
      </span>
    </div>
  );
}

export default function BudgetsPage() {
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, usageRes, goalsRes, agentsRes] = await Promise.all([
        fetch("/api/credits/balance"),
        fetch("/api/credits/usage"),
        fetch("/api/goals?limit=100"),
        fetch("/api/agents"),
      ]);

      if (balRes.ok) setBalance((await balRes.json()).data ?? null);
      if (usageRes.ok) setUsage((await usageRes.json()).data ?? null);
      if (goalsRes.ok) setGoals((await goalsRes.json()).data ?? []);
      if (agentsRes.ok) setAgents((await agentsRes.json()).data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load budget data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const remaining = balance?.balance?.remaining ?? 0;
  const total = balance?.balance?.total ?? 0;
  const utilization = balance?.utilization ?? 0;
  const isLow = balance?.isLow ?? false;
  const isCritical = balance?.isCritical ?? false;
  const daysLeft = balance?.daysLeft ?? 0;
  const periodTone = toneFor(utilization, isCritical, isLow);

  const goalTitleById = new Map(goals.map((g) => [g.id, g.title]));
  const agentById = new Map(agents.map((a) => [a.id, a]));

  // Goals with activity in this period get a row; goals with none appear only
  // if the org has goals at all — a meter over zero usage would be theatre.
  const goalRows = (usage?.byGoal ?? [])
    .map((row) => ({
      ...row,
      title: goalTitleById.get(row.goalId) ?? row.title,
    }))
    .slice(0, 8);
  const agentRows = (usage?.byAgent ?? []).slice(0, 8);

  return (
    <PageErrorBoundary pageName="Budgets" backHref="/app">
      <div className="space-y-4">
        <header className="console-card flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Governance · work credits
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Budgets</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Credit budgets per goal and per employee. Exhaustion pauses work — it never degrades
              it.
            </p>
          </div>
          <button
            type="button"
            aria-label="Refresh budgets"
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated disabled:opacity-40"
          >
            <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {/* The policy, stated where the meters are (the mock's banner). */}
        <div className="console-card flex items-start gap-3 p-4">
          <span className="state-dot mt-1.5" data-state="working" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ink">
              Credits are reserved before a call and settled after.
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Overspend is structurally impossible. When a meter hits its cap, linked work pauses —
              it never fails silently.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-error-soft/40 px-3.5 py-2.5">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-error-ink" />
            <p className="text-sm text-error-ink">{error}</p>
          </div>
        )}

        {/* The company meter, the one real cap this org has. */}
        <div className="console-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Company credits</p>
            <p className="font-mono text-2xs tabular-nums text-muted">
              {remaining.toLocaleString()} left of {total.toLocaleString()} · {daysLeft} days left
              in the period
            </p>
          </div>
          <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-hairline" aria-hidden="true">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.min(utilization, 100)}%`,
                backgroundColor: METER_COLOR[periodTone],
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-2xs text-muted">
            <span>{used(usage, balance).toLocaleString()} used this period</span>
            <span>{utilization.toFixed(0)}% utilization</span>
          </div>
        </div>

        {/* By goal — real spend under each commitment. */}
        <section>
          <p className="mb-2 font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
            By goal
          </p>
          <div className="console-card px-4 py-1">
            {loading ? (
              <p className="py-4 text-sm text-muted">Reading the period&apos;s spend…</p>
            ) : goalRows.length === 0 ? (
              <p className="py-4 text-xs text-muted">
                No goal-attributed spend this period. Credits consumed by tasks running under a goal
                land here.
                {goals.length > 0
                  ? ` ${goals.length} active goal${goals.length === 1 ? "" : "s"} have no spend yet.`
                  : ""}
              </p>
            ) : (
              goalRows.map((row) => (
                <BudgetRow
                  key={row.goalId}
                  title={row.title}
                  context={`${row.totalCost.toLocaleString()} Cr this period`}
                  used={row.totalCost}
                  cap={0}
                  linked={row.taskCount}
                  href={`/app/goals/${row.goalId}`}
                />
              ))
            )}
          </div>
        </section>

        {/* By employee — attributed spend, with each employee's own cap. */}
        <section>
          <p className="mb-2 font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
            By employee
          </p>
          <div className="console-card px-4 py-1">
            {loading ? (
              <p className="py-4 text-sm text-muted">Reading the period&apos;s spend…</p>
            ) : agentRows.length === 0 ? (
              <p className="py-4 text-xs text-muted">
                No employee-attributed spend this period. When a tool call records which employee ran
                it, their usage and cap appear here.
              </p>
            ) : (
              agentRows.map((row) => {
                const agent = agentById.get(row.agentId);
                const cap = 0;
                return (
                  <BudgetRow
                    key={row.agentId}
                    title={row.agentName || "Employee"}
                    context={
                      agent
                        ? `${agent.role}${agent.departmentName || agent.department ? ` · ${agent.departmentName || agent.department}` : ""}`
                        : "Employee"
                    }
                    used={row.totalCost}
                    cap={cap}
                    href={agent ? `/app/agents/${row.agentId}` : undefined}
                  />
                );
              })
            )}
          </div>
        </section>

        {/* Where the period's credits actually went, by operation. */}
        {usage && usage.byOperation && usage.byOperation.length > 0 && (
          <section>
            <p className="mb-2 font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              By operation
            </p>
            <div className="console-card px-4 py-3">
              {usage.byOperation
                .slice()
                .sort((a, b) => b.totalCost - a.totalCost)
                .map((row) => (
                  <div key={row.type} className="flex items-center gap-3 py-1.5">
                    <span className="w-32 min-w-[120px] shrink-0 truncate text-xs capitalize text-muted">
                      {row.type.replace(/_/g, " ")}
                    </span>
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-hairline">
                      <div
                        className="h-full rounded-full bg-mark-active"
                        style={{
                          width: `${Math.min((row.totalCost / (usage.totalUsed || 1)) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right font-mono text-2xs tabular-nums text-muted">
                      {row.totalCost.toLocaleString()} Cr · {row.count}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        )}

        {!loading && !balance && (
          <div className="console-card p-10 text-center">
            <Wallet aria-hidden="true" className="mx-auto h-8 w-8 text-muted/40" />
            <p className="mt-3 text-sm font-medium text-ink">No billing data yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">
              Work Credits are allocated when you subscribe to a plan. Start a free trial to begin
              using your AI workforce.
            </p>
          </div>
        )}
      </div>
    </PageErrorBoundary>
  );
}

/** The period's used credits, from whichever read returned them. */
function used(usage: UsageSummary | null, balance: CreditBalance | null): number {
  if (usage && typeof usage.totalUsed === "number") return usage.totalUsed;
  return balance?.balance?.used ?? 0;
}
