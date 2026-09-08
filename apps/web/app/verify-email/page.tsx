"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, MailCheck, AlertCircle, Clock } from "lucide-react";

type VerifyState = "pending" | "verifying" | "success" | "invalid" | "expired" | "already_used" | "error";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
          <Loader2 className="h-7 w-7 animate-spin text-orq8-green" />
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
  const [state, setState] = useState<VerifyState>("pending");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      setMessage("No verification token was provided. Use the link from your verification email.");
      return;
    }
    let cancelled = false;
    (async () => {
      setState("verifying");
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
        } else {
          const code = json?.error?.code as string | undefined;
          const msg = (json?.error?.message as string | undefined) ?? "Verification failed.";
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-xl border border-hairline bg-white p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orq8-lime/10">
          {state === "verifying" ? (
            <Loader2 className="h-7 w-7 animate-spin text-orq8-green" />
          ) : state === "success" ? (
            <CheckCircle2 className="h-7 w-7 text-orq8-green" />
          ) : state === "expired" ? (
            <Clock className="h-7 w-7 text-amber-500" />
          ) : state === "pending" ? (
            <MailCheck className="h-7 w-7 text-orq8-green" />
          ) : (
            <AlertCircle className="h-7 w-7 text-red-500" />
          )}
        </div>

        {state === "verifying" && (
          <>
            <h1 className="mt-4 text-lg font-bold text-ink">Verifying your email…</h1>
            <p className="mt-2 text-sm text-muted">This only takes a moment.</p>
          </>
        )}

        {state === "pending" && (
          <>
            <h1 className="mt-4 text-lg font-bold text-ink">Check your inbox</h1>
            <p className="mt-2 text-sm text-muted">
              Open the verification email we sent you and click the link inside.
            </p>
          </>
        )}

        {state === "success" && (
          <>
            <h1 className="mt-4 text-lg font-bold text-ink">Email verified</h1>
            <p className="mt-2 text-sm text-muted">
              Your email is confirmed. Everything in your workspace is ready to go.
            </p>
            <Link
              href="/app"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-orq8-green px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orq8-green-dark"
            >
              Go to your dashboard
            </Link>
          </>
        )}

        {(state === "invalid" || state === "expired" || state === "already_used" || state === "error") && (
          <>
            <h1 className="mt-4 text-lg font-bold text-ink">
              {state === "expired" ? "Link expired" : state === "already_used" ? "Link already used" : "Verification problem"}
            </h1>
            <p className="mt-2 text-sm text-muted">{message}</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/settings"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-orq8-green px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orq8-green-dark"
              >
                Resend verification email
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-hairline px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-orq8-green"
              >
                Back to login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
