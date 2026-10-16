"use client";

/**
 * Engineering focus (docs/86 §6).
 *
 * Renders the department-scoped read-model the API returns at
 * `detail.focus.engineering`. The shape distinguishes two scopes and this panel
 * keeps them visibly separate, because blurring them would be a lie:
 *
 *   this department  — engineering work and reviews whose author is one of the
 *                      department's own employees
 *   workspace-wide   — repositories and sandbox runs, which have no employee
 *                      column at all (a repository belongs to the org; a run
 *                      belongs to a repository)
 *
 * It is the reason an engineering department page looks like engineering and
 * not like a task list with a different name.
 */

import Link from "next/link";

import { OsEmptyPanel, OsFacts, OsMetricRow, OsSection, OsStateBadge, type OsMetric } from "../os/structure";
import { type DotState, StateDot, formatCredits, formatTimeAgo } from "../os/primitives";

export interface EngineeringFocusData {
  work: Array<{
    id: string;
    title: string;
    status: string;
    branch: string;
    assigneeId: string;
    prId: string | null;
    updatedAt: string;
  }>;
  reviews: Array<{
    id: string;
    title: string;
    status: string;
    state: string;
    headBranch: string;
    repositoryId: string;
    updatedAt: string;
  }>;
  repositories: Array<{
    id: string;
    name: string;
    fullName: string;
    defaultBranch: string;
    lastSyncedAt: string;
  }>;
  sandbox: Array<{
    id: string;
    command: string;
    state: string;
    exitCode: number | null;
    startedAt: string | null;
  }>;
  counts: {
    repositories: number;
    workOpen: number;
    workCompleted: number;
    workFailed: number;
    reviewsOpen: number;
    sandboxRunning: number;
  };
}

/**
 * engineering_tasks.status → the shared state vocabulary. Exported because the
 * engineering page renders the same statuses from a different read (the
 * workspace-wide `/api/engineering/tasks`) and two mappers would drift — which
 * is exactly how a failed run came to render as `blocked` in one place and
 * `failed` in another.
 */
export function workState(status: string): { state: DotState; label: string } {
  if (status === "planning") return { state: "waiting", label: "Planning" };
  if (status === "implemented") return { state: "review", label: "Implemented" };
  if (status === "tested") return { state: "review", label: "Tested" };
  if (status === "review") return { state: "review", label: "In review" };
  if (status === "completed") return { state: "done", label: "Completed" };
  if (status === "failed") return { state: "failed", label: "Failed" };
  return { state: "", label: status };
}

/** repository_prs.status → the shared state vocabulary. */
export function prState(status: string): { state: DotState; label: string } {
  if (status === "pending_review") return { state: "waiting", label: "Awaiting review" };
  if (status === "changes_requested") return { state: "blocked", label: "Changes requested" };
  if (status === "approved") return { state: "review", label: "Approved" };
  if (status === "merged") return { state: "done", label: "Merged" };
  if (status === "rejected") return { state: "failed", label: "Rejected" };
  return { state: "", label: status };
}

/** sandbox_runs.state → the shared state vocabulary. */
export function runState(state: string): { state: DotState; label: string } {
  if (state === "running") return { state: "working", label: "Running" };
  if (state === "queued") return { state: "", label: "Queued" };
  if (state === "completed") return { state: "done", label: "Completed" };
  if (state === "failed") return { state: "failed", label: "Failed" };
  // A timed-out run is a failed run with a specific cause: the command hit
  // its time limit. Name it so a founder can tell "too slow" from "broke".
  if (state === "timeout") return { state: "failed", label: "Timed out" };
  if (state === "cancelled") return { state: "paused", label: "Cancelled" };
  return { state: "", label: state };
}

