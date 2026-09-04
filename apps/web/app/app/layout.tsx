import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "../../components/app-sidebar";
import { AppErrorBoundary } from "../../components/app-error-boundary";
import { TopBar } from "../../components/top-bar";
import { API_URL, SESSION_COOKIE } from "../../lib/api";
import { AnalyticsProvider } from "../../components/analytics-provider";



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
 * Authenticated app shell: the sidebar carries the full (phased) ORQ8 feature
 * surface, and each route renders inside it. Unauthenticated → /login.
 *
 * In production, always requires a valid session from the deployed API.
 * In development, allows a fallback mode for previewing the dashboard.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  // No session token → redirect to login with return URL
  if (!token) {
    redirect("/login?next=/app");
  }

  let me: MeData | null = null;
  let apiError: string | null = null;
  let isApiReachable = true;

  try {
    const res = await fetch(`${API_URL}/v1/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      // Cache auth check for 30s to avoid 700ms latency on every navigation.
      // The cookie still gates access; this just prevents redundant API calls
      // when the user navigates between dashboard pages rapidly.
      next: { revalidate: 30 },
    });

    if (res.ok) {
      const data = (await res.json()) as { data?: MeData };
      me = data?.data ?? null;
    } else if (res.status === 401) {
      // Session expired or invalid → clear cookie and redirect to login
      redirect("/login?next=/app");
    } else {
      // API returned an error (500, 503, etc.)
      isApiReachable = false;
      apiError = `API error (${res.status}): Service temporarily unavailable.`;
    }
  } catch {
    // Network error - API is completely unreachable
    isApiReachable = false;
    apiError = "Could not connect to the ORQ8 API. The service may be temporarily unavailable.";
  }

  // SECURITY: Always require valid session. No dev fallback to sample data.
  if (!me) {
    if (!isApiReachable) {
      // API unreachable: show service unavailable (never bypass auth)
      return (
        <div id="main" className="min-h-screen bg-canvas flex items-center justify-center">
          <div className="max-w-md text-center px-6">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-ink">Service Unavailable</h1>
            <p className="mt-2 text-sm text-muted">{apiError}</p>
            <p className="mt-4 text-sm text-muted">Please try again in a few moments, or contact support if the issue persists.</p>
            <a href="/login" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#0a0a0b] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0a0a0b]">
              Return to Login
            </a>
          </div>
        </div>
      );
    }
    // API reachable but session invalid → redirect to login
    redirect("/login?next=/app");
  }

  const active =
    me?.memberships.find((m) => m.org.id === me.active_org_id) ??
    me?.memberships[0];

  const orgName = active?.org.name ?? "My Organization";
  const plan = active?.org.plan ?? "starter";
  const userName = me?.user.name ?? me?.user.email ?? "Founder";
  const hasSession = !!me;

  const userRole = active?.role ?? "member";
  const platformRole = me?.platformRole ?? "user";

  return (
    <div id="main" className="min-h-screen bg-canvas">
      <AnalyticsProvider
        userId={me?.user.id}
        orgId={active?.org.id}
        userName={userName}
        userEmail={me?.user.email}
      />
      <AppSidebar
        orgName={orgName}
        plan={plan}
        userName={userName}
        sampleMode={false}
      />

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
