import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "../../components/auth-form";
import { API_URL, SESSION_COOKIE } from "../../lib/api";

export const metadata = { title: "Sign in — ORQ8" };

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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await isAuthenticated()) redirect("/app");

  const { next } = await searchParams;
  const title =
    next && next.startsWith("/") && !next.startsWith("//")
      ? "Sign back in to continue"
      : "Welcome back";

  return (
    <div id="main" className="flex min-h-screen bg-white">
      {/* Left panel — branding */}
      <div className="hidden w-1/2 flex-col justify-between bg-navy-950 p-10 lg:flex">
        <Link
          href="/"
          className="flex items-baseline gap-1.5 text-2xl font-bold tracking-tight text-white"
        >
          ORQ8
          <span className="h-2 w-2 rounded-full bg-emerald" />
        </Link>

        <div className="max-w-md">
          <h2 className="mb-4 text-3xl font-light leading-tight text-white">
            Run your company with{" "}
            <span className="text-emerald">AI employees</span>
          </h2>
          <p className="text-sm leading-relaxed text-white/50">
            The AI organization operating system. One founder. One HQ. A whole
            operation running itself.
          </p>
        </div>

        <p className="text-xs text-white/30">
          © 2026 ORQ8. The AI Organization Operating System.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <Link
          href="/"
          className="mb-8 flex items-baseline gap-1.5 text-2xl font-bold tracking-tight text-navy-950 lg:hidden"
        >
          ORQ8
          <span className="h-2 w-2 rounded-full bg-emerald" />
        </Link>

        <div className="w-full max-w-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald">
            Sign in
          </p>
          <h1 className="mb-1 text-2xl font-semibold text-navy-950">
            {title}
          </h1>
          <p className="mb-8 text-sm text-gray-500">
            {next
              ? "Your organization is waiting."
              : "Sign in to your organization."}
          </p>

          <AuthForm mode="login" next={next} />

          <p className="mt-6 text-center text-sm text-gray-500">
            New to ORQ8?{" "}
            <Link
              href={
                next ? `/register?next=${encodeURIComponent(next)}` : "/register"
              }
              className="font-medium text-emerald transition-colors hover:text-emerald/80"
            >
              Create an organization
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
