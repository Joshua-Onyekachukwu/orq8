import { cookies } from "next/headers";
import { Users, Search } from "lucide-react";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

export const metadata = { title: "Users — Admin — ORQ8" };

async function fetchUsers(token: string) {
  try {
    const res = await fetch(`${API_URL}/v1/admin/users`, {
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

export default async function AdminUsersPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const users = await fetchUsers(token);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Users</h1>
          <p className="mt-1 text-sm text-muted">
            Manage platform users and their access.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-hairline bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-canvas text-left">
              {["User", "Email", "Role", "Status", "Joined"].map((h) => (
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
            {Array.isArray(users) && users.length > 0 ? (
              (users as Array<{ id: string; email: string; name: string | null; status: string; createdAt: string }>).map((u) => (
                <tr key={u.id} className="hover:bg-canvas/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-emerald">
                        {(u.name ?? u.email).charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-ink">{u.name ?? "Unnamed"}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-muted">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-muted/10 px-2 py-0.5 font-mono text-[10px] uppercase text-muted">
                      member
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.status === "active" ? "bg-emerald/10 text-emerald-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center">
                  <Users className="mx-auto h-8 w-8 text-muted/30" />
                  <p className="mt-3 text-sm text-muted">No users found</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
