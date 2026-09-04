import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../../components/auth-form";
import { API_URL, SESSION_COOKIE } from "../../lib/api";

export const metadata = { title: "Create your organization — ORQ8" };

const REGISTRATION_OPEN = process.env.REGISTRATION_OPEN === "true";

async function isAuthenticated(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const res = await fetch(`${API_URL}/v1/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
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

  if (!REGISTRATION_OPEN) {
    return (
      <div id="main" className="flex min-h-screen bg-white">
        {/* Left panel — branding */}
        <div className="hidden w-1/2 flex-col justify-between bg-[#0a0a0b] p-10 lg:flex">
          <Link
            href="/"
            className="flex items-baseline gap-1.5 text-2xl font-bold tracking-tight text-white"
          >
            ORQ8
            <span className="h-2 w-2 rounded-full bg-[#1a5c2e]" />
          </Link>

          <div className="max-w-md">
            <h2 className="mb-4 text-3xl font-light leading-tight text-white">
              The first cohort is{" "}
              <span className="text-[#B8FF66]">almost ready</span>
            </h2>
            <p className="text-sm leading-relaxed text-white/50">
              We are building ORQ8 so it works reliably from day one. Join the
              waitlist for early access.
            </p>
          </div>

          <p className="text-xs text-white/30">
            © 2026 ORQ8. The AI Organization Operating System.
          </p>
        </div>

        {/* Right panel — gated message */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <Link
            href="/"
            className="mb-8 flex items-baseline gap-1.5 text-2xl font-bold tracking-tight text-[#0a0a0b] lg:hidden"
          >
            ORQ8
            <span className="h-2 w-2 rounded-full bg-[#1a5c2e]" />
          </Link>

          <div className="w-full max-w-sm text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-emerald/20 bg-[#1a5c2e]/5">
              <svg
                className="h-8 w-8 text-[#B8FF66]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            <h1 className="mb-3 text-2xl font-semibold text-[#0a0a0b]">
              Registration opens soon
            </h1>
            <p className="mb-8 text-sm leading-relaxed text-gray-500">
              ORQ8 is preparing for its first cohort. We are building the
              platform so it works reliably from day one. Join the waitlist to
              get early access.
            </p>

            <div className="flex flex-col gap-3">
              <Link
                href="/#waitlist"
                className="inline-flex h-11 items-center justify-center rounded-full bg-[#1a5c2e] px-8 text-sm font-semibold text-white transition-colors hover:bg-[#1a5c2e]/90"
              >
                Join the waitlist
              </Link>
              <Link
                href="/"
                className="inline-flex h-11 items-center justify-center rounded-full border border-gray-200 px-8 text-sm font-medium text-gray-600 transition-colors hover:text-[#0a0a0b]"
              >
                Back to home
              </Link>
            </div>

            <p className="mt-6 text-xs text-gray-400 uppercase tracking-widest">
              Existing users can still sign in normally
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="main" className="flex min-h-screen bg-white">
      {/* Left panel — branding */}
      <div className="hidden w-1/2 flex-col justify-between bg-[#0a0a0b] p-10 lg:flex">
        <Link
          href="/"
          className="flex items-baseline gap-1.5 text-2xl font-bold tracking-tight text-white"
        >
          ORQ8
          <span className="h-2 w-2 rounded-full bg-[#1a5c2e]" />
        </Link>

        <div className="max-w-md">
          <h2 className="mb-4 text-3xl font-light leading-tight text-white">
            You stay the CEO.{" "}
            <span className="text-[#B8FF66]">The system runs.</span>
          </h2>
          <p className="text-sm leading-relaxed text-white/50">
            Create your organization, hire your AI team, and start delegating
            real work in minutes.
          </p>
        </div>

        <p className="text-xs text-white/30">
          © 2026 ORQ8. The AI Organization Operating System.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <Link
          href="/"
          className="mb-8 flex items-baseline gap-1.5 text-2xl font-bold tracking-tight text-[#0a0a0b] lg:hidden"
        >
          ORQ8
          <span className="h-2 w-2 rounded-full bg-[#1a5c2e]" />
        </Link>

        <div className="w-full max-w-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[#B8FF66]">
            Create your organization
          </p>
          <h1 className="mb-1 text-2xl font-semibold text-[#0a0a0b]">
            You stay the CEO
          </h1>
          <p className="mb-8 text-sm text-gray-500">
            The system runs the organization.
          </p>

          <AuthForm mode="register" next={next} />

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link
              href={
                next ? `/login?next=${encodeURIComponent(next)}` : "/login"
              }
              className="font-medium text-[#B8FF66] transition-colors hover:text-[#B8FF66]/80"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
