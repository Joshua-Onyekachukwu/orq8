import Link from "next/link";
import { AuthShell } from "../../components/auth/auth-shell";
import { ResetPasswordForm } from "../../components/reset-password-form";

export const metadata = {
  title: "Set a new password | ORQ8",
  description: "Set a new password for your ORQ8 account.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell
      eyebrow="Password reset"
      title="Set a new password"
      subtitle="Choose a password you have not used for this company before."
      brandHeadline="Back to work in one step."
      brandBody="Resetting the password signs out every other session, so anyone holding an old link loses access."
      footer={
        <p className="text-sm text-white/50">
          Need a new link?{" "}
          <Link
            href="/forgot-password"
            className="text-white underline decoration-white/30 underline-offset-2 transition-colors hover:decoration-white"
          >
            Request one
          </Link>
          .
        </p>
      }
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="rounded-lg border border-border-error/30 bg-error/10 px-4 py-4">
          <p className="text-sm text-error-ink">This reset link is incomplete</p>
          <p className="mt-1 text-xs text-error-ink/80">
            The link that opened this page is missing its token. Request a new link and use the
            one from that email.
          </p>
          <Link
            href="/forgot-password"
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-deep text-sm font-semibold text-white transition-colors hover:bg-brand"
          >
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
