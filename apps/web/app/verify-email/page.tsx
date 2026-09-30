"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { AuthShell } from "../../components/auth/auth-shell";
import { ResendVerification } from "../../components/auth/resend-verification";

type VerifyState = "verifying" | "success" | "invalid" | "expired" | "already_used" | "error";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center ink">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" aria-label="Checking the link" />
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyState>("verifying");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      setMessage(
        "The link that opened this page is missing its token. Open the button in your confirmation email, or request a new link below.",
      );
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok) {
          setState("success");
          setMessage("Your email is confirmed. Sign in to open your company.");
        } else {
          const code = json?.error?.code as string | undefined;
          const msg = (json?.error?.message as string | undefined) ?? null;
          if (code === "verification_expired") setState("expired");
          else if (code === "verification_already_used") setState("already_used");
          else setState("invalid");
          setMessage(msg);
        }
      } catch {
        if (!cancelled) {
          setState("error");
          setMessage("Could not reach the server. Check your connection and try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "verifying") {
    return (
      <AuthShell
        eyebrow="Confirm your email"
        title="Confirming your email"
        subtitle="This takes a moment."
        brandHeadline="Confirming."
        brandBody="We are checking your link with the ORQ8 API. Nothing else is needed from you."
      >
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" aria-hidden />
          <p className="text-sm text-white/70">Checking the link…</p>
        </div>
      </AuthShell>
    );
  }

  if (state === "success") {
    return (
      <AuthShell
        eyebrow="Confirm your email"
        title="Email confirmed"
        subtitle="Your email is confirmed. Sign in to open your company."
        brandHeadline="You are in."
        brandBody="Your company is ready. Sign in and continue where sign-up left you."
        footer={
          <p className="text-sm text-white/50">
            Ready to set up your company?{" "}
            <Link
              href="/onboarding"
              className="text-white underline decoration-white/30 underline-offset-2 transition-colors hover:decoration-white"
            >
              Open company setup
            </Link>
            .
          </p>
        }
      >
        <div
          aria-live="polite"
          className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" aria-hidden />
            <p className="text-sm text-white/70">
              Confirmation recorded. Your company is unlocked.
            </p>
          </div>
          <Link
            href="/login"
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-deep text-sm font-semibold text-white transition-colors hover:bg-brand"
          >
            Continue to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  const heading =
    state === "expired"
      ? "This link expired"
      : state === "already_used"
        ? "This link was already used"
        : "This link did not work";

  return (
    <AuthShell
      eyebrow="Confirm your email"
      title={heading}
      subtitle="Request a new link below and open the newest email you receive."
      brandHeadline="Links expire. Accounts do not."
      brandBody="Confirmation links last 24 hours and can be used once. A fresh link takes a few seconds."
      footer={
        <p className="text-sm text-white/50">
          Already confirmed?{" "}
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
      <div className="space-y-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warm-ink" aria-hidden />
            <p className="text-sm text-white/70">
              {message ??
                "The link is not valid any more. Request a new confirmation email below."}
            </p>
          </div>
        </div>
        <ResendVerification />
      </div>
    </AuthShell>
  );
}
