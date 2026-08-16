import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "../../components/app-sidebar";
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
 * Authenticated app shell: the sidebar carries the full (phased) ORQ8 feature
 * surface, and each route renders inside it. Unauthenticated → /login.
 *
 * Dev-only fallback: while the deployed API is unreachable, local development
 * renders the shell with sample data so the dashboard design stays previewable.
 * Production always redirects to /login when the session cannot be confirmed.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  let me: MeData | null = null;
  let apiDown = false;
  try {
    const res = await fetch(`${API_URL}/v1/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: MeData };
      me = data?.data ?? null;
    } else if (res.status === 401) {
      redirect("/login");
    } else {
      apiDown = true;
    }
  } catch {
    apiDown = true;
  }

  const allowDemo = process.env.NODE_ENV === "development";
  if (!me && !(apiDown && allowDemo)) redirect("/login");

  const active =
    me?.memberships.find((m) => m.org.id === me.active_org_id) ??
    me?.memberships[0];

  const orgName = active?.org.name ?? "Sample Org";
  const plan = active?.org.plan ?? "pro";
  const userName = me?.user.name ?? me?.user.email ?? "Founder";

  return (
    <div id="main" className="min-h-screen bg-canvas">
      <AppSidebar
        orgName={orgName}
        plan={plan}
        userName={userName}
        sampleMode={!me}
      />

      <div className="lg:pl-64">
        <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {apiDown && !me && (
            <div
              role="status"
              className="mb-6 flex items-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              API unreachable — showing sample data so you can preview the
              dashboard. Production will redirect to sign-in until the API is
              back.
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
