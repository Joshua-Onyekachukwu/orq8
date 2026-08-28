import { cookies } from "next/headers";
import { Users } from "lucide-react";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

export const metadata = { title: "Users — Admin — ORQ8" };

interface UserWithMemberships {
  id: string;
  email: string;
  name: string | null;
  status: string;
  createdAt: string;
  memberships: Array<{
    role: string;
    orgId: string;
    orgName: string;
  }>;
  primaryRole: string;
}

async function fetchUsers(token: string) {
  try {
    const res = await fetch(`${API_URL}/v1/admin/users`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return { data: [], meta: { total: 0 } };
    const data = (await res.json()) as { data?: UserWithMemberships[]; meta?: { total: number } };
    return { data: data?.data ?? [], meta: data?.meta ?? { total: 0 } };
  } catch {
    return { data: [], meta: { total: 0 } };
  }
}

function roleBadge(role: string) {
  switch (role) {
    case "owner":
      return "bg-lime/10 text-lime";
    case "admin":
      return "bg-purple-50 text-purple-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export default async function AdminUsersPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const { data: users, meta } = await fetchUsers(token);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Users</h1>
          <p className="mt-1 text-sm text-muted">
            Manage platform users and their access. {meta.total > 0 ? `${meta.total} total users.` : ""}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-hairline bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-canvas text-left">
              {["User", "Email", "Role", "Organization", "Status", "Joined"].map((h) => (
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
            {users.length > 0 ? (
              users.map((u) => (
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
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${roleBadge(u.primaryRole)}`}>
                      {u.primaryRole}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted">
                    {u.memberships.length > 0
                      ? u.memberships.map((m) => m.orgName).join(", ")
                      : "—"}
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
                <td colSpan={6} className="px-5 py-10 text-center">
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
