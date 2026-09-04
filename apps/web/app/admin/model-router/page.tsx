import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import { Zap, Activity, DollarSign, BarChart3 } from "lucide-react";

export const metadata = { title: "Model Router — Admin" };

async function fetchData(token: string) {
  try {
    const res = await fetch(`${API_URL}/v1/admin/model-router`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as { data?: any };
  } catch {
    return null;
  }
}

export default async function ModelRouterPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const data = (await fetchData(token))?.data;

  const totals = data?.totals ?? { requests: 0, costCents: 0 };
  const byDepartment = data?.byDepartment ?? [];
  const byType = data?.byType ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Model Router</h1>
        <p className="mt-1 text-sm text-muted">AI provider routing decisions and usage patterns.</p>
      </div>

      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold"><Activity className="h-4 w-4" /> Total Requests</div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">{totals.requests}</p>
          <p className="text-xs text-muted">all-time activity events</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold"><DollarSign className="h-4 w-4" /> Estimated Cost</div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">${(totals.costCents / 100).toFixed(2)}</p>
          <p className="text-xs text-muted">total AI infrastructure spend</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold"><BarChart3 className="h-4 w-4" /> Avg Cost/Request</div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">${totals.requests > 0 ? (totals.costCents / totals.requests / 100).toFixed(4) : "0.00"}</p>
          <p className="text-xs text-muted">per activity event</p>
        </div>
      </div>

      {/* By Department */}
      <div className="rounded-xl border border-hairline bg-white p-5 mb-6">
        <h2 className="text-sm font-semibold text-ink mb-4">Usage by Department</h2>
        {byDepartment.length === 0 ? (
          <p className="text-sm text-muted">No activity data yet.</p>
        ) : (
          <div className="space-y-3">
            {byDepartment.map((d: any) => (
              <div key={d.department} className="flex items-center justify-between rounded-lg border border-hairline p-3">
                <div>
                  <p className="text-sm font-medium text-ink">{d.department}</p>
                  <p className="text-[10px] text-muted">{d.count} events</p>
                </div>
                <span className="font-mono text-sm text-ink">${(d.totalCost / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* By Activity Type */}
      <div className="rounded-xl border border-hairline bg-white p-5">
        <h2 className="text-sm font-semibold text-ink mb-4">Usage by Activity Type</h2>
        {byType.length === 0 ? (
          <p className="text-sm text-muted">No activity data yet.</p>
        ) : (
          <div className="space-y-3">
            {byType.map((t: any) => (
              <div key={t.type} className="flex items-center justify-between rounded-lg border border-hairline p-3">
                <div>
                  <p className="text-sm font-medium text-ink capitalize">{t.type}</p>
                  <p className="text-[10px] text-muted">{t.count} events</p>
                </div>
                <span className="font-mono text-sm text-ink">${(t.totalCost / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
