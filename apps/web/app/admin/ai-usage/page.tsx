import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import { Zap, TrendingUp, Calendar, Bot } from "lucide-react";

export const metadata = { title: "AI Usage — Admin" };

async function fetchData(token: string) {
  try {
    const res = await fetch(`${API_URL}/v1/admin/ai-usage`, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return (await res.json()) as { data?: any };
  } catch {
    return null;
  }
}

export default async function AIUsagePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const data = (await fetchData(token))?.data;

  const weekly = data?.weekly ?? { requests: 0, costCents: 0 };
  const monthly = data?.monthly ?? { requests: 0, costCents: 0 };
  const allTime = data?.allTime ?? { requests: 0, costCents: 0 };
  const credits = data?.credits ?? { total: 0, used: 0 };
  const agents = data?.agents ?? { total: 0, active: 0 };

  const creditUtil = credits.total > 0 ? Math.round((credits.used / credits.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">AI Usage & Cost</h1>
        <p className="mt-1 text-sm text-muted">Platform-wide AI inference costs and credit consumption.</p>
      </div>

      {/* Time-based usage */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold"><Calendar className="h-4 w-4" /> This Week</div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">{weekly.requests}</p>
          <p className="text-xs text-muted">requests · ${(weekly.costCents / 100).toFixed(2)} cost</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold"><TrendingUp className="h-4 w-4" /> This Month</div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">{monthly.requests}</p>
          <p className="text-xs text-muted">requests · ${(monthly.costCents / 100).toFixed(2)} cost</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold"><Zap className="h-4 w-4" /> All Time</div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">{allTime.requests}</p>
          <p className="text-xs text-muted">requests · ${(allTime.costCents / 100).toFixed(2)} cost</p>
        </div>
      </div>

      {/* Credits + Agents */}
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">Credit Pool</h2>
          <div className="flex items-end gap-4">
            <div>
              <p className="font-mono text-3xl font-bold text-ink tabular-nums">{credits.total}</p>
              <p className="text-xs text-muted">total credits</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold text-[#E86A33] tabular-nums">{credits.used}</p>
              <p className="text-xs text-muted">consumed</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold text-[#1a5c2e] tabular-nums">{credits.total - credits.used}</p>
              <p className="text-xs text-muted">remaining</p>
            </div>
          </div>
          <div className="mt-4 h-3 rounded-full bg-hairline overflow-hidden">
            <div className="h-full rounded-full bg-[#1a5c2e] transition-all" style={{ width: `${creditUtil}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{creditUtil}% utilized</p>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">AI Workforce</h2>
          <div className="flex items-end gap-4">
            <div>
              <p className="font-mono text-3xl font-bold text-ink tabular-nums">{agents.total}</p>
              <p className="text-xs text-muted">total agents</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold text-[#1a5c2e] tabular-nums">{agents.active}</p>
              <p className="text-xs text-muted">active</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold text-muted tabular-nums">{agents.total - agents.active}</p>
              <p className="text-xs text-muted">paused</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
