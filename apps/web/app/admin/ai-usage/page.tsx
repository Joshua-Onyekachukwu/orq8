import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import {
  Zap,
  TrendingUp,
  Calendar,
  Bot,
  DollarSign,
  Percent,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

export const metadata = { title: "AI Usage — Admin" };

/**
 * AI usage and cost (docs/77 P1 §5).
 *
 * The page used to print `costCents / 100` next to a dollar sign, where the number
 * behind it was *Work Credits* summed from activity events — credits wearing a
 * dollar sign, and no margin anywhere. It now reports the units separately:
 * calls/tokens/USD come from `llm_performance` (what we paid providers), credits
 * come from the credit ledger (what we charged), and margin is the one line where
 * the two meet, with the rate it used written on it.
 */

interface WindowUsage {
  calls: number;
  tokens: number;
  providerCostUsd: number;
  creditsCharged: number;
}

interface Margin {
  creditsUsed: number;
  usdPerCredit: number;
  revenueUsd: number;
  providerCostUsd: number;
  marginUsd: number;
  marginPct: number | null;
}

interface BreakdownRow {
  provider?: string;
  model?: string;
  calls: number;
  tokens: number;
  providerCostUsd: number;
  unknownPricingCalls?: number;
}

interface UsageData {
  weekly: WindowUsage;
  monthly: WindowUsage;
  allTime: WindowUsage;
  spend: { providerCostUsd: number; unknownPricingCalls: number; failedCalls: number };
  billing: { usdPerCredit: number; rateBasis: string };
  margin: { monthly: Margin; allTime: Margin; monthlyUnbilledProviderCostUsd: number };
  credits: { total: number; used: number };
  agents: { total: number; active: number };
  byProvider: BreakdownRow[];
  byModel: BreakdownRow[];
}

async function fetchData(token: string): Promise<UsageData | null> {
  try {
    const res = await fetch(`${API_URL}/v1/admin/ai-usage`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return ((await res.json()) as { data?: UsageData }).data ?? null;
  } catch {
    return null;
  }
}

interface DriftingOrg {
  name: string;
  balanceUsed: number;
  ledgerUsed: number;
  drift: number;
}

interface ReconcileData {
  checked: number;
  drifting: number;
  orgs: DriftingOrg[];
}

/**
 * Ledger vs balance drift (docs/77 P0, surfaced here in docs/80 Phase 0).
 * The ledger is the source of truth; non-zero drift means a charge was lost or
 * double-applied. Reported as null when the API did not answer — never as a
 * clean zero, which would read as "all good" when nothing was checked.
 */
async function fetchReconcile(token: string): Promise<ReconcileData | null> {
  try {
    const res = await fetch(`${API_URL}/v1/admin/credits/reconcile`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return ((await res.json()) as { data?: ReconcileData }).data ?? null;
  } catch {
    return null;
  }
}

function usd(value: number | undefined): string {
  return `$${(value ?? 0).toFixed(value !== undefined && Math.abs(value) < 0.01 && value > 0 ? 4 : 2)}`;
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export default async function AIUsagePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const [data, reconcile] = await Promise.all([fetchData(token), fetchReconcile(token)]);

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl">
        <h1 className="text-2xl font-bold text-ink">AI Usage &amp; Cost</h1>
        <p className="mt-2 text-sm text-muted">
          Usage data is unavailable — the API did not answer. Nothing is shown rather than zeros
          that read like real numbers.
        </p>
      </div>
    );
  }

  const windows: Array<{ label: string; icon: typeof Calendar; usage: WindowUsage }> = [
    { label: "This Week", icon: Calendar, usage: data.weekly },
    { label: "This Month", icon: TrendingUp, usage: data.monthly },
    { label: "All Time", icon: Zap, usage: data.allTime },
  ];

  const monthlyUnbilled = data.margin.monthlyUnbilledProviderCostUsd ?? 0;
  const creditUtil =
    data.credits.total > 0 ? Math.round((data.credits.used / data.credits.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">AI Usage &amp; Cost</h1>
        <p className="mt-1 text-sm text-muted">
          What the platform ran, what providers charged for it, and what that leaves after credits.
        </p>
      </div>

      {/* Usage windows — calls, tokens, real USD, credits charged */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {windows.map((w) => {
          const Icon = w.icon;
          return (
            <div key={w.label} className="rounded-xl border border-hairline bg-white p-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                <Icon className="h-4 w-4" /> {w.label}
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-ink tabular-nums">
                {w.usage.calls.toLocaleString("en-US")}
              </p>
              <p className="text-xs text-muted">
                model calls · {w.usage.tokens.toLocaleString("en-US")} tokens
              </p>
              <div className="mt-3 flex items-baseline gap-2 border-t border-hairline pt-3">
                <span className="font-mono text-sm font-semibold text-ink tabular-nums">
                  {usd(w.usage.providerCostUsd)}
                </span>
                <span className="text-3xs uppercase tracking-wider text-muted">provider cost</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {w.usage.creditsCharged.toLocaleString("en-US")} credits charged
              </p>
            </div>
          );
        })}
      </div>

      {/* Margin — the only place credits and dollars meet */}
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-hairline bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-ink">Gross margin (last 30 days)</h2>
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="font-mono text-3xl font-bold text-ink tabular-nums">
                {usd(data.margin.monthly.revenueUsd)}
              </p>
              <p className="text-xs text-muted">
                revenue from {data.margin.monthly.creditsUsed.toLocaleString("en-US")} credits
              </p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold text-warm-ink tabular-nums">
                {usd(data.margin.monthly.providerCostUsd)}
              </p>
              <p className="text-xs text-muted">attributed provider cost</p>
            </div>
            <div>
              <p
                className={`font-mono text-3xl font-bold tabular-nums ${
                  data.margin.monthly.marginUsd < 0 ? "text-error-ink" : "text-brand-ink"
                }`}
              >
                {usd(data.margin.monthly.marginUsd)}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted">
                <Percent className="h-3 w-3" />
                {pct(data.margin.monthly.marginPct)} margin
              </p>
            </div>
          </div>
          <p className="mt-4 border-t border-hairline pt-3 text-3xs text-muted">
            Credits valued at {usd(data.billing.usdPerCredit)} each — {data.billing.rateBasis}. All
            time: {usd(data.margin.allTime.revenueUsd)} revenue,{" "}
            {usd(data.margin.allTime.providerCostUsd)} cost, {pct(data.margin.allTime.marginPct)}{" "}
            margin.
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-ink">Coverage &amp; waste</h2>
          </div>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted">Spend in the last 30 days</span>
              <span className="font-mono tabular-nums text-ink">{usd(data.monthly.providerCostUsd)}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted">Spend not billed to anyone</span>
              <span className="font-mono tabular-nums text-ink">{usd(monthlyUnbilled)}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted">Calls that failed</span>
              <span className="font-mono tabular-nums text-ink">
                {(data.spend.failedCalls ?? 0).toLocaleString("en-US")}
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted">Calls with no known price</span>
              <span className="font-mono tabular-nums text-ink">
                {(data.spend.unknownPricingCalls ?? 0).toLocaleString("en-US")}
              </span>
            </li>
          </ul>
          <p className="mt-4 border-t border-hairline pt-3 text-3xs text-muted">
            Cost is metered per call: the provider&apos;s own reported figure when it sends one,
            otherwise the published model rates. Calls with no known price count as $0 here and are
            counted above, so a margin is never read as complete when it is not.
          </p>
        </div>
      </div>

      {/* Credits + Agents */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">Credit Pool</h2>
          <div className="flex items-end gap-4">
            <div>
              <p className="font-mono text-3xl font-bold text-ink tabular-nums">{data.credits.total}</p>
              <p className="text-xs text-muted">total credits</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold text-warm-ink tabular-nums">{data.credits.used}</p>
              <p className="text-xs text-muted">consumed</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold text-brand-ink tabular-nums">
                {data.credits.total - data.credits.used}
              </p>
              <p className="text-xs text-muted">remaining</p>
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-hairline">
            <div
              className="h-full rounded-full bg-brand-deep transition-all"
              style={{ width: `${creditUtil}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted">{creditUtil}% utilized</p>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink">AI Workforce</h2>
          <div className="flex items-end gap-4">
            <div>
              <p className="font-mono text-3xl font-bold text-ink tabular-nums">{data.agents.total}</p>
              <p className="text-xs text-muted">total agents</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold text-brand-ink tabular-nums">{data.agents.active}</p>
              <p className="text-xs text-muted">active</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold text-muted tabular-nums">
                {data.agents.total - data.agents.active}
              </p>
              <p className="text-xs text-muted">paused</p>
            </div>
          </div>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted">
            <Bot className="h-4 w-4" />
            {(data.byModel?.length ?? 0) > 0
              ? `Priced across ${data.byModel.length} model${data.byModel.length === 1 ? "" : "s"} in the last 30 days`
              : "No model calls recorded in the last 30 days"}
          </p>
        </div>
      </div>

      {/* Ledger integrity — the balance must equal the append-only ledger */}
      <div className="mb-8 rounded-xl border border-hairline bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-semibold text-ink">Ledger integrity</h2>
        </div>
        {reconcile === null ? (
          <p className="text-sm text-muted">
            Not checked — the reconcile endpoint did not answer. Nothing is shown rather than a
            clean zero that would read as healthy.
          </p>
        ) : reconcile.drifting === 0 ? (
          <p className="text-sm text-muted">
            {reconcile.checked.toLocaleString("en-US")} organization
            {reconcile.checked === 1 ? "" : "s"} checked — every balance equals the sum of its
            ledger rows. No drift.
          </p>
        ) : (
          <div>
            <p className="text-sm text-error-ink">
              {reconcile.drifting} of {reconcile.checked} organizations drift from the ledger — a
              charge was lost or double-applied. Investigate before trusting the numbers above.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-hairline">
                    {["Organization", "Balance says", "Ledger says", "Drift"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left font-mono text-3xs font-semibold uppercase tracking-wider text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {reconcile.orgs.map((org) => (
                    <tr key={org.name}>
                      <td className="px-3 py-2 text-sm text-ink">{org.name}</td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted">
                        {org.balanceUsed.toLocaleString("en-US")}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted">
                        {org.ledgerUsed.toLocaleString("en-US")}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold tabular-nums text-error-ink">
                        {org.drift > 0 ? "+" : ""}
                        {org.drift.toLocaleString("en-US")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Where the money went */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { title: "Cost by provider (30 days)", rows: data.byProvider ?? [], key: "provider" as const },
          { title: "Cost by model (30 days)", rows: data.byModel ?? [], key: "model" as const },
        ].map((section) => (
          <div key={section.title} className="rounded-xl border border-hairline bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">{section.title}</h2>
            {section.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No calls recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-hairline">
                      {[section.key === "provider" ? "Provider" : "Model", "Calls", "Tokens", "Cost"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left font-mono text-3xs font-semibold uppercase tracking-wider text-muted"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {section.rows.map((row, i) => (
                      <tr key={`${row.provider}-${row.model}-${i}`} className="hover:bg-canvas/50">
                        <td className="px-3 py-2 text-sm text-ink">
                          {row[section.key] ?? "—"}
                          {row.provider && section.key === "model" && (
                            <span className="ml-2 text-3xs text-muted">{row.provider}</span>
                          )}
                          {(row.unknownPricingCalls ?? 0) > 0 && (
                            <span className="ml-2 rounded bg-warm-soft px-1.5 py-0.5 text-3xs text-warm-ink">
                              {row.unknownPricingCalls} unpriced
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted">
                          {row.calls.toLocaleString("en-US")}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted">
                          {row.tokens.toLocaleString("en-US")}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums text-ink">
                          {usd(row.providerCostUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
