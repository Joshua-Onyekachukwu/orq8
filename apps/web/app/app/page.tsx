import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
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

// docs/35.3 — GET /v1/auth/me with the session cookie; unauthenticated → /login
export default async function AppPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  let me: MeData | null = null;
  try {
    const res = await fetch(`${API_URL}/v1/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      me = (data?.data as MeData | undefined) ?? null;
    }
  } catch {
    me = null;
  }
  if (!me) redirect("/login");

  const active = me.memberships.find((m) => m.org.id === me.active_org_id) ?? me.memberships[0];
  const displayName = me.user.name ?? me.user.email;

  return (
    <div id="main" className="min-h-screen bg-canvas">
      <header className="border-b border-hairline bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-navy-900">
            ORQ8
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/settings/providers" className="text-sm text-muted transition-colors hover:text-navy-800">
              Settings
            </Link>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-md border border-hairline px-3 py-1.5 text-sm text-muted transition-colors hover:border-navy-800 hover:text-navy-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-sm text-muted">Signed in as {me.user.email}</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Welcome back, {displayName}</h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-hairline bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Organization</p>
            <p className="mt-2 font-medium text-ink">{active?.org.name ?? "—"}</p>
            <p className="mt-0.5 text-sm text-muted">{active?.org.slug ?? ""}</p>
            <span className="mt-3 inline-block rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-navy-800">
              {active?.org.plan ?? ""}
            </span>
          </div>
          <div className="rounded-xl border border-hairline bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Your role</p>
            <p className="mt-2 font-medium capitalize text-ink">{active?.role ?? "—"}</p>
            <p className="mt-0.5 text-sm text-muted">Full authority over this organization</p>
          </div>
          <div className="rounded-xl border border-hairline bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Session</p>
            <p className="mt-2 font-medium text-ink">Active</p>
            <p className="mt-0.5 text-sm text-muted">Server-side · 30 days · revocable (ADR-007)</p>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-dashed border-hairline bg-white p-6 text-sm text-muted">
          <p className="font-medium text-ink">Phase 1 shell — what&apos;s next</p>
          <p className="mt-1">
            Departments, the organization explorer, and hiring arrive in Phase 2; the Executive
            Agent and Decision Center land in Phase 3. Everything you do here is audited and
            tenant-isolated.
          </p>
        </div>
      </main>
    </div>
  );
}
