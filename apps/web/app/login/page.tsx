import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../../components/auth-form";
import { API_URL, SESSION_COOKIE } from "../../lib/api";

export const metadata = { title: "Sign in" };

// Already signed in? Skip the form and head to the dashboard. The check is
// cookie + live API only, so a stale cookie cannot trap the user (it falls
// through to the form, and the app shell re-verifies on /app).
async function isAuthenticated(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const res = await fetch(`${API_URL}/v1/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    // API unreachable (e.g. local dev): let the form show rather than bounce.
    return false;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await isAuthenticated()) redirect("/app");

  const { next } = await searchParams;
  const title = next && next.startsWith("/") && !next.startsWith("//")
    ? "Sign back in to continue"
    : "Welcome back";

  return (
    <div
      id="main"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy-950 px-6 py-16"
    >
      {/* Command-center backdrop: grid + soft glows */}
      <div
        aria-hidden
        className="absolute inset-0 bg-grid-white [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_68%)]"
      />
      <div
        aria-hidden
        className="absolute -top-48 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-navy-surface blur-[130px]"
      />
      <div
        aria-hidden
        className="absolute bottom-[-180px] right-[-120px] h-[360px] w-[360px] rounded-full bg-emerald/10 blur-[110px]"
      />

      <Link
        href="/"
        className="relative mb-10 flex items-baseline gap-1.5 text-2xl font-bold tracking-tight text-white"
      >
        ORQ8
        <span className="h-2 w-2 rounded-full bg-lime" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald">
          · command center
        </span>
      </Link>

      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-navy-surface/80 p-8 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald">
          Sign in
        </p>
        <h1 className="mt-2 text-xl font-semibold text-white">{title}</h1>
        <p className="mt-1 text-sm text-fog">
          {next ? "Your organization is waiting." : "Sign in to your organization."}
        </p>
        <div className="mt-6">
          <AuthForm mode="login" next={next} />
        </div>
        <p className="mt-6 text-center text-sm text-fog">
          New to ORQ8?{" "}
          <Link
            href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
            className="font-medium text-emerald transition-colors hover:text-lime"
          >
            Create an organization
          </Link>
        </p>
      </div>
    </div>
  );
}
