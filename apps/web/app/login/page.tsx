import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "../../components/auth/auth-shell";
import { AuthForm } from "../../components/auth-form";
import { oauthProviders, postAuthTarget, probeSession } from "../../lib/auth-pages";

export const metadata = {
  title: "Sign in | ORQ8",
  // Own description so the sign-in head never inherits the root layout's
  // marketing copy (the auth e2e bans "organization" on this page).
  description: "Sign in to your company on ORQ8.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; oauth_error?: string }>;
}) {
  const { next, oauth_error } = await searchParams;
  const target = postAuthTarget(next);

  // Only a session the API confirms counts as signed in. An expired cookie
  // falls through to the form instead of bouncing back into /app, which is
  // what made the old middleware redirect loop possible.
  const session = await probeSession();
  if (session.authenticated) {
    redirect(session.emailVerified ? target ?? "/app" : "/check-email");
  }

  const providers = await oauthProviders();
  const nextQs = target ? `?next=${encodeURIComponent(target)}` : "";

  return (
    <AuthShell
      eyebrow="Sign in"
      title="Sign in to your company"
      brandHeadline="The company keeps moving while you sleep."
      brandBody="Your AI employees hold their departments, report progress, and escalate decisions that need a founder. Sign in to review the work."
      footer={
        <p className="text-sm text-white/50">
          Starting a company?{" "}
          <Link
            href={`/register${nextQs}`}
            className="text-white underline decoration-white/30 underline-offset-2 transition-colors hover:decoration-white"
          >
            Create one
          </Link>
          .
        </p>
      }
    >
      <AuthForm
        mode="login"
        next={target}
        oauthProviders={providers}
        oauthError={oauth_error ?? null}
      />
    </AuthShell>
  );
}
