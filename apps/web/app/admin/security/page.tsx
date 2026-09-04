import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import { Shield, AlertTriangle, Lock, CheckCircle } from "lucide-react";

export const metadata = { title: "Security Center — Admin" };

async function fetchData(token: string) {
  try {
    const res = await fetch(`${API_URL}/v1/admin/security`, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return (await res.json()) as { data?: any };
  } catch {
    return null;
  }
}

export default async function SecurityPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const data = (await fetchData(token))?.data;

  const failedLogins = data?.failedLogins ?? 0;
  const failedDetails = data?.failedLoginDetails ?? [];
  const deniedEvents = data?.deniedEvents ?? 0;
  const adminActions = data?.adminActions ?? 0;
  const status = data?.status ?? "normal";

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Security Center</h1>
        <p className="mt-1 text-sm text-muted">Authentication, access control, and security events.</p>
      </div>

      {/* Status banner */}
      <div className={`mb-6 flex items-center gap-3 rounded-xl border px-5 py-3 ${
        status === "elevated" ? "border-amber-200 bg-amber-50" : "border-orq8-green/20 bg-orq8-green/5"
      }`}>
        {status === "elevated" ? (
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        ) : (
          <CheckCircle className="h-5 w-5 text-orq8-green" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">
            {status === "elevated" ? "Elevated security activity detected" : "Security status normal"}
          </p>
          <p className="text-xs text-muted">
            {deniedEvents} denied events in last 24h · {failedLogins} accounts with failed attempts
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold"><Lock className="h-4 w-4" /> Failed Logins</div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">{failedLogins}</p>
          <p className="text-xs text-muted">accounts with failed attempts</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold"><Shield className="h-4 w-4" /> Denied Events</div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">{deniedEvents}</p>
          <p className="text-xs text-muted">access denials in last 24h</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold"><CheckCircle className="h-4 w-4" /> Admin Actions</div>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">{adminActions}</p>
          <p className="text-xs text-muted">admin operations in last 24h</p>
        </div>
      </div>

      {/* Failed login details */}
      <div className="rounded-xl border border-hairline bg-white p-5">
        <h2 className="text-sm font-semibold text-ink mb-4">Failed Login Attempts</h2>
        {failedDetails.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="mx-auto h-8 w-8 text-orq8-green/30" />
            <p className="mt-2 text-sm text-muted">No failed login attempts recorded.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline">
                  {["Email", "Failed Attempts", "Locked Until"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-mono text-3xs font-semibold uppercase tracking-wider text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {failedDetails.map((d: any, i: number) => (
                  <tr key={i} className="hover:bg-canvas/50">
                    <td className="px-4 py-2.5 text-sm text-ink">{d.email}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-3xs font-semibold ${d.failedCount >= 5 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                        {d.failedCount} attempts
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted font-mono">
                      {d.lockedUntil ? new Date(d.lockedUntil).toLocaleString() : "Not locked"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
