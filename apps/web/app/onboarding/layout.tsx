import { redirect } from "next/navigation";
import { probeSession } from "../../lib/auth-pages";

/**
 * Onboarding is part of the signed-in product, so it requires the same proof
 * as /app: a session the API confirms, with a confirmed email. A session
 * minted at registration is valid but unconfirmed, so those founders land on
 * /check-email and return here after clicking the link in their inbox.
 */
export default async function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { authenticated, emailVerified } = await probeSession();
  if (!authenticated) redirect("/login?next=/onboarding");
  if (!emailVerified) redirect("/check-email?next=/onboarding");
  return <>{children}</>;
}
