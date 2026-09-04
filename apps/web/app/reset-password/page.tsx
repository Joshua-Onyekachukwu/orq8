import Link from "next/link";
import { ResetPasswordForm } from "../../components/reset-password-form";

export const metadata = { title: "Set new password" };

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <div
      id="main"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-orq8-dark px-6 py-16"
    >
      {/* Command-center backdrop: grid + soft glows */}
      <div
        aria-hidden
        className="absolute inset-0 bg-grid-white [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_68%)]"
      />
      <div
        aria-hidden
        className="absolute -top-48 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-orq8-green-dark blur-[130px]"
      />
      <div
        aria-hidden
        className="absolute bottom-[-180px] right-[-120px] h-[360px] w-[360px] rounded-full bg-orq8-green/10 blur-[110px]"
      />

      <Link
        href="/"
        className="relative mb-10 flex items-baseline gap-1.5 text-2xl font-bold tracking-tight text-white"
      >
        ORQ8
        <span className="h-2 w-2 rounded-full bg-lime" aria-hidden />
        <span className="font-mono text-3xs uppercase tracking-[0.2em] text-orq8-lime">
          · command center
        </span>
      </Link>

      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-orq8-green-dark/80 p-8 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl">
        <p className="font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-orq8-lime">
          Password Reset
        </p>
        <h1 className="mt-2 text-xl font-semibold text-white">Set a new password</h1>
        <p className="mt-1 text-sm text-fog">
          Choose a strong password for your account.
        </p>
        <div className="mt-6">
          <ResetPasswordPageContent searchParams={searchParams} />
        </div>
      </div>
    </div>
  );
}

async function ResetPasswordPageContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-sm text-fog">
          No reset token found. Please request a new password reset link.
        </p>
        <Link
          href="/forgot-password"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-orq8-green px-6 text-sm font-semibold text-ink transition-colors hover:bg-orq8-lime"
        >
          Request reset link
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
