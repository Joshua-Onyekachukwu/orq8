import { cookies } from "next/headers";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";
import { Users, Search, Mail, Building2, Shield } from "lucide-react";
import { UserActions } from "../../../components/admin/user-actions";

export const metadata = { title: "Users — Admin" };

async function fetchUsers(token: string, search?: string) {
  try {
    const url = search
      ? `${API_URL}/v1/admin/users?limit=200&search=${encodeURIComponent(search)}`
      : `${API_URL}/v1/admin/users?limit=200`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    return ((await res.json()) as { data?: unknown[] }).data ?? [];
  } catch {
    return [];
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "active": return "bg-orq8-green/10 text-orq8-green";
    case "disabled": return "bg-red-50 text-red-600";
    case "suspended": return "bg-amber-50 text-amber-600";
    default: return "bg-canvas text-muted";
  }
}

function platformRoleBadge(role: string | null) {
  if (role === "admin") return "bg-orq8-orange/10 text-orq8-orange";
  return "bg-canvas text-muted";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? "";
  const params = await searchParams;
  const users = await fetchUsers(token, params.search);

  const filteredUsers = params.status
    ? users.filter((u: any) => u.status === params.status)
    : users;

  const activeCount = users.filter((u: any) => u.status === "active").length;
  const adminCount = users.filter((u: any) => u.platformRole === "admin").length;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Users</h1>
        <p className="mt-1 text-sm text-muted">
          Manage platform users and administrator access.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="rounded-xl border border-hairline bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold">
            <Users className="h-4 w-4" /> Total Users
          </div>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{users.length}</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold">
            <Shield className="h-4 w-4" /> Admin Users
          </div>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{adminCount}</p>
        </div>
        <div className="rounded-xl border border-hairline bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-muted font-semibold">
            <Building2 className="h-4 w-4" /> Active
          </div>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{activeCount}</p>
        </div>
      </div>

      {/* Search */}
      <form className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            name="search"
            defaultValue={params.search ?? ""}
            placeholder="Search by name or email..."
            className="w-full rounded-lg border border-hairline bg-white pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-orq8-green focus:outline-none focus:ring-1 focus:ring-orq8-green/20"
          />
        </div>
      </form>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-3xs font-semibold uppercase tracking-wider text-muted">Filter:</span>
        {["all", "active", "disabled", "suspended"].map((s) => (
          <a
            key={s}
            href={s === "all" ? "/admin/users" : `/admin/users?status=${s}`}
            className={`rounded-full px-2.5 py-1 text-3xs font-semibold uppercase transition-colors ${
              (params.status ?? "all") === s
                ? "bg-orq8-dark text-white"
                : "bg-canvas text-muted hover:bg-hairline"
            }`}
          >
            {s}
          </a>
        ))}
      </div>

      {/* Users table */}
      <div className="rounded-xl border border-hairline bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-hairline bg-canvas">
              {["User", "Email", "Role", "Status", "Actions"].map((h) => (
                <th key={h} className="px-5 py-3 text-left font-mono text-3xs font-semibold uppercase tracking-[0.14em] text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted">
                  {params.search ? "No users match your search." : "No users found."}
                </td>
              </tr>
            ) : (
              filteredUsers.map((user: any) => (
                <tr key={user.id} className="hover:bg-canvas/50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orq8-dark text-xs font-bold text-orq8-lime">
                        {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-ink">{user.name ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-muted">{user.email}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-semibold uppercase ${platformRoleBadge(user.platformRole)}`}>
                      {user.platformRole === "admin" && <Shield className="h-2.5 w-2.5" />}
                      {user.platformRole ?? "user"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-3xs font-semibold uppercase ${statusBadge(user.status)}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <UserActions userId={user.id} currentStatus={user.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted">
        Showing {filteredUsers.length} of {users.length} users
      </p>
    </div>
  );
}
