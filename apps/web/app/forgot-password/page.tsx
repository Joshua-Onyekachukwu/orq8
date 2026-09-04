import Link from "next/link";
import { ForgotPasswordForm } from "../../components/forgot-password-form";

export const metadata = { title: "Reset your password — ORQ8" };

export default function ForgotPasswordPage() {
  return (
    <div id="main" className="flex min-h-screen bg-white">
      {/* Left panel — branding */}
      <div className="hidden w-1/2 flex-col justify-between bg-orq8-dark p-10 lg:flex">
        <Link
          href="/"
          className="flex items-baseline gap-1.5 text-2xl font-bold tracking-tight text-white"
        >
          ORQ8
          <span className="h-2 w-2 rounded-full bg-orq8-green" />
        </Link>

        <div className="max-w-md">
          <h2 className="mb-4 text-3xl font-light leading-tight text-white">
            Your AI organization is{" "}
            <span className="text-orq8-lime">waiting for you</span>
          </h2>
          <p className="text-sm leading-relaxed text-white/50">
            Reset your password and get back to running your company with AI
            employees.
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
          className="mb-8 flex items-baseline gap-1.5 text-2xl font-bold tracking-tight text-ink lg:hidden"
        >
          ORQ8
          <span className="h-2 w-2 rounded-full bg-orq8-green" />
        </Link>

        <div className="w-full max-w-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-orq8-lime">
            Password Reset
          </p>
          <h1 className="mb-1 text-2xl font-semibold text-ink">
            Forgot your password?
          </h1>
          <p className="mb-8 text-sm text-gray-500">
            Enter your email and we&apos;ll send you a reset link.
          </p>

          <ForgotPasswordForm />

          <p className="mt-6 text-center text-sm text-gray-500">
            Remember your password?{" "}
            <Link
              href="/login"
              className="font-medium text-orq8-lime transition-colors hover:text-orq8-lime/80"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
