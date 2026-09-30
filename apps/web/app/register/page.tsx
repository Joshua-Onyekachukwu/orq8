import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "../../components/auth/auth-shell";
import { AuthForm } from "../../components/auth-form";
import { oauthProviders, postAuthTarget, probeSession } from "../../lib/auth-pages";

export const metadata = {
  title: "Start your company | ORQ8",
  description: "Create your account and start your company on ORQ8.",
};

const REGISTRATION_OPEN = process.env.REGISTRATION_OPEN === "true";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = postAuthTarget(next);

  const session = await probeSession();
  if (session.authenticated) {
    redirect(session.emailVerified ? target ?? "/app" : "/check-email");
  }

  const providers = await oauthProviders();
  const nextQs = target ? `?next=${encodeURIComponent(target)}` : "";

  if (!REGISTRATION_OPEN) {
    return (
      <AuthShell
        eyebrow="Founding cohort"
        title="Registration opens soon"
        subtitle="ORQ8 is opening to a first group of founders. Join the waitlist and we will write to you when your company can start."
        brandHeadline="Built with the first founders, not around them."
        brandBody="The founding cohort shapes which departments ship first. Everyone in it starts with free credits and no credit card."
        footer={
          <div className="space-y-3">
            <Link
              href="/#waitlist"
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-deep text-sm font-semibold text-white transition-colors hover:bg-brand"
            >
              Join the waitlist
            </Link>
            <p className="text-sm text-white/50">
              Already have a company?{" "}
              <Link
                href={`/login${nextQs}`}
                className="text-white underline decoration-white/30 underline-offset-2 transition-colors hover:decoration-white"
              >
                Sign in
              </Link>
              .
            </p>
          </div>
        }
      >
        <ul className="space-y-3 text-sm text-white/60">
          <li>Founding companies start with free credits.</li>
          <li>No credit card is required to begin.</li>
          <li>Waitlist members are invited in order of sign-up.</li>
        </ul>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Start your company"
      title="Start your company"
      subtitle="Join the founding cohort. Free credits, no credit card required."
      brandHeadline="You stay the CEO. The company runs."
      brandBody="Name your company, hire AI employees into real departments, and delegate the first work today. You review, approve, and decide."
      footer={
        <p className="text-sm text-white/50">
          Already running a company?{" "}
          <Link
            href={`/login${nextQs}`}
            className="text-white underline decoration-white/30 underline-offset-2 transition-colors hover:decoration-white"
          >
            Sign in
          </Link>
          .
        </p>
      }
    >
      <AuthForm
        mode="register"
        next={target}
        oauthProviders={providers}
        oauthError={null}
      />
    </AuthShell>
  );
}
