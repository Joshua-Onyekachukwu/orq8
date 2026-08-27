import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import { Wallet, TrendingUp, AlertTriangle } from "lucide-react";

export const metadata = { title: "Budgets & Limits" };

async function fetchBudgets() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/v1/dashboard`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

export default async function BudgetsPage() {
  const data = await fetchBudgets();
  const weeklySpend = data?.weekly_spend ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
            Governance
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Budgets & Limits
          </h1>
          <p className="mt-1 text-sm text-muted">
            Track spending across your AI workforce. Set limits per agent, department, or task.
          </p>
        </div>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald/10 text-emerald-700">
            <Wallet className="h-4 w-4" />
          </span>
          <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Weekly Spend
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">
            ${(weeklySpend).toFixed(2)}
          </p>
          <p className="mt-0.5 text-xs text-muted">this week</p>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
            <TrendingUp className="h-4 w-4" />
          </span>
          <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Monthly Budget
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">
            —
          </p>
          <p className="mt-0.5 text-xs text-muted">not configured</p>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Alerts
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">
            0
          </p>
          <p className="mt-0.5 text-xs text-muted">no budget alerts</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
        <Wallet className="mx-auto h-10 w-10 text-muted/30" />
        <p className="mt-4 text-sm font-medium text-ink">Budget controls coming soon</p>
        <p className="mt-1 text-sm text-muted max-w-md mx-auto">
          Per-agent spending limits, department budgets, and automatic alerts when spending approaches thresholds will be available in the next release.
        </p>
      </div>
    </div>
  );
}
