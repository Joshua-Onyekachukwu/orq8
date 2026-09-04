import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import { Building2, Users, Bot, Search, CreditCard } from "lucide-react";

export const metadata = { title: "Organizations — Admin" };

async function fetchOrgs(token: string) {
  try {
    const res = await fetch(`${API_URL}/v1/admin/organizations?limit=200`, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    return ((await res.json()) as { data?: unknown[] }).data ?? [];
  } catch {
    return [];
  }
}

function planBadge(plan: string) {
  switch (plan) {
    case "pro": return "bg-orq8-orange/10 text-orq8-orange";
    case "business": return "bg-orq8-green/10 text-orq8-green";
    case "enterprise": return "bg-purple-50 text-purple-600";
    default: return "bg-canvas text-muted";
  }
}

function statusDot(status: string) {
  return status === "active" ? "bg-orq8-green" : "bg-gray-300";
}

export default async function AdminOrganizationsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const orgs = await fetchOrgs(token);

  const activeCount = orgs.filter((o: any) => o.status === "active").length;
  const proCount = orgs.filter((o: any) => o.plan !== "free").length;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Organizations</h1>
        <p className="mt-1 text-sm text-muted">
          Platform organizations and their operational status.
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="rounded-xl border border-hairline bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold">
            <Building2 className="h-4 w-4" /> Total Orgs
          </div>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{orgs.length}</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold">
            <CreditCard className="h-4 w-4" /> Paid Plans
          </div>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{proCount}</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold">
            <Building2 className="h-4 w-4" /> Active
          </div>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{activeCount}</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-hairline bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-hairline bg-canvas">
              {["Organization", "Owner", "Plan", "Status", "Created"].map((h) => (
                <th key={h} className="px-5 py-3 text-left font-mono text-3xs font-semibold uppercase tracking-[0.14em] text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {orgs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted">
                  No organizations found.
                </td>
              </tr>
            ) : (
              orgs.map((org: any) => (
                <tr key={org.id} className="hover:bg-canvas/50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orq8-dark text-xs font-bold text-orq8-lime">
                        {(org.name ?? "O").charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-ink">{org.name}</p>
                        <p className="text-3xs text-muted font-mono">{org.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-muted">{org.ownerEmail ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-3xs font-semibold uppercase ${planBadge(org.plan)}`}>
                      {org.plan}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className={`h-2 w-2 rounded-full ${statusDot(org.status)}`} />
                      {org.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted font-mono">
                    {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
