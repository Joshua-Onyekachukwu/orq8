import Link from "next/link";
import { AuthShell } from "../../components/auth/auth-shell";
import { ForgotPasswordForm } from "../../components/forgot-password-form";

export const metadata = {
  title: "Reset your password | ORQ8",
  description: "Reset the password for your ORQ8 account.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Password reset"
      title="Forgot your password?"
      subtitle="Enter your email and we will send a reset link."
      brandHeadline="Your company is where you left it."
      brandBody="Reset the password and sign back in. Sessions, approvals, and running work stay exactly as they were."
      footer={
        <p className="text-sm text-white/50">
          Remembered it?{" "}
          <Link
            href="/login"
            className="text-white underline decoration-white/30 underline-offset-2 transition-colors hover:decoration-white"
          >
            Sign in
          </Link>
          .
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
