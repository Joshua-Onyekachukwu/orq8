import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../../components/auth-form";
import { API_URL, SESSION_COOKIE } from "../../lib/api";

export const metadata = { title: "Create your organization" };

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
    return false;
  }
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await isAuthenticated()) redirect("/app");

  const { next } = await searchParams;

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
        aria-label="ORQ8 home"
        className="relative mb-10 flex items-center gap-3"
      >
        <img
          src="/images/logo-white.png"
          alt=""
          aria-hidden
          className="h-9 w-auto"
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald">
          command center
        </span>
      </Link>

      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-navy-surface/80 p-8 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald">
          Create your organization
        </p>
        <h1 className="mt-2 text-xl font-semibold text-white">You stay the CEO</h1>
        <p className="mt-1 text-sm text-fog">The system runs the organization.</p>
        <div className="mt-6">
          <AuthForm mode="register" next={next} />
        </div>
        <p className="mt-6 text-center text-sm text-fog">
          Already have an account?{" "}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            className="font-medium text-emerald transition-colors hover:text-lime"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
