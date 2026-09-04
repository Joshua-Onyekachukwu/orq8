import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminSidebar } from "../../components/admin/admin-sidebar";
import { TopBar } from "../../components/top-bar";
import { API_URL, SESSION_COOKIE } from "../../lib/api";

export const dynamic = "force-dynamic";

type MeData = {
  user: { id: string; email: string; name: string | null };
  memberships: {
    org: { id: string; name: string; slug: string; plan: string };
    role: string;
  }[];
  active_org_id: string | null;
  platformRole?: string;
};

/**
 * Admin shell: authenticated + sidebar + admin navigation.
 * Requires a valid session. In production, should also verify admin role.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    redirect("/login?next=/admin");
  }

  let me: MeData | null = null;

  try {
    const res = await fetch(`${API_URL}/v1/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (res.ok) {
      const data = (await res.json()) as { data?: MeData };
      me = data?.data ?? null;
    } else if (res.status === 401) {
      redirect("/login?next=/admin");
    }
  } catch {
    // API unreachable
  }

  if (!me) {
    redirect("/login?next=/admin");
  }

  // SECURITY: /admin is the PLATFORM console — it reads every tenant's users,
  // orgs, and activity. Access requires users.platform_role = 'admin' (or a
  // PLATFORM_ADMIN_EMAILS bootstrap match). The org membership role (owner/admin)
  // is org-scoped and deliberately grants NO platform access; those users are
  // redirected to their org dashboard.
  const activeMembership =
    me.memberships.find((m) => m.org.id === me.active_org_id) ?? me.memberships[0];
  const userRole = activeMembership?.role ?? "member";
  const platformRole = me.platformRole ?? "user";
  if (platformRole !== "admin") {
    redirect("/app");
  }

  const orgName = activeMembership?.org.name ?? "ORQ8";
  const plan = activeMembership?.org.plan ?? "trial";
  const userName = me.user.name ?? me.user.email ?? "Admin";

  return (
    <div className="min-h-screen bg-canvas">
      <AdminSidebar />
      <div className="lg:pl-64">
        <TopBar
          userName={userName}
          orgName={orgName}
          plan={plan}
          userRole={userRole}
          platformRole={platformRole}
        />
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
