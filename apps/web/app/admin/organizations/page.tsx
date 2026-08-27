import { cookies } from "next/headers";
import { Building2 } from "lucide-react";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

export const metadata = { title: "Organizations — Admin — ORQ8" };

async function fetchOrgs(token: string) {
  try {
    const res = await fetch(`${API_URL}/v1/admin/organizations`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: unknown[] };
    return data?.data ?? [];
  } catch {
    return [];
  }
}

export default async function AdminOrganizationsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const orgs = await fetchOrgs(token);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Organizations</h1>
        <p className="mt-1 text-sm text-muted">
          All workspaces on the ORQ8 platform.
        </p>
      </div>

      <div className="rounded-xl border border-hairline bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-canvas text-left">
              {["Organization", "Slug", "Plan", "Status", "Created"].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {Array.isArray(orgs) && orgs.length > 0 ? (
              (orgs as Array<{ id: string; name: string; slug: string; plan: string; status: string; createdAt: string }>).map((o) => (
                <tr key={o.id} className="hover:bg-canvas/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-xs font-bold text-purple-600">
                        {o.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-ink">{o.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted">{o.slug}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-lime/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-lime">
                      {o.plan}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      o.status === "active" ? "bg-emerald/10 text-emerald-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center">
                  <Building2 className="mx-auto h-8 w-8 text-muted/30" />
                  <p className="mt-3 text-sm text-muted">No organizations found</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
