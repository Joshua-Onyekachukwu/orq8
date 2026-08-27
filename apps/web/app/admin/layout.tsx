import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminSidebar } from "../../components/admin/admin-sidebar";
import { API_URL, SESSION_COOKIE } from "../../lib/api";

export const dynamic = "force-dynamic";

type MeData = {
  user: { id: string; email: string; name: string | null };
  memberships: {
    org: { id: string; name: string; slug: string; plan: string };
    role: string;
  }[];
  active_org_id: string | null;
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
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
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

  // SECURITY: Verify the user has admin or owner role.
  // Only owners and admins can access the admin dashboard.
  const activeMembership = me.memberships.find(
    (m) => m.org.id === me.active_org_id
  ) ?? me.memberships[0];
  const userRole = activeMembership?.role ?? "member";
  if (userRole !== "owner" && userRole !== "admin") {
    // Non-admin users are redirected to the user dashboard
    redirect("/app");
  }

  return (
    <div className="min-h-screen bg-canvas">
      <AdminSidebar />
      <div className="lg:pl-64">
        <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
