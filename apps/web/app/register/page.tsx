import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../../components/auth-form";
import { API_URL, SESSION_COOKIE } from "../../lib/api";

export const metadata = { title: "Create your organization" };

// Registration is gated behind the waitlist. When REGISTRATION_OPEN is not
// "true", visitors see a waitlist redirect instead of the signup form.
const REGISTRATION_OPEN = process.env.REGISTRATION_OPEN === "true";

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
  // Already signed in? Go straight to the dashboard.
  if (await isAuthenticated()) redirect("/app");

  const { next } = await searchParams;

  // Registration is gated: redirect to the landing waitlist unless cohort is open
  // or the user arrived with a valid invite token.
  if (!REGISTRATION_OPEN) {
    return (
      <div
        id="main"
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy-950 px-6 py-16"
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-grid-white [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_68%)]"
        />
        <div
          aria-hidden
          className="absolute -top-48 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-navy-surface blur-[130px]"
        />

        <Link
          href="/"
          className="relative mb-10 flex items-center gap-3"
          aria-label="ORQ8 home"
        >
          <img src="/images/logo-white.png" alt="" aria-hidden className="h-9 w-auto" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald">
            Company of One
          </span>
        </Link>

        <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-navy-surface/80 p-8 text-center shadow-[0_24px_70px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-lime/30 bg-lime/10">
            <svg className="h-8 w-8 text-lime" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold text-white">Registration opens soon</h1>
          <p className="mt-3 text-sm leading-relaxed text-fog">
            ORQ8 is preparing for its first cohort. We are building the platform
            so it works reliably from day one. Join the waitlist to get early
            access when your cohort opens.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <Link
              href="/#waitlist"
              className="inline-flex h-12 items-center justify-center rounded-full bg-emerald px-8 text-sm font-semibold text-navy-950 transition-colors hover:bg-lime"
            >
              Join the waitlist
            </Link>
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/20 px-8 text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              Back to home
            </Link>
          </div>

          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
            Existing users can still sign in normally
          </p>
        </div>
      </div>
    );
  }

  // Registration is open: show the signup form.
  return (
    <div
      id="main"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy-950 px-6 py-16"
    >
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
        className="relative mb-10 flex items-center gap-3"
        aria-label="ORQ8 home"
      >
        <img src="/images/logo-white.png" alt="" aria-hidden className="h-9 w-auto" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald">
          Company of One
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