export function DepartmentFocusPanel({
  focus,
  departmentName,
  agentNameById,
}: {
  focus: EngineeringFocusData;
  departmentName: string;
  agentNameById: Map<string, string>;
}) {
  const metrics: OsMetric[] = [
    {
      key: "workOpen",
      label: "Engineering in flight",
      value: focus.counts.workOpen,
      sub: "implemented, tested or in review",
    },
    {
      key: "reviewsOpen",
      label: "Reviews open",
      value: focus.counts.reviewsOpen,
      sub: "authored by this department",
      tone: focus.counts.reviewsOpen > 0 ? "warn" : "default",
    },
    {
      key: "workFailed",
      label: "Failed work",
      value: focus.counts.workFailed,
      sub: focus.counts.workFailed > 0 ? "needs a look" : "nothing failed",
      tone: focus.counts.workFailed > 0 ? "bad" : "default",
    },
    {
      key: "sandboxRunning",
      label: "Sandbox running",
      value: focus.counts.sandboxRunning,
      sub: "workspace-wide",
    },
  ];

  return (
    <OsSection
      id="focus"
      title="Engineering focus"
      description="What this department is building, reviewing and running — scoped to its own employees."
      emphasis
    >
      <OsMetricRow metrics={metrics} />

      {/* Member-scoped: the department's own engineering work. */}
      <div className="rounded-lg border border-hairline bg-canvas p-4">
        <p className="font-mono text-2xs tracking-wider text-muted uppercase">
          Work owned by {departmentName}
        </p>
        {focus.work.length === 0 ? (
          <div className="mt-2">
            <OsEmptyPanel
              title="No engineering work recorded for this department's employees yet."
              hint="Work appears here when an employee is assigned a repository task."
            />
          </div>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {focus.work.map((w) => {
              const s = workState(w.status);
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <StateDot state={s.state} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{w.title}</span>
                  <span className="font-mono text-3xs text-muted">{w.branch}</span>
                  <span className="text-2xs text-muted">
                    {agentNameById.get(w.assigneeId) ?? "employee"}
                  </span>
                  <OsStateBadge state={s.state} label={s.label} />
                  {w.prId ? (
                    <Link
                      href={`/app/engineering`}
                      className="font-mono text-3xs text-muted underline underline-offset-4 hover:text-ink"
                    >
                      PR
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Member-scoped: reviews this department authored. */}
      <div className="rounded-lg border border-hairline bg-canvas p-4">
        <p className="font-mono text-2xs tracking-wider text-muted uppercase">
          Reviews opened by this department
        </p>
        {focus.reviews.length === 0 ? (
          <div className="mt-2">
            <OsEmptyPanel title="No open pull requests from this department." />
          </div>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {focus.reviews.map((r) => {
              const s = prState(r.status);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <StateDot state={s.state} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.title}</span>
                  <span className="font-mono text-3xs text-muted">{r.headBranch}</span>
                  <OsStateBadge state={s.state} label={s.label} />
                  <span className="font-mono text-3xs text-muted">{formatTimeAgo(r.updatedAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Workspace-wide — explicitly labelled, because it is not this
          department's property and saying otherwise would mislead. */}
      <OsFacts
        columns={2}
        items={[
          {
            label: `Repositories the workspace works in (${focus.repositories.length})`,
            value:
              focus.repositories.length === 0 ? (
                <span className="text-muted">none connected</span>
              ) : (
                <ul className="space-y-1">
                  {focus.repositories.map((r) => (
                    <li key={r.id} className="font-mono text-2xs">
                      {r.fullName}{" "}
                      <span className="text-muted">· {r.defaultBranch}</span>
                    </li>
                  ))}
                </ul>
              ),
          },
          {
            label: `Recent sandbox runs (${focus.sandbox.length})`,
            value:
              focus.sandbox.length === 0 ? (
                <span className="text-muted">none recorded</span>
              ) : (
                <ul className="space-y-1">
                  {focus.sandbox.map((s) => {
                    const st = runState(s.state);
                    return (
                      <li key={s.id} className="flex items-center gap-2">
                        <StateDot state={st.state} />
                        <span className="min-w-0 flex-1 truncate font-mono text-2xs">{s.command}</span>
                        <span className="text-2xs text-muted">{st.label}</span>
                      </li>
                    );
                  })}
                </ul>
              ),
          },
        ]}
      />
      <p className="text-2xs text-muted">
        Repositories and sandbox runs are workspace-wide — ORQ8 records no owning employee for them,
        so they are never attributed to this department.
      </p>
    </OsSection>
  );
}

// ─── Marketing ──────────────────────────────────────────────────────────────

export interface MarketingFocusData {
  assets: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    agentId: string | null;
    taskId: string | null;
    createdAt: string;
  }>;
  briefings: Array<{
    id: string;
    kind: string;
    status: string;
    periodStart: string;
    periodEnd: string;
    deliveredAt: string | null;
    createdAt: string;
  }>;
  counts: {
    assets: number;
    assets30d: number;
    assetsBytes: number;
    briefings: number;
    briefingsDelivered: number;
  };
}

/**
 * Marketing focus — what this department produced.
 *
 * The panel names the two scopes rather than blending them: the assets are the
 * department's own employees' output (a file records the agent that made it),
 * while briefings are the company's, because the briefing table records no
 * owning employee. It does not claim to be a campaign board: ORQ8 has no
 * campaigns table, and a number printed here has to be a number that exists.
 */
export function MarketingFocusPanel({
  focus,
  departmentName,
  agentNameById,
}: {
  focus: MarketingFocusData;
  departmentName: string;
  agentNameById: Map<string, string>;
}) {
  const metrics: OsMetric[] = [
    {
      key: "assets",
      label: "Assets produced",
      value: focus.counts.assets,
      sub: `${focus.counts.assets30d} in the last 30 days`,
    },
    {
      key: "briefings",
      label: "Company briefings",
      value: focus.counts.briefings,
      sub: `${focus.counts.briefingsDelivered} delivered`,
    },
    {
      key: "assetsBytes",
      label: "Output size",
      value: `${Math.round(focus.counts.assetsBytes / 1024)} KB`,
      sub: "across the assets listed",
    },
  ];

  return (
    <OsSection
      id="focus"
      title="Marketing output"
      description="What this department has produced, and the briefings the company generated."
      emphasis
    >
      <OsMetricRow metrics={metrics} />

      <div className="rounded-lg border border-hairline bg-canvas p-4">
        <p className="font-mono text-2xs tracking-wider text-muted uppercase">
          Assets produced by {departmentName}
        </p>
        {focus.assets.length === 0 ? (
          <div className="mt-2">
            <OsEmptyPanel
              title="No assets from this department's employees yet."
              hint="An asset appears here when one of its employees writes a file while working."
            />
          </div>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {focus.assets.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.name}</span>
                <span className="font-mono text-3xs text-muted">{a.mimeType}</span>
                <span className="font-mono text-3xs text-muted">
                  {Math.max(1, Math.round(a.size / 1024))} KB
                </span>
                <span className="text-2xs text-muted">
                  {a.agentId ? (agentNameById.get(a.agentId) ?? "employee") : "—"}
                </span>
                <span className="font-mono text-3xs text-muted">{formatTimeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <OsFacts
        columns={1}
        items={[
          {
            label: `Company briefings (${focus.briefings.length})`,
            value:
              focus.briefings.length === 0 ? (
                <span className="text-muted">none generated yet</span>
              ) : (
                <ul className="space-y-1">
                  {focus.briefings.map((b) => (
                    <li key={b.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-2xs">
                        {b.kind} · {new Date(b.periodStart).toLocaleDateString()} —{" "}
                        {new Date(b.periodEnd).toLocaleDateString()}
                      </span>
                      <OsStateBadge
                        state={b.status === "delivered" ? "done" : "waiting"}
                        label={b.status}
                      />
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
      <p className="text-2xs text-muted">
        Briefings are workspace-wide — ORQ8 records no owning employee for them, so they are never
        attributed to this department.
      </p>
    </OsSection>
  );
}

// ─── Finance ────────────────────────────────────────────────────────────────

export interface FinanceFocusData {
  budget: number | null;
  spend: Array<{
    id: string;
    description: string | null;
    amount: number;
    type: string;
    agentId: string | null;
    createdAt: string;
  }>;
  holds: Array<{
    id: string;
    agentId: string | null;
    estimateCredits: number;
    status: string;
    expiresAt: string;
    createdAt: string;
  }>;
  purchases: Array<{
    id: string;
    description: string | null;
    amount: number;
    type: string;
    agentId: string | null;
    createdAt: string;
  }>;
  alerts: Array<{
    id: string;
    type: string;
    threshold: number;
    message: string;
    sentAt: string;
    readAt: string | null;
  }>;
  counts: {
    spendCredits30d: number;
    spendEvents30d: number;
    holdsActive: number;
    holdsCredits: number;
    purchasesCredits30d: number;
    unreadAlerts: number;
    burnPct: number | null;
  };
}

/**
 * Finance focus — the department's budget and the spend that met it.
 *
 * Every number here is a credit fact the product already keeps: the budget on
 * the department, the credits ledger, live holds, company purchases and unread
 * balance alerts. It is a budget board, not a profit-and-loss statement, and it
 * does not dress up the difference.
 */
export function FinanceFocusPanel({
  focus,
  departmentName,
  agentNameById,
}: {
  focus: FinanceFocusData;
  departmentName: string;
  agentNameById: Map<string, string>;
}) {
  const burn = focus.counts.burnPct;
  const metrics: OsMetric[] = [
    {
      key: "spendCredits30d",
      label: "Spent",
      value: formatCredits(focus.counts.spendCredits30d),
      sub: `by ${departmentName}, last 30 days`,
    },
    {
      key: "budget",
      label: "Budget",
      value: focus.budget != null ? formatCredits(focus.budget) : "—",
      sub: focus.budget != null ? "department budget" : "no budget set",
    },
    {
      key: "burnPct",
      label: "Budget burned",
      value: burn != null ? `${burn}%` : "—",
      sub: burn != null ? "lifetime, against the budget" : "set a budget to measure this",
      tone: burn != null && burn >= 80 ? "warn" : "default",
    },
    {
      key: "holdsActive",
      label: "Held for work in flight",
      value: formatCredits(focus.counts.holdsCredits),
      sub: `${focus.counts.holdsActive} active hold${focus.counts.holdsActive === 1 ? "" : "s"}`,
    },
  ];

  return (
    <OsSection
      id="focus"
      title="Finance focus"
      description="The department's budget, what it spent, and what the company holds for it."
      emphasis
    >
      <OsMetricRow metrics={metrics} />

      <div className="rounded-lg border border-hairline bg-canvas p-4">
        <p className="font-mono text-2xs tracking-wider text-muted uppercase">
          Spend by {departmentName}, last 30 days
        </p>
        {focus.spend.length === 0 ? (
          <div className="mt-2">
            <OsEmptyPanel
              title="This department has spent nothing in the last 30 days."
              hint="Spend appears here as its employees run work."
            />
          </div>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {focus.spend.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {s.description ?? s.type}
                </span>
                <span className="text-2xs text-muted">
                  {s.agentId ? (agentNameById.get(s.agentId) ?? "employee") : "—"}
                </span>
                <span className="font-mono text-2xs tabular-nums text-ink">
                  {formatCredits(Math.abs(s.amount))}
                </span>
                <span className="font-mono text-3xs text-muted">{formatTimeAgo(s.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {focus.alerts.length > 0 ? (
        <div className="rounded-lg border border-hairline bg-canvas p-4">
          <p className="font-mono text-2xs tracking-wider text-muted uppercase">
            Unread balance alerts
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {focus.alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <OsStateBadge state="waiting" label={a.type.replace(/_/g, " ")} />
                <span className="min-w-0 flex-1 text-sm text-ink">{a.message}</span>
                <span className="font-mono text-3xs text-muted">{formatTimeAgo(a.sentAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <OsFacts
        columns={2}
        items={[
          {
            label: `Company purchases, last 30 days (${focus.purchases.length})`,
            value:
              focus.purchases.length === 0 ? (
                <span className="text-muted">none recorded</span>
              ) : (
                <span className="font-mono text-2xs">
                  {formatCredits(focus.counts.purchasesCredits30d)} bought
                </span>
              ),
          },
          {
            label: "Holds on work in flight",
            value:
              focus.holds.length === 0 ? (
                <span className="text-muted">nothing held</span>
              ) : (
                <ul className="space-y-1">
                  {focus.holds.map((h) => (
                    <li key={h.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-2xs">
                        {h.agentId ? (agentNameById.get(h.agentId) ?? "employee") : "—"}
                      </span>
                      <span className="text-2xs text-muted">
                        {formatCredits(h.estimateCredits)}
                      </span>
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
      <p className="text-2xs text-muted">
        Purchases and balance alerts are workspace-wide — they belong to the company, not to an
        employee. ORQ8 keeps no invoices; credits are the unit of account here.
      </p>
    </OsSection>
  );
}

// ─── Sales (deals) and Customer success (tickets) ────────────────────────────
//
// These two boards were one panel until migration 0054. They shared an accounts
// read-model because ORQ8 had no `deals` table and no `tickets` table, so a
// pipeline or a queue would have been a number nobody wrote. Now each has its
// own table and its own read-model, and they render as the different things
// they are. The account list stays because a deal belongs to an account and a
// ticket belongs to an account — but it is context beside the department's own
// rows, not the whole board.

export interface AccountsFocusData {
  accounts: Array<{
    id: string;
    name: string;
    summary: string | null;
    source: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  counts: { accounts: number; accountsNew30d: number };
}

/** Money as its minor unit — the API sends cents and never a float. */
export function formatMoney(cents: number, currency = "USD"): string {
  const amount = Math.max(0, cents) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    // An unknown currency code must not blank the page — fall back to the
    // code and the number rather than throwing inside a render.
    return `${currency} ${amount.toLocaleString()}`;
  }
}

/** deals.stage → the shared state vocabulary. */
export function dealStage(stage: string): { state: DotState; label: string } {
  if (stage === "qualifying") return { state: "waiting", label: "Qualifying" };
  if (stage === "discovery") return { state: "waiting", label: "Discovery" };
  if (stage === "proposal") return { state: "working", label: "Proposal" };
  if (stage === "negotiation") return { state: "review", label: "Negotiation" };
  if (stage === "won") return { state: "done", label: "Won" };
  if (stage === "lost") return { state: "failed", label: "Lost" };
  return { state: "", label: stage };
}

/** tickets.status → the shared state vocabulary. */
export function ticketState(status: string): { state: DotState; label: string } {
  if (status === "open") return { state: "waiting", label: "Open" };
  if (status === "pending") return { state: "working", label: "In progress" };
  if (status === "waiting_customer") return { state: "blocked", label: "Waiting on customer" };
  if (status === "escalated") return { state: "failed", label: "Escalated" };
  if (status === "resolved") return { state: "done", label: "Resolved" };
  if (status === "closed") return { state: "done", label: "Closed" };
  return { state: "", label: status };
}

/** tickets.priority → tone for the badge, so urgent reads as urgent. */
export function ticketPriorityTone(priority: string): "default" | "warn" | "bad" {
  if (priority === "urgent") return "bad";
  if (priority === "high") return "warn";
  return "default";
}

/** The account list both boards show, labelled as the company's, not theirs. */
function AccountsList({ accounts, hint }: { accounts: AccountsFocusData["accounts"]; hint: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-4">
      <p className="font-mono text-2xs tracking-wider text-muted uppercase">
        Accounts the company knows
      </p>
      {accounts.length === 0 ? (
        <div className="mt-2">
          <OsEmptyPanel title="No customer accounts recorded yet." hint={hint} />
        </div>
      ) : (
        <ul className="mt-2.5 space-y-1.5">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm text-ink">{a.name}</span>
              {a.summary ? (
                <span className="min-w-0 flex-1 truncate text-2xs text-muted">{a.summary}</span>
              ) : (
                <span className="min-w-0 flex-1" />
              )}
              {a.source ? <span className="font-mono text-3xs text-muted">{a.source}</span> : null}
              <span className="font-mono text-3xs text-muted">{formatTimeAgo(a.updatedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface SalesFocusData {
  pipeline: Array<{
    id: string;
    title: string;
    accountName: string;
    stage: string;
    valueCents: number;
    currency: string;
    probability: number;
    ownerAgentId: string | null;
    nextStep: string | null;
    expectedCloseAt: string | null;
    updatedAt: string;
  }>;
  stages: Array<{ stage: string; count: number; valueCents: number }>;
  accounts: AccountsFocusData["accounts"];
  counts: {
    openDeals: number;
    pipelineValueCents: number;
    weightedValueCents: number;
    closingSoon: number;
    won30d: number;
    lost30d: number;
    unassigned: number;
    winRatePct: number | null;
    accounts: number;
  };
}

/**
 * Sales focus — the department's pipeline.
 *
 * Every number comes from a `deals` row: the value is the deal's own amount in
 * cents, the weighted figure is value × probability (and is labelled an
 * estimate), and the win rate is closed-won over everything closed. Deals
 * nobody owns are counted but never attributed to this department — an
 * unclaimed deal is the workspace's.
 */
export function SalesFocusPanel({
  focus,
  departmentName,
  agentNameById,
}: {
  focus: SalesFocusData;
  departmentName: string;
  agentNameById: Map<string, string>;
}) {
  const metrics: OsMetric[] = [
    {
      key: "openDeals",
      label: "Open deals",
      value: focus.counts.openDeals,
      sub: `owned by ${departmentName}`,
    },
    {
      key: "pipelineValue",
      label: "Pipeline value",
      value: formatMoney(focus.counts.pipelineValueCents),
      sub: `${formatMoney(focus.counts.weightedValueCents)} weighted by probability`,
    },
    {
      key: "closingSoon",
      label: "Closing in 30 days",
      value: focus.counts.closingSoon,
      sub:
        focus.counts.closingSoon > 0 ? "expected close date set" : "nothing due soon",
      tone: focus.counts.closingSoon > 0 ? "warn" : "default",
    },
    {
      key: "winRate",
      label: "Win rate",
      value: focus.counts.winRatePct != null ? `${focus.counts.winRatePct}%` : "—",
      sub: `${focus.counts.won30d} won · ${focus.counts.lost30d} lost, last 30 days`,
    },
  ];

  return (
    <OsSection
      id="focus"
      title="Sales pipeline"
      description="The deals this department owns — real rows, with the value and stage each one carries."
      emphasis
    >
      <OsMetricRow metrics={metrics} />

      {/* Member-scoped: the stage breakdown of this department's open deals. */}
      <div className="rounded-lg border border-hairline bg-canvas p-4">
        <p className="font-mono text-2xs tracking-wider text-muted uppercase">
          Open pipeline by stage
        </p>
        <OsFacts
          columns={2}
          items={focus.stages.map((s) => {
            const st = dealStage(s.stage);
            return {
              label: st.label,
              value: (
                <span className="font-mono text-2xs tabular-nums">
                  {s.count} · {formatMoney(s.valueCents)}
                </span>
              ),
            };
          })}
        />
      </div>

      {/* Member-scoped: the deals themselves, newest activity first. */}
      <div className="rounded-lg border border-hairline bg-canvas p-4">
        <p className="font-mono text-2xs tracking-wider text-muted uppercase">
          Deals owned by {departmentName}
        </p>
        {focus.pipeline.length === 0 ? (
          <div className="mt-2">
            <OsEmptyPanel
              title="No open deals for this department's employees."
              hint="A deal appears here when one of its employees records one against an account."
            />
          </div>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {focus.pipeline.map((d) => {
              const st = dealStage(d.stage);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <StateDot state={st.state} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{d.title}</span>
                  <span className="text-2xs text-muted">{d.accountName}</span>
                  <span className="font-mono text-2xs tabular-nums text-ink">
                    {formatMoney(d.valueCents, d.currency)}
                  </span>
                  <span className="font-mono text-3xs text-muted">{d.probability}%</span>
                  <span className="text-2xs text-muted">
                    {d.ownerAgentId ? (agentNameById.get(d.ownerAgentId) ?? "employee") : "unowned"}
                  </span>
                  <OsStateBadge state={st.state} label={st.label} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AccountsList
        accounts={focus.accounts}
        hint="Accounts appear here from a business import or when an employee records one."
      />

      <p className="text-2xs text-muted">
        Pipeline value is the sum of open deal amounts; the weighted figure is value × probability and
        is an estimate, not a forecast. Accounts are workspace-wide — the knowledge graph records no
        owning employee. {focus.counts.unassigned} open deal
        {focus.counts.unassigned === 1 ? " is" : "s are"} unowned and counted workspace-wide, never
        against this department.
      </p>
    </OsSection>
  );
}

export interface SuccessFocusData {
  queue: Array<{
    id: string;
    subject: string;
    accountName: string;
    status: string;
    priority: string;
    channel: string;
    assigneeAgentId: string | null;
    slaDueAt: string | null;
    firstResponseAt: string | null;
    updatedAt: string;
  }>;
  accounts: AccountsFocusData["accounts"];
  counts: {
    open: number;
    escalated: number;
    urgent: number;
    unassigned: number;
    slaBreached: number;
    awaitingFirstResponse: number;
    resolved30d: number;
    accounts: number;
  };
}

/**
 * Customer-success focus — the department's support queue.
 *
 * Queue counts are the department's own tickets; `unassigned` is the
 * workspace's, because an unclaimed ticket belongs to nobody and attributing it
 * here would be a lie. `slaBreached` counts only tickets that are still open
 * past their due date — a resolved ticket that missed its SLA is history.
 */
export function SuccessFocusPanel({
  focus,
  departmentName,
  agentNameById,
}: {
  focus: SuccessFocusData;
  departmentName: string;
  agentNameById: Map<string, string>;
}) {
  const metrics: OsMetric[] = [
    {
      key: "open",
      label: "Open tickets",
      value: focus.counts.open,
      sub: `on ${departmentName}`,
    },
    {
      key: "escalated",
      label: "Escalated",
      value: focus.counts.escalated,
      sub: focus.counts.escalated > 0 ? "needs a decision" : "nothing escalated",
      tone: focus.counts.escalated > 0 ? "bad" : "default",
    },
    {
      key: "slaBreached",
      label: "Past SLA",
      value: focus.counts.slaBreached,
      sub: focus.counts.slaBreached > 0 ? "open tickets overdue" : "nothing overdue",
      tone: focus.counts.slaBreached > 0 ? "bad" : "default",
    },
    {
      key: "awaitingFirstResponse",
      label: "No first reply",
      value: focus.counts.awaitingFirstResponse,
      sub: `${focus.counts.resolved30d} resolved in 30 days`,
      tone: focus.counts.awaitingFirstResponse > 0 ? "warn" : "default",
    },
  ];

  return (
    <OsSection
      id="focus"
      title="Support queue"
      description="The tickets this department is on, most urgent first — with the SLA the company set against them."
      emphasis
    >
      <OsMetricRow metrics={metrics} />

      <div className="rounded-lg border border-hairline bg-canvas p-4">
        <p className="font-mono text-2xs tracking-wider text-muted uppercase">
          Queue on {departmentName}
        </p>
        {focus.queue.length === 0 ? (
          <div className="mt-2">
            <OsEmptyPanel
              title="No open tickets on this department's employees."
              hint="A ticket appears here when one of its employees is assigned one."
            />
          </div>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {focus.queue.map((t) => {
              const st = ticketState(t.status);
              const overdue = t.slaDueAt != null && new Date(t.slaDueAt).getTime() < Date.now();
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <StateDot state={overdue ? "failed" : st.state} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.subject}</span>
                  <span className="text-2xs text-muted">{t.accountName}</span>
                  <OsStateBadge state={st.state} label={st.label} />
                  <span
                    className={`font-mono text-3xs ${ticketPriorityTone(t.priority) === "bad" ? "text-danger" : "text-muted"}`}
                  >
                    {t.priority}
                  </span>
                  <span className="text-2xs text-muted">
                    {t.assigneeAgentId ? (agentNameById.get(t.assigneeAgentId) ?? "employee") : "unassigned"}
                  </span>
                  {t.slaDueAt ? (
                    <span
                      className={`font-mono text-3xs ${overdue ? "text-danger" : "text-muted"}`}
                    >
                      {overdue ? "overdue " : "due "}
                      {formatTimeAgo(t.slaDueAt)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AccountsList
        accounts={focus.accounts}
        hint="Accounts appear here from a business import or when an employee records one."
      />

      <p className="text-2xs text-muted">
        The queue is this department's; {focus.counts.unassigned} open ticket
        {focus.counts.unassigned === 1 ? " is" : "s are"} unassigned and counted workspace-wide, never
        against this department. Accounts are workspace-wide too. A ticket closed after missing its
        SLA is history and is not counted as an open breach.
      </p>
    </OsSection>
  );
}
