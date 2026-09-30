"use client";

import { useEffect, useState } from "react";
import { MailWarning, X, Loader2, CheckCircle2 } from "lucide-react";

/**
 * Persistent-until-verified email confirmation banner for the app shell.
 * Renders nothing for verified users or before the check resolves. The
 * dismiss is session-only — verification state is the source of truth, so
 * the banner returns next session until the email is actually confirmed.
 */
export function UnverifiedEmailBanner() {
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState<"idle" | "sent" | "rate_limited" | "error">("idle");
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (!cancelled) setEmailVerified(!!json?.data?.user?.emailVerified);
      } catch {
        // Banner is non-critical — silently absent on API failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fresh signups: emphasize the inbox action in the first session only.
  const isNewSignup = (() => {
    try {
      if (sessionStorage.getItem("orq8_verification_notice") === "1") {
        sessionStorage.removeItem("orq8_verification_notice");
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  })();

  if (emailVerified !== false || dismissed) return null;

  async function handleResend() {
    setResending(true);
    setHint(null);
    try {
      const res = await fetch("/api/auth/verify-email/resend", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setResent("sent");
      } else if (res.status === 429) {
        setResent("rate_limited");
        setHint(json?.error?.message ?? "Too many emails requested. Try again later.");
      } else if (json?.data?.status === "already_verified") {
        setEmailVerified(true);
      } else {
        setResent("error");
        setHint(json?.error?.message ?? "Could not send the email right now.");
      }
    } catch {
      setResent("error");
      setHint("Could not reach the server.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warm bg-warm-soft px-4 py-2.5 text-sm text-warm-ink sm:px-6 lg:px-8"
    >
      <MailWarning className="h-4 w-4 shrink-0 text-warm-ink" aria-hidden="true" />
      <span className="font-medium">{isNewSignup ? "We sent you a verification email" : "Confirm your email address"}</span>
      <span className="hidden text-warm-ink sm:inline">
        {isNewSignup
          ? "Click the link in your inbox to confirm your address — it takes one click."
          : "Check your inbox for the verification link we sent when you signed up."}
      </span>

      {resent === "sent" ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-brand-ink">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Email sent — check your inbox
        </span>
      ) : (
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="inline-flex items-center gap-1.5 rounded-md border border-warm bg-white px-2.5 py-1 text-xs font-semibold text-warm-ink transition-colors hover:border-warm disabled:opacity-60"
        >
          {resending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
          Resend email
        </button>
      )}

      {hint && <span className="text-xs text-warm-ink">{hint}</span>}

      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss for now"
        className="ml-auto rounded p-1 text-warm-ink transition-colors hover:bg-warm-soft"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
