import { redirect } from "next/navigation";
import { AuthShell } from "../../components/auth/auth-shell";
import { ResendVerification } from "../../components/auth/resend-verification";
import { postAuthTarget, probeSession } from "../../lib/auth-pages";

export const metadata = {
  title: "Confirm your email | ORQ8",
  description: "Confirm your email address to activate your ORQ8 account.",
};

/**
 * Landing spot for a valid but unconfirmed session (the one minted at
 * registration). Everything behind /app waits for the confirmation link, so
 * this page exists to explain that and to resend the email.
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = postAuthTarget(next) ?? "/app";

  const session = await probeSession();
  if (!session.authenticated) redirect("/login");
  if (session.emailVerified) redirect(target);

  const email = session.email ?? "your email address";

  return (
    <AuthShell
      eyebrow="Confirm your email"
      title="Check your email"
      subtitle={`We sent a confirmation link to ${email}. Open it to activate your company.`}
      brandHeadline="One click and the doors open."
      brandBody="Confirming your email keeps your company tied to an address you control. Everything in ORQ8 waits for that link, so it is the only step left."
      footer={
        <div className="space-y-3">
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="w-full text-center text-sm text-white/50 transition-colors hover:text-white"
            >
              Sign out
            </button>
          </form>
          <p className="text-xs text-white/40">
            Wrong address? Sign out and start again with the right email.
          </p>
        </div>
      }
    >
      <div className="space-y-4">
        <ResendVerification defaultEmail={session.email} />
        <p className="text-xs text-white/50">
          The link expires after 24 hours. Check your spam folder if it does not arrive within a
          few minutes.
        </p>
      </div>
    </AuthShell>
  );
}
