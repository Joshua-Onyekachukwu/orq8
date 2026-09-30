"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle, MailPlus } from "lucide-react";
import { AuthShell } from "../../../components/auth/auth-shell";

/**
 * Accept an invitation.
 *
 * The link a founder sends (or the API emails) opens here. Three things can be
 * true when it does, and each needs a different next step:
 *
 *   no session      → sign in, or create the account, and come straight back.
 *                     The API requires a signed-in account whose address is the
 *                     invited one, so the link alone can never seat somebody
 *                     else — including whoever it was forwarded to.
 *   wrong account   → the API names the invited address; the page says to sign
 *                     in with it instead of pretending the link is broken.
 *   right account   → accept, switch the session into that company (a session is
 *                     bound to one organization), then open the app.
 */

type Phase = "checking" | "signed-out" | "ready" | "accepting" | "done" | "error";

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";

  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const invitePath = `/invite/${token}`;
  const next = encodeURIComponent(invitePath);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setPhase("signed-out");
          return;
        }
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        setEmail(json?.data?.user?.email ?? null);
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("signed-out");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const accept = useCallback(async () => {
    setPhase("accepting");
    setMessage(null);
    setCode(null);
    try {
      const res = await fetch("/api/members/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setCode(json?.error ?? null);
        setMessage(
          typeof json?.message === "string" && json.message.length > 0
            ? json.message
            : "That invitation could not be accepted.",
        );
        setPhase("error");
        return;
      }

      // A session acts in one organization: move it into the one that invited
      // this account, or the teammate lands in their own company and cannot see
      // the work they just joined.
      const orgId = json?.data?.orgId as string | undefined;
      if (orgId) {
        await fetch("/api/org/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ org_id: orgId }),
        }).catch(() => undefined);
      }

      setPhase("done");
      router.push("/app");
      router.refresh();
    } catch {
      setMessage("Could not reach the server. Check your connection and try again.");
      setPhase("error");
    }
  }, [token, router]);

  if (phase === "checking") {
    return (
      <AuthShell
        eyebrow="Invitation"
        title="Checking your invitation"
        subtitle="This takes a moment."
        brandHeadline="Joining a company."
        brandBody="We are checking the link and your session with the ORQ8 API."
      >
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" aria-hidden />
          <p className="text-sm text-white/70">Checking the link…</p>
        </div>
      </AuthShell>
    );
  }

  if (phase === "done") {
    return (
      <AuthShell
        eyebrow="Invitation"
        title="You have joined"
        subtitle="Opening the company…"
        brandHeadline="Welcome in."
        brandBody="Your membership is recorded and this session now acts in the company that invited you."
      >
        <div aria-live="polite" className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" aria-hidden />
            <p className="text-sm text-white/70">Invitation accepted. Taking you to the company.</p>
          </div>
          <Link
            href="/app"
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-deep text-sm font-semibold text-white transition-colors hover:bg-brand"
          >
            Open the company
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (phase === "signed-out") {
    return (
      <AuthShell
        eyebrow="Invitation"
        title="Sign in to accept"
        subtitle="The invitation is tied to the email address it was sent to."
        brandHeadline="One step to join."
        brandBody="Sign in with the invited address — or create the account with it — and this page finishes the job."
      >
        <div className="space-y-3">
          <Link
            href={`/login?next=${next}`}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-deep text-sm font-semibold text-white transition-colors hover:bg-brand"
          >
            Sign in and accept
          </Link>
          <Link
            href={`/register?next=${next}`}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-white/15 text-sm font-semibold text-white transition-colors hover:bg-white/[0.05]"
          >
            Create an account with the invited address
          </Link>
          <p className="flex items-start gap-2 pt-1 text-xs text-white/50">
            <MailPlus className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Nothing to fill in here: once you are signed in, accepting takes one click.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (phase === "error") {
    const emailMismatch = code === "email_mismatch";
    const settled = code === "not_pending" || code === "expired";
    return (
      <AuthShell
        eyebrow="Invitation"
        title={emailMismatch ? "Wrong account" : settled ? "This invitation is no longer open" : "That did not work"}
        subtitle={message ?? "The invitation could not be accepted."}
        brandHeadline={emailMismatch ? "Invitations are address-bound." : "Links expire."}
        brandBody={
          emailMismatch
            ? "An invitation belongs to the address it was sent to, so a forwarded link cannot seat anyone else."
            : "Ask whoever invited you for a fresh link — one click in Members & Roles issues a new one."
        }
        footer={
          <p className="text-sm text-white/50">
            {emailMismatch ? (
              <>
                Signed in as {email ?? "another account"}.{" "}
                <Link
                  href={`/login?next=${next}`}
                  className="text-white underline decoration-white/30 underline-offset-2 transition-colors hover:decoration-white"
                >
                  Switch account
                </Link>
                .
              </>
            ) : (
              <>
                Already a member?{" "}
                <Link
                  href="/app"
                  className="text-white underline decoration-white/30 underline-offset-2 transition-colors hover:decoration-white"
                >
                  Open the app
                </Link>
                .
              </>
            )}
          </p>
        }
      >
        <div aria-live="polite" className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warm" aria-hidden />
            <p className="text-sm text-white/70">{message ?? "The invitation could not be accepted."}</p>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Invitation"
      title="Join the company"
      subtitle={email ? `You are signed in as ${email}.` : undefined}
      brandHeadline="One click to join."
      brandBody="Accepting adds your membership and moves this session into the company that invited you."
      footer={
        <p className="text-sm text-white/50">
          Not the right account?{" "}
          <Link
            href={`/login?next=${next}`}
            className="text-white underline decoration-white/30 underline-offset-2 transition-colors hover:decoration-white"
          >
            Sign in with the invited address
          </Link>
          .
        </p>
      }
    >
      <div className="space-y-3">
        <button
          type="button"
          onClick={accept}
          disabled={phase === "accepting"}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-deep text-sm font-semibold text-white transition-colors hover:bg-brand disabled:opacity-60"
        >
          {phase === "accepting" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {phase === "accepting" ? "Accepting…" : "Accept invitation"}
        </button>
        <p className="text-xs text-white/50">
          Your role is set by the person who invited you, and only an owner can change an owner.
        </p>
      </div>
    </AuthShell>
  );
}
